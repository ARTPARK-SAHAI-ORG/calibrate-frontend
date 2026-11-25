import { render, screen } from "@/test-utils";
import {
  MessagesPerDayInfo,
  MessagesPerDayTooHigh,
  overMessagesPerDayMaximum,
} from "../MessagesPerDayParts";

it("draws nothing beside the setting when the workspace has no maximum", () => {
  const { container } = render(<MessagesPerDayInfo maximum={null} />);
  expect(container).toBeEmptyDOMElement();
});

it("draws the information icon when there is a maximum", () => {
  render(<MessagesPerDayInfo maximum={1500} />);
  expect(screen.getByLabelText("More about this limit")).toBeInTheDocument();
});

it("says the box is above what the workspace allows, with a contact link", () => {
  render(<MessagesPerDayTooHigh />);
  expect(
    screen.getByText(/This is more than your workspace allows/),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Click here" })).toHaveAttribute(
    "target",
    "_blank",
  );
});

it("is above the maximum only when there is one and the number passes it", () => {
  expect(overMessagesPerDayMaximum(201, 200)).toBe(true);
  expect(overMessagesPerDayMaximum(200, 200)).toBe(false);
  expect(overMessagesPerDayMaximum(10_000, null)).toBe(false);
});
