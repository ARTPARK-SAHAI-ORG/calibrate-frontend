import { render, screen, setupUser } from "@/test-utils";
import {
  ItemValueFilter,
  activeValueFilters,
  describeValueFilter,
  isValueFilterActive,
  matchesAllValueFilters,
  matchesValueFilter,
  valueFilterEvaluators,
  valueFilterOptions,
  type ValueFilter,
  type ValueFilterEvaluator,
} from "../ItemValueFilter";

const binary: ValueFilterEvaluator = {
  uuid: "ev-binary",
  name: "Correctness",
  output_type: "binary",
};

const binaryCustom: ValueFilterEvaluator = {
  uuid: "ev-binary-custom",
  name: "Politeness",
  output_type: "binary",
  output_config: {
    scale: [
      { value: true, name: "Polite" },
      { value: false, name: "Rude" },
    ],
  },
};

const rating: ValueFilterEvaluator = {
  uuid: "ev-rating",
  name: "Helpfulness",
  output_type: "rating",
  scale_min: 1,
  scale_max: 3,
  output_config: {
    scale: [
      { value: 1, name: "Poor" },
      { value: 3, name: "Great" },
    ],
  },
};

describe("valueFilterOptions", () => {
  it("offers both verdicts with the default labels for a binary evaluator", () => {
    expect(valueFilterOptions(binary)).toEqual([
      { value: true, label: "Correct", shortLabel: "Correct" },
      { value: false, label: "Wrong", shortLabel: "Wrong" },
    ]);
  });

  it("uses the evaluator's own binary labels when it has them", () => {
    expect(valueFilterOptions(binaryCustom)).toEqual([
      { value: true, label: "Polite", shortLabel: "Polite" },
      { value: false, label: "Rude", shortLabel: "Rude" },
    ]);
  });

  it("offers one option per rating level, naming the levels that have names", () => {
    expect(valueFilterOptions(rating)).toEqual([
      { value: 1, label: "1 — Poor", shortLabel: "Poor" },
      { value: 2, label: "2", shortLabel: "2" },
      { value: 3, label: "3 — Great", shortLabel: "Great" },
    ]);
  });

  it("offers nothing for a rating evaluator with no scale bounds", () => {
    expect(
      valueFilterOptions({ uuid: "ev", output_type: "rating" }),
    ).toEqual([]);
  });

  it("offers nothing when the rating bounds are back to front", () => {
    expect(
      valueFilterOptions({
        uuid: "ev",
        output_type: "rating",
        scale_min: 5,
        scale_max: 1,
      }),
    ).toEqual([]);
  });

  it("does not read a rating scale as true/false", () => {
    // A rating scale's level 1 must never be picked up as the "true" label.
    const opts = valueFilterOptions(rating);
    expect(opts.every((o) => typeof o.value === "number")).toBe(true);
  });
});

describe("valueFilterEvaluators", () => {
  it("drops evaluators that cannot be filtered on", () => {
    const unusable: ValueFilterEvaluator = {
      uuid: "ev-bad",
      output_type: "rating",
    };
    expect(
      valueFilterEvaluators([binary, unusable, rating]).map((e) => e.uuid),
    ).toEqual(["ev-binary", "ev-rating"]);
  });

  it("lists an evaluator once even when a run scored several of its versions", () => {
    // The run page's list holds one row per pinned version, so the same
    // evaluator arrives twice. Filtering is keyed by uuid alone.
    const v2: ValueFilterEvaluator = { ...rating, scale_max: 5 };
    expect(valueFilterEvaluators([rating, v2])).toEqual([rating]);
  });

  it("keeps a later version when the first one has no options to pick", () => {
    const noBounds: ValueFilterEvaluator = {
      uuid: "ev-rating",
      name: "Helpfulness",
      output_type: "rating",
    };
    expect(valueFilterEvaluators([noBounds, rating])).toEqual([rating]);
  });
});

describe("matchesValueFilter", () => {
  it("matches a boolean score", () => {
    expect(matchesValueFilter(false, [false])).toBe(true);
    expect(matchesValueFilter(true, [false])).toBe(false);
  });

  it("matches scores stored as 1/0 or yes/no", () => {
    expect(matchesValueFilter(1, [true])).toBe(true);
    expect(matchesValueFilter(0, [false])).toBe(true);
    expect(matchesValueFilter("no", [false])).toBe(true);
  });

  it("matches a rating level", () => {
    expect(matchesValueFilter(3, [1, 3])).toBe(true);
    expect(matchesValueFilter(2, [1, 3])).toBe(false);
  });

  it("never lets a boolean satisfy a rating level", () => {
    expect(matchesValueFilter(true, [1])).toBe(false);
  });

  it("does not match a missing score", () => {
    expect(matchesValueFilter(undefined, [true, false])).toBe(false);
    expect(matchesValueFilter(null, [1, 2, 3])).toBe(false);
  });

  it("matches nothing when no value is picked", () => {
    expect(matchesValueFilter(true, [])).toBe(false);
  });
});

describe("isValueFilterActive", () => {
  it("is inactive until a value is picked", () => {
    expect(isValueFilterActive(null)).toBe(false);
    expect(isValueFilterActive({ evaluatorId: "ev", values: [] })).toBe(false);
    expect(isValueFilterActive({ evaluatorId: "ev", values: [true] })).toBe(
      true,
    );
  });
});

describe("describeValueFilter", () => {
  it("reads as a sentence for one value", () => {
    expect(
      describeValueFilter(binary, { evaluatorId: "ev-binary", values: [false] }),
    ).toBe("Correctness is Wrong");
  });

  it("joins two values with or, naming the levels rather than numbering them", () => {
    expect(
      describeValueFilter(rating, { evaluatorId: "ev-rating", values: [1, 3] }),
    ).toBe("Helpfulness is Poor or Great");
  });

  it("falls back to the number for a level with no name", () => {
    expect(
      describeValueFilter(rating, { evaluatorId: "ev-rating", values: [2] }),
    ).toBe("Helpfulness is 2");
  });

  it("collapses to a count past two values, so the bar stays short", () => {
    expect(
      describeValueFilter(rating, {
        evaluatorId: "ev-rating",
        values: [1, 2, 3],
      }),
    ).toBe("Helpfulness is 3 of 3 scores");
  });

  it("adds whose answer it reads when the filter has a source", () => {
    expect(
      describeValueFilter(binary, {
        evaluatorId: "ev-binary",
        values: [false],
        source: "human",
      }),
    ).toBe("Correctness is Wrong by a human");
  });

  it("falls back to the evaluator name when nothing is picked", () => {
    expect(
      describeValueFilter(binary, { evaluatorId: "ev-binary", values: [] }),
    ).toBe("Correctness");
  });
});

describe("activeValueFilters", () => {
  it("drops the ones with no value picked", () => {
    const live = { evaluatorId: "a", values: [true] };
    expect(
      activeValueFilters([{ evaluatorId: "b", values: [] }, live]),
    ).toEqual([live]);
  });
});

describe("matchesAllValueFilters", () => {
  const scores: Record<string, Record<string, unknown[]>> = {
    "item-1": { "ev-binary": [false], "ev-rating": [1] },
    "item-2": { "ev-binary": [false], "ev-rating": [5] },
    "item-3": { "ev-binary": [true], "ev-rating": [1] },
  };
  const scoresFor = (item: string, ev: string) => scores[item]?.[ev] ?? [];
  const evs = [binary, rating];

  it("an item has to satisfy every filter", () => {
    const filters = [
      { evaluatorId: "ev-binary", values: [false] },
      { evaluatorId: "ev-rating", values: [1] },
    ];
    expect(matchesAllValueFilters("item-1", filters, evs, scoresFor)).toBe(true);
    expect(matchesAllValueFilters("item-2", filters, evs, scoresFor)).toBe(false);
    expect(matchesAllValueFilters("item-3", filters, evs, scoresFor)).toBe(false);
  });

  it("keeps everything when no filter is active", () => {
    expect(matchesAllValueFilters("item-3", [], evs, scoresFor)).toBe(true);
    expect(
      matchesAllValueFilters(
        "item-3",
        [{ evaluatorId: "ev-binary", values: [] }],
        evs,
        scoresFor,
      ),
    ).toBe(true);
  });

  it("any one of an evaluator's scores matching is enough", () => {
    // The run page can hold one score per evaluator version.
    const twoVersions = () => [2, 5];
    expect(
      matchesAllValueFilters(
        "item-1",
        [{ evaluatorId: "ev-rating", values: [5] }],
        evs,
        twoVersions,
      ),
    ).toBe(true);
  });

  it("ignores a filter for an evaluator this view does not have", () => {
    // Filter state outlives the run it was made on. An unknown evaluator
    // draws no tag, so it must not silently hide items either.
    expect(
      matchesAllValueFilters(
        "item-3",
        [{ evaluatorId: "ev-gone", values: [true] }],
        evs,
        scoresFor,
      ),
    ).toBe(true);
  });

  it("an item with no score for a known evaluator never matches", () => {
    expect(
      matchesAllValueFilters(
        "item-1",
        [{ evaluatorId: "ev-rating", values: [4] }],
        evs,
        scoresFor,
      ),
    ).toBe(false);
  });
});

describe("ItemValueFilter", () => {
  const noop = jest.fn();

  it("renders nothing when no evaluator can be filtered on", () => {
    const { container } = render(
      <ItemValueFilter
        evaluators={[{ uuid: "ev", output_type: "rating" }]}
        filters={[]}
        onChange={noop}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows only the add button before anything is picked", () => {
    render(
      <ItemValueFilter evaluators={[binary]} filters={[]} onChange={noop} />,
    );
    expect(
      screen.getByRole("button", { name: "+ Add filter" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Wrong" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear all" })).toBeNull();
  });

  it("walks from the add button to an evaluator to a value", async () => {
    const user = setupUser();
    const onChange = jest.fn();
    render(
      <ItemValueFilter
        evaluators={[binary, rating]}
        filters={[]}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: "+ Add filter" }));
    // Both evaluators are offered, neither is filtered on yet.
    expect(screen.getByRole("button", { name: /Correctness/ })).toBeVisible();
    await user.click(screen.getByRole("button", { name: /Helpfulness/ }));
    await user.click(screen.getByRole("button", { name: "3 — Great" }));
    expect(onChange).toHaveBeenCalledWith([
      { evaluatorId: "ev-rating", values: [3] },
    ]);
  });

  it("shows a picked filter as a tag", () => {
    render(
      <ItemValueFilter
        evaluators={[binary]}
        filters={[{ evaluatorId: "ev-binary", values: [false] }]}
        onChange={noop}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Correctness is Wrong" }),
    ).toBeInTheDocument();
  });

  it("adds a second value to an existing tag", async () => {
    const user = setupUser();
    const onChange = jest.fn();
    render(
      <ItemValueFilter
        evaluators={[rating]}
        filters={[{ evaluatorId: "ev-rating", values: [1] }]}
        onChange={onChange}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Helpfulness is Poor" }),
    );
    await user.click(screen.getByRole("button", { name: "3 — Great" }));
    expect(onChange).toHaveBeenCalledWith([
      { evaluatorId: "ev-rating", values: [1, 3] },
    ]);
  });

  it("unticking the last value drops the tag entirely", async () => {
    const user = setupUser();
    const onChange = jest.fn();
    render(
      <ItemValueFilter
        evaluators={[binary]}
        filters={[{ evaluatorId: "ev-binary", values: [false] }]}
        onChange={onChange}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Correctness is Wrong" }),
    );
    const wrong = screen.getByRole("button", { name: "Wrong" });
    expect(wrong).toHaveAttribute("aria-pressed", "true");
    await user.click(wrong);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("keeps one evaluator out of the add list once it has a tag", async () => {
    const user = setupUser();
    render(
      <ItemValueFilter
        evaluators={[binary, rating]}
        filters={[{ evaluatorId: "ev-binary", values: [false] }]}
        onChange={noop}
      />,
    );
    await user.click(screen.getByRole("button", { name: "+ Add filter" }));
    expect(screen.getByRole("button", { name: /Helpfulness/ })).toBeVisible();
    // The bare name is the addable row; the tag reads "Correctness is Wrong".
    expect(screen.queryByRole("button", { name: "Correctness" })).toBeNull();
  });

  it("hides the add button once every evaluator has a tag", () => {
    render(
      <ItemValueFilter
        evaluators={[binary]}
        filters={[{ evaluatorId: "ev-binary", values: [false] }]}
        onChange={noop}
      />,
    );
    expect(screen.queryByRole("button", { name: "+ Add filter" })).toBeNull();
  });

  it("the x removes just that one filter", async () => {
    const user = setupUser();
    const onChange = jest.fn();
    const keep = { evaluatorId: "ev-rating", values: [1] };
    render(
      <ItemValueFilter
        evaluators={[binary, rating]}
        filters={[{ evaluatorId: "ev-binary", values: [false] }, keep]}
        onChange={onChange}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Remove Correctness is Wrong" }),
    );
    expect(onChange).toHaveBeenCalledWith([keep]);
  });

  it("Clear all shows only with two tags and removes them all", async () => {
    const user = setupUser();
    const onChange = jest.fn();
    const { rerender } = render(
      <ItemValueFilter
        evaluators={[binary, rating]}
        filters={[{ evaluatorId: "ev-binary", values: [false] }]}
        onChange={onChange}
      />,
    );
    expect(screen.queryByRole("button", { name: "Clear all" })).toBeNull();

    rerender(
      <ItemValueFilter
        evaluators={[binary, rating]}
        filters={[
          { evaluatorId: "ev-binary", values: [false] },
          { evaluatorId: "ev-rating", values: [1] },
        ]}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Clear all" }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("closes the panel on Escape", async () => {
    const user = setupUser();
    render(
      <ItemValueFilter evaluators={[binary]} filters={[]} onChange={noop} />,
    );
    await user.click(screen.getByRole("button", { name: "+ Add filter" }));
    expect(screen.getByRole("button", { name: /Correctness/ })).toBeVisible();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: /Correctness/ })).toBeNull();
  });

  it("draws the add button solid blue with white text, and it still opens", async () => {
    const user = setupUser();
    render(
      <ItemValueFilter evaluators={[binary]} filters={[]} onChange={noop} />,
    );
    const add = screen.getByRole("button", { name: "+ Add filter" });
    expect(add).toHaveClass("bg-blue-600", "text-white", "cursor-pointer");
    await user.click(add);
    expect(add).toHaveClass("bg-blue-700");
    expect(screen.getByRole("button", { name: /Correctness/ })).toBeVisible();
  });

  describe("with showSource", () => {
    it("is off by default: no source is asked or added", async () => {
      const user = setupUser();
      const onChange = jest.fn();
      render(
        <ItemValueFilter evaluators={[binary]} filters={[]} onChange={onChange} />,
      );
      await user.click(screen.getByRole("button", { name: "+ Add filter" }));
      await user.click(screen.getByRole("button", { name: /Correctness/ }));
      expect(screen.queryByText("Whose answer")).toBeNull();
      await user.click(screen.getByRole("button", { name: "Wrong" }));
      expect(onChange).toHaveBeenCalledWith([
        { evaluatorId: "ev-binary", values: [false] },
      ]);
    });

    it("starts a new tag on either, with that choice shown as picked", async () => {
      const user = setupUser();
      const onChange = jest.fn();
      render(
        <ItemValueFilter
          evaluators={[binary]}
          filters={[]}
          onChange={onChange}
          showSource
        />,
      );
      await user.click(screen.getByRole("button", { name: "+ Add filter" }));
      await user.click(screen.getByRole("button", { name: /Correctness/ }));
      expect(screen.getByText("Whose answer")).toBeInTheDocument();
      expect(
        screen.getAllByRole("radio").map((r) => r.textContent),
      ).toEqual([
        "By the evaluator or a human",
        "By the evaluator",
        "By a human",
        "By the evaluator and a human",
      ]);
      expect(
        screen.getByRole("radio", { name: "By the evaluator or a human" }),
      ).toHaveAttribute("aria-checked", "true");
      await user.click(screen.getByRole("button", { name: "Wrong" }));
      expect(onChange).toHaveBeenCalledWith([
        { evaluatorId: "ev-binary", values: [false], source: "either" },
      ]);
    });

    it("changing whose answer keeps the tag in its place", async () => {
      const user = setupUser();
      const onChange = jest.fn();
      const other = { evaluatorId: "ev-rating", values: [1], source: "either" as const };
      render(
        <ItemValueFilter
          evaluators={[binary, rating]}
          filters={[
            { evaluatorId: "ev-binary", values: [false], source: "either" },
            other,
          ]}
          onChange={onChange}
          showSource
        />,
      );
      await user.click(
        screen.getByRole("button", {
          name: "Correctness is Wrong by the evaluator or a human",
        }),
      );
      await user.click(screen.getByRole("radio", { name: "By a human" }));
      expect(onChange).toHaveBeenCalledWith([
        { evaluatorId: "ev-binary", values: [false], source: "human" },
        other,
      ]);
    });

    it("keeps the tag's source when a value is added", async () => {
      const user = setupUser();
      const onChange = jest.fn();
      render(
        <ItemValueFilter
          evaluators={[binary]}
          filters={[{ evaluatorId: "ev-binary", values: [false], source: "both" }]}
          onChange={onChange}
          showSource
        />,
      );
      await user.click(
        screen.getByRole("button", {
          name: "Correctness is Wrong by the evaluator and a human",
        }),
      );
      expect(
        screen.getByRole("radio", { name: "By the evaluator and a human" }),
      ).toHaveAttribute("aria-checked", "true");
      await user.click(screen.getByRole("button", { name: "Correct" }));
      expect(onChange).toHaveBeenCalledWith([
        { evaluatorId: "ev-binary", values: [false, true], source: "both" },
      ]);
    });

    it("names whose answer on the remove button", () => {
      render(
        <ItemValueFilter
          evaluators={[binary]}
          filters={[{ evaluatorId: "ev-binary", values: [false], source: "evaluator" }]}
          onChange={noop}
          showSource
        />,
      );
      expect(
        screen.getByRole("button", {
          name: "Remove Correctness is Wrong by the evaluator",
        }),
      ).toBeInTheDocument();
    });

    it("keeps the source when the last value is unticked", async () => {
      const user = setupUser();
      const onChange = jest.fn();
      render(
        <ItemValueFilter
          evaluators={[binary]}
          filters={[{ evaluatorId: "ev-binary", values: [false], source: "human" }]}
          onChange={onChange}
          showSource
        />,
      );
      await user.click(
        screen.getByRole("button", { name: "Correctness is Wrong by a human" }),
      );
      await user.click(screen.getByRole("button", { name: "Wrong" }));
      expect(onChange).toHaveBeenLastCalledWith([
        { evaluatorId: "ev-binary", values: [], source: "human" },
      ]);
    });

    it("the remove button drops the whole tag", async () => {
      const user = setupUser();
      const onChange = jest.fn();
      render(
        <ItemValueFilter
          evaluators={[binary]}
          filters={[{ evaluatorId: "ev-binary", values: [false], source: "human" }]}
          onChange={onChange}
          showSource
        />,
      );
      await user.click(
        screen.getByRole("button", { name: "Remove Correctness is Wrong by a human" }),
      );
      expect(onChange).toHaveBeenLastCalledWith([]);
    });

    it("reads a tag with no source as the default", () => {
      render(
        <ItemValueFilter
          evaluators={[binary]}
          filters={[{ evaluatorId: "ev-binary", values: [false] }]}
          onChange={noop}
          showSource
        />,
      );
      expect(
        screen.getByRole("button", {
          name: "Correctness is Wrong by the evaluator or a human",
        }),
      ).toBeInTheDocument();
    });
  });

  it("does not name a source on a page that does not offer the choice", () => {
    render(
      <ItemValueFilter
        evaluators={[binary]}
        filters={[{ evaluatorId: "ev-binary", values: [false], source: "human" }]}
        onChange={noop}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Correctness is Wrong" }),
    ).toBeInTheDocument();
  });
});
