import { render, screen } from "@/test-utils";
import { StatusBadge } from "../StatusBadge";

describe("StatusBadge", () => {
  it("renders the formatted status text", () => {
    render(<StatusBadge status="in_progress" />);
    expect(screen.getByText("Running")).toBeInTheDocument();
  });

  it("renders an unrecognized status as-is", () => {
    render(<StatusBadge status="weird_status" />);
    expect(screen.getByText("weird_status")).toBeInTheDocument();
  });

  it("does not show a spinner by default even for active statuses", () => {
    const { container } = render(<StatusBadge status="queued" />);
    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });

  it("shows a spinner when showSpinner is true and status is active", () => {
    const { container } = render(<StatusBadge status="queued" showSpinner />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("does not show a spinner when showSpinner is true but status is not active", () => {
    const { container } = render(<StatusBadge status="done" showSpinner />);
    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });

  it("shows a spinner for in_progress status when showSpinner is true", () => {
    const { container } = render(
      <StatusBadge status="in_progress" showSpinner />
    );
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
