import React from "react";
import { render, screen } from "@/test-utils";
import { ModelProblemNote } from "@/components/ModelProblemNote";

const STEPS = ["pick", "newVersion", "comparison"] as const;

describe("ModelProblemNote", () => {
  it("draws nothing with no problem", () => {
    const { container } = render(<ModelProblemNote problem={null} nextStep="pick" />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ["pick", "Pick another one."],
    ["newVersion", "Pick another model."],
    ["comparison", "Remove it or pick another one."],
  ] as const)("retired and privacy, %s", (nextStep, step) => {
    const { unmount } = render(
      <ModelProblemNote problem={{ kind: "retired" }} nextStep={nextStep} />,
    );
    expect(
      screen.getByText(`This model is no longer available. ${step}`),
    ).toBeInTheDocument();
    unmount();
    render(<ModelProblemNote problem={{ kind: "privacy" }} nextStep={nextStep} />);
    expect(
      screen.getByText(
        `This model cannot be used. ${step}`,
      ),
    ).toBeInTheDocument();
  });

  it.each(STEPS)("soon, %s", (nextStep) => {
    render(
      <ModelProblemNote
        problem={{ kind: "soon", expiresOn: "2026-12-11" }}
        nextStep={nextStep}
      />,
    );
    const step =
      nextStep === "pick"
        ? "Pick another one before then."
        : nextStep === "newVersion"
          ? "Pick another model."
          : "Remove it or pick another one.";
    expect(
      screen.getByText(`This model will be removed on 11 December 2026. ${step}`),
    ).toBeInTheDocument();
  });
});
