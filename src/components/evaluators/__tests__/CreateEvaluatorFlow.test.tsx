import React from "react";
import { render, screen, setupUser, waitFor } from "@/test-utils";
import { CreateEvaluatorFlow } from "../CreateEvaluatorFlow";
import type { EvaluatorDetail } from "@/lib/evaluatorApi";

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
    judgeModel,
  }: {
    isOpen: boolean;
    onCreate: () => void;
    onClose: () => void;
    evaluatorName: string;
    setEvaluatorName: (value: string) => void;
    systemPrompt: string;
    createNameError: string | null;
    nameInputRef?: React.RefObject<HTMLInputElement | null>;
    judgeModel: { id: string; name: string } | null;
  }) =>
    isOpen ? (
      <div data-testid="create-sidebar">
        <span data-testid="prompt-field">{systemPrompt}</span>
        <span data-testid="judge-model">{judgeModel?.name}</span>
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
        useCaseTypes={["llm", "conversation"]}
      />,
    );

    // Both kinds on offer sit inside a conversation, so text or voice and the
    // conversation question both have one possible answer and are not asked.
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
        useCaseTypes={["llm", "conversation"]}
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
        useCaseTypes={["llm"]}
      />,
    );

    // One use case means there is nothing to ask: the form opens straight away.
    expect(
      screen.queryByText("What is this evaluator for?"),
    ).not.toBeInTheDocument();
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

  it("creates a tool call evaluator from the tool-call default prompt", async () => {
    const user = setupUser();
    const onCreated = jest.fn();

    render(
      <CreateEvaluatorFlow
        open
        onClose={jest.fn()}
        existingEvaluators={[]}
        onCreated={onCreated}
        useCaseTypes={["tool-call"]}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("prompt-field")).toHaveTextContent(
        "Judge the reply",
      ),
    );
    const fetchMock = global.fetch as jest.Mock;
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes("/evaluators/default-prompt?purpose=tool-call"),
      ),
    ).toBe(true);

    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Right tool");
    await user.click(screen.getByText("Submit create"));

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    const post = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).endsWith("/evaluators") && init?.method === "POST",
    );
    const body = JSON.parse(post![1].body as string);
    expect(body.evaluator_type).toBe("tool-call");
    expect(body.data_type).toBe("text");
  });

  it.each([
    ["a conversation agent", ["llm", "tool-call"]],
    ["a basic agent", ["llm-general", "tool-call"]],
  ] as const)(
    "offers Tool call in the picker for %s",
    async (_label, types) => {
      const user = setupUser();
      render(
        <CreateEvaluatorFlow
          open
          onClose={jest.fn()}
          existingEvaluators={[]}
          onCreated={jest.fn()}
          useCaseTypes={[...types]}
        />,
      );

      expect(screen.getByText("What is this evaluator for?")).toBeInTheDocument();
      await user.click(screen.getByText("The tool calls"));
      await user.click(screen.getByRole("button", { name: "Continue" }));

      expect(await screen.findByTestId("create-sidebar")).toBeInTheDocument();
      const fetchMock = global.fetch as jest.Mock;
      await waitFor(() =>
        expect(
          fetchMock.mock.calls.some(([url]) =>
            String(url).includes("default-prompt?purpose=tool-call"),
          ),
        ).toBe(true),
      );
    },
  );

  it("offers Tool call when every use case is on offer", async () => {
    const user = setupUser();
    render(
      <CreateEvaluatorFlow
        open
        onClose={jest.fn()}
        existingEvaluators={[]}
        onCreated={jest.fn()}
      />,
    );

    await user.click(screen.getByText("Text"));
    await user.click(screen.getByText("Conversation"));
    await user.click(screen.getByText("The tool calls"));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByTestId("create-sidebar")).toBeInTheDocument();
  });

  it("opens with a name that says what the evaluator judges, numbered past names already taken", async () => {
    render(
      <CreateEvaluatorFlow
        open
        onClose={jest.fn()}
        existingEvaluators={[{ name: "New conversation reply evaluator" }]}
        onCreated={jest.fn()}
        useCaseTypes={["llm"]}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("prompt-field")).toHaveTextContent(
        "Judge the reply",
      ),
    );
    // The name the backend suggests is not used.
    expect(screen.getByLabelText("Name")).toHaveValue(
      "New conversation reply evaluator 2",
    );
  });

  it.each([
    ["Conversation", "New conversation tool call evaluator"],
    ["Basic", "New basic tool call evaluator"],
  ])(
    "names a tool call evaluator after the %s answer, and posts that name",
    async (agentKind, expected) => {
      const user = setupUser();
      render(
        <CreateEvaluatorFlow
          open
          onClose={jest.fn()}
          existingEvaluators={[]}
          onCreated={jest.fn()}
        />,
      );

      await user.click(screen.getByText("Text"));
      await user.click(screen.getByText(agentKind));
      await user.click(screen.getByText("The tool calls"));
      await user.click(screen.getByRole("button", { name: "Continue" }));
      expect(await screen.findByLabelText("Name")).toHaveValue(expected);

      await user.click(screen.getByText("Submit create"));
      const fetchMock = global.fetch as jest.Mock;
      await waitFor(() => {
        const post = fetchMock.mock.calls.find(
          ([url, init]) =>
            String(url).endsWith("/evaluators") && init?.method === "POST",
        );
        expect(JSON.parse(post![1].body as string).name).toBe(expected);
      });
    },
  );

  it("names the evaluator after the answer picked, and posts that name", async () => {
    const user = setupUser();
    render(
      <CreateEvaluatorFlow
        open
        onClose={jest.fn()}
        existingEvaluators={[]}
        onCreated={jest.fn()}
      />,
    );

    await user.click(screen.getByText("Voice"));
    await user.click(screen.getByText("Speech to Text"));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByLabelText("Name")).toHaveValue(
      "New speech to text evaluator",
    );

    await user.click(screen.getByText("Submit create"));
    const fetchMock = global.fetch as jest.Mock;
    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).endsWith("/evaluators") && init?.method === "POST",
      );
      expect(JSON.parse(post![1].body as string).name).toBe(
        "New speech to text evaluator",
      );
    });
  });

  it("keeps a tool call evaluator's name plain when the agent kind was never asked", async () => {
    render(
      <CreateEvaluatorFlow
        open
        onClose={jest.fn()}
        existingEvaluators={[]}
        onCreated={jest.fn()}
        useCaseTypes={["tool-call"]}
      />,
    );
    expect(await screen.findByLabelText("Name")).toHaveValue(
      "New tool call evaluator",
    );
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
        useCaseTypes={["llm"]}
      />,
    );

    expect(await screen.findByTestId("create-sidebar")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Name"));
    await user.click(screen.getByText("Submit create"));

    expect(await screen.findByText("Name is required")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveFocus();
    expect(onCreated).not.toHaveBeenCalled();
  });

  describe("with duplicateOf", () => {
    const source: EvaluatorDetail = {
      uuid: "ev-src",
      name: "Tone check",
      description: "Is the reply polite",
      evaluator_type: "llm",
      output_type: "binary",
      live_version_index: 0,
      versions: [
        {
          uuid: "v1",
          version_number: 1,
          judge_model: "gpt-4",
          system_prompt: "Was the reply polite?",
          output_config: null,
        },
      ],
    };

    const fetchCalls = () => (global.fetch as jest.Mock).mock.calls;
    const postBody = () => {
      const call = fetchCalls().find(
        ([url, init]) =>
          String(url).endsWith("/evaluators") && init?.method === "POST",
      );
      return JSON.parse(call![1].body);
    };

    it("opens the form filled in as a copy, without asking the use case", async () => {
      render(
        <CreateEvaluatorFlow
          open
          onClose={jest.fn()}
          existingEvaluators={[]}
          onCreated={jest.fn()}
          // One use case on offer is the path that would otherwise fetch the
          // default prompt, so this is where the copy must not.
          useCaseTypes={["llm"]}
          duplicateOf={source}
        />,
      );

      expect(
        screen.queryByText("What is this evaluator for?"),
      ).not.toBeInTheDocument();
      expect(await screen.findByTestId("create-sidebar")).toBeInTheDocument();
      expect(screen.getByLabelText("Name")).toHaveValue("Copy of Tone check");
      expect(screen.getByTestId("prompt-field")).toHaveTextContent(
        "Was the reply polite?",
      );
      expect(
        fetchCalls().some(([url]) =>
          String(url).includes("/evaluators/default-prompt"),
        ),
      ).toBe(false);
    });

    it("creates the copy from the prefilled form", async () => {
      const user = setupUser();
      const onCreated = jest.fn();

      render(
        <CreateEvaluatorFlow
          open
          onClose={jest.fn()}
          existingEvaluators={[]}
          onCreated={onCreated}
          duplicateOf={source}
        />,
      );

      // The copy shows the model's name from the model list, and saves its id.
      expect(await screen.findByTestId("judge-model")).toHaveTextContent(
        "GPT-4",
      );
      await user.click(await screen.findByText("Submit create"));

      await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
      expect(postBody()).toMatchObject({
        name: "Copy of Tone check",
        description: "Is the reply polite",
        evaluator_type: "llm",
        output_type: "binary",
        version: {
          judge_model: "gpt-4",
          system_prompt: "Was the reply polite?",
        },
      });
    });

    it("carries a binary source's labels and variable descriptions into the copy", async () => {
      const user = setupUser();
      const onCreated = jest.fn();
      const binarySource: EvaluatorDetail = {
        ...source,
        versions: [
          {
            ...source.versions![0],
            system_prompt: "Was the reply polite to {{caller}}?",
            variables: [{ name: "caller", description: "Who called" }],
            output_config: {
              // The false row first, to check the copy puts true first.
              scale: [
                { value: false, name: "Rude" },
                { value: true, name: "Polite", description: "Greets them" },
              ],
            },
          },
        ],
      };

      render(
        <CreateEvaluatorFlow
          open
          onClose={jest.fn()}
          existingEvaluators={[]}
          onCreated={onCreated}
          duplicateOf={binarySource}
        />,
      );

      await user.click(await screen.findByText("Submit create"));

      await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
      expect(postBody().version).toMatchObject({
        variables: [{ name: "caller", description: "Who called" }],
        output_config: {
          scale: [
            { value: true, name: "Polite", description: "Greets them" },
            { value: false, name: "Rude" },
          ],
        },
      });
    });

    it("carries a rating source's scale rows into the copy", async () => {
      const user = setupUser();
      const onCreated = jest.fn();
      const ratingSource: EvaluatorDetail = {
        ...source,
        output_type: "rating",
        versions: [
          {
            ...source.versions![0],
            output_config: {
              scale: [
                { value: 1, name: "Rude", description: "Insults the caller" },
                { value: 2, name: "Neutral" },
                { value: 3, name: "Warm", description: "Goes out of its way" },
              ],
            },
          },
        ],
      };

      render(
        <CreateEvaluatorFlow
          open
          onClose={jest.fn()}
          existingEvaluators={[]}
          onCreated={onCreated}
          duplicateOf={ratingSource}
        />,
      );

      await user.click(await screen.findByText("Submit create"));

      await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
      expect(postBody()).toMatchObject({
        output_type: "rating",
        version: {
          output_config: {
            scale: [
              { value: 1, name: "Rude", description: "Insults the caller" },
              { value: 2, name: "Neutral" },
              { value: 3, name: "Warm", description: "Goes out of its way" },
            ],
          },
        },
      });
    });
  });
});
