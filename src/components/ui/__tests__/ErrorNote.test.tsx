import { render, screen } from "@/test-utils";
import { ErrorNote } from "../ErrorNote";

describe("ErrorNote", () => {
  it("shows its message as an alert, with any extra classes", () => {
    render(<ErrorNote className="mb-4">Something broke</ErrorNote>);
    const note = screen.getByRole("alert");
    expect(note).toHaveTextContent("Something broke");
    expect(note).toHaveClass("text-red-700", "mb-4");
  });
});
