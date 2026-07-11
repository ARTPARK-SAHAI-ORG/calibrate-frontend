import { render, screen, setupUser, waitFor } from "@/test-utils";
import { EditTaskDialog } from "../EditTaskDialog";
import { apiClient } from "../../../lib/api";

jest.mock("../../../lib/api", () => ({
  apiClient: jest.fn(),
}));

const mockedApiClient = apiClient as jest.Mock;

function renderDialog(
  props: Partial<React.ComponentProps<typeof EditTaskDialog>> = {},
) {
  const onClose = jest.fn();
  const onSaved = jest.fn();
  const utils = render(
    <EditTaskDialog
      isOpen
      accessToken="tok"
      taskUuid="task-1"
      initialName="Original name"
      initialDescription="Original description"
      onClose={onClose}
      onSaved={onSaved}
      {...props}
    />,
  );
  return { onClose, onSaved, ...utils };
}

describe("EditTaskDialog", () => {
  beforeEach(() => {
    mockedApiClient.mockReset();
  });

  it("renders nothing when closed", () => {
    render(
      <EditTaskDialog
        isOpen={false}
        accessToken="tok"
        taskUuid="task-1"
        initialName="Original name"
        initialDescription="Original description"
        onClose={jest.fn()}
        onSaved={jest.fn()}
      />,
    );
    expect(screen.queryByText("Edit task")).not.toBeInTheDocument();
  });

  it("pre-fills the name and description from initial values", () => {
    renderDialog();
    expect(screen.getByDisplayValue("Original name")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("Original description"),
    ).toBeInTheDocument();
  });

  it("shows a validation error when saving with an empty name", async () => {
    const user = setupUser();
    renderDialog();
    const nameInput = screen.getByPlaceholderText("Task name");
    await user.clear(nameInput);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Name is required")).toBeInTheDocument();
    expect(mockedApiClient).not.toHaveBeenCalled();
  });

  it("clears the name error when the name field is edited again", async () => {
    const user = setupUser();
    renderDialog();
    const nameInput = screen.getByPlaceholderText("Task name");
    await user.clear(nameInput);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Name is required")).toBeInTheDocument();

    await user.type(nameInput, "New name");
    expect(screen.queryByText("Name is required")).not.toBeInTheDocument();
  });

  it("saves successfully, trimming name/description, and calls onSaved", async () => {
    mockedApiClient.mockResolvedValue({});
    const user = setupUser();
    const { onSaved } = renderDialog();

    const nameInput = screen.getByPlaceholderText("Task name");
    await user.clear(nameInput);
    await user.type(nameInput, "  Renamed task  ");
    const descInput = screen.getByPlaceholderText(
      "Short description of the labelling task",
    );
    await user.clear(descInput);
    await user.type(descInput, "  New description  ");

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(mockedApiClient).toHaveBeenCalledWith(
      "/annotation-tasks/task-1",
      "tok",
      {
        method: "PUT",
        body: { name: "Renamed task", description: "New description" },
      },
    );
  });

  it("shows a name-conflict error inline when the backend reports a duplicate name", async () => {
    mockedApiClient.mockRejectedValue(
      new Error(
        'Request failed: 400 - {"detail":"Task with this name already exists"}',
      ),
    );
    const user = setupUser();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("Task with this name already exists"),
    ).toBeInTheDocument();
  });

  it("shows a generic error for other failures, parsing plain-text error bodies", async () => {
    mockedApiClient.mockRejectedValue(
      new Error("Request failed: 500 - Internal Server Error"),
    );
    const user = setupUser();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("Internal Server Error"),
    ).toBeInTheDocument();
  });

  it("falls back to the error message when the response isn't in 'Request failed' format", async () => {
    mockedApiClient.mockRejectedValue(new Error("Network down"));
    const user = setupUser();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Network down")).toBeInTheDocument();
  });

  it("falls back to the default message when the Error has an empty message", async () => {
    mockedApiClient.mockRejectedValue(new Error(""));
    const user = setupUser();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Failed to save task")).toBeInTheDocument();
  });

  it("falls back to the default message for non-Error rejections", async () => {
    mockedApiClient.mockRejectedValue("boom");
    const user = setupUser();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Failed to save task")).toBeInTheDocument();
  });

  it("clears a previous generic error once the name field changes", async () => {
    mockedApiClient.mockRejectedValue(new Error("Network down"));
    const user = setupUser();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Network down")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Task name"), "!");
    expect(screen.queryByText("Network down")).not.toBeInTheDocument();
  });

  it("resets fields and errors when reopened with new initial values", async () => {
    mockedApiClient.mockRejectedValue(new Error("Network down"));
    const user = setupUser();
    const { rerender } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Network down")).toBeInTheDocument();

    rerender(
      <EditTaskDialog
        isOpen={false}
        accessToken="tok"
        taskUuid="task-1"
        initialName="Original name"
        initialDescription="Original description"
        onClose={jest.fn()}
        onSaved={jest.fn()}
      />,
    );
    rerender(
      <EditTaskDialog
        isOpen
        accessToken="tok"
        taskUuid="task-2"
        initialName="Fresh name"
        initialDescription="Fresh description"
        onClose={jest.fn()}
        onSaved={jest.fn()}
      />,
    );

    expect(screen.getByDisplayValue("Fresh name")).toBeInTheDocument();
    expect(screen.queryByText("Network down")).not.toBeInTheDocument();
  });

  it("does not close when the backdrop is clicked while saving is in flight", async () => {
    let resolveSave: (() => void) | undefined;
    mockedApiClient.mockReturnValue(
      new Promise((resolve) => {
        resolveSave = () => resolve({});
      }),
    );
    const user = setupUser();
    const { onClose, container } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    await user.click(container.firstChild as Element);
    expect(onClose).not.toHaveBeenCalled();

    resolveSave?.();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled(),
    );
  });

  it("closes via the header close button, footer Cancel button, and backdrop when idle", async () => {
    const user = setupUser();
    const { onClose, container } = renderDialog();

    const headerCloseButton = container.querySelector(
      ".border-b button",
    ) as Element;
    await user.click(headerCloseButton);
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(2);

    await user.click(container.firstChild as Element);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("does not close when clicking inside the dialog panel", async () => {
    const user = setupUser();
    const { onClose } = renderDialog();
    await user.click(screen.getByText("Edit task"));
    expect(onClose).not.toHaveBeenCalled();
  });
});
