import { render, screen } from "@/test-utils";
import { StoppedRunPill } from "../StoppedRunPill";

describe("StoppedRunPill", () => {
  it("says the run was stopped", () => {
    render(<StoppedRunPill />);
    expect(screen.getByText("Stopped")).toBeInTheDocument();
  });
});
