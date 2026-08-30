import React from "react";
import { render, screen, setupUser } from "@/test-utils";
import { ToolLibraryPicker } from "../ToolLibraryPicker";
import type { ToolData } from "@/components/AddToolDialog";

const toolA: ToolData = {
  uuid: "tool-a",
  name: "Weather lookup",
  description: "Gets the weather",
  config: { type: "structured_output" },
  created_at: "2024-01-01",
  updated_at: "2024-01-01",
};
const toolB: ToolData = {
  uuid: "tool-b",
  name: "Book flight",
  config: { type: "webhook", description: "Books a flight" },
  created_at: "2024-01-01",
  updated_at: "2024-01-01",
};

function renderPicker(
  overrides: Partial<React.ComponentProps<typeof ToolLibraryPicker>> = {},
) {
  const onToggle = jest.fn();
  const utils = render(
    <ToolLibraryPicker
      tools={[toolA, toolB]}
      selectedIds={new Set()}
      onToggle={onToggle}
      {...overrides}
    />,
  );
  return { onToggle, ...utils };
}

describe("ToolLibraryPicker", () => {
  it("shows a loading state", () => {
    const { container } = renderPicker({ isLoading: true });
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("shows the empty message when there are no tools to offer at all", () => {
    renderPicker({ tools: [], emptyMessage: "Nothing left to add" });
    expect(screen.getByText("Nothing left to add")).toBeInTheDocument();
  });

  it("lists each tool's name, type and description", () => {
    renderPicker();
    // The first tool (Weather lookup) also previews by default, so its name
    // and description show twice — once in the row, once in the preview.
    expect(screen.getAllByText("Weather lookup").length).toBe(2);
    expect(screen.getAllByText("Gets the weather").length).toBe(2);
    expect(screen.getAllByText("Structured Output").length).toBe(2);
    expect(screen.getByText("Book flight")).toBeInTheDocument();
    expect(screen.getByText("Books a flight")).toBeInTheDocument();
    expect(screen.getByText("Webhook")).toBeInTheDocument();
  });

  it("filters the list by search on name and description", async () => {
    const user = setupUser();
    renderPicker();

    await user.type(screen.getByPlaceholderText("Search tools"), "weather");
    // Row presence, not text presence — Weather lookup's name legitimately
    // still shows in the preview column too, since it stays previewed.
    expect(screen.getByLabelText("Select Weather lookup")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Select Book flight"),
    ).not.toBeInTheDocument();
  });

  it("shows a no-match message and no results when search matches nothing", async () => {
    const user = setupUser();
    renderPicker();

    await user.type(screen.getByPlaceholderText("Search tools"), "zzzznotool");
    expect(screen.getByText("No tools match your search")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Select Weather lookup"),
    ).not.toBeInTheDocument();
  });

  it("calls onToggle from the checkbox, not from clicking the name", async () => {
    const user = setupUser();
    const { onToggle } = renderPicker();

    await user.click(screen.getByLabelText("Select Weather lookup"));
    expect(onToggle).toHaveBeenCalledWith("tool-a");

    onToggle.mockClear();
    // Weather lookup is already previewed by default; click Book flight's
    // row instead so this exercises a real name click, not a no-op re-click.
    await user.click(screen.getByText("Book flight"));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("previews the first tool by default, without selecting its checkbox, and switches on click", async () => {
    const user = setupUser();
    renderPicker();

    // Name shows once in the row and again in the preview heading.
    expect(screen.getAllByText("Weather lookup").length).toBe(2);
    expect(
      screen.queryByText("Select a tool to see its details"),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Select Weather lookup")).not.toBeChecked();

    await user.click(screen.getByText("Book flight"));
    expect(screen.getAllByText("Book flight").length).toBe(2);
    expect(screen.getByLabelText("Select Book flight")).not.toBeChecked();
  });

  it("checkbox reflects selectedIds", () => {
    renderPicker({ selectedIds: new Set(["tool-a"]) });
    expect(screen.getByLabelText("Select Weather lookup")).toBeChecked();
    expect(screen.getByLabelText("Select Book flight")).not.toBeChecked();
  });
});
