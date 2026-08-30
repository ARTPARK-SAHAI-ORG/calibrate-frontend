import React from "react";
import { render, screen, setupUser } from "@/test-utils";
import { CreateToolFlow } from "../CreateToolFlow";
import type { ToolData } from "@/components/AddToolDialog";

// AddToolDialog is a large, separately-tested component (creation form,
// validation, the real POST). Stubbed here to a button that reports back
// exactly what the real builder reports: the full tool list after the
// backend created the tool.
const addToolDialogProps = jest.fn();
jest.mock("../../AddToolDialog", () => ({
  __esModule: true,
  AddToolDialog: (props: {
    isOpen: boolean;
    toolType: string;
    onClose: () => void;
    onToolsUpdated: (tools: ToolData[]) => void;
  }) => {
    addToolDialogProps(props);
    if (!props.isOpen) return null;
    return (
      <>
        <button
          onClick={() =>
            props.onToolsUpdated([
              {
                uuid: "t-1",
                name: "Existing",
                config: {},
                created_at: "",
                updated_at: "",
              },
              {
                uuid: "t-2",
                name: "New tool",
                config: {},
                created_at: "",
                updated_at: "",
              },
            ])
          }
        >
          Finish {props.toolType} build
        </button>
        <button onClick={props.onClose}>Cancel build</button>
      </>
    );
  },
}));

const KNOWN: ToolData[] = [
  { uuid: "t-1", name: "Existing", config: {}, created_at: "", updated_at: "" },
];

describe("CreateToolFlow", () => {
  beforeEach(() => {
    addToolDialogProps.mockClear();
  });

  it("renders nothing when closed", () => {
    render(
      <CreateToolFlow
        isOpen={false}
        onClose={jest.fn()}
        accessToken="tok"
        knownTools={KNOWN}
        onCreated={jest.fn()}
      />,
    );
    expect(screen.queryByText("Create tool")).not.toBeInTheDocument();
  });

  it("asks which kind of tool first", () => {
    render(
      <CreateToolFlow
        isOpen
        onClose={jest.fn()}
        accessToken="tok"
        knownTools={KNOWN}
        onCreated={jest.fn()}
      />,
    );
    expect(screen.getByText("Create tool")).toBeInTheDocument();
    expect(screen.getByText("Webhook tool")).toBeInTheDocument();
    expect(screen.getByText("Structured output tool")).toBeInTheDocument();
  });

  it("opens the builder for the chosen kind", async () => {
    const user = setupUser();
    render(
      <CreateToolFlow
        isOpen
        onClose={jest.fn()}
        accessToken="tok"
        knownTools={KNOWN}
        onCreated={jest.fn()}
      />,
    );
    await user.click(screen.getByText("Webhook tool"));
    expect(addToolDialogProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ isOpen: true, toolType: "webhook" }),
    );
    expect(screen.getByText("Finish webhook build")).toBeInTheDocument();
  });

  it("reports the tool that is new against knownTools, and the full list", async () => {
    const user = setupUser();
    const onCreated = jest.fn();
    render(
      <CreateToolFlow
        isOpen
        onClose={jest.fn()}
        accessToken="tok"
        knownTools={KNOWN}
        onCreated={onCreated}
      />,
    );
    await user.click(screen.getByText("Structured output tool"));
    await user.click(screen.getByText("Finish structured_output build"));
    expect(onCreated).toHaveBeenCalledWith(
      {
        uuid: "t-2",
        name: "New tool",
        config: {},
        created_at: "",
        updated_at: "",
      },
      [
        {
          uuid: "t-1",
          name: "Existing",
          config: {},
          created_at: "",
          updated_at: "",
        },
        {
          uuid: "t-2",
          name: "New tool",
          config: {},
          created_at: "",
          updated_at: "",
        },
      ],
    );
  });

  it("does not call onCreated when the returned list has nothing new", async () => {
    const user = setupUser();
    const onCreated = jest.fn();
    render(
      <CreateToolFlow
        isOpen
        onClose={jest.fn()}
        accessToken="tok"
        knownTools={[
          {
            uuid: "t-1",
            name: "Existing",
            config: {},
            created_at: "",
            updated_at: "",
          },
          {
            uuid: "t-2",
            name: "New tool",
            config: {},
            created_at: "",
            updated_at: "",
          },
        ]}
        onCreated={onCreated}
      />,
    );
    await user.click(screen.getByText("Webhook tool"));
    await user.click(screen.getByText("Finish webhook build"));
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("resets to the picker when the builder's own close fires, ready for next time", async () => {
    // The component never unmounts on isOpen=false (the caller keeps it
    // mounted and toggles isOpen), so the picker choice would otherwise
    // survive from one open to the next. `close()` clears it explicitly.
    const user = setupUser();
    const onClose = jest.fn();
    const { rerender } = render(
      <CreateToolFlow
        isOpen
        onClose={onClose}
        accessToken="tok"
        knownTools={KNOWN}
        onCreated={jest.fn()}
      />,
    );
    await user.click(screen.getByText("Webhook tool"));
    expect(screen.getByText("Finish webhook build")).toBeInTheDocument();

    await user.click(screen.getByText("Cancel build"));
    expect(onClose).toHaveBeenCalledTimes(1);

    // The parent reacts to that call by setting isOpen=false, then the reader
    // opens it again — reused component instance, so this proves `variant`
    // was actually cleared rather than only forwarding the close.
    rerender(
      <CreateToolFlow
        isOpen={false}
        onClose={onClose}
        accessToken="tok"
        knownTools={KNOWN}
        onCreated={jest.fn()}
      />,
    );
    rerender(
      <CreateToolFlow
        isOpen
        onClose={onClose}
        accessToken="tok"
        knownTools={KNOWN}
        onCreated={jest.fn()}
      />,
    );
    expect(screen.getByText("Webhook tool")).toBeInTheDocument();
    expect(screen.queryByText("Finish webhook build")).not.toBeInTheDocument();
  });
});
