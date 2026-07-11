import { render, screen } from "@/test-utils";
import { ContentPlaceholder } from "../ContentPlaceholder";

describe("ContentPlaceholder", () => {
  it("renders the title and description", () => {
    render(
      <ContentPlaceholder title="My Title" description="My description text" />,
    );
    expect(
      screen.getByRole("heading", { name: "My Title" }),
    ).toBeInTheDocument();
    expect(screen.getByText("My description text")).toBeInTheDocument();
  });

  it("renders the static placeholder copy", () => {
    render(<ContentPlaceholder title="T" description="D" />);
    expect(
      screen.getByText("Upload files or configure test"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Component-specific input area will appear here"),
    ).toBeInTheDocument();
    expect(screen.getByText("Results & Metrics")).toBeInTheDocument();
  });
});
