import { render, screen, setupUser, within } from "@/test-utils";
import { buildOverviewRows } from "@/lib/taskOverviewData";
import { AgreementOverviewTable } from "../AgreementOverviewTable";

const rows = buildOverviewRows([
  {
    evaluator_id: "ev-1",
    name: "Tone",
    current: 0.9,
    pair_count: 4,
    series: [],
    kappa: 0.5,
    kappa_type: "cohen",
    inter_annotator: {
      current: 0.7,
      pair_count: 3,
      series: [],
      kappa: null,
      kappa_type: "cohen",
      kappa_blank_reason: "too_few_items",
    },
  },
  {
    evaluator_id: "ev-2",
    name: "Clarity",
    current: 0.4,
    pair_count: 2,
    series: [],
    kappa: 0.25,
    kappa_type: "linear_weighted_cohen",
  },
]);

function renderTable(onSort = jest.fn(), onOpenEvaluator = jest.fn()) {
  render(
    <AgreementOverviewTable
      rows={rows}
      sortKey="current"
      sortDir="desc"
      onSort={onSort}
      onOpenEvaluator={onOpenEvaluator}
    />,
  );
  return { onSort, onOpenEvaluator };
}

// The table and the cards are both in the page; CSS picks one by width.
const table = () =>
  screen.getAllByText("Name")[0].closest(".md\\:block") as HTMLElement;
const tableRow = (name: string) =>
  within(table())
    .getByRole("button", { name })
    .closest(".grid") as HTMLElement;

describe("AgreementOverviewTable", () => {
  it("groups the columns under inter-annotator agreement and agreement with humans", () => {
    renderTable();
    const t = within(table());
    expect(t.getByText("Inter-annotator agreement")).toBeInTheDocument();
    expect(t.getByText("Evaluator agreement with humans")).toBeInTheDocument();
    expect(t.getAllByText("Agreement")).toHaveLength(2);
    expect(t.getAllByText("Kappa")).toHaveLength(2);
    expect(t.queryByText("alignment")).not.toBeInTheDocument();
  });

  it("shows each evaluator's kind of answer and both groups in order", () => {
    renderTable();
    const tone = tableRow("Tone");
    expect(within(tone).getByText("binary")).toBeInTheDocument();
    const cells = [...tone.children].map((c) => c.textContent);
    expect(cells.slice(1)).toEqual(["70%", "Too few items", "90%", "0.50"]);

    const clarity = tableRow("Clarity");
    expect(within(clarity).getByText("rating")).toBeInTheDocument();
    expect([...clarity.children].map((c) => c.textContent).slice(1)).toEqual([
      "—",
      "—",
      "40%",
      "0.25",
    ]);
  });

  it("shows no kind when it cannot be told", () => {
    render(
      <AgreementOverviewTable
        rows={buildOverviewRows([
          { evaluator_id: "ev-3", name: "New", current: null, pair_count: 0, series: [] },
        ])}
        sortKey="name"
        sortDir="asc"
        onSort={jest.fn()}
        onOpenEvaluator={jest.fn()}
      />,
    );
    expect(screen.queryByText("binary")).not.toBeInTheDocument();
    expect(screen.queryByText("rating")).not.toBeInTheDocument();
  });

  it("sorts by name or by agreement with humans, and opens an evaluator", async () => {
    const user = setupUser();
    const { onSort, onOpenEvaluator } = renderTable();
    const t = within(table());
    await user.click(t.getByRole("button", { name: /Name/ }));
    expect(onSort).toHaveBeenLastCalledWith("name");
    await user.click(t.getAllByRole("button", { name: /Agreement/ })[0]);
    expect(onSort).toHaveBeenLastCalledWith("current");
    await user.click(t.getByRole("button", { name: "Tone" }));
    expect(onOpenEvaluator).toHaveBeenCalledWith({ uuid: "ev-1", name: "Tone" });
  });

  it("shows the same groups stacked on each card", () => {
    renderTable();
    const cards = screen
      .getAllByText("Inter-annotator agreement")
      .slice(1)
      .map((el) => el.closest(".rounded-xl") as HTMLElement);
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent(
      "Inter-annotator agreement70%Kappa Too few items",
    );
    expect(cards[0]).toHaveTextContent(
      "Evaluator agreement with humans90%Kappa 0.50",
    );
  });
});
