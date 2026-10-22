import { render, screen, setupUser } from "@/test-utils";
import { KappaCell, KappaValue } from "../KappaCell";

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

  it.each([
    [
      "too_few_items",
      "Too few items",
      "Kappa needs at least two items, because one item cannot show what chance alone would produce",
    ],
    [
      "everyone_agreed",
      "Everyone agreed",
      "Every answer was the same, so chance alone would also agree every time and kappa cannot be worked out",
    ],
  ] as const)(
    "shows a pill saying why there is no kappa when the reason is %s",
    async (reason, text, help) => {
      const user = setupUser();
      render(
        <KappaCell
          fields={{ kappa: null, kappa_type: null, kappa_blank_reason: reason }}
        />,
      );
      expect(screen.getByText(text).className).toContain("rounded-md");
      expect(screen.queryByText("—")).not.toBeInTheDocument();
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      expect(screen.queryByText(help)).not.toBeInTheDocument();
      await user.hover(screen.getByText(text));
      expect(await screen.findByText(help)).toBeInTheDocument();
    },
  );

  it("shows a dash and no info icon when there is no kappa", () => {
    render(
      <KappaCell
        fields={{ kappa: null, kappa_type: null, kappa_blank_reason: null }}
      />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows a muted dash and no pill when KappaValue has no kappa and no reason", () => {
    render(<KappaValue fields={{ kappa: null, kappa_blank_reason: null }} />);
    expect(screen.getByText("—").className).toContain("text-muted-foreground");
  });

  it("shows the number or the pill in KappaValue", () => {
    const { rerender } = render(<KappaValue fields={{ kappa: 0.123 }} />);
    expect(screen.getByText("0.12")).toBeInTheDocument();
    rerender(
      <KappaValue
        fields={{ kappa: null, kappa_blank_reason: "too_few_items" }}
      />,
    );
    expect(screen.getByText("Too few items").className).toContain(
      "rounded-md",
    );
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });
});
