import { render, screen, setupUser } from "@/test-utils";
import { SlidePanel, SlidePanelFooter } from "../SlidePanel";

describe("SlidePanel", () => {
  it("renders nothing when isOpen is false", () => {
    const { container } = render(
      <SlidePanel isOpen={false} onClose={jest.fn()} title="Panel Title">
        <div>content</div>
      </SlidePanel>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the title and children when open", () => {
    render(
      <SlidePanel isOpen onClose={jest.fn()} title="Panel Title">
        <div>panel content</div>
      </SlidePanel>
    );
    expect(screen.getByText("Panel Title")).toBeInTheDocument();
    expect(screen.getByText("panel content")).toBeInTheDocument();
  });

  it("renders the icon when provided", () => {
    render(
      <SlidePanel
        isOpen
        onClose={jest.fn()}
        title="Panel Title"
        icon={<span data-testid="my-icon">icon</span>}
      >
        <div>content</div>
      </SlidePanel>
    );
    expect(screen.getByTestId("my-icon")).toBeInTheDocument();
  });

  it("does not render an icon wrapper when icon is not provided", () => {
    render(
      <SlidePanel isOpen onClose={jest.fn()} title="Panel Title">
        <div>content</div>
      </SlidePanel>
    );
    expect(screen.queryByTestId("my-icon")).not.toBeInTheDocument();
  });

  it("shows the loading spinner instead of children when isLoading is true", () => {
    const { container } = render(
      <SlidePanel isOpen onClose={jest.fn()} title="Panel Title" isLoading>
        <div>hidden content</div>
      </SlidePanel>
    );
    expect(screen.queryByText("hidden content")).not.toBeInTheDocument();
    expect(container.querySelector("svg.animate-spin")).toBeInTheDocument();
  });

  it("calls onClose when the backdrop is clicked", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    const { container } = render(
      <SlidePanel isOpen onClose={onClose} title="Panel Title">
        <div>content</div>
      </SlidePanel>
    );
    const backdrop = container.querySelector(".backdrop-blur-sm") as HTMLElement;
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the close button is clicked", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    render(
      <SlidePanel isOpen onClose={onClose} title="Panel Title">
        <div>content</div>
      </SlidePanel>
    );
    await user.click(screen.getByRole("button"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not render a footer section when footer is not provided", () => {
    render(
      <SlidePanel isOpen onClose={jest.fn()} title="Panel Title">
        <div>content</div>
      </SlidePanel>
    );
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
  });

  it("renders the footer and error message when provided", () => {
    render(
      <SlidePanel
        isOpen
        onClose={jest.fn()}
        title="Panel Title"
        error="Something went wrong"
        footer={<button>Save</button>}
      >
        <div>content</div>
      </SlidePanel>
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("renders the footer without an error message when error is not set", () => {
    render(
      <SlidePanel
        isOpen
        onClose={jest.fn()}
        title="Panel Title"
        footer={<button>Save</button>}
      >
        <div>content</div>
      </SlidePanel>
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
  });

  it("applies a custom width class", () => {
    const { container } = render(
      <SlidePanel
        isOpen
        onClose={jest.fn()}
        title="Panel Title"
        width="w-[80%] min-w-[300px]"
      >
        <div>content</div>
      </SlidePanel>
    );
    const panel = container.querySelector(".shadow-2xl");
    expect(panel).toHaveClass("w-[80%]", "min-w-[300px]");
  });
});

describe("SlidePanelFooter", () => {
  it("renders default cancel/submit text and calls callbacks", async () => {
    const user = setupUser();
    const onCancel = jest.fn();
    const onSubmit = jest.fn();
    render(<SlidePanelFooter onCancel={onCancel} onSubmit={onSubmit} />);

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    const saveButton = screen.getByRole("button", { name: "Save" });
    expect(cancelButton).not.toBeDisabled();
    expect(saveButton).not.toBeDisabled();

    await user.click(cancelButton);
    expect(onCancel).toHaveBeenCalledTimes(1);
    await user.click(saveButton);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("uses custom text overrides", () => {
    render(
      <SlidePanelFooter
        onCancel={jest.fn()}
        onSubmit={jest.fn()}
        submitText="Create"
        cancelText="Discard"
      />
    );
    expect(screen.getByRole("button", { name: "Discard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
  });

  it("disables both buttons and shows submittingText while isSubmitting", () => {
    render(
      <SlidePanelFooter
        onCancel={jest.fn()}
        onSubmit={jest.fn()}
        isSubmitting
        submittingText="Creating..."
      />
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByText("Creating...")).toBeInTheDocument();
  });

  it("disables both buttons while isLoading", () => {
    render(
      <SlidePanelFooter onCancel={jest.fn()} onSubmit={jest.fn()} isLoading />
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});
