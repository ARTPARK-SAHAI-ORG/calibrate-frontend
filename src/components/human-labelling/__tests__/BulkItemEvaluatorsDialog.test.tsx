import { render, screen, setupUser, waitFor } from "@/test-utils";
import { BulkItemEvaluatorsDialog } from "../BulkItemEvaluatorsDialog";
import { apiClient } from "../../../lib/api";

jest.mock("../../../lib/api", () => ({
  apiClient: jest.fn(),
}));

const mockedApiClient = apiClient as jest.Mock;

const evaluators = [
  { uuid: "ev-1", name: "Relevance", description: "Checks relevance" },
  { uuid: "ev-2", name: "Fluency" },
];

function renderDialog(
  props: Partial<React.ComponentProps<typeof BulkItemEvaluatorsDialog>> = {},
) {
  const onClose = jest.fn();
  const onDone = jest.fn();
  const utils = render(
    <BulkItemEvaluatorsDialog
      isOpen
      onClose={onClose}
      accessToken="tok"
      taskUuid="task-1"
      evaluators={evaluators}
      selectedItemCount={40}
      scope={{ item_ids: ["i-1", "i-2"] }}
      onDone={onDone}
      {...props}
    />,
  );
  return { onClose, onDone, ...utils };
}

const primaryButton = (name: RegExp) => screen.getByRole("button", { name });

describe("BulkItemEvaluatorsDialog", () => {
  beforeEach(() => {
    mockedApiClient.mockReset();
    mockedApiClient.mockResolvedValue({ updated_count: 2 });
  });

  it("renders nothing when closed", () => {
    renderDialog({ isOpen: false });
    expect(screen.queryByText("Change evaluators")).not.toBeInTheDocument();
  });

  it("lists the task's evaluators and the item count", () => {
    renderDialog();
    expect(screen.getByText("Relevance")).toBeInTheDocument();
    expect(screen.getByText("Checks relevance")).toBeInTheDocument();
    expect(screen.getByText("Fluency")).toBeInTheDocument();
    expect(
      screen.getByText("Applies to the 40 items you selected"),
    ).toBeInTheDocument();
  });

  it("uses the singular noun for one item", () => {
    renderDialog({ selectedItemCount: 1 });
    expect(
      screen.getByText("Applies to the 1 item you selected"),
    ).toBeInTheDocument();
  });

  it("keeps the action button disabled until an evaluator is picked", async () => {
    const user = setupUser();
    renderDialog();
    const button = primaryButton(/Add to items/);
    expect(button).toBeDisabled();

    await user.click(screen.getByText("Relevance"));
    expect(button).not.toBeDisabled();

    // Unticking the last one disables it again.
    await user.click(screen.getByText("Relevance"));
    expect(button).toBeDisabled();
  });

  it("switches the copy and the button label between add and remove", async () => {
    const user = setupUser();
    renderDialog();
    expect(
      screen.getByText(/Add the selected evaluators to 40 items\./),
    ).toBeInTheDocument();

    await user.click(primaryButton(/^Remove$/));
    expect(
      screen.getByText(
        "Remove the selected evaluators from 40 items. The task and every other item keep them.",
      ),
    ).toBeInTheDocument();
    expect(primaryButton(/Remove from items/)).toBeInTheDocument();
  });

  it("posts action add with the picked ids and the given scope", async () => {
    const user = setupUser();
    const { onDone } = renderDialog();

    await user.click(screen.getByText("Fluency"));
    await user.click(screen.getByText("Relevance"));
    await user.click(primaryButton(/Add to items/));

    await waitFor(() => expect(mockedApiClient).toHaveBeenCalledTimes(1));
    expect(mockedApiClient).toHaveBeenCalledWith(
      "/annotation-tasks/task-1/items/evaluators",
      "tok",
      {
        method: "POST",
        body: {
          action: "add",
          // Task display order, not click order.
          evaluator_ids: ["ev-1", "ev-2"],
          item_ids: ["i-1", "i-2"],
        },
      },
    );
    expect(onDone).toHaveBeenCalledWith("add", 2);
  });

  it("posts action remove when remove is chosen", async () => {
    const user = setupUser();
    const { onDone } = renderDialog();

    await user.click(primaryButton(/^Remove$/));
    await user.click(screen.getByText("Relevance"));
    await user.click(primaryButton(/Remove from items/));

    await waitFor(() => expect(mockedApiClient).toHaveBeenCalledTimes(1));
    expect(mockedApiClient.mock.calls[0][2].body).toEqual({
      action: "remove",
      evaluator_ids: ["ev-1"],
      item_ids: ["i-1", "i-2"],
    });
    expect(onDone).toHaveBeenCalledWith("remove", 2);
  });

  it("passes a select_all scope through unchanged", async () => {
    const user = setupUser();
    renderDialog({ scope: { select_all: true, q: "hello" } });

    await user.click(screen.getByText("Relevance"));
    await user.click(primaryButton(/Add to items/));

    await waitFor(() => expect(mockedApiClient).toHaveBeenCalledTimes(1));
    expect(mockedApiClient.mock.calls[0][2].body).toEqual({
      action: "add",
      evaluator_ids: ["ev-1"],
      select_all: true,
      q: "hello",
    });
  });

  it("reports a lower updated count than the rows picked without showing an error", async () => {
    const user = setupUser();
    mockedApiClient.mockResolvedValue({ updated_count: 1 });
    const { onDone } = renderDialog({ selectedItemCount: 40 });

    await user.click(screen.getByText("Relevance"));
    await user.click(primaryButton(/Add to items/));

    await waitFor(() => expect(onDone).toHaveBeenCalledWith("add", 1));
    expect(screen.queryByText(/Failed to update/)).not.toBeInTheDocument();
  });

  it("treats a response with no count as zero", async () => {
    const user = setupUser();
    mockedApiClient.mockResolvedValue({});
    const { onDone } = renderDialog();

    await user.click(screen.getByText("Relevance"));
    await user.click(primaryButton(/Add to items/));

    await waitFor(() => expect(onDone).toHaveBeenCalledWith("add", 0));
  });

  it("shows the backend message inline and keeps the dialog open when the call fails", async () => {
    const user = setupUser();
    mockedApiClient.mockRejectedValue(
      new Error(
        'Request failed: 400 - {"detail":"An item must keep at least one evaluator"}',
      ),
    );
    const { onDone } = renderDialog();

    await user.click(primaryButton(/^Remove$/));
    await user.click(screen.getByText("Relevance"));
    await user.click(primaryButton(/Remove from items/));

    expect(
      await screen.findByText("An item must keep at least one evaluator"),
    ).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByText("Change evaluators")).toBeInTheDocument();
  });

  it("shows the raw body when the failure body is not valid JSON", async () => {
    const user = setupUser();
    mockedApiClient.mockRejectedValue(
      new Error("Request failed: 500 - not-json{{{"),
    );
    renderDialog();

    await user.click(screen.getByText("Relevance"));
    await user.click(primaryButton(/Add to items/));

    expect(await screen.findByText("not-json{{{")).toBeInTheDocument();
  });

  it("shows a plain error message that is not in the structured format", async () => {
    const user = setupUser();
    mockedApiClient.mockRejectedValue(new Error("Network down"));
    renderDialog();

    await user.click(screen.getByText("Relevance"));
    await user.click(primaryButton(/Add to items/));

    expect(await screen.findByText("Network down")).toBeInTheDocument();
  });

  it("falls back to a default message for a non-Error failure", async () => {
    const user = setupUser();
    mockedApiClient.mockRejectedValue("boom");
    renderDialog();

    await user.click(screen.getByText("Relevance"));
    await user.click(primaryButton(/Add to items/));

    expect(
      await screen.findByText("Failed to update the evaluators"),
    ).toBeInTheDocument();
  });

  it("shows the loading state and disables the buttons while the call runs", async () => {
    const user = setupUser();
    let resolveCall: ((v: unknown) => void) | undefined;
    mockedApiClient.mockReturnValue(
      new Promise((resolve) => {
        resolveCall = resolve;
      }),
    );
    const { onClose, container } = renderDialog();

    await user.click(screen.getByText("Relevance"));
    await user.click(primaryButton(/Add to items/));

    expect(primaryButton(/Saving\.\.\./)).toBeDisabled();
    expect(primaryButton(/^Cancel$/)).toBeDisabled();

    // The backdrop must not close the dialog mid-call.
    await user.click(container.firstChild as Element);
    expect(onClose).not.toHaveBeenCalled();

    resolveCall?.({ updated_count: 3 });
    await waitFor(() =>
      expect(screen.queryByText("Saving...")).not.toBeInTheDocument(),
    );
  });

  it("closes via the close button, Cancel and the backdrop", async () => {
    const user = setupUser();
    const { onClose, container } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(primaryButton(/^Cancel$/));
    expect(onClose).toHaveBeenCalledTimes(2);

    await user.click(container.firstChild as Element);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("does not close when clicking inside the dialog", async () => {
    const user = setupUser();
    const { onClose } = renderDialog();
    await user.click(screen.getByText("Change evaluators"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("blocks removing every evaluator and says why", async () => {
    const user = setupUser();
    renderDialog();

    await user.click(primaryButton(/^Remove$/));
    await user.click(screen.getByText("Relevance"));
    await user.click(screen.getByText("Fluency"));

    expect(primaryButton(/Remove from items/)).toBeDisabled();
    expect(
      screen.getByText("An item must keep at least one evaluator."),
    ).toBeInTheDocument();

    await user.click(primaryButton(/Remove from items/));
    expect(mockedApiClient).not.toHaveBeenCalled();
  });

  it("allows removing some of the evaluators", async () => {
    const user = setupUser();
    renderDialog();

    await user.click(primaryButton(/^Remove$/));
    await user.click(screen.getByText("Relevance"));

    expect(primaryButton(/Remove from items/)).not.toBeDisabled();
    expect(
      screen.queryByText("An item must keep at least one evaluator."),
    ).not.toBeInTheDocument();
  });

  it("allows adding every evaluator", async () => {
    const user = setupUser();
    renderDialog();

    await user.click(screen.getByText("Relevance"));
    await user.click(screen.getByText("Fluency"));

    expect(primaryButton(/Add to items/)).not.toBeDisabled();
    expect(
      screen.queryByText("An item must keep at least one evaluator."),
    ).not.toBeInTheDocument();
  });

  it("clears the blocked state when switching from remove back to add", async () => {
    const user = setupUser();
    renderDialog();

    await user.click(primaryButton(/^Remove$/));
    await user.click(screen.getByText("Relevance"));
    await user.click(screen.getByText("Fluency"));
    expect(primaryButton(/Remove from items/)).toBeDisabled();

    await user.click(primaryButton(/^Add$/));
    expect(primaryButton(/Add to items/)).not.toBeDisabled();
    expect(
      screen.queryByText("An item must keep at least one evaluator."),
    ).not.toBeInTheDocument();
  });

  it("resets the action and the picks when reopened", async () => {
    const user = setupUser();
    const { rerender } = renderDialog();

    await user.click(primaryButton(/^Remove$/));
    await user.click(screen.getByText("Relevance"));
    expect(primaryButton(/Remove from items/)).not.toBeDisabled();

    rerender(
      <BulkItemEvaluatorsDialog
        isOpen={false}
        onClose={jest.fn()}
        accessToken="tok"
        taskUuid="task-1"
        evaluators={evaluators}
        selectedItemCount={40}
        scope={{ item_ids: ["i-1"] }}
        onDone={jest.fn()}
      />,
    );
    rerender(
      <BulkItemEvaluatorsDialog
        isOpen
        onClose={jest.fn()}
        accessToken="tok"
        taskUuid="task-1"
        evaluators={evaluators}
        selectedItemCount={40}
        scope={{ item_ids: ["i-1"] }}
        onDone={jest.fn()}
      />,
    );

    expect(primaryButton(/Add to items/)).toBeDisabled();
  });
});
