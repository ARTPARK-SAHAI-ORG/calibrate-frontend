import { render } from "@/test-utils";
import { RetryIcon } from "../RetryIcon";

describe("RetryIcon", () => {
  it("renders with the default className", () => {
    const { container } = render(<RetryIcon />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveClass("w-3.5", "h-3.5", "shrink-0");
  });

  it("renders with a custom className", () => {
    const { container } = render(<RetryIcon className="w-10 h-10" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveClass("w-10", "h-10");
    expect(svg).not.toHaveClass("w-3.5");
  });
});
