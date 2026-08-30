import { render, screen } from "@/test-utils";
import { ToolTypePill } from "../ToolTypePill";

describe("ToolTypePill", () => {
  it("shows a webhook in its own colour", () => {
    render(<ToolTypePill configType="webhook" />);
    const pill = screen.getByText("Webhook");
    expect(pill).toHaveClass("bg-blue-500/10");
  });

  it("shows anything else as structured output, in a different colour", () => {
    render(<ToolTypePill configType={undefined} />);
    const pill = screen.getByText("Structured Output");
    expect(pill).toHaveClass("bg-teal-500/10");
    expect(pill).not.toHaveClass("bg-blue-500/10");
  });
});
