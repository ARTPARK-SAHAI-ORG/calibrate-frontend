import { render, screen } from "@/test-utils";
import { FieldError } from "../FieldError";

describe("FieldError", () => {
  it("renders nothing when show is false", () => {
    const { container } = render(
      <FieldError show={false}>This field is required</FieldError>
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("This field is required")).not.toBeInTheDocument();
  });

  it("renders the message when show is true", () => {
    render(<FieldError show={true}>This field is required</FieldError>);
    const message = screen.getByText("This field is required");
    expect(message).toBeInTheDocument();
    expect(message.tagName).toBe("P");
    expect(message).toHaveClass("text-red-500");
  });
});
