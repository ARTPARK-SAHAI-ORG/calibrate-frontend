import { fireEvent, render, screen, setupUser } from "@/test-utils";
import { KappaCell } from "../KappaCell";

describe("KappaCell", () => {
  it("does not follow the row's link when its info icon is clicked", () => {
    const openRow = jest.fn();
    render(
      <a onClick={openRow}>
        <KappaCell fields={{ kappa: 0.4, kappa_type: "cohen" }} />
      </a>,
    );
    const icon = screen.getByRole("button", { name: "Cohen's kappa" });
    // fireEvent returns false when the click's default was cancelled.
    expect(fireEvent.click(icon)).toBe(false);
    expect(openRow).not.toHaveBeenCalled();
  });

  it("shows only the kappa, with its kind on hover of the info icon", async () => {
    const user = setupUser();
    render(<KappaCell fields={{ kappa: 0.4267, kappa_type: "fleiss" }} />);
    expect(screen.getByText("0.43")).toBeInTheDocument();
    expect(screen.queryByText("Fleiss' kappa")).not.toBeInTheDocument();
    await user.hover(screen.getByRole("button", { name: "Fleiss' kappa" }));
    expect(await screen.findByText("Fleiss' kappa")).toBeInTheDocument();
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
      expect(screen.queryByText(help)).not.toBeInTheDocument();
      await user.hover(screen.getByRole("button", { name: help }));
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
});
