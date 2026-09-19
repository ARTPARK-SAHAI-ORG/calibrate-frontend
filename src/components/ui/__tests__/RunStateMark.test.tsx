import React from "react";
import { render, screen } from "../../../test-utils";
import { RunStateMark } from "../RunStateMark";

describe("RunStateMark", () => {
  it.each([
    ["finished", "The evaluation ran every test"],
    ["gave_up", "Partially complete as some tests could not be run"],
    ["none_run", "None of the tests could be run"],
    ["stopped", "Someone stopped the evaluation before it finished"],
    ["error", "The evaluation broke before it could finish"],
  ] as const)("says what %s means", (state, tooltip) => {
    render(<RunStateMark state={state} />);
    expect(screen.getByRole("img", { name: tooltip })).toBeInTheDocument();
  });
});
