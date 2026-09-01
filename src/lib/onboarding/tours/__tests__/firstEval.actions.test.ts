const mockClickElement = jest.fn().mockResolvedValue(true);
const mockClickByText = jest.fn().mockResolvedValue(true);
const mockFillInput = jest.fn().mockResolvedValue(true);
const mockFillByPlaceholder = jest.fn().mockResolvedValue(true);
const mockDelay = jest.fn().mockResolvedValue(undefined);
const mockWaitForElement = jest.fn(async (...args: unknown[]) =>
  document.querySelector<HTMLElement>(args[0] as string),
);

jest.mock("../../dom", () => ({
  clickElement: (...args: unknown[]) => mockClickElement(...args),
  clickByText: (...args: unknown[]) => mockClickByText(...args),
  fillInput: (...args: unknown[]) => mockFillInput(...args),
  fillByPlaceholder: (...args: unknown[]) => mockFillByPlaceholder(...args),
  delay: (...args: unknown[]) => mockDelay(...args),
  waitForElement: (...args: unknown[]) => mockWaitForElement(...args),
  fillAllByPlaceholderPrefix: jest.requireActual("../../dom")
    .fillAllByPlaceholderPrefix,
  setNativeValue: jest.requireActual("../../dom").setNativeValue,
}));

jest.mock("../../../../lib/api", () => ({
  getBackendUrl: () => "http://127.0.0.1:8000",
  getDefaultHeaders: () => ({ Authorization: "Bearer tok" }),
  unwrapList: <T>(data: { items?: T[] } | T[]) =>
    Array.isArray(data) ? data : (data.items ?? []),
}));

import {
  A,
  buildFirstEvalTour,
  fillSystemPromptResilient,
  pickFreeName,
  resolveEvaluatorPlan,
  type EvaluatorPlan,
} from "../firstEval";

// A two-evaluator plan (Correctness + a "Politeness" second check) so the flow
// includes the second-pick step under test.
const TWO_EVAL_PLAN: EvaluatorPlan = {
  correctnessName: "Correctness",
  secondEvaluatorName: "Politeness",
};

function buildTour(token: string | null = null, plan: EvaluatorPlan = TWO_EVAL_PLAN) {
  return buildFirstEvalTour({ getAccessToken: () => token, plan });
}

function stepByTitle(tour: ReturnType<typeof buildFirstEvalTour>, title: string) {
  const step = tour.steps.find((s) => s.title === title);
  if (!step) throw new Error(`Missing step: ${title}`);
  return step;
}

function makeLayoutVisible(...els: HTMLElement[]): void {
  for (const el of els) {
    Object.defineProperty(el, "getClientRects", {
      configurable: true,
      value: () => [{ width: 10, height: 10 }],
    });
  }
}

describe("pickFreeName", () => {
  it("returns the base name when it is free", () => {
    expect(pickFreeName("Demo agent", new Set())).toBe("Demo agent");
  });

  it("suffixes when the base name is already taken", () => {
    expect(
      pickFreeName("Demo agent", new Set(["demo agent"])),
    ).toBe("Demo agent (2)");
  });
});

describe("first-eval tour step actions", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    jest.clearAllMocks();
    global.fetch = jest.fn();
    HTMLElement.prototype.scrollIntoView = jest.fn();
    jest.spyOn(window, "getComputedStyle").mockReturnValue({
      visibility: "visible",
      display: "block",
    } as CSSStyleDeclaration);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("creates an agent with a deduped name", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [{ name: "Community Clinic Helpline" }],
      }),
    });

    const tour = buildTour("tok");
    await stepByTitle(tour, "Create an agent").action?.();

    expect(mockClickElement).toHaveBeenCalledWith(A.newAgent);
    expect(mockFillInput).toHaveBeenCalledWith(
      A.agentNameInput,
      "Community Clinic Helpline (2)",
      { timeout: 8000 },
    );
  });

  it("fills the system prompt during prepare", async () => {
    jest.useFakeTimers();
    const tour = buildTour();
    await stepByTitle(tour, "Give it instructions").prepare?.();
    expect(mockFillInput).toHaveBeenCalledWith(
      A.systemPrompt,
      expect.stringContaining("community health clinics"),
      { timeout: 15000 },
    );
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("re-applies the system prompt if the agent load clobbers it", async () => {
    jest.useFakeTimers();
    const el = document.createElement("textarea");
    el.setAttribute("data-tour", "agent-system-prompt");
    // fillInput is mocked (no real write), so simulate the agent-load default
    // sitting in the field; the background guard must overwrite it.
    el.value = "You are a helpful assistant.";
    makeLayoutVisible(el);
    document.body.appendChild(el);

    await fillSystemPromptResilient("SAMPLE PROMPT", {
      checks: 5,
      intervalMs: 10,
    });
    // One guard tick is enough to correct the clobbered value.
    jest.advanceTimersByTime(10);
    expect(el.value).toBe("SAMPLE PROMPT");

    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("drives the test-type picker's two steps by anchor, not by copy", async () => {
    const tour = buildTour("tok");
    await stepByTitle(tour, "Pick what to test").action?.();
    // Pick the reply/answer type, then confirm with Next: clicking the option
    // alone only previews it, so both are needed to reach the editor. Anchored
    // so the picker's wording can change without stalling the tour.
    expect(mockClickElement).toHaveBeenCalledWith(A.testTypeNextReply, {
      timeout: 8000,
    });
    expect(mockClickElement).toHaveBeenCalledWith(A.testTypeNext, {
      timeout: 8000,
    });
  });

  it("no-ops the pick when the picker dialog is absent", async () => {
    const tour = buildTour();
    await expect(
      stepByTitle(tour, "Pick it in the list").action?.(),
    ).resolves.toBeUndefined();
  });

  it("no-ops the criteria fill when the evaluators area is absent", async () => {
    const tour = buildTour();
    await expect(
      stepByTitle(tour, "How your test is graded").prepare?.(),
    ).resolves.toBeUndefined();
  });

  it("ticks only the second evaluator, never the already-attached one", async () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("data-tour", "add-evaluators-dialog");
    const correctness = document.createElement("div");
    correctness.innerHTML =
      '<input type="checkbox" aria-label="Select Correctness" /><span>Correctness</span>';
    const second = document.createElement("div");
    second.innerHTML =
      '<input type="checkbox" aria-label="Select Politeness" /><span>Politeness</span>';
    dialog.append(correctness, second);
    document.body.appendChild(dialog);

    const tour = buildTour();
    await stepByTitle(tour, "Pick it in the list").action?.();
    expect(
      second.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked,
    ).toBe(true);
    // Correctness is already on the agent, so the tour must not touch it.
    expect(
      correctness.querySelector<HTMLInputElement>('input[type="checkbox"]')
        ?.checked,
    ).toBe(false);
  });

  it("fills a demo test scenario and criteria", async () => {
    const userField = document.createElement("textarea");
    userField.placeholder = "Enter user message";
    const agentField = document.createElement("textarea");
    agentField.placeholder = "Enter agent message";
    makeLayoutVisible(userField, agentField);
    document.body.append(userField, agentField);

    const evaluators = document.createElement("div");
    evaluators.setAttribute("data-tour", "test-evaluators-area");
    // Each attached evaluator renders as a card holding its name + criteria
    // field; the Correctness card gets the test's own criterion.
    const card = document.createElement("div");
    const name = document.createElement("div");
    name.textContent = "Correctness";
    const criteria = document.createElement("textarea");
    makeLayoutVisible(criteria);
    card.append(name, criteria);
    evaluators.appendChild(card);
    document.body.appendChild(evaluators);

    const tour = buildTour();
    stepByTitle(tour, "The scenario").prepare?.();
    expect(userField.value).toContain("clinic");

    await stepByTitle(tour, "How your test is graded").prepare?.();
    expect(criteria.value).toContain("opening hours");
    await stepByTitle(tour, "How your test is graded").action?.();
    expect(mockClickByText).toHaveBeenCalledWith("Create", { timeout: 8000 });

    // The second (failing) test writes its own criterion into the same card.
    stepByTitle(tour, "A scenario it cannot answer").prepare?.();
    expect(userField.value).toContain("phone number");
    await stepByTitle(tour, "Require what it cannot give").prepare?.();
    expect(criteria.value).toContain("phone number");
  });

  it("expands failed reasoning and appends the prompt fix", async () => {
    jest.useFakeTimers();
    const verdict = document.createElement("div");
    verdict.setAttribute("data-tour", "run-result-verdict");
    const card = document.createElement("div");
    card.textContent = "Fail";
    const toggle = document.createElement("button");
    toggle.textContent = "See reasoning";
    card.appendChild(toggle);
    verdict.appendChild(card);
    document.body.appendChild(verdict);

    const clickSpy = jest.spyOn(toggle, "click");
    const tour = buildTour();
    await stepByTitle(tour, "The evaluator's verdict").action?.();
    expect(clickSpy).toHaveBeenCalled();

    const prompt = document.createElement("textarea");
    prompt.setAttribute("data-tour", "agent-system-prompt");
    prompt.value = "Base prompt.";
    makeLayoutVisible(prompt);
    document.body.appendChild(prompt);

    const fixStep = stepByTitle(tour, "Fix the gap it found");
    await fixStep.prepare?.();
    expect(prompt.value).toContain("1800-123-4567");
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("opens the phone-number result during the pass-now prepare", async () => {
    const testsTab = document.createElement("button");
    testsTab.setAttribute("data-tour", "run-tab-tests");
    const row = document.createElement("button");
    row.setAttribute("data-tour", "run-result-row");
    row.textContent = "Demo · phone number it lacks";
    const detail = document.createElement("div");
    detail.setAttribute("data-tour", "run-result-detail");
    document.body.append(testsTab, row, detail);

    const tour = buildTour();
    await stepByTitle(tour, "It passes now ✅").prepare?.();

    expect(mockClickElement).toHaveBeenCalledWith(A.runTabTests, {
      timeout: 10000,
    });
  });
});

describe("resolveEvaluatorPlan", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it("returns the Correctness-only fallback without a token (no fetch)", async () => {
    expect(await resolveEvaluatorPlan(null)).toEqual({
      correctnessName: "Correctness",
      secondEvaluatorName: null,
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // The plan takes the built-in Correctness (by slug) as the first check, and
  // as the second an existing DEFAULT LLM-reply evaluator (Conciseness first)
  // whose live judge prompt has the `{{criteria}}` slot the tour writes into.
  // Nothing is ever created.
  const ITEMS = [
    {
      uuid: "ev-correct",
      name: "Correctness",
      evaluator_type: "llm",
      slug: "default-llm-next-reply",
      is_default: true,
    },
    {
      uuid: "ev-faith",
      name: "Faithfulness",
      evaluator_type: "llm",
      is_default: true,
    },
    {
      uuid: "ev-conc",
      name: "Conciseness",
      evaluator_type: "llm",
      is_default: true,
    },
    {
      uuid: "ev-mine",
      name: "My custom judge",
      evaluator_type: "llm",
      is_default: false,
      owner_user_id: "u1",
    },
  ];

  // Judge prompts by evaluator uuid. Anything not named here answers with a
  // fixed rubric, i.e. no `{{criteria}}` slot for the tour to write into.
  const CRITERIA_PROMPT = "Grade the reply against:\n\n{{criteria}}";
  const FIXED_PROMPT = "Grade whether the reply is faithful to the source.";

  function mockList(
    items: unknown[] = ITEMS,
    prompts: Record<string, string> = {
      "ev-conc": CRITERIA_PROMPT,
      "ev-faith": FIXED_PROMPT,
    },
  ) {
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      const detail = /\/evaluators\/([^/?]+)$/.exec(url)?.[1];
      if (detail) {
        return {
          ok: true,
          json: async () => ({
            live_version_index: 0,
            versions: [{ uuid: "v1", system_prompt: prompts[detail] ?? FIXED_PROMPT }],
          }),
        };
      }
      return { ok: true, json: async () => ({ items }) };
    });
  }

  it("uses the existing Correctness and prefers Conciseness as the second", async () => {
    mockList();
    expect(await resolveEvaluatorPlan("tok")).toEqual({
      correctnessName: "Correctness",
      secondEvaluatorName: "Conciseness",
    });
  });

  it("uses a Correctness-named evaluator as-is when the default slug is gone", async () => {
    mockList(
      [
        { uuid: "ev-c", name: "Correctness", evaluator_type: "llm", is_default: false, owner_user_id: "u1" },
        { uuid: "ev-faith", name: "Faithfulness", evaluator_type: "llm", is_default: true },
      ],
      { "ev-faith": CRITERIA_PROMPT },
    );
    expect(await resolveEvaluatorPlan("tok")).toEqual({
      correctnessName: "Correctness",
      secondEvaluatorName: "Faithfulness",
    });
  });

  it("takes another default evaluator when no Conciseness exists", async () => {
    mockList(
      [
        ITEMS[0],
        { uuid: "ev-faith", name: "Faithfulness", evaluator_type: "llm", is_default: true },
      ],
      { "ev-faith": CRITERIA_PROMPT },
    );
    expect((await resolveEvaluatorPlan("tok")).secondEvaluatorName).toBe(
      "Faithfulness",
    );
  });

  // The tour overwrites the second check's criteria so every demo answer
  // passes. An evaluator with a fixed rubric cannot be told what to grade, so
  // it is skipped rather than left to fail an answer the tour calls a pass.
  it("skips a second evaluator whose judge prompt has no criteria slot", async () => {
    mockList(
      [
        ITEMS[0],
        { uuid: "ev-faith", name: "Faithfulness", evaluator_type: "llm", is_default: true },
      ],
      { "ev-faith": FIXED_PROMPT },
    );
    expect((await resolveEvaluatorPlan("tok")).secondEvaluatorName).toBeNull();
  });

  it("falls through the fixed-rubric ones to a default it can control", async () => {
    mockList(
      [
        ITEMS[0],
        { uuid: "ev-faith", name: "Faithfulness", evaluator_type: "llm", is_default: true },
        { uuid: "ev-polite", name: "Politeness", evaluator_type: "llm", is_default: true },
      ],
      { "ev-faith": FIXED_PROMPT, "ev-polite": CRITERIA_PROMPT },
    );
    expect((await resolveEvaluatorPlan("tok")).secondEvaluatorName).toBe(
      "Politeness",
    );
  });

  it("checks at most a handful of candidates", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      uuid: `ev-${i}`,
      name: `Judge ${i}`,
      evaluator_type: "llm",
      is_default: true,
    }));
    mockList([ITEMS[0], ...many], {});
    expect((await resolveEvaluatorPlan("tok")).secondEvaluatorName).toBeNull();
    // One list request plus at most six detail requests.
    expect((global.fetch as jest.Mock).mock.calls.length).toBeLessThanOrEqual(7);
  });

  it("never offers a user-owned evaluator or a non-llm default as the second", async () => {
    mockList([
      ITEMS[0],
      { uuid: "ev-mine", name: "My custom judge", evaluator_type: "llm", is_default: false, owner_user_id: "u1" },
      { uuid: "ev-conv", name: "Coherence", evaluator_type: "conversation", is_default: true },
    ]);
    expect((await resolveEvaluatorPlan("tok")).secondEvaluatorName).toBeNull();
  });

  it("falls back when the request is not ok", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false });
    expect(await resolveEvaluatorPlan("tok")).toEqual({
      correctnessName: "Correctness",
      secondEvaluatorName: null,
    });
  });

  it("falls back when the request throws", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("network"));
    expect(await resolveEvaluatorPlan("tok")).toEqual({
      correctnessName: "Correctness",
      secondEvaluatorName: null,
    });
  });
});
