import { fireEvent, render, screen, setupUser } from "@/test-utils";
import { KeyField } from "../KeyField";

function renderField(
  props: Partial<React.ComponentProps<typeof KeyField>> = {},
) {
  const onChange = jest.fn();
  const parentClick = jest.fn();
  render(
    <div onClick={parentClick}>
      <KeyField
        id="key"
        name="Deepgram"
        value=""
        onChange={onChange}
        {...props}
      />
    </div>,
  );
  return { onChange, parentClick };
}

describe("KeyField", () => {
  it("hides the key until the eye button is pressed, and hides it again", async () => {
    const user = setupUser();
    renderField({ value: "secret" });
    const field = screen.getByPlaceholderText("Paste your Deepgram API key");
    expect(field).toHaveAttribute("type", "password");

    await user.click(
      screen.getByRole("button", { name: "Show the Deepgram key" }),
    );
    expect(field).toHaveAttribute("type", "text");

    await user.click(
      screen.getByRole("button", { name: "Hide the Deepgram key" }),
    );
    expect(field).toHaveAttribute("type", "password");
  });

  it("calls onEnter on Enter, and does nothing without it", () => {
    const onEnter = jest.fn();
    renderField({ onEnter });
    const field = screen.getByPlaceholderText("Paste your Deepgram API key");
    fireEvent.keyDown(field, { key: "a" });
    expect(onEnter).not.toHaveBeenCalled();
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  it("ignores Enter when no onEnter is given", () => {
    renderField();
    const field = screen.getByPlaceholderText("Paste your Deepgram API key");
    expect(fireEvent.keyDown(field, { key: "Enter" })).toBe(true);
  });

  it("passes typed text to onChange", () => {
    const { onChange } = renderField();
    fireEvent.change(
      screen.getByPlaceholderText("Paste your Deepgram API key"),
      {
        target: { value: "abc" },
      },
    );
    expect(onChange).toHaveBeenCalledWith("abc");
  });

  // jsdom drops -webkit-text-security, so the masking itself is not visible here.
  it("draws a text box for multiline keys, with the eye toggle", async () => {
    const user = setupUser();
    renderField({ multiline: true, name: "Google Cloud", value: "{}" });
    const box = screen.getByPlaceholderText("Paste your service account JSON");
    expect(box.tagName).toBe("TEXTAREA");

    await user.click(
      screen.getByRole("button", { name: "Show the Google Cloud key" }),
    );
    expect(
      screen.getByRole("button", { name: "Hide the Google Cloud key" }),
    ).toBeInTheDocument();
  });

  it("marks the field invalid and points at the error", () => {
    renderField({
      error: true,
      errorId: "key-error",
      ariaLabel: "Deepgram API key",
    });
    const field = screen.getByLabelText("Deepgram API key");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAttribute("aria-describedby", "key-error");
  });

  it("is valid with no description when there is no error", () => {
    renderField({ errorId: "key-error" });
    const field = screen.getByPlaceholderText("Paste your Deepgram API key");
    expect(field).toHaveAttribute("aria-invalid", "false");
    expect(field).not.toHaveAttribute("aria-describedby");
  });

  it("keeps clicks on the field and the eye button from reaching the parent", async () => {
    const user = setupUser();
    const { parentClick } = renderField();
    await user.click(
      screen.getByPlaceholderText("Paste your Deepgram API key"),
    );
    await user.click(
      screen.getByRole("button", { name: "Show the Deepgram key" }),
    );
    expect(parentClick).not.toHaveBeenCalled();
  });
});
