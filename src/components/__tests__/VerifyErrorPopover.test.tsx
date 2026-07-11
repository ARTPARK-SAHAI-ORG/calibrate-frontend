import { render, screen, setupUser } from "@/test-utils";
import { VerifyErrorPopover } from "../VerifyErrorPopover";

describe("VerifyErrorPopover", () => {
  it("renders nothing when there is no error and no sample response", () => {
    const { container } = render(
      <VerifyErrorPopover error={null} sampleResponse={null} onDismiss={jest.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the error message", () => {
    render(
      <VerifyErrorPopover
        error="Something went wrong"
        sampleResponse={null}
        onDismiss={jest.fn()}
      />,
    );
    expect(screen.getByText("Verification Failed")).toBeInTheDocument();
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(
      screen.queryByText("Your agent responded with:"),
    ).not.toBeInTheDocument();
  });

  it("renders the sample response as formatted JSON", () => {
    render(
      <VerifyErrorPopover
        error={null}
        sampleResponse={{ foo: "bar" }}
        onDismiss={jest.fn()}
      />,
    );
    expect(screen.getByText("Your agent responded with:")).toBeInTheDocument();
    expect(screen.getByText(/"foo": "bar"/)).toBeInTheDocument();
  });

  it("calls onDismiss when the close button is clicked", async () => {
    const user = setupUser();
    const onDismiss = jest.fn();
    render(
      <VerifyErrorPopover
        error="Oops"
        sampleResponse={null}
        onDismiss={onDismiss}
      />,
    );
    await user.click(screen.getByRole("button"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("calls onDismiss when the backdrop overlay is clicked", () => {
    const onDismiss = jest.fn();
    const { container } = render(
      <VerifyErrorPopover
        error="Oops"
        sampleResponse={null}
        onDismiss={onDismiss}
      />,
    );
    const overlay = container.querySelector(".fixed.inset-0");
    expect(overlay).toBeInTheDocument();
    overlay!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
