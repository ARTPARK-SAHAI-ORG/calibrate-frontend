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

  it("recreates Correctness when the workspace deleted it", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    (global.fetch as jest.Mock).mockImplementation(
      async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        if (url.includes("/evaluators/default-prompt")) {
          return {
            ok: true,
            json: async () => ({
              system_prompt: "Judge against {{criteria}}",
              judge_model: "openai/gpt-5.4-mini",
              output_type: "binary",
            }),
          };
        }
        return { ok: true, json: async () => ({ uuid: "new-correct" }) };
      },
    );

    const tour = buildTour("tok", {
      correctnessName: null,
      secondEvaluatorName: null,
    });
    await stepByTitle(tour, "Add an evaluator").prepare?.();

    const post = calls.find(
      (c) => c.init?.method === "POST" && c.url.endsWith("/evaluators"),
    );
    expect(post).toBeDefined();
    const body = JSON.parse(post!.init!.body as string);
    expect(body.name).toBe("Correctness");
    expect(body.evaluator_type).toBe("llm");
    expect(body.version.judge_model).toBe("openai/gpt-5.4-mini");
    expect(body.version.variables[0].name).toBe("criteria");
  });

  it("does not recreate Correctness when it already exists", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    const tour = buildTour("tok"); // plan already has Correctness
    await stepByTitle(tour, "Add an evaluator").prepare?.();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("skips the POST when the default-prompt gives no judge model", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    (global.fetch as jest.Mock).mockImplementation(
      async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        // default-prompt responds but without a judge_model.
        return { ok: true, json: async () => ({ system_prompt: "x {{criteria}}" }) };
      },
    );
    const tour = buildTour("tok", {
      correctnessName: null,
      secondEvaluatorName: null,
    });
    await stepByTitle(tour, "Add an evaluator").prepare?.();
    // No create POST without a judge model (the backend would reject it).
    expect(
      calls.find((c) => c.init?.method === "POST"),
    ).toBeUndefined();
  });

  it("does not recreate Correctness without an access token", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    const tour = buildTour(null, {
      correctnessName: null,
      secondEvaluatorName: null,
    });
    await stepByTitle(tour, "Add an evaluator").prepare?.();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("swallows a failure while recreating Correctness", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("boom"));
    const tour = buildTour("tok", {
      correctnessName: null,
      secondEvaluatorName: null,
    });
    await expect(
      stepByTitle(tour, "Add an evaluator").prepare?.(),
    ).resolves.toBeUndefined();
  });

  it("no-ops the pick when the picker dialog is absent", async () => {
    const tour = buildTour();
    await expect(
      stepByTitle(tour, "Choose what to check").action?.(),
    ).resolves.toBeUndefined();
  });

  it("no-ops the criteria fill when the evaluators area is absent", async () => {
    const tour = buildTour();
    await expect(
      stepByTitle(tour, "How your test is graded").prepare?.(),
    ).resolves.toBeUndefined();
  });

  it("ticks correctness and a second evaluator in the picker", async () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("data-tour", "add-evaluators-dialog");
    const correctness = document.createElement("label");
    correctness.innerHTML =
      '<input type="checkbox" /><span>Correctness</span><span>LLM reply</span>';
    const tone = document.createElement("label");
    tone.innerHTML =
      '<input type="checkbox" /><span>Politeness</span><span>LLM reply</span>';
    dialog.append(correctness, tone);
    document.body.appendChild(dialog);

    const tour = buildTour();
    await stepByTitle(tour, "Choose what to check").action?.();
    expect(
      correctness.querySelector<HTMLInputElement>('input[type="checkbox"]')
        ?.checked,
    ).toBe(true);

    await stepByTitle(tour, "Add another check").action?.();
    expect(
      tone.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked,
    ).toBe(true);
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
    const outputsTab = document.createElement("button");
    outputsTab.setAttribute("data-tour", "run-tab-outputs");
    const row = document.createElement("button");
    row.setAttribute("data-tour", "run-result-row");
    row.textContent = "Demo · phone number it lacks";
    const detail = document.createElement("div");
    detail.setAttribute("data-tour", "run-result-detail");
    document.body.append(outputsTab, row, detail);

    const tour = buildTour();
    await stepByTitle(tour, "It passes now ✅").prepare?.();

    expect(mockClickElement).toHaveBeenCalledWith(A.runTabOutputs, {
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

  it("resolves Correctness + a conciseness second from the library", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            name: "Correctness",
            evaluator_type: "llm",
            slug: "default-llm-next-reply",
          },
          {
            name: "Reply Conciseness",
            evaluator_type: "llm",
            slug: "reply-conciseness",
          },
        ],
      }),
    });
    expect(await resolveEvaluatorPlan("tok")).toEqual({
      correctnessName: "Correctness",
      secondEvaluatorName: "Reply Conciseness",
    });
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
