import { render, screen, setupUser, within } from "@/test-utils";
import { buildOverviewRows } from "@/lib/taskOverviewData";
import { AgreementOverviewTable } from "../AgreementOverviewTable";

const rows = buildOverviewRows([
  {
    evaluator_id: "ev-1",
    name: "Tone",
    current: 0.9,
    pair_count: 4,
    kappa: 0.5,
    kappa_type: "cohen",
    chance_agreement: 0.6,
    inter_annotator: {
      current: 0.4,
      pair_count: 3,
      kappa: null,
      kappa_type: "cohen",
      kappa_blank_reason: "too_few_items",
      chance_agreement: 0.55,
    },
  },
  {
    evaluator_id: "ev-2",
    name: "Clarity",
    current: 0.5,
    pair_count: 2,
    kappa: 0,
    kappa_type: "linear_weighted_cohen",
    chance_agreement: 0.5,
  },
  {
    evaluator_id: "ev-3",
    name: "Brevity",
    current: 0.7,
    pair_count: 2,
    kappa: null,
    kappa_type: "cohen",
    chance_agreement: null,
  },
]);

function renderTable(onSort = jest.fn(), onOpenEvaluator = jest.fn()) {
  render(
    <AgreementOverviewTable
      rows={rows}
      sortKey="withHumans"
      sortDir="desc"
      onSort={onSort}
      onOpenEvaluator={onOpenEvaluator}
    />,
  );
  return { onSort, onOpenEvaluator };
}

// The table and the cards are both on the page; the screen width picks one.
const table = () =>
  screen
    .getByRole("button", { name: /^Evaluator$/ })
    .closest(".md\\:block") as HTMLElement;
const tableRow = (name: string) =>
  within(table()).getByRole("button", { name }).closest(".grid") as HTMLElement;
const cells = (row: HTMLElement) => [...row.children] as HTMLElement[];

describe("AgreementOverviewTable", () => {
  it("has an Evaluator column and one column per measure, each after a divider", () => {
    renderTable();
    const header = cells(
      within(table()).getByRole("button", { name: /^Evaluator$/ })
        .parentElement as HTMLElement,
    );
    expect(header.map((c) => c.textContent)).toEqual([
      "Evaluator",
      "Inter-annotator agreement",
      "Evaluator agreement with humans",
    ]);
    expect(header[0].className).not.toContain("border-l");
    expect(header[1].className).toContain("border-l");
    expect(header[2].className).toContain("border-l");
    expect(cells(tableRow("Tone"))[1].className).toContain("border-l");
  });

  it("puts the kind of answer beside the name, on the same line", () => {
    renderTable();
    const nameCell = cells(tableRow("Tone"))[0];
    expect(nameCell.className).toContain("flex");
    expect(within(nameCell).getByText("binary")).toBeInTheDocument();
    expect(
      within(cells(tableRow("Clarity"))[0]).getByText("rating"),
    ).toBeInTheDocument();
  });

  it("shows the agreement, the kappa and a bar against chance in each measure", () => {
    renderTable();
    const withHumans = cells(tableRow("Tone"))[2];
    expect(withHumans).toHaveTextContent("90%Kappa0.50");
    expect(within(withHumans).getByText("90%").className).toContain(
      "text-foreground",
    );
    const fill = within(withHumans).getByTestId("agreement-fill");
    expect(fill.style.width).toBe("90%");
    expect(fill.className).toContain("bg-green-500");
    expect(within(withHumans).getByTestId("chance-tick").style.left).toBe(
      "60%",
    );

    const inter = cells(tableRow("Tone"))[1];
    expect(inter).toHaveTextContent("40%KappaToo few items");
    expect(within(inter).getByTestId("agreement-fill").className).toContain(
      "bg-red-500",
    );
  });

  it("mutes the bar when agreement equals chance or chance is unknown", () => {
    renderTable();
    const clarity = cells(tableRow("Clarity"))[2];
    expect(within(clarity).getByTestId("agreement-fill").className).toContain(
      "bg-muted-foreground",
    );
    const brevity = cells(tableRow("Brevity"))[2];
    expect(within(brevity).getByTestId("agreement-fill").className).toContain(
      "bg-muted-foreground",
    );
    expect(
      within(brevity).queryByTestId("chance-tick"),
    ).not.toBeInTheDocument();
  });

  it("shows only a muted dash, with no bar, for a measure with no agreement", () => {
    renderTable();
    const inter = cells(tableRow("Clarity"))[1];
    expect(inter.textContent).toBe("—");
    expect(within(inter).getByText("—").className).toContain(
      "text-muted-foreground",
    );
    expect(
      within(inter).queryByTestId("agreement-fill"),
    ).not.toBeInTheDocument();
  });

  it("sorts by name or by either measure, and opens an evaluator", async () => {
    const user = setupUser();
    const { onSort, onOpenEvaluator } = renderTable();
    const t = within(table());
    await user.click(t.getByRole("button", { name: /^Evaluator$/ }));
    expect(onSort).toHaveBeenLastCalledWith("name");
    await user.click(t.getByRole("button", { name: /^Inter-annotator agreement$/ }));
    expect(onSort).toHaveBeenLastCalledWith("interAnnotator");
    await user.click(
      t.getByRole("button", { name: /^Evaluator agreement with humans$/ }),
    );
    expect(onSort).toHaveBeenLastCalledWith("withHumans");
    await user.click(t.getByRole("button", { name: "Tone" }));
    expect(onOpenEvaluator).toHaveBeenCalledWith({
      uuid: "ev-1",
      name: "Tone",
    });
  });

  it("shows the same measures stacked on each card", () => {
    renderTable();
    const card = screen
      .getAllByText("Inter-annotator agreement")
      .find((el) => el.tagName === "P")!
      .closest(".rounded-xl") as HTMLElement;
    expect(card).toHaveTextContent("Inter-annotator agreement40%KappaToo few items");
    expect(card).toHaveTextContent("Evaluator agreement with humans90%Kappa0.50");
    expect(within(card).getAllByTestId("agreement-fill")).toHaveLength(2);
  });

  it("explains the bar with a legend above the table", () => {
    renderTable();
    for (const text of [
      "Agreement expected by chance alone",
      "Better than chance",
      "Worse than chance",
      "Cannot be compared with chance",
    ])
      expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("has no legend when no row has a bar", () => {
    render(
      <AgreementOverviewTable
        rows={buildOverviewRows([
          { evaluator_id: "ev-9", name: "New", current: null, pair_count: 0 },
        ])}
        sortKey="name"
        sortDir="asc"
        onSort={jest.fn()}
        onOpenEvaluator={jest.fn()}
      />,
    );
    expect(screen.queryByText("Better than chance")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Agreement expected by chance alone"),
    ).not.toBeInTheDocument();
  });
});

