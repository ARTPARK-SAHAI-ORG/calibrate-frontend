import { render, screen, setupUser, waitFor } from "@/test-utils";
import { CreateEvaluatorFlow } from "../CreateEvaluatorFlow";

jest.mock("../../../hooks", () => ({
  useAccessToken: () => "test-token",
  useOpenRouterModels: () => ({
    providers: [
      {
        slug: "openai",
        models: [{ id: "gpt-4", name: "GPT-4" }],
      },
    ],
  }),
  findModelInProviders: () => ({ id: "gpt-4", name: "GPT-4" }),
}));

jest.mock("../../../lib/reportError", () => ({
  reportError: jest.fn(),
}));

jest.mock("../../agent-tabs/LLMSelectorModal", () => ({
  LLMSelectorModal: () => null,
}));

jest.mock("../CreateEvaluatorSidebar", () => ({
  CreateEvaluatorSidebar: ({
    isOpen,
    onCreate,
    onClose,
  }: {
    isOpen: boolean;
    onCreate: () => void;
    onClose: () => void;
  }) =>
    isOpen ? (
      <div data-testid="create-sidebar">
        <button type="button" onClick={onCreate}>
          Submit create
        </button>
        <button type="button" onClick={onClose}>
          Close sidebar
        </button>
      </div>
    ) : null,
}));

beforeEach(() => {
  process.env.NEXT_PUBLIC_BACKEND_URL = "http://test-backend";
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("/evaluators/default-prompt")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          name: "Suggested name",
          system_prompt: "Judge the reply",
          judge_model: "gpt-4",
          output_type: "binary",
          output_config: null,
        }),
      };
    }
    if (url.endsWith("/evaluators") && init?.method === "POST") {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          uuid: "ev-new",
          name: "Suggested name",
          description: "",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
          owner_user_id: "user-1",
          evaluator_type: "llm",
          output_type: "binary",
          data_type: "text",
          kind: "single",
        }),
      };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  });
});

describe("CreateEvaluatorFlow", () => {
  it("does not render when closed", () => {
    render(
      <CreateEvaluatorFlow
        open={false}
        onClose={jest.fn()}
        existingEvaluators={[]}
        onCreated={jest.fn()}
      />,
    );

    expect(
      screen.queryByText("What is this evaluator for?"),
    ).not.toBeInTheDocument();
  });

  it("limits the use-case picker to conversation types when configured", () => {
    render(
      <CreateEvaluatorFlow
        open
        onClose={jest.fn()}
        existingEvaluators={[]}
        onCreated={jest.fn()}
        useCaseGroups={["conversation"]}
      />,
    );

    expect(screen.getByText("LLM reply")).toBeInTheDocument();
    expect(screen.getByText("Full conversation")).toBeInTheDocument();
    expect(screen.queryByText("Speech to Text")).not.toBeInTheDocument();
    expect(screen.queryByText("Conversation")).not.toBeInTheDocument();
  });

  it("closes the flow when the picker is cancelled before the sidebar opens", async () => {
    const user = setupUser();
    const onClose = jest.fn();

    render(
      <CreateEvaluatorFlow
        open
        onClose={onClose}
        existingEvaluators={[]}
        onCreated={jest.fn()}
        useCaseGroups={["conversation"]}
      />,
    );

    await user.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });

  it("creates an evaluator after choosing a use case", async () => {
    const user = setupUser();
    const onCreated = jest.fn();
    const onClose = jest.fn();

    render(
      <CreateEvaluatorFlow
        open
        onClose={onClose}
        existingEvaluators={[]}
        onCreated={onCreated}
        useCaseGroups={["conversation"]}
        useCaseTypes={["llm"]}
      />,
    );

    await user.click(screen.getByText("LLM reply"));
    await user.click(screen.getByText("Continue"));
    expect(await screen.findByTestId("create-sidebar")).toBeInTheDocument();

    await user.click(screen.getByText("Submit create"));

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(onCreated.mock.calls[0][0]).toMatchObject({
      uuid: "ev-new",
      name: "Suggested name",
      evaluator_type: "llm",
    });
    expect(onClose).toHaveBeenCalled();
  });
});
