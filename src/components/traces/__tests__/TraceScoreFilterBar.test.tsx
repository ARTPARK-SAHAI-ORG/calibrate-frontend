import { render, screen, setupUser } from "@/test-utils";
import {
  TraceScoreFilterBar,
  scoreConditionOptions,
} from "../TraceScoreFilterBar";

describe("scoreConditionOptions", () => {
  it("offers the two verdicts for a yes-or-no evaluator", () => {
    expect(
      scoreConditionOptions({
        evaluator_uuid: "ev-1",
        name: "Tone",
        output_type: "binary",
      }),
    ).toEqual([
      { value: "passed", label: "Correct" },
      { value: "failed", label: "Wrong" },
    ]);
  });

  it("offers the two verdicts when the scale is not known", () => {
    expect(
      scoreConditionOptions({ evaluator_uuid: "ev-1", name: "Tone" }),
    ).toEqual([
      { value: "passed", label: "Correct" },
      { value: "failed", label: "Wrong" },
    ]);
    // A rating with no numbers on it, or an upside-down one, cannot be
    // offered by its scores either.
    expect(
      scoreConditionOptions({
        evaluator_uuid: "ev-1",
        name: "Tone",
        output_type: "rating",
        scale_min: null,
        scale_max: null,
      }),
    ).toEqual([
      { value: "passed", label: "Correct" },
      { value: "failed", label: "Wrong" },
    ]);
  });

  it("offers every score on a rating's scale, and the middle ones with everything below them", () => {
    expect(
      scoreConditionOptions({
        evaluator_uuid: "ev-2",
        name: "Accuracy",
        output_type: "rating",
        scale_min: 1,
        scale_max: 5,
      }),
    ).toEqual([
      { value: "=1", label: "scored 1" },
      { value: "=2", label: "scored 2" },
      { value: "=3", label: "scored 3" },
      { value: "=4", label: "scored 4" },
      { value: "=5", label: "scored 5" },
      // No "1 or below": on the lowest score it would mean the same as
      // "scored 1". No "5 or below" either: that is the whole scale.
      { value: "<=2", label: "scored 2 or below" },
      { value: "<=3", label: "scored 3 or below" },
      { value: "<=4", label: "scored 4 or below" },
    ]);
  });

  it("offers the two verdicts when a rating's scale has only one value", () => {
    expect(
      scoreConditionOptions({
        evaluator_uuid: "ev-3",
        name: "Flat",
        output_type: "rating",
        scale_min: 3,
        scale_max: 3,
      }).map((option) => option.value),
    ).toEqual(["passed", "failed"]);
  });
});

describe("TraceScoreFilterBar", () => {
  const evaluators = [
    { evaluator_uuid: "ev-1", name: "Tone", output_type: "binary" as const },
    {
      evaluator_uuid: "ev-2",
      name: "Accuracy",
      output_type: "rating" as const,
      scale_min: 1,
      scale_max: 3,
    },
  ];

  it("renders nothing when no evaluator can score", () => {
    const { container } = render(
      <TraceScoreFilterBar evaluators={[]} value={{}} onChange={jest.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("reports a picked condition under the evaluator it belongs to", async () => {
    const user = setupUser();
    const onChange = jest.fn();
    render(
      <TraceScoreFilterBar
        evaluators={evaluators}
        value={{ "ev-1": "failed" }}
        onChange={onChange}
      />,
    );

    await user.selectOptions(
      screen.getByLabelText("Filter traces by Accuracy"),
      "<=2",
    );
    expect(onChange).toHaveBeenCalledWith({ "ev-1": "failed", "ev-2": "<=2" });
  });

  it("takes an evaluator back out of the filter when any score is picked", async () => {
    const user = setupUser();
    const onChange = jest.fn();
    render(
      <TraceScoreFilterBar
        evaluators={evaluators}
        value={{ "ev-1": "failed", "ev-2": "=3" }}
        onChange={onChange}
      />,
    );

    await user.selectOptions(
      screen.getByLabelText("Filter traces by Tone"),
      "Tone: any score",
    );
    expect(onChange).toHaveBeenCalledWith({ "ev-2": "=3" });
  });
});
