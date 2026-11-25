import { render, screen, setupUser, waitFor } from "@/test-utils";
import { AddToolCallEvaluatorButton } from "../AddToolCallEvaluatorButton";
import type { EvaluatorData } from "@/lib/evaluatorApi";

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

it("still opens the picker when the library cannot be read", async () => {
  fetchAllEvaluators.mockRejectedValue(new Error("down"));
  const user = setupUser();
  render(
    <AddToolCallEvaluatorButton
      agentUuid="agent-1"
      accessToken="token"
      linkedEvaluatorUuids={[]}
      onAdded={jest.fn()}
    />,
  );
  await user.click(
    screen.getByRole("button", { name: "Add a tool call evaluator" }),
  );
  expect(await screen.findByText("Add evaluators")).toBeInTheDocument();
});
