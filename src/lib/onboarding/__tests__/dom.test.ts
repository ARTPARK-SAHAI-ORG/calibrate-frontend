import {
  clickByText,
  clickElement,
  delay,
  fillAllByPlaceholderPrefix,
  fillByPlaceholder,
  fillInput,
  isVisible,
  setNativeValue,
  waitForElement,
} from "../dom";

function makeLayoutVisible(...elements: HTMLElement[]): void {
  elements.forEach((el) => {
    Object.defineProperty(el, "getClientRects", {
      configurable: true,
      value: () => [{ width: 10, height: 10 }],
    });
  });
}

describe("onboarding dom helpers", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    jest.useRealTimers();
    jest.spyOn(window, "getComputedStyle").mockReturnValue({
      visibility: "visible",
      display: "block",
    } as CSSStyleDeclaration);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("resolves immediately when the selector is already visible", async () => {
    const btn = document.createElement("button");
    btn.id = "go";
    btn.textContent = "Go";
    makeLayoutVisible(btn);
    document.body.appendChild(btn);

    await expect(waitForElement("#go")).resolves.toBe(btn);
  });

  it("returns null after the timeout when the element never appears", async () => {
    jest.useFakeTimers();
    const promise = waitForElement("#missing", { timeout: 200 });
    jest.advanceTimersByTime(250);
    await expect(promise).resolves.toBeNull();
  });

  it("treats hidden elements as absent when visible is required", () => {
    const input = document.createElement("input");
    input.hidden = true;
    makeLayoutVisible(input);
    expect(isVisible(input)).toBe(false);
  });

  it("detects display:none as not visible", () => {
    const el = document.createElement("div");
    makeLayoutVisible(el);
    jest.spyOn(window, "getComputedStyle").mockReturnValue({
      visibility: "visible",
      display: "none",
    } as CSSStyleDeclaration);

    expect(isVisible(el)).toBe(false);
  });

  it("sets native values and fills inputs by selector", async () => {
    const input = document.createElement("input");
    input.id = "name";
    makeLayoutVisible(input);
    document.body.appendChild(input);

    const onInput = jest.fn();
    input.addEventListener("input", onInput);

    setNativeValue(input, "Clinic bot");
    expect(input.value).toBe("Clinic bot");
    expect(onInput).toHaveBeenCalled();

    expect(await fillInput("#name", "Updated")).toBe(true);
    expect(input.value).toBe("Updated");
  });

  it("fills by placeholder and prefix, and clicks matching elements", async () => {
    const named = document.createElement("input");
    named.placeholder = "Enter simulation name";
    const prefixed = document.createElement("textarea");
    prefixed.placeholder = "Enter user message here";
    const button = document.createElement("button");
    button.textContent = "Create";
    makeLayoutVisible(named, prefixed, button);
    document.body.append(named, prefixed, button);

    expect(await fillByPlaceholder("Enter simulation name", "Demo")).toBe(true);
    expect(named.value).toBe("Demo");
    expect(fillAllByPlaceholderPrefix("Enter user message", "Hi")).toBe(1);
    expect(prefixed.value).toBe("Hi");

    expect(await clickElement("button")).toBe(true);
    expect(await clickByText("Create")).toBe(true);
    expect(await clickByText("Missing", { timeout: 160 })).toBe(false);
  });

  it("matches clickByText on a starts-with label", async () => {
    const button = document.createElement("button");
    button.textContent = "Next reply test Evaluate the next message";
    makeLayoutVisible(button);
    document.body.appendChild(button);

    expect(await clickByText("Next reply test")).toBe(true);
  });

  it("awaits delay", async () => {
    jest.useFakeTimers();
    const promise = delay(100);
    jest.advanceTimersByTime(100);
    await expect(promise).resolves.toBeUndefined();
  });
});
