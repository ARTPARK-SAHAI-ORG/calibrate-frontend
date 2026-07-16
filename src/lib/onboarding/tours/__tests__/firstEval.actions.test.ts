const mockClickElement = jest.fn().mockResolvedValue(true);
const mockClickByText = jest.fn().mockResolvedValue(true);
const mockFillInput = jest.fn().mockResolvedValue(true);
const mockFillByPlaceholder = jest.fn().mockResolvedValue(true);
const mockDelay = jest.fn().mockResolvedValue(undefined);
const mockWaitForElement = jest.fn(
  async (selector: string) => document.querySelector<HTMLElement>(selector),
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
  pickFreeName,
} from "../firstEval";

function stepByTitle(tour: ReturnType<typeof buildFirstEvalTour>, title: string) {
  const step = tour.steps.find((s) => s.title === title);
  if (!step) throw new Error(`Missing step: ${title}`);
  return step;
}

function makeLayoutVisible(el: HTMLElement): void {
  Object.defineProperty(el, "getClientRects", {
    configurable: true,
    value: () => [{ width: 10, height: 10 }],
  });
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

    const tour = buildFirstEvalTour({ getAccessToken: () => "tok" });
    await stepByTitle(tour, "Create an agent").action?.();

    expect(mockClickElement).toHaveBeenCalledWith(A.newAgent);
    expect(mockFillInput).toHaveBeenCalledWith(
      A.agentNameInput,
      "Community Clinic Helpline (2)",
      { timeout: 8000 },
    );
  });

  it("fills the system prompt during prepare", async () => {
    const tour = buildFirstEvalTour({ getAccessToken: () => null });
    await stepByTitle(tour, "Give it instructions").prepare?.();
    expect(mockFillInput).toHaveBeenCalledWith(
      A.systemPrompt,
      expect.stringContaining("community health clinics"),
      { timeout: 15000 },
    );
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

    const tour = buildFirstEvalTour({ getAccessToken: () => null });
    await stepByTitle(tour, "Choose what to check").action?.();
    expect(
      correctness.querySelector<HTMLInputElement>('input[type="checkbox"]')
        ?.checked,
    ).toBe(true);

    await stepByTitle(tour, "Add another dimension").action?.();
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
    const criteria = document.createElement("textarea");
    makeLayoutVisible(criteria);
    evaluators.appendChild(criteria);
    document.body.appendChild(evaluators);

    const tour = buildFirstEvalTour({ getAccessToken: () => null });
    stepByTitle(tour, "The scenario").prepare?.();
    expect(userField.value).toContain("clinic");

    await stepByTitle(tour, "Two dimensions, one test").prepare?.();
    expect(criteria.value).toContain("opening hours");
    await stepByTitle(tour, "Two dimensions, one test").action?.();
    expect(mockClickByText).toHaveBeenCalledWith("Create", { timeout: 8000 });
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
    const tour = buildFirstEvalTour({ getAccessToken: () => null });
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

    const tour = buildFirstEvalTour({ getAccessToken: () => null });
    await stepByTitle(tour, "It passes now ✅").prepare?.();

    expect(mockClickElement).toHaveBeenCalledWith(A.runTabOutputs, {
      timeout: 10000,
    });
  });
});
