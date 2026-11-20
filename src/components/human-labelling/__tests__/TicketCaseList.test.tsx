import { render, screen, setupUser, within } from "@/test-utils";
import { fireEvent } from "@testing-library/react";
import { TicketCaseList, type CaseRow } from "../TicketCaseList";

const rows: CaseRow[] = [
  { uuid: "a", position: 1, title: "Ticket aaaa", status: null, preview: "Fever since yesterday", meta: "19:00 · 3.5 h", searchText: "ticket aaaa fever since yesterday" },
  { uuid: "b", position: 2, title: "Ticket bbbb", status: "in progress", preview: "Baby will not feed", meta: "", searchText: "ticket bbbb baby will not feed" },
  { uuid: "c", position: 3, title: "Ticket cccc", status: "completed", preview: "", meta: "20:10", searchText: "ticket cccc" },
];

function setup(currentUuid: string | null = "a") {
  const onSelect = jest.fn();
  const user = setupUser();
  render(<TicketCaseList rows={rows} currentUuid={currentUuid} onSelect={onSelect} />);
  return { onSelect, user };
}

describe("TicketCaseList", () => {
  it("shows each case with what the user wrote, its timing and its state", () => {
    setup();
    expect(screen.getByText("Fever since yesterday")).toBeInTheDocument();
    expect(screen.getByText("1 · 19:00 · 3.5 h")).toBeInTheDocument();
    // A case with no preview falls back to its title, and no timing shows just its place.
    expect(screen.getByText("Ticket cccc")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Case 1, not answered" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Case 2, in progress" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Case 3, completed" })).toBeInTheDocument();
    expect(screen.getByTestId("case-count")).toHaveTextContent("3 of 3 cases · 2 unfinished");
  });

  it("marks the case being read and opens another when it is picked", async () => {
    const { onSelect, user } = setup("b");
    expect(screen.getByRole("button", { name: "Case 2, in progress" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: "Case 1, not answered" })).not.toHaveAttribute("aria-current");
    await user.click(screen.getByRole("button", { name: "Case 3, completed" }));
    expect(onSelect).toHaveBeenCalledWith("c");
  });

  it("searches the whole ticket, and says so when nothing matches", async () => {
    const { user } = setup();
    await user.type(screen.getByRole("searchbox", { name: "Search cases" }), "FEED");
    expect(screen.getByTestId("case-count")).toHaveTextContent("1 of 3 cases");
    expect(screen.getByText("Baby will not feed")).toBeInTheDocument();
    expect(screen.queryByText("Fever since yesterday")).not.toBeInTheDocument();
    await user.type(screen.getByRole("searchbox", { name: "Search cases" }), "zzz");
    expect(screen.getByText(/No cases match/)).toBeInTheDocument();
  });

  it("clears the search with Escape", async () => {
    const { user } = setup();
    const box = screen.getByRole("searchbox", { name: "Search cases" });
    await user.type(box, "feed");
    await user.keyboard("{Escape}");
    expect(box).toHaveValue("");
    expect(screen.getByTestId("case-count")).toHaveTextContent("3 of 3 cases");
  });

  it("narrows to the cases still to do", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("checkbox", { name: "Show unfinished only" }));
    expect(screen.getByTestId("case-count")).toHaveTextContent("2 of 3 cases");
    expect(screen.queryByRole("button", { name: "Case 3, completed" })).not.toBeInTheDocument();
  });

  it("jumps to the search box on /, but not while typing somewhere else", async () => {
    const { user } = setup();
    const box = screen.getByRole("searchbox", { name: "Search cases" });
    await user.keyboard("/");
    expect(box).toHaveFocus();
    expect(box).toHaveValue("");

    box.blur();
    const other = document.createElement("input");
    document.body.appendChild(other);
    other.focus();
    fireEvent.keyDown(other, { key: "/" });
    expect(other).toHaveFocus();
    other.remove();

    fireEvent.keyDown(window, { key: "/", ctrlKey: true });
    expect(box).not.toHaveFocus();
  });

  it("folds the list away and brings it back", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Fold away the list of cases" }));
    const list = screen.getByTestId("ticket-case-list");
    expect(list.className).toContain("md:w-12");
    await user.click(screen.getByRole("button", { name: "Show the list of cases" }));
    expect(list.className).toContain("md:w-72");
  });

  it("opens behind an All cases button on a phone, and closes once a case is picked", async () => {
    const { onSelect, user } = setup();
    const toggle = screen.getByRole("button", { name: /All cases/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveTextContent("2 unfinished");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.click(within(screen.getByTestId("ticket-case-list")).getByRole("button", { name: "Case 2, in progress" }));
    expect(onSelect).toHaveBeenCalledWith("b");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps the case being read in view as the list scrolls", () => {
    const { rerender } = render(
      <TicketCaseList rows={rows} currentUuid="a" onSelect={jest.fn()} />,
    );
    const list = screen.getByRole("list");
    Object.defineProperty(list, "clientHeight", { configurable: true, value: 100 });
    const rowB = screen.getByRole("button", { name: "Case 2, in progress" });
    Object.defineProperty(rowB, "offsetTop", { configurable: true, value: 300 });
    Object.defineProperty(rowB, "offsetHeight", { configurable: true, value: 50 });
    rerender(<TicketCaseList rows={rows} currentUuid="b" onSelect={jest.fn()} />);
    expect(list.scrollTop).toBe(250);
    list.scrollTop = 600;
    rerender(<TicketCaseList rows={rows} currentUuid={null} onSelect={jest.fn()} />);
    rerender(<TicketCaseList rows={rows} currentUuid="b" onSelect={jest.fn()} />);
    expect(list.scrollTop).toBe(300);
  });
});
