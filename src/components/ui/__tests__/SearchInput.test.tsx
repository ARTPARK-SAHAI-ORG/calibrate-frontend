/**
 * Example: interaction test for a controlled input.
 * Shows how to simulate typing and assert onChange fires per keystroke.
 */
import { useState } from "react";
import { render, screen, setupUser } from "@/test-utils";
import { SearchInput } from "../SearchInput";

// A tiny stateful wrapper so the controlled input actually reflects typing,
// mirroring how pages use SearchInput with their own useState.
function Harness({ onChange }: { onChange: (v: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <SearchInput
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange(v);
      }}
      placeholder="Search agents"
    />
  );
}

describe("SearchInput", () => {
  it("calls onChange for each character typed and reflects the value", async () => {
    const user = setupUser();
    const onChange = jest.fn();
    render(<Harness onChange={onChange} />);

    const input = screen.getByPlaceholderText("Search agents");
    await user.type(input, "voice");

    expect(onChange).toHaveBeenCalledTimes(5);
    expect(onChange).toHaveBeenLastCalledWith("voice");
    expect(input).toHaveValue("voice");
  });
});
