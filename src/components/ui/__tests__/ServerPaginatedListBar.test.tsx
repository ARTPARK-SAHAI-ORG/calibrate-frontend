import { render, screen, setupUser } from "@/test-utils";
import { ServerPaginatedListBar } from "../ServerPaginatedListBar";

it("shows a simple count when everything fits on one page", () => {
  render(
    <ServerPaginatedListBar
      total={3}
      offset={0}
      loadedCount={3}
      pageSize={50}
      onPageSizeChange={jest.fn()}
      currentPage={1}
      pageCount={1}
      onPrev={jest.fn()}
      onNext={jest.fn()}
      itemNoun="trace"
    />,
  );

  expect(screen.getByText("3 traces")).toBeInTheDocument();
  expect(screen.queryByLabelText("Per page")).not.toBeInTheDocument();
});

it("shows the range, per page, and page navigation when needed", async () => {
  const onNext = jest.fn();
  const user = setupUser();

  render(
    <ServerPaginatedListBar
      total={25}
      offset={0}
      loadedCount={10}
      pageSize={10}
      onPageSizeChange={jest.fn()}
      currentPage={1}
      pageCount={3}
      onPrev={jest.fn()}
      onNext={onNext}
      itemNoun="item"
    />,
  );

  expect(screen.getByText(/1–10 of 25 items/)).toBeInTheDocument();
  expect(screen.getByLabelText("Per page")).toBeInTheDocument();
  expect(screen.getByText(/Page/)).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Next page" }));
  expect(onNext).toHaveBeenCalledTimes(1);
});

it("does not start the count with the word Showing", () => {
  render(
    <ServerPaginatedListBar
      total={25}
      offset={10}
      loadedCount={10}
      pageSize={10}
      onPageSizeChange={jest.fn()}
      currentPage={2}
      pageCount={3}
      onPrev={jest.fn()}
      onNext={jest.fn()}
      itemNoun="item"
    />,
  );

  expect(screen.getByText("11–20 of 25 items")).toBeInTheDocument();
  expect(screen.queryByText(/Showing/)).not.toBeInTheDocument();
});

it("keeps the count and per page together, the page arrows in the middle, and what the caller adds on the right", () => {
  render(
    <ServerPaginatedListBar
      total={25}
      offset={0}
      loadedCount={10}
      pageSize={10}
      onPageSizeChange={jest.fn()}
      currentPage={1}
      pageCount={3}
      onPrev={jest.fn()}
      onNext={jest.fn()}
      itemNoun="item"
      trailing={<button type="button">Add to tests</button>}
    />,
  );

  const bar =
    screen.getByText(/1–10 of 25 items/).parentElement!.parentElement!;
  const [left, middle] = Array.from(bar.children);

  // The count and the per-page picker share the left zone.
  expect(left).toContainElement(screen.getByText(/1–10 of 25 items/));
  expect(left).toContainElement(screen.getByLabelText("Per page"));
  // The arrows sit in the middle zone, centred.
  expect(middle.className).toContain("justify-center");
  expect(middle).toContainElement(
    screen.getByRole("button", { name: "Next page" }),
  );
  // What the caller adds is last, so it keeps its place as the page controls
  // change width.
  expect(bar.lastElementChild).toBe(
    screen.getByRole("button", { name: "Add to tests" }),
  );
});

it("shows what the caller adds on a list too short to page through", () => {
  render(
    <ServerPaginatedListBar
      total={3}
      offset={0}
      loadedCount={3}
      pageSize={50}
      onPageSizeChange={jest.fn()}
      currentPage={1}
      pageCount={1}
      onPrev={jest.fn()}
      onNext={jest.fn()}
      itemNoun="trace"
      trailing={<button type="button">Add to tests</button>}
    />,
  );

  expect(screen.getByText("3 traces")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Add to tests" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Next page" }),
  ).not.toBeInTheDocument();
});

it("names one row in the singular and an empty list in the plural", () => {
  const { rerender } = render(
    <ServerPaginatedListBar
      total={1}
      offset={0}
      loadedCount={1}
      pageSize={50}
      onPageSizeChange={jest.fn()}
      currentPage={1}
      pageCount={1}
      onPrev={jest.fn()}
      onNext={jest.fn()}
      itemNoun="trace"
    />,
  );
  expect(screen.getByText("1 trace")).toBeInTheDocument();

  rerender(
    <ServerPaginatedListBar
      total={0}
      offset={0}
      loadedCount={0}
      pageSize={50}
      onPageSizeChange={jest.fn()}
      currentPage={1}
      pageCount={1}
      onPrev={jest.fn()}
      onNext={jest.fn()}
      itemNoun="trace"
    />,
  );
  expect(screen.getByText("0 traces")).toBeInTheDocument();
});
