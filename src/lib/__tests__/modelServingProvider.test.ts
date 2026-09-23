import {
  splitServingProvider,
  withServingProvider,
} from "../modelServingProvider";

describe("withServingProvider", () => {
  it("adds the serving company to the model id", () => {
    expect(withServingProvider("deepseek/deepseek-chat-v3.1", "deepinfra")).toBe(
      "deepseek/deepseek-chat-v3.1@deepinfra",
    );
  });

  it("leaves the id alone when there is no company", () => {
    expect(withServingProvider("deepseek/x", null)).toBe("deepseek/x");
    expect(withServingProvider("deepseek/x", undefined)).toBe("deepseek/x");
    expect(withServingProvider("deepseek/x", "")).toBe("deepseek/x");
    expect(withServingProvider("deepseek/x", "   ")).toBe("deepseek/x");
  });

  it("trims a company with spaces around it", () => {
    expect(withServingProvider("deepseek/x", " novita ")).toBe(
      "deepseek/x@novita",
    );
  });
});

describe("splitServingProvider", () => {
  it("splits the model from the serving company", () => {
    expect(splitServingProvider("deepseek/deepseek-chat-v3.1@deepinfra")).toEqual(
      { model: "deepseek/deepseek-chat-v3.1", provider: "deepinfra" },
    );
  });

  it("gives back a plain model id unchanged", () => {
    expect(splitServingProvider("openai/gpt-4")).toEqual({
      model: "openai/gpt-4",
      provider: null,
    });
    expect(splitServingProvider("")).toEqual({ model: "", provider: null });
  });

  it("splits on the last @ so a model id carrying one keeps it", () => {
    expect(splitServingProvider("some/model@v2@novita")).toEqual({
      model: "some/model@v2",
      provider: "novita",
    });
  });

  it("returns the whole string when either side would be empty", () => {
    expect(splitServingProvider("@deepinfra")).toEqual({
      model: "@deepinfra",
      provider: null,
    });
    expect(splitServingProvider("deepseek/x@")).toEqual({
      model: "deepseek/x@",
      provider: null,
    });
    expect(splitServingProvider("@")).toEqual({ model: "@", provider: null });
  });

  it("round trips", () => {
    expect(
      splitServingProvider(withServingProvider("deepseek/x", "deepinfra")),
    ).toEqual({ model: "deepseek/x", provider: "deepinfra" });
  });
});
