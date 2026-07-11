import { useState } from "react";
import { render, screen, setupUser } from "@/test-utils";
import {
  SearchModeInput,
  matchesSearchMode,
  SearchMode,
} from "../SearchModeInput";

describe("matchesSearchMode", () => {
  it("matches contains mode case-insensitively", () => {
    expect(matchesSearchMode("Hello World", "lo wo", "contains")).toBe(true);
    expect(matchesSearchMode("Hello World", "xyz", "contains")).toBe(false);
  });

  it("matches starts-with mode", () => {
    expect(matchesSearchMode("Hello World", "hello", "starts-with")).toBe(true);
    expect(matchesSearchMode("Hello World", "world", "starts-with")).toBe(false);
  });

  it("matches ends-with mode", () => {
    expect(matchesSearchMode("Hello World", "world", "ends-with")).toBe(true);
    expect(matchesSearchMode("Hello World", "hello", "ends-with")).toBe(false);
  });

  it("matches exact mode", () => {
    expect(matchesSearchMode("Hello World", "hello world", "exact")).toBe(true);
    expect(matchesSearchMode("Hello World", "hello", "exact")).toBe(false);
  });

  it("defaults unknown modes to contains behavior", () => {
    expect(
      matchesSearchMode("Hello World", "lo wo", "unknown" as SearchMode)
    ).toBe(true);
  });
});

describe("SearchModeInput", () => {
  it("renders with the value, placeholder and mode", () => {
    render(
      <SearchModeInput
        value="query"
        onChange={jest.fn()}
        mode="contains"
        onModeChange={jest.fn()}
        placeholder="Search tests"
      />
    );
    expect(screen.getByPlaceholderText("Search tests")).toHaveValue("query");
    expect(screen.getByLabelText("Search match mode")).toHaveValue("contains");
  });

  it("uses the default placeholder when not provided", () => {
    render(
      <SearchModeInput
        value=""
        onChange={jest.fn()}
        mode="contains"
        onModeChange={jest.fn()}
      />
    );
    expect(screen.getByPlaceholderText("Search")).toBeInTheDocument();
  });

  it("applies an extra className to the wrapper", () => {
    const { container } = render(
      <SearchModeInput
        value=""
        onChange={jest.fn()}
        mode="contains"
        onModeChange={jest.fn()}
        className="extra-class"
      />
    );
    expect(container.querySelector("div")).toHaveClass("extra-class");
  });

  it("calls onChange as the user types", async () => {
    const user = setupUser();
    const onChange = jest.fn();

    function Harness() {
      const [value, setValue] = useState("");
      return (
        <SearchModeInput
          value={value}
          onChange={(v) => {
            setValue(v);
            onChange(v);
          }}
          mode="contains"
          onModeChange={jest.fn()}
        />
      );
    }
    render(<Harness />);
    await user.type(screen.getByPlaceholderText("Search"), "abc");
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(onChange).toHaveBeenLastCalledWith("abc");
  });

  it("calls onModeChange when a new mode is selected", async () => {
    const user = setupUser();
    const onModeChange = jest.fn();
    render(
      <SearchModeInput
        value=""
        onChange={jest.fn()}
        mode="contains"
        onModeChange={onModeChange}
      />
    );
    await user.selectOptions(
      screen.getByLabelText("Search match mode"),
      "Exact"
    );
    expect(onModeChange).toHaveBeenCalledWith("exact");
  });

  it("renders all match mode options", () => {
    render(
      <SearchModeInput
        value=""
        onChange={jest.fn()}
        mode="contains"
        onModeChange={jest.fn()}
      />
    );
    ["Contains", "Starts with", "Ends with", "Exact"].forEach((label) => {
      expect(
        screen.getByRole("option", { name: label })
      ).toBeInTheDocument();
    });
  });
});
