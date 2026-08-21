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

  expect(screen.getByText(/Showing/)).toBeInTheDocument();
  expect(screen.getByLabelText("Per page")).toBeInTheDocument();
  expect(screen.getByText(/Page/)).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Next page" }));
  expect(onNext).toHaveBeenCalledTimes(1);
});
