import { render, screen } from "@/test-utils";
import { KappaCell } from "../KappaCell";

describe("KappaCell", () => {
  it("shows the kappa with its kind underneath", () => {
    render(<KappaCell fields={{ kappa: 0.4267, kappa_type: "fleiss" }} />);
    expect(screen.getByText("0.43")).toBeInTheDocument();
    expect(screen.getByText("Fleiss' kappa")).toBeInTheDocument();
  });

  it("names a mixed kappa Cohen's when it compares one annotator with the others", () => {
    render(
      <KappaCell fields={{ kappa: 0, kappa_type: "mixed" }} oneAgainstOthers />,
    );
    expect(screen.getByText("0.00")).toBeInTheDocument();
    expect(
      screen.getByText("Cohen's kappa, linear weighted for ratings"),
    ).toBeInTheDocument();
  });

  it("shows a dash when there is no kappa", () => {
    render(<KappaCell fields={{ kappa: null, kappa_type: null }} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
