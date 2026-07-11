import { render, screen, setupUser, waitFor } from "@/test-utils";
import { CreateApiKeyDialog } from "../CreateApiKeyDialog";
import type { OrganizationApiKeyWithSecret } from "@/lib/orgs";

const createdKey: OrganizationApiKeyWithSecret = {
  uuid: "key-1",
  name: "GitHub Actions",
  last_four: "abcd",
  masked_key: "****abcd",
  key: "sk-secret-value-123",
};

describe("CreateApiKeyDialog", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <CreateApiKeyDialog isOpen={false} onClose={jest.fn()} onCreate={jest.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("keeps Create key disabled until a name is entered, and disables on whitespace-only input", async () => {
    const user = setupUser();
    render(
      <CreateApiKeyDialog isOpen onClose={jest.fn()} onCreate={jest.fn()} />,
    );
    const submit = screen.getByRole("button", { name: "Create key" });
    expect(submit).toBeDisabled();

    const input = screen.getByPlaceholderText("e.g. GitHub Actions");
    await user.type(input, "   ");
    expect(submit).toBeDisabled();

    await user.type(input, "My key");
    expect(submit).toBeEnabled();
  });

  it("submits the trimmed name and shows the one-time secret reveal on success", async () => {
    const user = setupUser();
    const onCreate = jest.fn().mockResolvedValue(createdKey);
    render(<CreateApiKeyDialog isOpen onClose={jest.fn()} onCreate={onCreate} />);

    await user.type(
      screen.getByPlaceholderText("e.g. GitHub Actions"),
      "  GitHub Actions  ",
    );
    await user.click(screen.getByRole("button", { name: "Create key" }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith("GitHub Actions"));
    expect(await screen.findByText("API key created")).toBeInTheDocument();
    expect(screen.getByText(createdKey.key)).toBeInTheDocument();
  });

  it("shows an error message and stays on the form when creation fails", async () => {
    const user = setupUser();
    const onCreate = jest
      .fn()
      .mockRejectedValue(new Error("Request failed: 409 - {\"detail\":\"name already exists\"}"));
    render(<CreateApiKeyDialog isOpen onClose={jest.fn()} onCreate={onCreate} />);

    await user.type(screen.getByPlaceholderText("e.g. GitHub Actions"), "Dup");
    await user.click(screen.getByRole("button", { name: "Create key" }));

    expect(await screen.findByText("name already exists")).toBeInTheDocument();
    expect(screen.getByText("Create API key")).toBeInTheDocument();
  });

  it("clears the error when the name is edited again", async () => {
    const user = setupUser();
    const onCreate = jest.fn().mockRejectedValue(new Error("boom"));
    render(<CreateApiKeyDialog isOpen onClose={jest.fn()} onCreate={onCreate} />);

    const input = screen.getByPlaceholderText("e.g. GitHub Actions");
    await user.type(input, "Dup");
    await user.click(screen.getByRole("button", { name: "Create key" }));
    expect(await screen.findByText("boom")).toBeInTheDocument();

    await user.type(input, "2");
    expect(screen.queryByText("boom")).not.toBeInTheDocument();
  });

  it("shows a spinner and disables inputs while submitting", async () => {
    const user = setupUser();
    let resolveCreate: (v: OrganizationApiKeyWithSecret) => void;
    const onCreate = jest.fn(
      () =>
        new Promise<OrganizationApiKeyWithSecret>((resolve) => {
          resolveCreate = resolve;
        }),
    );
    render(<CreateApiKeyDialog isOpen onClose={jest.fn()} onCreate={onCreate} />);

    await user.type(screen.getByPlaceholderText("e.g. GitHub Actions"), "Pending");
    await user.click(screen.getByRole("button", { name: "Create key" }));

    expect(screen.getByText("Creating...")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("e.g. GitHub Actions")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    resolveCreate!(createdKey);
    await screen.findByText("API key created");
  });

  it("does not submit when the name is only whitespace (form submit bypass)", async () => {
    const onCreate = jest.fn();
    render(<CreateApiKeyDialog isOpen onClose={jest.fn()} onCreate={onCreate} />);
    const form = screen.getByRole("button", { name: "Create key" }).closest("form")!;
    // fireEvent.submit bypasses the disabled attribute to exercise the guard clause directly.
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.submit(form);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("copies the key to the clipboard and shows Copied, reverting after timeout", async () => {
    const user = setupUser();
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    const onCreate = jest.fn().mockResolvedValue(createdKey);
    render(<CreateApiKeyDialog isOpen onClose={jest.fn()} onCreate={onCreate} />);

    await user.type(screen.getByPlaceholderText("e.g. GitHub Actions"), "Key");
    await user.click(screen.getByRole("button", { name: "Create key" }));
    await screen.findByText("API key created");

    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith(createdKey.key);
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();

    await waitFor(
      () => expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument(),
      { timeout: 3000 },
    );
  }, 10000);

  it("falls back to execCommand copy when clipboard API throws", async () => {
    // userEvent.setup() installs its own clipboard stub, so it must run
    // before we override navigator.clipboard — otherwise it clobbers ours.
    const user = setupUser();
    const writeText = jest.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    const execCommand = jest.fn();
    document.execCommand = execCommand;

    const onCreate = jest.fn().mockResolvedValue(createdKey);
    render(<CreateApiKeyDialog isOpen onClose={jest.fn()} onCreate={onCreate} />);

    await user.type(screen.getByPlaceholderText("e.g. GitHub Actions"), "Key");
    await user.click(screen.getByRole("button", { name: "Create key" }));
    await screen.findByText("API key created");

    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("calls onClose from the Done button after reveal", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    const onCreate = jest.fn().mockResolvedValue(createdKey);
    render(<CreateApiKeyDialog isOpen onClose={onClose} onCreate={onCreate} />);

    await user.type(screen.getByPlaceholderText("e.g. GitHub Actions"), "Key");
    await user.click(screen.getByRole("button", { name: "Create key" }));
    await screen.findByText("API key created");

    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose from the Cancel button on the name form", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    render(<CreateApiKeyDialog isOpen onClose={onClose} onCreate={jest.fn()} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when clicking the backdrop on the name form", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    const { container } = render(
      <CreateApiKeyDialog isOpen onClose={onClose} onCreate={jest.fn()} />,
    );
    const backdrop = container.querySelector(".absolute.inset-0.-z-10") as HTMLElement;
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not render a backdrop click target once the key has been revealed", async () => {
    const user = setupUser();
    const onCreate = jest.fn().mockResolvedValue(createdKey);
    const { container } = render(
      <CreateApiKeyDialog isOpen onClose={jest.fn()} onCreate={onCreate} />,
    );
    await user.type(screen.getByPlaceholderText("e.g. GitHub Actions"), "Key");
    await user.click(screen.getByRole("button", { name: "Create key" }));
    await screen.findByText("API key created");

    expect(container.querySelector(".absolute.inset-0.-z-10")).not.toBeInTheDocument();
  });

  it("resets form state after closing and reopening", async () => {
    const user = setupUser();
    const onCreate = jest.fn().mockResolvedValue(createdKey);
    const { rerender } = render(
      <CreateApiKeyDialog isOpen onClose={jest.fn()} onCreate={onCreate} />,
    );
    await user.type(screen.getByPlaceholderText("e.g. GitHub Actions"), "Key");
    await user.click(screen.getByRole("button", { name: "Create key" }));
    await screen.findByText("API key created");

    rerender(
      <CreateApiKeyDialog isOpen={false} onClose={jest.fn()} onCreate={onCreate} />,
    );
    rerender(
      <CreateApiKeyDialog isOpen onClose={jest.fn()} onCreate={onCreate} />,
    );

    expect(screen.getByText("Create API key")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("e.g. GitHub Actions")).toHaveValue("");
  });
});
