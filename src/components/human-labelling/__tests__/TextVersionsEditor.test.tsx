import { useState } from "react";
import { fireEvent, render, screen, setupUser } from "@/test-utils";
import type { TurnExtras } from "@/lib/messageVersions";
import {
  TextVersionsEditor,
  sameExtras,
  versionsComplete,
} from "../TextVersionsEditor";

function Harness({
  initial,
  onChange,
  onPendingChange,
}: {
  initial: TurnExtras;
  onChange?: (next: TurnExtras) => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const [extras, setExtras] = useState(initial);
  return (
    <TextVersionsEditor
      field="input"
      extras={extras}
      onChange={(next) => {
        setExtras(next);
        onChange?.(next);
      }}
      onPendingChange={onPendingChange}
    >
      <textarea aria-label="Main text" defaultValue="Summarise this" />
    </TextVersionsEditor>
  );
}

const START: TurnExtras = {
  label: "English",
  versions: { Hindi: "इसका सार दो", Tamil: "சுருக்கவும்" },
};

const names = () =>
  screen
    .getAllByLabelText("Version name")
    .map((i) => (i as HTMLInputElement).value);

describe("versionsComplete and sameExtras", () => {
  it("needs text in every version", () => {
    expect(versionsComplete({})).toBe(true);
    expect(versionsComplete({ versions: { Hindi: "x" } })).toBe(true);
    expect(versionsComplete({ versions: { Hindi: " " } })).toBe(false);
  });

  it("compares heading and versions, order included", () => {
    expect(sameExtras({}, { label: "" })).toBe(true);
    expect(sameExtras({ label: "A" }, { label: "B" })).toBe(false);
    expect(
      sameExtras(
        { versions: { a: "1", b: "2" } },
        { versions: { b: "2", a: "1" } },
      ),
    ).toBe(false);
  });
});

describe("TextVersionsEditor", () => {
  it("applies a heading only with its tick, and drops it with the cross", async () => {
    const user = setupUser();
    const onChange = jest.fn();
    render(<Harness initial={START} onChange={onChange} />);
    const heading = screen.getByLabelText("Heading for the input");

    await user.clear(heading);
    await user.type(heading, "Original");
    await user.click(screen.getByLabelText("Main text"));
    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cancel heading" }));
    expect(heading).toHaveValue("English");

    await user.clear(heading);
    await user.type(heading, "Original");
    await user.click(screen.getByRole("button", { name: "Confirm heading" }));
    expect(onChange).toHaveBeenLastCalledWith({
      label: "Original",
      versions: START.versions,
    });
  });

  it("clears the heading when it is emptied and confirmed with Enter", async () => {
    const user = setupUser();
    const onChange = jest.fn();
    render(<Harness initial={START} onChange={onChange} />);
    const heading = screen.getByLabelText("Heading for the input");
    await user.clear(heading);
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenLastCalledWith({ versions: START.versions });
  });

  it("ignores Enter while a word is still being typed with an input method", () => {
    const onChange = jest.fn();
    render(<Harness initial={START} onChange={onChange} />);
    const heading = screen.getByLabelText("Heading for the input");
    fireEvent.change(heading, { target: { value: "मूल" } });
    fireEvent.keyDown(heading, { key: "Enter", isComposing: true });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(heading, { key: "Escape" });
    expect(heading).toHaveValue("English");
  });

  it("renames a version with its tick and keeps the order", async () => {
    const user = setupUser();
    render(<Harness initial={START} />);
    const first = screen.getAllByLabelText("Version name")[0];
    await user.clear(first);
    await user.type(first, "Hindi (formal){Enter}");
    expect(names()).toEqual(["Hindi (formal)", "Tamil"]);
  });

  it("refuses a name another version already has", async () => {
    const user = setupUser();
    render(<Harness initial={START} />);
    const first = screen.getAllByLabelText("Version name")[0];
    await user.clear(first);
    await user.type(first, "Tamil");
    expect(screen.getByText("Another version already has this name")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm version name" })).toBeDisabled();
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "Cancel version name" }));
    expect(names()).toEqual(["Hindi", "Tamil"]);
  });

  it("drops a blank name instead of applying it", async () => {
    const user = setupUser();
    render(<Harness initial={START} />);
    await user.clear(screen.getAllByLabelText("Version name")[0]);
    await user.click(screen.getByRole("button", { name: "Confirm version name" }));
    expect(names()).toEqual(["Hindi", "Tamil"]);
  });

  it("asks before removing a version; Cancel keeps it and Remove deletes it", async () => {
    const user = setupUser();
    const onChange = jest.fn();
    render(<Harness initial={START} onChange={onChange} />);

    await user.click(screen.getAllByRole("button", { name: "Remove version" })[1]);
    expect(screen.getByText('Remove "Tamil" from the input?')).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(names()).toEqual(["Hindi", "Tamil"]);

    await user.click(screen.getAllByRole("button", { name: "Remove version" })[1]);
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(names()).toEqual(["Hindi"]);

    await user.click(screen.getByRole("button", { name: "Remove version" }));
    await user.click(
      document.querySelector(".fixed.inset-0 > .bg-black\\/30") as HTMLElement,
    );
    expect(names()).toEqual(["Hindi"]);
    await user.click(screen.getByRole("button", { name: "Remove version" }));
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.queryByLabelText("Version name")).not.toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith({ label: "English" });
  });

  it("edits a version's text and flags an empty one", async () => {
    const user = setupUser();
    render(<Harness initial={START} />);
    const text = screen.getAllByLabelText("Version text")[0];
    await user.clear(text);
    expect(screen.getByText("Version cannot be empty")).toBeInTheDocument();
    await user.type(text, "नया");
    expect(screen.queryByText("Version cannot be empty")).not.toBeInTheDocument();
  });

  it("reports when a typed heading or name is waiting for its tick", async () => {
    const user = setupUser();
    const onPendingChange = jest.fn();
    render(<Harness initial={START} onPendingChange={onPendingChange} />);
    await user.type(screen.getAllByLabelText("Version name")[0], "X");
    expect(onPendingChange).toHaveBeenLastCalledWith(true);
    await user.keyboard("{Escape}");
    expect(onPendingChange).toHaveBeenLastCalledWith(false);
  });

  it("drops an unchanged heading draft when the field loses focus", async () => {
    const user = setupUser();
    const onPendingChange = jest.fn();
    render(<Harness initial={{}} onPendingChange={onPendingChange} />);
    const heading = screen.getByLabelText("Heading for the input");
    await user.type(heading, "a");
    await user.type(heading, "{Backspace}");
    await user.click(screen.getByLabelText("Main text"));
    expect(onPendingChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByLabelText("Version name")).not.toBeInTheDocument();
  });

  it("does nothing on Enter when nothing was typed or the text is unchanged", async () => {
    const user = setupUser();
    const onChange = jest.fn();
    render(<Harness initial={{ versions: { Hindi: "x" } }} onChange={onChange} />);
    await user.click(screen.getByLabelText("Heading for the input"));
    await user.keyboard("{Enter}");
    await user.click(screen.getByLabelText("Version name"));
    await user.keyboard("{Enter}");
    await user.type(screen.getByLabelText("Heading for the input"), " {Enter}");
    expect(onChange).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Heading for the input"), "Original{Enter}");
    expect(onChange).toHaveBeenLastCalledWith({
      label: "Original",
      versions: { Hindi: "x" },
    });
  });

  it("sets a heading on a text with no versions", async () => {
    const user = setupUser();
    const onChange = jest.fn();
    render(<Harness initial={{}} onChange={onChange} />);
    await user.type(screen.getByLabelText("Heading for the input"), "Original{Enter}");
    expect(onChange).toHaveBeenLastCalledWith({ label: "Original" });
  });

  it("renames a version on a text with no heading", async () => {
    const user = setupUser();
    const onChange = jest.fn();
    render(<Harness initial={{ versions: { Hindi: "x" } }} onChange={onChange} />);
    const name = screen.getByLabelText("Version name");
    await user.clear(name);
    await user.type(name, "Marathi{Enter}");
    expect(onChange).toHaveBeenLastCalledWith({ versions: { Marathi: "x" } });
  });
});
