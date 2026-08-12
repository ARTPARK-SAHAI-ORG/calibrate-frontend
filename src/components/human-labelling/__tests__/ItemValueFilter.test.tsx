import { render, screen, setupUser } from "@/test-utils";
import {
  ItemValueFilter,
  isValueFilterActive,
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
      { value: true, label: "Correct" },
      { value: false, label: "Wrong" },
    ]);
  });

  it("uses the evaluator's own binary labels when it has them", () => {
    expect(valueFilterOptions(binaryCustom)).toEqual([
      { value: true, label: "Polite" },
      { value: false, label: "Rude" },
    ]);
  });

  it("offers one option per rating level, naming the levels that have names", () => {
    expect(valueFilterOptions(rating)).toEqual([
      { value: 1, label: "1 — Poor" },
      { value: 2, label: "2" },
      { value: 3, label: "3 — Great" },
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

describe("ItemValueFilter", () => {
  it("renders nothing when no evaluator can be filtered on", () => {
    const { container } = render(
      <ItemValueFilter
        evaluators={[{ uuid: "ev", output_type: "rating" }]}
        filter={null}
        onChange={jest.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows no value options until an evaluator is picked", () => {
    render(
      <ItemValueFilter
        evaluators={[binary]}
        filter={null}
        onChange={jest.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Correct" })).toBeNull();
  });

  it("picking an evaluator reports it with no values yet", async () => {
    const user = setupUser();
    const onChange = jest.fn();
    render(
      <ItemValueFilter
        evaluators={[binary, rating]}
        filter={null}
        onChange={onChange}
      />,
    );
    await user.selectOptions(
      screen.getByLabelText("Filter by evaluator"),
      "ev-rating",
    );
    expect(onChange).toHaveBeenCalledWith({
      evaluatorId: "ev-rating",
      values: [],
    });
  });

  it("adds a value on click and removes it on a second click", async () => {
    const user = setupUser();
    const onChange = jest.fn();
    const filter: ValueFilter = { evaluatorId: "ev-binary", values: [] };
    const { rerender } = render(
      <ItemValueFilter
        evaluators={[binary]}
        filter={filter}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Wrong" }));
    expect(onChange).toHaveBeenCalledWith({
      evaluatorId: "ev-binary",
      values: [false],
    });

    rerender(
      <ItemValueFilter
        evaluators={[binary]}
        filter={{ evaluatorId: "ev-binary", values: [false] }}
        onChange={onChange}
      />,
    );
    const wrong = screen.getByRole("button", { name: "Wrong" });
    expect(wrong).toHaveAttribute("aria-pressed", "true");
    await user.click(wrong);
    expect(onChange).toHaveBeenLastCalledWith({
      evaluatorId: "ev-binary",
      values: [],
    });
  });

  it("keeps several values of the same evaluator", async () => {
    const user = setupUser();
    const onChange = jest.fn();
    render(
      <ItemValueFilter
        evaluators={[rating]}
        filter={{ evaluatorId: "ev-rating", values: [1] }}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: "3 — Great" }));
    expect(onChange).toHaveBeenCalledWith({
      evaluatorId: "ev-rating",
      values: [1, 3],
    });
  });

  it("Clear appears only once a value is picked and resets the filter", async () => {
    const user = setupUser();
    const onChange = jest.fn();
    const { rerender } = render(
      <ItemValueFilter
        evaluators={[binary]}
        filter={{ evaluatorId: "ev-binary", values: [] }}
        onChange={onChange}
      />,
    );
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();

    rerender(
      <ItemValueFilter
        evaluators={[binary]}
        filter={{ evaluatorId: "ev-binary", values: [true] }}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("choosing Any evaluator resets the filter", async () => {
    const user = setupUser();
    const onChange = jest.fn();
    render(
      <ItemValueFilter
        evaluators={[binary]}
        filter={{ evaluatorId: "ev-binary", values: [true] }}
        onChange={onChange}
      />,
    );
    await user.selectOptions(screen.getByLabelText("Filter by evaluator"), "");
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
