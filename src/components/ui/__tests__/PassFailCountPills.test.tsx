import { render, screen } from "@/test-utils";
import { PassFailCountPills } from "../PassFailCountPills";

describe("PassFailCountPills", () => {
  it("puts the count in the Success and Fail pills", () => {
    render(<PassFailCountPills passed={2} failed={1} />);
    expect(screen.getByText("2 Success")).toBeInTheDocument();
    expect(screen.getByText("1 Fail")).toBeInTheDocument();
  });

  it("omits a pill whose count is zero", () => {
    const { rerender } = render(<PassFailCountPills passed={3} failed={0} />);
    expect(screen.getByText("3 Success")).toBeInTheDocument();
    expect(screen.queryByText(/Fail/)).not.toBeInTheDocument();

    rerender(<PassFailCountPills passed={0} failed={4} />);
    expect(screen.getByText("4 Fail")).toBeInTheDocument();
    expect(screen.queryByText(/Success/)).not.toBeInTheDocument();
  });

  it("shows Not run only when some tests never answered", () => {
    render(<PassFailCountPills passed={1} failed={1} unanswered={2} />);
    expect(screen.getByText("1 Success")).toBeInTheDocument();
    expect(screen.getByText("1 Fail")).toBeInTheDocument();
    expect(screen.getByText("2 Not run")).toBeInTheDocument();
  });

  it("renders nothing when every count is zero", () => {
    const { container } = render(
      <PassFailCountPills passed={0} failed={0} unanswered={0} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
