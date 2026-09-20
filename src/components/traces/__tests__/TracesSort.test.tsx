import React from "react";
import { render, screen, setupUser, within } from "@/test-utils";
import {
  TracesSort,
  type TracesSortValue,
} from "@/components/traces/TracesSort";

const NEWEST: TracesSortValue = { evaluatorUuid: null, order: "asc" };

const EVALUATORS = [
  { evaluator_uuid: "ev-1", name: "Tone" },
  { evaluator_uuid: "ev-2", name: "Accuracy" },
];

function setup(
  value: TracesSortValue = NEWEST,
  evaluators: { evaluator_uuid: string; name: string }[] = EVALUATORS,
) {
  const onChange = jest.fn();
  const user = setupUser();
  render(
    <TracesSort value={value} evaluators={evaluators} onChange={onChange} />,
  );
  return { user, onChange };
}

const openPanel = (user: ReturnType<typeof setupUser>) =>
  user.click(screen.getByRole("button", { name: "Sort traces" }));

/** The two directions offered against one evaluator. */
const directions = (name: string) =>
  within(screen.getByRole("group", { name: `Sort traces by ${name}` }));

it("shows nothing when no evaluator scores this agent's traces", () => {
  const { onChange } = setup(NEWEST, []);

  expect(
    screen.queryByRole("button", { name: "Sort traces" }),
  ).not.toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
});

it("sorts an evaluator's highest scores first in one click", async () => {
  const { user, onChange } = setup();

  await openPanel(user);
  await user.click(
    directions("Tone").getByRole("button", { name: /High to low/ }),
  );

  expect(onChange).toHaveBeenCalledWith({
    evaluatorUuid: "ev-1",
    order: "desc",
  });
});

it("sorts a different evaluator's lowest scores first in one click", async () => {
  const { user, onChange } = setup();

  await openPanel(user);
  await user.click(
    directions("Accuracy").getByRole("button", { name: /Low to high/ }),
  );

  expect(onChange).toHaveBeenCalledWith({
    evaluatorUuid: "ev-2",
    order: "asc",
  });
});

it("goes back to newest first", async () => {
  const { user, onChange } = setup({ evaluatorUuid: "ev-1", order: "desc" });

  await openPanel(user);
  const newest = screen.getByRole("button", { name: "Newest first" });
  expect(newest).toHaveAttribute("aria-pressed", "false");

  await user.click(newest);

  expect(onChange).toHaveBeenCalledWith({ evaluatorUuid: null, order: "asc" });
});

it("highlights newest first while nothing is sorted", async () => {
  const { user } = setup();

  await openPanel(user);

  expect(screen.getByRole("button", { name: "Newest first" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

it("leaves both directions unchosen on the evaluator the list is not sorted by", async () => {
  const { user } = setup({ evaluatorUuid: "ev-1", order: "desc" });

  await openPanel(user);

  const sorted = directions("Tone");
  expect(sorted.getByRole("button", { name: /High to low/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(sorted.getByRole("button", { name: /Low to high/ })).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  const other = directions("Accuracy");
  expect(other.getByRole("button", { name: /High to low/ })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  expect(other.getByRole("button", { name: /Low to high/ })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

it("names the evaluator it is sorted by on the button", async () => {
  const { user } = setup({ evaluatorUuid: "ev-2", order: "asc" });

  await user.hover(screen.getByRole("button", { name: "Sort traces" }));

  expect(await screen.findByText("Sorted by Accuracy")).toBeInTheDocument();
});

it("closes when Escape is pressed", async () => {
  const { user, onChange } = setup();

  await openPanel(user);
  expect(screen.getByText("Sort by")).toBeInTheDocument();

  await user.keyboard("{Escape}");

  expect(screen.queryByText("Sort by")).not.toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
});

it("closes when the reader clicks away", async () => {
  const { user, onChange } = setup();

  await openPanel(user);
  await user.click(document.body);

  expect(screen.queryByText("Sort by")).not.toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
});
