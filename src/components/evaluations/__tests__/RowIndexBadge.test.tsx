import { render, screen } from "@/test-utils";
import { RowIndexBadge } from "../RowIndexBadge";

describe("RowIndexBadge", () => {
  it("renders a small number", () => {
    render(<RowIndexBadge value={3} />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("renders a large number (pill growth case)", () => {
    render(<RowIndexBadge value={12345} />);
    expect(screen.getByText("12345")).toBeInTheDocument();
  });

  it("renders zero", () => {
    render(<RowIndexBadge value={0} />);
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});
