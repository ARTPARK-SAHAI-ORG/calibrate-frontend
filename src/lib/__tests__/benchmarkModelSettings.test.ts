import {
  benchmarkModelsPayload,
  benchmarkVariantId,
  describeSettingsSlug,
  duplicateModelRows,
  hasModelSettings,
  modelOfVariantId,
  modelSettingsExtra,
  modelSettingsSlug,
  rowsFromModelIds,
} from "../benchmarkModelSettings";

describe("hasModelSettings", () => {
  it("is false for nothing picked", () => {
    expect(hasModelSettings(undefined)).toBe(false);
    expect(hasModelSettings({})).toBe(false);
  });

  it("is true once either setting is picked", () => {
    expect(hasModelSettings({ thinking: "low" })).toBe(true);
    expect(hasModelSettings({ hostedBy: "azure" })).toBe(true);
  });
});

describe("modelSettingsExtra", () => {
  it("sends nothing when nothing is picked", () => {
    expect(modelSettingsExtra(undefined)).toBeUndefined();
    expect(modelSettingsExtra({})).toBeUndefined();
  });

  it("writes the thinking level as a reasoning effort", () => {
    expect(modelSettingsExtra({ thinking: "high" })).toEqual({
      reasoning: { effort: "high" },
    });
  });

  it("pins the host and turns off falling back to another one", () => {
    expect(modelSettingsExtra({ hostedBy: "azure" })).toEqual({
      provider: { only: ["azure"], allow_fallbacks: false },
    });
  });

  it("carries both when both are picked", () => {
    expect(
      modelSettingsExtra({ thinking: "low", hostedBy: "google-vertex" }),
    ).toEqual({
      reasoning: { effort: "low" },
      provider: { only: ["google-vertex"], allow_fallbacks: false },
    });
  });
});

describe("modelSettingsSlug", () => {
  it("is empty when nothing is picked", () => {
    expect(modelSettingsSlug(undefined)).toBe("");
    expect(modelSettingsSlug({})).toBe("");
  });

  it("spells the settings in a fixed order whichever way they were set", () => {
    expect(modelSettingsSlug({ thinking: "high", hostedBy: "azure" })).toBe(
      "thinking-high_host-azure",
    );
    expect(modelSettingsSlug({ hostedBy: "azure", thinking: "high" })).toBe(
      "thinking-high_host-azure",
    );
  });
});

describe("benchmarkVariantId", () => {
  it("leaves a model with no settings exactly as it was", () => {
    expect(benchmarkVariantId("openai/gpt-5")).toBe("openai/gpt-5");
    expect(benchmarkVariantId("openai/gpt-5", {})).toBe("openai/gpt-5");
  });

  it("gives two rows of one model different ids", () => {
    const high = benchmarkVariantId("openai/gpt-5", { thinking: "high" });
    const low = benchmarkVariantId("openai/gpt-5", { thinking: "low" });
    expect(high).toBe("openai/gpt-5::thinking-high");
    expect(low).toBe("openai/gpt-5::thinking-low");
    expect(high).not.toBe(low);
  });

  it("reads the model back out of a variant id", () => {
    expect(modelOfVariantId("openai/gpt-5::thinking-high")).toBe(
      "openai/gpt-5",
    );
    expect(modelOfVariantId("openai/gpt-5")).toBe("openai/gpt-5");
  });
});

describe("describeSettingsSlug", () => {
  it("says the thinking level in words", () => {
    expect(describeSettingsSlug("thinking-high")).toBe("high thinking");
  });

  it("says the host in words", () => {
    expect(describeSettingsSlug("host-azure")).toBe("on Azure");
    expect(describeSettingsSlug("host-amazon-bedrock")).toBe("on AWS Bedrock");
  });

  it("says both", () => {
    expect(describeSettingsSlug("thinking-low_host-azure")).toBe(
      "low thinking, on Azure",
    );
  });

  it("passes through a part it does not know rather than dropping it", () => {
    expect(describeSettingsSlug("host-novita")).toBe("on novita");
    expect(describeSettingsSlug("something-else")).toBe("something-else");
  });

  it("is empty for an empty slug", () => {
    expect(describeSettingsSlug("")).toBe("");
  });
});

describe("benchmarkModelsPayload", () => {
  it("sends the plain model ids when nobody touched the settings", () => {
    expect(
      benchmarkModelsPayload([
        { model: "openai/gpt-5" },
        { model: "anthropic/claude-sonnet-4.6", settings: {} },
      ]),
    ).toEqual(["openai/gpt-5", "anthropic/claude-sonnet-4.6"]);
  });

  it("switches the whole list to objects as soon as one row has a setting", () => {
    expect(
      benchmarkModelsPayload([
        { model: "openai/gpt-5", settings: { thinking: "high" } },
        { model: "openai/gpt-5", settings: { thinking: "low" } },
        { model: "anthropic/claude-sonnet-4.6" },
      ]),
    ).toEqual([
      {
        id: "openai/gpt-5::thinking-high",
        model: "openai/gpt-5",
        extra: { reasoning: { effort: "high" } },
      },
      {
        id: "openai/gpt-5::thinking-low",
        model: "openai/gpt-5",
        extra: { reasoning: { effort: "low" } },
      },
      {
        id: "anthropic/claude-sonnet-4.6",
        model: "anthropic/claude-sonnet-4.6",
      },
    ]);
  });
});

describe("rowsFromModelIds", () => {
  it("reopens a plain comparison with no settings picked", () => {
    expect(rowsFromModelIds(["openai/gpt-5"])).toEqual([
      { model: "openai/gpt-5", settings: {} },
    ]);
  });

  it("reopens a comparison with its thinking levels already chosen", () => {
    expect(
      rowsFromModelIds([
        "openai/gpt-5::thinking-high",
        "openai/gpt-5::thinking-low_host-azure",
      ]),
    ).toEqual([
      { model: "openai/gpt-5", settings: { thinking: "high" } },
      {
        model: "openai/gpt-5",
        settings: { thinking: "low", hostedBy: "azure" },
      },
    ]);
  });

  it("ignores a thinking level it does not know", () => {
    expect(rowsFromModelIds(["openai/gpt-5::thinking-extreme"])).toEqual([
      { model: "openai/gpt-5", settings: {} },
    ]);
  });

  it("survives a round trip", () => {
    const rows = [
      { model: "openai/gpt-5", settings: { thinking: "high" as const } },
      { model: "openai/gpt-5", settings: { thinking: "low" as const } },
    ];
    const ids = rows.map((r) => benchmarkVariantId(r.model, r.settings));
    expect(rowsFromModelIds(ids)).toEqual(rows);
  });
});

describe("duplicateModelRows", () => {
  it("is false for two different models", () => {
    expect(
      duplicateModelRows([
        { model: "openai/gpt-5" },
        { model: "anthropic/claude-sonnet-4.6" },
      ]),
    ).toBe(false);
  });

  it("is false for one model under two different settings", () => {
    expect(
      duplicateModelRows([
        { model: "openai/gpt-5", settings: { thinking: "high" } },
        { model: "openai/gpt-5", settings: { thinking: "low" } },
      ]),
    ).toBe(false);
  });

  it("is true for one model asked for the same way twice", () => {
    expect(
      duplicateModelRows([
        { model: "openai/gpt-5", settings: { thinking: "high" } },
        { model: "openai/gpt-5", settings: { thinking: "high" } },
      ]),
    ).toBe(true);
    expect(
      duplicateModelRows([{ model: "openai/gpt-5" }, { model: "openai/gpt-5" }]),
    ).toBe(true);
  });
});
