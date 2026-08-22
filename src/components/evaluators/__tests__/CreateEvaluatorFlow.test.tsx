import React from "react";
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
    evaluatorName,
    setEvaluatorName,
    systemPrompt,
    createNameError,
    nameInputRef,
  }: {
    isOpen: boolean;
    onCreate: () => void;
    onClose: () => void;
    evaluatorName: string;
    setEvaluatorName: (value: string) => void;
    systemPrompt: string;
    createNameError: string | null;
    nameInputRef?: React.RefObject<HTMLInputElement | null>;
  }) =>
    isOpen ? (
      <div data-testid="create-sidebar">
        <span data-testid="prompt-field">{systemPrompt}</span>
        <input
          aria-label="Name"
          ref={nameInputRef}
          value={evaluatorName}
          onChange={(e) => setEvaluatorName(e.target.value)}
        />
        {createNameError ? <span>{createNameError}</span> : null}
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

    // Both kinds on offer sit inside a conversation, so text or voice and the
    // conversation question both have one possible answer and are not asked.
    expect(screen.getByText("What do you want judged?")).toBeInTheDocument();
    expect(screen.getByText("A single reply")).toBeInTheDocument();
    expect(screen.getByText("The whole conversation")).toBeInTheDocument();
    expect(screen.queryByText("Speech to Text")).not.toBeInTheDocument();
    expect(screen.queryByText("Voice")).not.toBeInTheDocument();
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

  it("skips the use-case step when only one use case is on offer", async () => {
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

    // One use case means there is nothing to ask: the form opens straight away.
    expect(
      screen.queryByText("What is this evaluator for?"),
    ).not.toBeInTheDocument();
    expect(await screen.findByTestId("create-sidebar")).toBeInTheDocument();

    // Nothing is created until the reader names it.
    await user.click(screen.getByText("Submit create"));
    expect(onCreated).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Name"), "Refund policy");
    await user.click(screen.getByText("Submit create"));

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(onCreated.mock.calls[0][0]).toMatchObject({
      uuid: "ev-new",
      name: "Suggested name",
      evaluator_type: "llm",
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("leaves the name empty for the reader to fill in", async () => {
    render(
      <CreateEvaluatorFlow
        open
        onClose={jest.fn()}
        existingEvaluators={[]}
        onCreated={jest.fn()}
        useCaseGroups={["conversation"]}
        useCaseTypes={["llm"]}
      />,
    );

    // The judge prompt is still filled in from the default for this use case.
    await waitFor(() =>
      expect(screen.getByTestId("prompt-field")).toHaveTextContent(
        "Judge the reply",
      ),
    );
    // The name the backend suggests is not put in the box.
    expect(screen.getByLabelText("Name")).toHaveValue("");
  });

  it("says the name is needed and puts the cursor back on the box", async () => {
    const user = setupUser();
    const onCreated = jest.fn();

    render(
      <CreateEvaluatorFlow
        open
        onClose={jest.fn()}
        existingEvaluators={[]}
        onCreated={onCreated}
        useCaseGroups={["conversation"]}
        useCaseTypes={["llm"]}
      />,
    );

    expect(await screen.findByTestId("create-sidebar")).toBeInTheDocument();
    await user.click(screen.getByText("Submit create"));

    expect(await screen.findByText("Name is required")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveFocus();
    expect(onCreated).not.toHaveBeenCalled();
  });
});
