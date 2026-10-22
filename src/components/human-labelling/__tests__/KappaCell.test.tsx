import { render, screen, setupUser } from "@/test-utils";
import { KappaByKindList, KappaCell } from "../KappaCell";

describe("KappaCell", () => {
  it("shows only the kappa, with its kind on hover of the info icon", async () => {
    const user = setupUser();
    render(<KappaCell fields={{ kappa: 0.4267, kappa_type: "fleiss" }} />);
    expect(screen.getByText("0.43")).toBeInTheDocument();
    expect(screen.queryByText("Fleiss' kappa")).not.toBeInTheDocument();
    await user.hover(screen.getByRole("button", { name: "Fleiss' kappa" }));
    expect(await screen.findByText("Fleiss' kappa")).toBeInTheDocument();
  });

  it("names the kind on the info icon and shows it on keyboard focus", async () => {
    const user = setupUser();
    render(<KappaCell fields={{ kappa: 0.2, kappa_type: "cohen" }} />);
    await user.tab();
    expect(screen.getByRole("button", { name: "Cohen's kappa" })).toHaveFocus();
    expect(await screen.findByText("Cohen's kappa")).toBeInTheDocument();
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
      await user.tab();
      expect(screen.getByRole("button", { name: help })).toHaveFocus();
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

describe("KappaByKindList", () => {
  it("shows one kappa per kind of answer, each after its kind", async () => {
    const user = setupUser();
    render(
      <KappaByKindList
        kinds={[
          { answer_kind: "binary", kappa: 0.2, kappa_type: "cohen" },
          {
            answer_kind: "rating",
            kappa: null,
            kappa_type: "linear_weighted_cohen",
            kappa_blank_reason: "everyone_agreed",
          },
        ]}
      />,
    );
    const binary = screen.getByText("Binary").parentElement!;
    expect(binary).toHaveTextContent("Binary0.20");
    const rating = screen.getByText("Rating").parentElement!;
    expect(rating).toHaveTextContent("RatingEveryone agreed");
    await user.hover(screen.getByRole("button", { name: "Cohen's kappa" }));
    expect(await screen.findByText("Cohen's kappa", { selector: "div" })).toBeInTheDocument();
  });

  it("shows a dash when no kind was compared", () => {
    const { rerender } = render(<KappaByKindList kinds={[]} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    rerender(<KappaByKindList kinds={undefined} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("Binary")).not.toBeInTheDocument();
  });
});

