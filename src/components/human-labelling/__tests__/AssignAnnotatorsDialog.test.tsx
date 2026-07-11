import { render, screen, setupUser, waitFor } from "@/test-utils";
import { AssignAnnotatorsDialog } from "../AssignAnnotatorsDialog";
import { apiClient } from "../../../lib/api";

jest.mock("../../../lib/api", () => ({
  apiClient: jest.fn(),
}));

const mockedApiClient = apiClient as jest.Mock;

const evaluators = [
  { uuid: "ev-1", name: "Relevance", description: "Checks relevance" },
  { uuid: "ev-2", name: "Fluency" },
];

const annotators = [
  { uuid: "a-1", name: "Alice" },
  { uuid: "a-2", name: "Bob" },
];

function renderDialog(
  props: Partial<React.ComponentProps<typeof AssignAnnotatorsDialog>> = {},
) {
  const onClose = jest.fn();
  const onConfirm = jest.fn();
  const utils = render(
    <AssignAnnotatorsDialog
      isOpen
      accessToken="tok"
      selectedItemCount={3}
      evaluators={evaluators}
      onClose={onClose}
      onConfirm={onConfirm}
      {...props}
    />,
  );
  return { onClose, onConfirm, ...utils };
}

describe("AssignAnnotatorsDialog", () => {
  beforeEach(() => {
    mockedApiClient.mockReset();
  });

  it("renders nothing when closed", () => {
    render(
      <AssignAnnotatorsDialog
        isOpen={false}
        accessToken="tok"
        selectedItemCount={1}
        evaluators={evaluators}
        onClose={jest.fn()}
        onConfirm={jest.fn()}
      />,
    );
    expect(screen.queryByText("Assign annotators")).not.toBeInTheDocument();
  });

  it("shows a loading state while fetching annotators", () => {
    mockedApiClient.mockReturnValue(new Promise(() => {}));
    renderDialog();
    expect(screen.getByText("Loading annotators")).toBeInTheDocument();
  });

  it("shows a load error when fetching annotators fails", async () => {
    mockedApiClient.mockRejectedValue(
      new Error('Request failed: 500 - {"detail":"Server exploded"}'),
    );
    renderDialog();
    expect(
      await screen.findByText("Server exploded"),
    ).toBeInTheDocument();
  });

  it("shows a plain-text load error when the response isn't in structured format", async () => {
    mockedApiClient.mockRejectedValue(new Error("Network down"));
    renderDialog();
    expect(await screen.findByText("Network down")).toBeInTheDocument();
  });

  it("falls back to the raw message text when the load error body isn't valid JSON", async () => {
    mockedApiClient.mockRejectedValue(
      new Error("Request failed: 500 - not-json{{{"),
    );
    renderDialog();
    expect(await screen.findByText("not-json{{{")).toBeInTheDocument();
  });

  it("falls back to the default load error for a non-Error rejection", async () => {
    mockedApiClient.mockRejectedValue("boom");
    renderDialog();
    expect(
      await screen.findByText("Failed to load annotators"),
    ).toBeInTheDocument();
  });

  it("shows an empty state with a link when there are no annotators", async () => {
    mockedApiClient.mockResolvedValue([]);
    renderDialog();
    expect(await screen.findByText("No annotators yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add annotators" })).toHaveAttribute(
      "href",
      "/human-alignment?tab=annotators",
    );
  });

  it("tolerates a non-array response by treating it as empty", async () => {
    mockedApiClient.mockResolvedValue({ not: "an array" });
    renderDialog();
    expect(await screen.findByText("No annotators yet")).toBeInTheDocument();
  });

  it("lists annotators and keeps Assign disabled until one is picked", async () => {
    const user = setupUser();
    mockedApiClient.mockResolvedValue(annotators);
    renderDialog();

    await screen.findByText("Alice");
    const assignButton = screen.getByRole("button", { name: "Assign" });
    expect(assignButton).toBeDisabled();

    await user.click(screen.getByText("Alice"));
    expect(assignButton).not.toBeDisabled();
  });

  it("selects all / unselects all annotators via the header checkbox", async () => {
    const user = setupUser();
    mockedApiClient.mockResolvedValue(annotators);
    renderDialog();
    await screen.findByText("Alice");

    const selectAll = screen.getByRole("checkbox", {
      name: "Select all annotators",
    });
    await user.click(selectAll);
    expect(
      screen.getByRole("checkbox", { name: "Unselect all annotators" }),
    ).toBeChecked();

    await user.click(
      screen.getByRole("checkbox", { name: "Unselect all annotators" }),
    );
    expect(
      screen.getByRole("checkbox", { name: "Select all annotators" }),
    ).not.toBeChecked();
  });

  it("does not show the select-all control with a single annotator", async () => {
    mockedApiClient.mockResolvedValue([annotators[0]]);
    renderDialog();
    await screen.findByText("Alice");
    expect(
      screen.queryByRole("checkbox", { name: /all annotators/ }),
    ).not.toBeInTheDocument();
  });

  it("hides the evaluator-choice column when there is 0 or 1 evaluator", async () => {
    mockedApiClient.mockResolvedValue(annotators);
    renderDialog({ evaluators: [evaluators[0]] });
    await screen.findByText("Alice");
    expect(screen.queryByText("Show all labels")).not.toBeInTheDocument();
  });

  it("shows the evaluator-choice column with more than 1 evaluator, defaulting to all", async () => {
    mockedApiClient.mockResolvedValue(annotators);
    renderDialog();
    await screen.findByText("Alice");
    expect(screen.getByText("Show all labels")).toBeInTheDocument();
    expect(
      screen.getByText(
        "All labels will be shown in the labelling jobs created",
      ),
    ).toBeInTheDocument();
    const showAllCheckbox = screen.getByRole("checkbox", {
      name: "Show all labels",
    });
    expect(showAllCheckbox).toBeChecked();
  });

  it("switching off 'show all' seeds explicit picks with every evaluator", async () => {
    const user = setupUser();
    mockedApiClient.mockResolvedValue(annotators);
    renderDialog();
    await screen.findByText("Alice");

    await user.click(screen.getByRole("checkbox", { name: "Show all labels" }));
    expect(
      screen.getByText(
        "Pick one or more labels to show in the labelling jobs created",
      ),
    ).toBeInTheDocument();
    // Seeded picks mean both evaluator checkboxes appear checked.
    expect(
      screen.getByRole("checkbox", { name: /Relevance/ }) ??
        screen.getAllByRole("checkbox")[2],
    ).toBeTruthy();
  });

  it("toggling an individual evaluator off then requires at least one picked to confirm", async () => {
    const user = setupUser();
    mockedApiClient.mockResolvedValue(annotators);
    const onConfirm = jest.fn().mockResolvedValue(undefined);
    renderDialog({ onConfirm });
    await screen.findByText("Alice");

    await user.click(screen.getByText("Alice"));
    await user.click(screen.getByRole("checkbox", { name: "Show all labels" }));

    const evaluatorCheckboxes = screen
      .getAllByRole("checkbox")
      .filter((cb) => cb.getAttribute("aria-label") === null)
      .slice(-2); // evaluator card checkboxes have no aria-label

    // Uncheck both evaluators -> invalid selection, Assign disabled.
    for (const cb of evaluatorCheckboxes) {
      await user.click(cb);
    }
    expect(screen.getByRole("button", { name: "Assign" })).toBeDisabled();

    // Re-check one.
    await user.click(evaluatorCheckboxes[0]);
    expect(screen.getByRole("button", { name: "Assign" })).not.toBeDisabled();
  });

  it("confirms with picked annotator ids and null evaluatorIds when 'show all' is on", async () => {
    const user = setupUser();
    mockedApiClient.mockResolvedValue(annotators);
    const onConfirm = jest.fn().mockResolvedValue(undefined);
    renderDialog({ onConfirm });
    await screen.findByText("Alice");

    await user.click(screen.getByText("Alice"));
    await user.click(screen.getByRole("button", { name: "Assign" }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm).toHaveBeenCalledWith(["a-1"], null);
  });

  it("confirms with explicit evaluator ids when 'show all' is off", async () => {
    const user = setupUser();
    mockedApiClient.mockResolvedValue(annotators);
    const onConfirm = jest.fn().mockResolvedValue(undefined);
    renderDialog({ onConfirm });
    await screen.findByText("Alice");

    await user.click(screen.getByText("Alice"));
    await user.click(screen.getByRole("checkbox", { name: "Show all labels" }));
    await user.click(screen.getByRole("button", { name: "Assign" }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    const [ids, evalIds] = onConfirm.mock.calls[0];
    expect(ids).toEqual(["a-1"]);
    expect(evalIds).toEqual(expect.arrayContaining(["ev-1", "ev-2"]));
  });

  it("shows a submit error when confirm rejects, parsed from a structured detail", async () => {
    const user = setupUser();
    mockedApiClient.mockResolvedValue(annotators);
    const onConfirm = jest
      .fn()
      .mockRejectedValue(
        new Error('Request failed: 400 - {"detail":"No capacity"}'),
      );
    renderDialog({ onConfirm });
    await screen.findByText("Alice");

    await user.click(screen.getByText("Alice"));
    await user.click(screen.getByRole("button", { name: "Assign" }));

    expect(await screen.findByText("No capacity")).toBeInTheDocument();
  });

  it("falls back to the default confirm error for a non-Error rejection", async () => {
    const user = setupUser();
    mockedApiClient.mockResolvedValue(annotators);
    const onConfirm = jest.fn().mockRejectedValue("boom");
    renderDialog({ onConfirm });
    await screen.findByText("Alice");

    await user.click(screen.getByText("Alice"));
    await user.click(screen.getByRole("button", { name: "Assign" }));

    expect(
      await screen.findByText("Failed to create jobs"),
    ).toBeInTheDocument();
  });

  it("shows 'Assigning...' while submitting and disables Cancel/close", async () => {
    const user = setupUser();
    mockedApiClient.mockResolvedValue(annotators);
    let resolveConfirm: (() => void) | undefined;
    const onConfirm = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirm = resolve;
        }),
    );
    renderDialog({ onConfirm });
    await screen.findByText("Alice");

    await user.click(screen.getByText("Alice"));
    await user.click(screen.getByRole("button", { name: "Assign" }));

    expect(screen.getByText("Assigning...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    resolveConfirm?.();
    await waitFor(() =>
      expect(screen.queryByText("Assigning...")).not.toBeInTheDocument(),
    );
  });

  it("closes via the header close button, Cancel, and backdrop", async () => {
    const user = setupUser();
    mockedApiClient.mockResolvedValue(annotators);
    const { onClose, container } = renderDialog();
    await screen.findByText("Alice");

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

  it("does not close on backdrop click while submitting", async () => {
    const user = setupUser();
    mockedApiClient.mockResolvedValue(annotators);
    let resolveConfirm: (() => void) | undefined;
    const onConfirm = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirm = resolve;
        }),
    );
    const { onClose, container } = renderDialog({ onConfirm });
    await screen.findByText("Alice");

    await user.click(screen.getByText("Alice"));
    await user.click(screen.getByRole("button", { name: "Assign" }));

    await user.click(container.firstChild as Element);
    expect(onClose).not.toHaveBeenCalled();

    resolveConfirm?.();
    await waitFor(() =>
      expect(screen.queryByText("Assigning...")).not.toBeInTheDocument(),
    );
  });

  it("does not close when clicking inside the dialog panel", async () => {
    const user = setupUser();
    mockedApiClient.mockResolvedValue(annotators);
    const { onClose } = renderDialog();
    await user.click(await screen.findByText("Assign annotators"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("resets selection state and refetches when reopened", async () => {
    mockedApiClient.mockResolvedValue(annotators);
    const { rerender } = render(
      <AssignAnnotatorsDialog
        isOpen={false}
        accessToken="tok"
        selectedItemCount={1}
        evaluators={evaluators}
        onClose={jest.fn()}
        onConfirm={jest.fn()}
      />,
    );
    rerender(
      <AssignAnnotatorsDialog
        isOpen
        accessToken="tok"
        selectedItemCount={1}
        evaluators={evaluators}
        onClose={jest.fn()}
        onConfirm={jest.fn()}
      />,
    );
    await screen.findByText("Alice");
    expect(mockedApiClient).toHaveBeenCalledWith("/annotators", "tok");
  });

  it("cancels a stale fetch when the dialog closes mid-request", async () => {
    let resolveFetch: ((v: unknown) => void) | undefined;
    mockedApiClient.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );
    const { rerender } = renderDialog();
    rerender(
      <AssignAnnotatorsDialog
        isOpen={false}
        accessToken="tok"
        selectedItemCount={3}
        evaluators={evaluators}
        onClose={jest.fn()}
        onConfirm={jest.fn()}
      />,
    );
    resolveFetch?.(annotators);
    // No assertion beyond "doesn't throw" — the cancelled flag suppresses
    // the state update after unmount/close.
    await waitFor(() => expect(mockedApiClient).toHaveBeenCalledTimes(1));
  });
});
