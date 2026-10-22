import { render, screen, setupUser } from "@/test-utils";
import { KappaCell } from "../KappaCell";

describe("KappaCell", () => {
  it("shows only the kappa, with its kind on hover of the info icon", async () => {
    const user = setupUser();
    render(<KappaCell fields={{ kappa: 0.4267, kappa_type: "fleiss" }} />);
    expect(screen.getByText("0.43")).toBeInTheDocument();
    expect(screen.queryByText("Fleiss' kappa")).not.toBeInTheDocument();
    await user.hover(screen.getByRole("button", { name: "Kind of kappa" }));
    expect(await screen.findByText("Fleiss' kappa")).toBeInTheDocument();
  });

  it("names a mixed kappa Cohen's when it compares one annotator with the others", async () => {
    const user = setupUser();
    render(
      <KappaCell fields={{ kappa: 0, kappa_type: "mixed" }} oneAgainstOthers />,
    );
    expect(screen.getByText("0.00")).toBeInTheDocument();
    await user.hover(screen.getByRole("button", { name: "Kind of kappa" }));
    expect(
      await screen.findByText("Cohen's kappa, linear weighted for ratings"),
    ).toBeInTheDocument();
  });

  it("shows a dash and no info icon when there is no kappa", () => {
    render(<KappaCell fields={{ kappa: null, kappa_type: null }} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Kind of kappa" }),
    ).not.toBeInTheDocument();
  });
});
