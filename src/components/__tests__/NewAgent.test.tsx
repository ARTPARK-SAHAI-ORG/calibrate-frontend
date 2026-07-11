import { render, screen } from "@/test-utils";
import { NewAgent } from "../NewAgent";

describe("NewAgent", () => {
  it("renders the placeholder heading and copy", () => {
    render(<NewAgent />);
    expect(
      screen.getByRole("heading", { name: "New Agent" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Agent configuration page (coming soon)"),
    ).toBeInTheDocument();
  });
});
