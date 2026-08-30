import React from "react";
import { act, render, screen, setupUser } from "@/test-utils";
import { EnableBenchmarkDialog } from "../EnableBenchmarkDialog";

describe("EnableBenchmarkDialog", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <EnableBenchmarkDialog
        isOpen={false}
        onClose={jest.fn()}
        onConfirm={jest.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("confirms with the default provider", async () => {
    const user = setupUser();
    const onConfirm = jest.fn();
    render(
      <EnableBenchmarkDialog
        isOpen
        onClose={jest.fn()}
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(onConfirm).toHaveBeenCalledWith("openrouter");
  });

  it("starts from the agent's saved provider and confirms the picked one", async () => {
    const user = setupUser();
    const onConfirm = jest.fn();
    render(
      <EnableBenchmarkDialog
        isOpen
        onClose={jest.fn()}
        onConfirm={onConfirm}
        currentProvider="google"
      />,
    );

    const select = screen.getByLabelText("Model provider") as HTMLSelectElement;
    expect(select.value).toBe("google");
    await user.selectOptions(select, "anthropic");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(onConfirm).toHaveBeenCalledWith("anthropic");
  });

  it("closes on cancel", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    render(
      <EnableBenchmarkDialog isOpen onClose={onClose} onConfirm={jest.fn()} />,
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("disables the controls while the provider is saving", async () => {
    const user = setupUser();
    let resolveConfirm: () => void = () => {};
    const onConfirm = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirm = resolve;
        }),
    );
    render(
      <EnableBenchmarkDialog
        isOpen
        onClose={jest.fn()}
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await act(async () => {
      resolveConfirm();
    });
  });
});
