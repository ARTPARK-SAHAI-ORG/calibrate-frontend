import React from "react";
import { render, screen, setupUser } from "@/test-utils";
import {
  TracesFilter,
  traceFilterCount,
  type TracesFilterValue,
} from "@/components/traces/TracesFilter";

const NONE: TracesFilterValue = { outputType: "all", labels: [] };

function setup(
  value: TracesFilterValue = NONE,
  labels: string[] = ["production", "staging"],
) {
  const onApply = jest.fn();
  const user = setupUser();
  render(<TracesFilter value={value} labels={labels} onApply={onApply} />);
  return { user, onApply };
}

const openPanel = (user: ReturnType<typeof setupUser>) =>
  user.click(screen.getByRole("button", { name: "Filter traces" }));

it("reports both choices together, and only once Apply is clicked", async () => {
  const { user, onApply } = setup();

  await openPanel(user);
  await user.click(screen.getByRole("button", { name: "Response" }));
  await user.click(screen.getByRole("button", { name: "production" }));
  expect(onApply).not.toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "Apply" }));

  expect(onApply).toHaveBeenCalledWith({
    outputType: "response",
    labels: ["production"],
  });
  expect(
    screen.queryByRole("button", { name: "Apply" }),
  ).not.toBeInTheDocument();
});

it("says on the button how many choices are on", () => {
  setup({ outputType: "response", labels: ["production", "staging"] });

  expect(screen.getByText("3")).toBeInTheDocument();
});

it("counts nothing when no choice is on", () => {
  setup();

  expect(screen.queryByText("0")).not.toBeInTheDocument();
  expect(traceFilterCount(NONE)).toBe(0);
});

it("drops a tick that was never applied", async () => {
  const { user, onApply } = setup();

  await openPanel(user);
  await user.click(screen.getByRole("button", { name: "production" }));
  // Closing is the reader changing their mind, so the tick goes with it.
  await user.keyboard("{Escape}");
  await openPanel(user);
  await user.click(screen.getByRole("button", { name: "Apply" }));

  expect(onApply).toHaveBeenCalledWith({ outputType: "all", labels: [] });
});

it("closes again when the button is clicked a second time", async () => {
  const { user, onApply } = setup();

  await openPanel(user);
  await openPanel(user);

  expect(
    screen.queryByRole("button", { name: "Apply" }),
  ).not.toBeInTheDocument();
  expect(onApply).not.toHaveBeenCalled();
});

it("closes without applying when the reader clicks away", async () => {
  const { user, onApply } = setup();

  await openPanel(user);
  await user.click(document.body);

  expect(
    screen.queryByRole("button", { name: "Apply" }),
  ).not.toBeInTheDocument();
  expect(onApply).not.toHaveBeenCalled();
});

it("clears both dimensions at once", async () => {
  const { user, onApply } = setup({
    outputType: "tool_call",
    labels: ["staging"],
  });

  await openPanel(user);
  await user.click(screen.getByRole("button", { name: "Clear all" }));
  await user.click(screen.getByRole("button", { name: "Apply" }));

  expect(onApply).toHaveBeenCalledWith({ outputType: "all", labels: [] });
});

it("has nothing to clear when nothing is picked", async () => {
  const { user } = setup();

  await openPanel(user);

  expect(screen.getByRole("button", { name: "Clear all" })).toBeDisabled();
});

it("unticks a label that was already on", async () => {
  const { user, onApply } = setup({ outputType: "all", labels: ["staging"] });

  await openPanel(user);
  await user.click(screen.getByRole("button", { name: "staging" }));
  await user.click(screen.getByRole("button", { name: "Apply" }));

  expect(onApply).toHaveBeenCalledWith({ outputType: "all", labels: [] });
});

it("leaves the labels out when the traces carry none", async () => {
  const { user } = setup(NONE, []);

  await openPanel(user);

  expect(screen.queryByText("Labels")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Response" })).toBeInTheDocument();
});

it("searches the labels once there are enough of them to scroll", async () => {
  const many = Array.from({ length: 9 }, (_, i) => `label-${i}`);
  const { user } = setup(NONE, many);

  await openPanel(user);
  await user.type(screen.getByLabelText("Search labels"), "label-3");

  expect(screen.getByRole("button", { name: "label-3" })).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "label-4" }),
  ).not.toBeInTheDocument();
});

it("says so when no label matches the search", async () => {
  const many = Array.from({ length: 9 }, (_, i) => `label-${i}`);
  const { user } = setup(NONE, many);

  await openPanel(user);
  await user.type(screen.getByLabelText("Search labels"), "polio");

  expect(screen.getByText("No labels match your search")).toBeInTheDocument();
});

it("offers no search box for a handful of labels", async () => {
  const { user } = setup();

  await openPanel(user);

  expect(screen.queryByLabelText("Search labels")).not.toBeInTheDocument();
});
