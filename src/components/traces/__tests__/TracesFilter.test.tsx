import React from "react";
import { render, screen, setupUser } from "@/test-utils";
import {
  TracesFilter,
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

/** Apply carries the draft count, so it is matched on its leading word. */
const applyButton = () => screen.getByRole("button", { name: /^Apply/ });
const queryApplyButton = () => screen.queryByRole("button", { name: /^Apply/ });

const openPanel = (user: ReturnType<typeof setupUser>) =>
  user.click(screen.getByRole("button", { name: "Filter traces" }));

it("reports both choices together, and only once Apply is clicked", async () => {
  const { user, onApply } = setup();

  await openPanel(user);
  await user.click(screen.getByRole("button", { name: "Response" }));
  await user.click(screen.getByRole("checkbox", { name: "production" }));
  expect(onApply).not.toHaveBeenCalled();

  await user.click(applyButton());

  expect(onApply).toHaveBeenCalledWith({
    outputType: "response",
    labels: ["production"],
  });
  expect(queryApplyButton()).not.toBeInTheDocument();
});

it("counts the picks on Apply, before they narrow anything", async () => {
  const { user, onApply } = setup();

  await openPanel(user);
  expect(applyButton()).toHaveTextContent("Apply");

  await user.click(screen.getByRole("checkbox", { name: "production" }));
  expect(applyButton()).toHaveTextContent("Apply (1)");

  await user.click(screen.getByRole("button", { name: "Response" }));
  expect(applyButton()).toHaveTextContent("Apply (2)");

  // The toolbar's own number cannot move until the list actually changes.
  expect(screen.queryByText("2")).not.toBeInTheDocument();
  expect(onApply).not.toHaveBeenCalled();
});

it("says on the button how many choices are on", () => {
  setup({ outputType: "response", labels: ["production", "staging"] });

  expect(screen.getByText("3")).toBeInTheDocument();
});

it("counts nothing when no choice is on", () => {
  setup();

  expect(screen.queryByText("0")).not.toBeInTheDocument();
});

it("drops a tick that was never applied", async () => {
  const { user, onApply } = setup();

  await openPanel(user);
  await user.click(screen.getByRole("checkbox", { name: "production" }));
  // Closing is the reader changing their mind, so the tick goes with it.
  await user.keyboard("{Escape}");
  await openPanel(user);
  await user.click(applyButton());

  expect(onApply).toHaveBeenCalledWith({ outputType: "all", labels: [] });
});

it("closes again when the button is clicked a second time", async () => {
  const { user, onApply } = setup();

  await openPanel(user);
  await openPanel(user);

  expect(queryApplyButton()).not.toBeInTheDocument();
  expect(onApply).not.toHaveBeenCalled();
});

it("closes without applying when the reader clicks away", async () => {
  const { user, onApply } = setup();

  await openPanel(user);
  await user.click(document.body);

  expect(queryApplyButton()).not.toBeInTheDocument();
  expect(onApply).not.toHaveBeenCalled();
});

it("clears both dimensions at once", async () => {
  const { user, onApply } = setup({
    outputType: "tool_call",
    labels: ["staging"],
  });

  await openPanel(user);
  await user.click(screen.getByRole("button", { name: "Clear all filters" }));
  await user.click(applyButton());

  expect(onApply).toHaveBeenCalledWith({ outputType: "all", labels: [] });
});

it("has nothing to clear when nothing is picked", async () => {
  const { user } = setup();

  await openPanel(user);

  expect(
    screen.getByRole("button", { name: "Clear all filters" }),
  ).toBeDisabled();
});

it("unticks a label that was already on", async () => {
  const { user, onApply } = setup({ outputType: "all", labels: ["staging"] });

  await openPanel(user);
  await user.click(screen.getByRole("checkbox", { name: "staging" }));
  await user.click(applyButton());

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

  expect(screen.getByRole("checkbox", { name: "label-3" })).toBeInTheDocument();
  expect(
    screen.queryByRole("checkbox", { name: "label-4" }),
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
