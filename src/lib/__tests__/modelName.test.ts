import { displayModelName } from "../modelName";

describe("displayModelName", () => {
  it("drops the company that makes the model", () => {
    expect(displayModelName("anthropic/claude-sonnet-4.6")).toBe(
      "claude-sonnet-4.6"
    );
  });

  it("handles the double-underscore form runs use", () => {
    expect(displayModelName("google__gemini-3-flash")).toBe("gemini-3-flash");
  });

  it("leaves a name with no company unchanged", () => {
    expect(displayModelName("gpt-4.1")).toBe("gpt-4.1");
  });

  it("returns the original string when there is nothing left to show", () => {
    expect(displayModelName("")).toBe("");
    expect(displayModelName("/")).toBe("/");
  });

  it("drops the company in front of the model", () => {
    expect(displayModelName("openai/gpt-5")).toBe("gpt-5");
  });

  it("drops the company when it is joined by two underscores", () => {
    expect(displayModelName("anthropic__claude-sonnet-4.6")).toBe(
      "claude-sonnet-4.6"
    );
  });

  it("names the thinking level a row ran at", () => {
    expect(displayModelName("openai/gpt-5::thinking-high")).toBe(
      "gpt-5 (high thinking)"
    );
  });

  it("names every setting a row ran with", () => {
    expect(displayModelName("openai/gpt-5::thinking-low_host-azure")).toBe(
      "gpt-5 (low thinking, on Azure)"
    );
  });

  it("shows the model on its own when the settings half is empty", () => {
    expect(displayModelName("openai/gpt-5::")).toBe("gpt-5");
  });

  it("passes an unrecognised setting through", () => {
    expect(displayModelName("openai/gpt-5::budget-tight")).toBe(
      "gpt-5 (budget-tight)"
    );
  });

  it("does not throw on a string that is only the separator", () => {
    expect(displayModelName("::")).toBe("");
  });
});
