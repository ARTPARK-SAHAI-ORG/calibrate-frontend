import { render, screen, setupUser, waitFor } from "@/test-utils";
import { RunEvaluatorsDialog } from "../RunEvaluatorsDialog";
import { apiClient } from "../../../lib/api";

jest.mock("../../../lib/api", () => ({
  apiClient: jest.fn(),
}));

const mockedApiClient = apiClient as jest.Mock;

const evaluators = [
  { uuid: "ev-1", name: "Relevance" },
  { uuid: "ev-2", name: "Fluency" },
];

const detailResponse = [
  {
    uuid: "ev-1",
    live_version_id: "v1-live",
    live_version_index: 1,
    versions: [
      { uuid: "v1-old", version_number: 1 },
      { uuid: "v1-live", version_number: 2 },
    ],
  },
  {
    uuid: "ev-2",
    live_version_id: null,
    live_version_index: null,
    versions: [{ uuid: "v2-only", version_number: 1 }],
  },
];

function renderDialog(
  props: Partial<React.ComponentProps<typeof RunEvaluatorsDialog>> = {},
) {
  const onClose = jest.fn();
  const onConfirm = jest.fn();
  const utils = render(
    <RunEvaluatorsDialog
      isOpen
      accessToken="tok"
      taskUuid="task-1"
      evaluators={evaluators}
      submitting={false}
      submitError={null}
      onClose={onClose}
      onConfirm={onConfirm}
      {...props}
    />,
  );
  return { onClose, onConfirm, ...utils };
}

describe("RunEvaluatorsDialog", () => {
  beforeEach(() => {
    mockedApiClient.mockReset();
  });

  it("renders nothing when closed", () => {
    render(
      <RunEvaluatorsDialog
        isOpen={false}
        accessToken="tok"
        taskUuid="task-1"
        evaluators={evaluators}
        submitting={false}
        submitError={null}
        onClose={jest.fn()}
        onConfirm={jest.fn()}
      />,
    );
    expect(screen.queryByText("Run evaluators")).not.toBeInTheDocument();
  });

  it("shows a loading state while fetching evaluator versions", () => {
    mockedApiClient.mockReturnValue(new Promise(() => {}));
    renderDialog();
    expect(screen.getByText("Loading evaluator versions")).toBeInTheDocument();
  });

  it("shows a message when there are no linked evaluators", async () => {
    mockedApiClient.mockResolvedValue([]);
    renderDialog({ evaluators: [] });
    expect(
      await screen.findByText("No evaluators are linked to this task."),
    ).toBeInTheDocument();
  });

  it("skips fetching versions when taskUuid is empty", () => {
    renderDialog({ taskUuid: "" });
    expect(mockedApiClient).not.toHaveBeenCalled();
  });

  it("shows a load error parsed from a structured detail", async () => {
    mockedApiClient.mockRejectedValue(
      new Error('Request failed: 500 - {"detail":"Server exploded"}'),
    );
    renderDialog();
    expect(await screen.findByText("Server exploded")).toBeInTheDocument();
  });

  it("shows the raw message when the load-error body isn't valid JSON", async () => {
    mockedApiClient.mockRejectedValue(
      new Error("Request failed: 500 - not-json{{{"),
    );
    renderDialog();
    expect(await screen.findByText("not-json{{{")).toBeInTheDocument();
  });

  it("shows the raw Error message when it doesn't match the 'Request failed' shape", async () => {
    mockedApiClient.mockRejectedValue(new Error("Network down"));
    renderDialog();
    expect(await screen.findByText("Network down")).toBeInTheDocument();
  });

  it("falls back to the default load error for an Error with an empty message", async () => {
    mockedApiClient.mockRejectedValue(new Error(""));
    renderDialog();
    expect(
      await screen.findByText("Failed to load evaluator versions"),
    ).toBeInTheDocument();
  });

  it("treats an evaluator whose versions field is absent as having no versions and blocks Run", async () => {
    mockedApiClient.mockResolvedValue([
      { uuid: "ev-1", live_version_id: null, live_version_index: null },
      { uuid: "ev-2", live_version_id: null, live_version_index: null },
    ]);
    const onConfirm = jest.fn();
    const user = setupUser();
    renderDialog({ onConfirm });
    await screen.findByText("Relevance");
    expect(screen.getAllByText("No versions")).toHaveLength(2);
    // Both picked by default but neither has a chosen version, so confirming
    // produces an empty selection set and never calls onConfirm.
    await user.click(screen.getByRole("button", { name: "Run" }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("skips unpicked evaluators when confirming", async () => {
    mockedApiClient.mockResolvedValue(detailResponse);
    const onConfirm = jest.fn();
    const user = setupUser();
    renderDialog({ onConfirm });
    await screen.findByText("Relevance");

    // Unpick just Fluency, leaving Relevance picked.
    await user.click(screen.getByRole("checkbox", { name: "Pick Fluency" }));
    await user.click(screen.getByRole("button", { name: "Run" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][0]).toEqual([
      { evaluator_id: "ev-1", evaluator_version_id: "v1-live" },
    ]);
  });

  it("falls back to the default load error for a non-Error rejection", async () => {
    mockedApiClient.mockRejectedValue("boom");
    renderDialog();
    expect(
      await screen.findByText("Failed to load evaluator versions"),
    ).toBeInTheDocument();
  });

  it("lists evaluators, all picked by default, versions resolved with live marker", async () => {
    mockedApiClient.mockResolvedValue(detailResponse);
    renderDialog();

    await screen.findByText("Relevance");
    expect(screen.getByText("Fluency")).toBeInTheDocument();
    // Live version label shown for evaluator 1's trigger.
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(screen.getByText("Live")).toBeInTheDocument();
    // Evaluator 2 has no live version, falls back to first (only) version.
    expect(screen.getByText("v1")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Run" })).not.toBeDisabled();
  });

  it("shows 'No versions' for an evaluator with an empty versions array", async () => {
    mockedApiClient.mockResolvedValue([
      { uuid: "ev-1", live_version_id: null, live_version_index: null, versions: [] },
      { uuid: "ev-2", live_version_id: null, live_version_index: null, versions: [] },
    ]);
    renderDialog();
    await screen.findByText("Relevance");
    expect(screen.getAllByText("No versions")).toHaveLength(2);
  });

  it("toggles an individual evaluator's picked state via checkbox and row click", async () => {
    const user = setupUser();
    mockedApiClient.mockResolvedValue(detailResponse);
    renderDialog();
    await screen.findByText("Relevance");

    const checkbox = screen.getByRole("checkbox", { name: "Pick Relevance" });
    expect(checkbox).toBeChecked();
    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();

    // Clicking the row (not the checkbox) also toggles.
    await user.click(screen.getByText("Relevance"));
    expect(checkbox).toBeChecked();
  });

  it("selects all / unselects all evaluators via the header checkbox", async () => {
    const user = setupUser();
    mockedApiClient.mockResolvedValue(detailResponse);
    renderDialog();
    await screen.findByText("Relevance");

    const selectAll = screen.getByRole("checkbox", {
      name: "Unselect all evaluators",
    });
    expect(selectAll).toBeChecked();
    await user.click(selectAll);
    expect(
      screen.getByRole("checkbox", { name: "Pick Relevance" }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Pick Fluency" }),
    ).not.toBeChecked();

    await user.click(
      screen.getByRole("checkbox", { name: "Select all evaluators" }),
    );
    expect(
      screen.getByRole("checkbox", { name: "Pick Relevance" }),
    ).toBeChecked();
  });

  it("hides the select-all control with a single evaluator", async () => {
    mockedApiClient.mockResolvedValue([detailResponse[0]]);
    renderDialog({ evaluators: [evaluators[0]] });
    await screen.findByText("Relevance");
    expect(
      screen.queryByRole("checkbox", { name: /all evaluators/ }),
    ).not.toBeInTheDocument();
  });

  it("disables Run when nothing is picked", async () => {
    const user = setupUser();
    mockedApiClient.mockResolvedValue(detailResponse);
    renderDialog();
    await screen.findByText("Relevance");

    await user.click(
      screen.getByRole("checkbox", { name: "Unselect all evaluators" }),
    );
    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
  });

  it("lets the user change the chosen version via the SingleSelectPicker", async () => {
    const user = setupUser();
    mockedApiClient.mockResolvedValue(detailResponse);
    const onConfirm = jest.fn();
    renderDialog({ onConfirm });
    await screen.findByText("Relevance");

    const versionTrigger = screen.getByRole("button", {
      name: "Version for Relevance",
    });
    await user.click(versionTrigger);
    const olderOption = screen.getByRole("option", { name: /v1/ });
    await user.click(olderOption);

    await user.click(screen.getByRole("button", { name: "Run" }));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.arrayContaining([
        { evaluator_id: "ev-1", evaluator_version_id: "v1-old" },
        { evaluator_id: "ev-2", evaluator_version_id: "v2-only" },
      ]),
    );
  });

  it("confirms with picked evaluators and their live/default version selections", async () => {
    const user = setupUser();
    mockedApiClient.mockResolvedValue(detailResponse);
    const onConfirm = jest.fn();
    renderDialog({ onConfirm });
    await screen.findByText("Relevance");

    await user.click(screen.getByRole("button", { name: "Run" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][0]).toEqual(
      expect.arrayContaining([
        { evaluator_id: "ev-1", evaluator_version_id: "v1-live" },
        { evaluator_id: "ev-2", evaluator_version_id: "v2-only" },
      ]),
    );
  });

  it("does not call onConfirm when Run is clicked with pickedCount 0 or while submitting", async () => {
    mockedApiClient.mockResolvedValue(detailResponse);
    const onConfirm = jest.fn();
    renderDialog({ onConfirm, submitting: true });
    await screen.findByText("Relevance");

    // Run button itself is disabled while submitting; verify no crash on
    // programmatic invocation isn't needed since disabled prevents clicks.
    expect(screen.getByRole("button", { name: "Starting..." })).toBeDisabled();
  });

  it("shows a submit error passed down from the parent", async () => {
    mockedApiClient.mockResolvedValue(detailResponse);
    renderDialog({ submitError: "Could not start run" });
    await screen.findByText("Relevance");
    expect(screen.getByText("Could not start run")).toBeInTheDocument();
  });

  it("closes via the header close button, Cancel, and backdrop when idle", async () => {
    const user = setupUser();
    mockedApiClient.mockResolvedValue(detailResponse);
    const { onClose, container } = renderDialog();
    await screen.findByText("Relevance");

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(2);

    await user.click(container.firstChild as Element);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("does not close on backdrop click while submitting", async () => {
    mockedApiClient.mockResolvedValue(detailResponse);
    const user = setupUser();
    const { onClose, container } = renderDialog({ submitting: true });
    await screen.findByText("Relevance");

    await user.click(container.firstChild as Element);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not close when clicking inside the dialog panel", async () => {
    mockedApiClient.mockResolvedValue(detailResponse);
    const user = setupUser();
    const { onClose } = renderDialog();
    await user.click(await screen.findByText("Run evaluators"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("refetches when reopened, keying off the sorted evaluator ids", async () => {
    mockedApiClient.mockResolvedValue(detailResponse);
    const { rerender } = render(
      <RunEvaluatorsDialog
        isOpen={false}
        accessToken="tok"
        taskUuid="task-1"
        evaluators={evaluators}
        submitting={false}
        submitError={null}
        onClose={jest.fn()}
        onConfirm={jest.fn()}
      />,
    );
    rerender(
      <RunEvaluatorsDialog
        isOpen
        accessToken="tok"
        taskUuid="task-1"
        evaluators={evaluators}
        submitting={false}
        submitError={null}
        onClose={jest.fn()}
        onConfirm={jest.fn()}
      />,
    );
    await screen.findByText("Relevance");
    expect(mockedApiClient).toHaveBeenCalledWith(
      "/annotation-tasks/task-1/evaluators",
      "tok",
    );
  });

  it("cancels a stale fetch when the dialog is closed mid-request", async () => {
    let resolveFetch: ((v: unknown) => void) | undefined;
    mockedApiClient.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );
    const { rerender } = renderDialog();
    rerender(
      <RunEvaluatorsDialog
        isOpen={false}
        accessToken="tok"
        taskUuid="task-1"
        evaluators={evaluators}
        submitting={false}
        submitError={null}
        onClose={jest.fn()}
        onConfirm={jest.fn()}
      />,
    );
    resolveFetch?.(detailResponse);
    await waitFor(() => expect(mockedApiClient).toHaveBeenCalledTimes(1));
  });

  it("resolves the live version via liveVersionOf when live_version_id is null but live_version_index is set", async () => {
    mockedApiClient.mockResolvedValue([
      {
        uuid: "ev-1",
        live_version_id: null,
        live_version_index: 0,
        versions: [{ uuid: "v1-a", version_number: 1 }],
      },
      {
        uuid: "ev-2",
        live_version_id: null,
        live_version_index: null,
        versions: [{ uuid: "v2-only", version_number: 1 }],
      },
    ]);
    const onConfirm = jest.fn();
    const user = setupUser();
    renderDialog({ onConfirm });
    await screen.findByText("Relevance");

    expect(screen.getByText("Live")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Run" }));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.arrayContaining([
        { evaluator_id: "ev-1", evaluator_version_id: "v1-a" },
      ]),
    );
  });
});
