import { render, screen, setupUser, waitFor } from "@/test-utils";
import { AddToolCallEvaluatorButton } from "../AddToolCallEvaluatorButton";
import type { EvaluatorData } from "@/lib/evaluatorApi";
import { toast } from "sonner";

jest.mock("sonner", () => ({ toast: { error: jest.fn() } }));

// The real create flow is a multi-step form, which these tests are not about.
jest.mock("../../evaluators/CreateEvaluatorFlow", () => ({
  CreateEvaluatorFlow: ({
    useCaseTypes,
    onCreated,
  }: {
    useCaseTypes?: string[];
    onCreated: (evaluator: { uuid: string }) => void;
  }) => (
    <div data-testid="create-flow">
      {useCaseTypes?.join(",")}
      <button type="button" onClick={() => onCreated({ uuid: "ev-new" })}>
        Finish creating
      </button>
    </div>
  ),
}));

jest.mock("../../evaluators/EvaluatorPromptPreview", () => ({
  EvaluatorPromptPreview: () => <div />,
}));

const fetchAllEvaluators = jest.fn();
const addEvaluatorsToAgent = jest.fn();
jest.mock("../../../lib/evaluatorApi", () => ({
  ...jest.requireActual("../../../lib/evaluatorApi"),
  fetchAllEvaluators: (...args: unknown[]) => fetchAllEvaluators(...args),
  addEvaluatorsToAgent: (...args: unknown[]) => addEvaluatorsToAgent(...args),
  deleteEvaluator: jest.fn(),
}));
jest.mock("../../../lib/reportError", () => ({ reportError: jest.fn() }));

const evaluator = (over: Partial<EvaluatorData>): EvaluatorData => ({
  uuid: "ev",
  name: "Evaluator",
  description: "",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  output_type: "binary",
  evaluator_type: "llm",
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  fetchAllEvaluators.mockResolvedValue([
    evaluator({ uuid: "ev-llm", name: "Tone" }),
    evaluator({
      uuid: "ev-tc",
      name: "Tool call correctness",
      evaluator_type: "tool-call",
      is_default: true,
    }),
    evaluator({
      uuid: "ev-tc-2",
      name: "Booking calls",
      evaluator_type: "tool-call",
    }),
    evaluator({
      uuid: "ev-tc-linked",
      name: "Already here",
      evaluator_type: "tool-call",
    }),
  ]);
  addEvaluatorsToAgent.mockResolvedValue({ linked: [], already_linked: [] });
});

it("lists only the tool call evaluators the agent does not have, and adds the ones picked", async () => {
  const user = setupUser();
  const onAdded = jest.fn();
  render(
    <AddToolCallEvaluatorButton
      agentUuid="agent-1"
      accessToken="token"
      linkedEvaluatorUuids={["ev-tc-linked"]}
      onAdded={onAdded}
    />,
  );

  await user.click(
    screen.getByRole("button", { name: "Add a tool call evaluator" }),
  );

  expect(await screen.findByText("Tool call correctness")).toBeInTheDocument();
  expect(screen.getByText("Booking calls")).toBeInTheDocument();
  expect(screen.queryByText("Tone")).not.toBeInTheDocument();
  expect(screen.queryByText("Already here")).not.toBeInTheDocument();

  for (const box of screen.getAllByRole("checkbox")) await user.click(box);
  await user.click(screen.getByRole("button", { name: "Add (2)" }));

  await waitFor(() => expect(onAdded).toHaveBeenCalled());
  expect(addEvaluatorsToAgent).toHaveBeenCalledWith(
    "agent-1",
    expect.arrayContaining(["ev-tc", "ev-tc-2"]),
    "token",
  );
  expect(screen.queryByText("Booking calls")).not.toBeInTheDocument();
});

it("says the library could not be read instead of opening an empty picker", async () => {
  fetchAllEvaluators.mockRejectedValue(new Error("down"));
  const onOpenChange = jest.fn();
  const user = setupUser();
  render(
    <AddToolCallEvaluatorButton
      agentUuid="agent-1"
      accessToken="token"
      linkedEvaluatorUuids={[]}
      onAdded={jest.fn()}
      onOpenChange={onOpenChange}
    />,
  );
  await user.click(
    screen.getByRole("button", { name: "Add a tool call evaluator" }),
  );
  await waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith(
      "Could not load your evaluators. Please try again.",
    ),
  );
  expect(screen.queryByText("Add evaluators")).not.toBeInTheDocument();
  expect(onOpenChange).not.toHaveBeenCalled();
});

it("offers to create a tool call evaluator when none is left to add, and adds the one created", async () => {
  fetchAllEvaluators.mockResolvedValue([
    evaluator({ uuid: "ev-llm", name: "Tone" }),
  ]);
  const onAdded = jest.fn();
  const onOpenChange = jest.fn();
  const user = setupUser();
  render(
    <AddToolCallEvaluatorButton
      agentUuid="agent-1"
      accessToken="token"
      linkedEvaluatorUuids={[]}
      onAdded={onAdded}
      onOpenChange={onOpenChange}
    />,
  );
  await user.click(
    screen.getByRole("button", { name: "Add a tool call evaluator" }),
  );
  expect(onOpenChange).toHaveBeenLastCalledWith(true);
  await user.click(
    await screen.findByRole("button", { name: "Create evaluator" }),
  );

  expect(screen.getByTestId("create-flow")).toHaveTextContent("tool-call");
  expect(onOpenChange).toHaveBeenLastCalledWith(true);
  await user.click(screen.getByRole("button", { name: "Finish creating" }));

  await waitFor(() => expect(onAdded).toHaveBeenCalled());
  expect(addEvaluatorsToAgent).toHaveBeenCalledWith(
    "agent-1",
    ["ev-new"],
    "token",
  );
  expect(screen.queryByTestId("create-flow")).not.toBeInTheDocument();
  expect(onOpenChange).toHaveBeenLastCalledWith(false);
});

it("tells the parent the picker closed when the button goes away with it open", async () => {
  const onOpenChange = jest.fn();
  const user = setupUser();
  const { unmount } = render(
    <AddToolCallEvaluatorButton
      agentUuid="agent-1"
      accessToken="token"
      linkedEvaluatorUuids={[]}
      onAdded={jest.fn()}
      onOpenChange={onOpenChange}
    />,
  );
  await user.click(
    screen.getByRole("button", { name: "Add a tool call evaluator" }),
  );
  await screen.findByText("Tool call correctness");
  unmount();
  expect(onOpenChange).toHaveBeenLastCalledWith(false);
});
