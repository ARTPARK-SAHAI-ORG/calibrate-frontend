import { render, screen, setupUser, waitFor } from "@/test-utils";
import { signOut } from "next-auth/react";
import { DuplicateAgentDialog } from "../DuplicateAgentDialog";

const useAccessTokenMock = jest.fn();

jest.mock("../../hooks", () => ({
  __esModule: true,
  ...jest.requireActual("../../hooks"),
  useAccessToken: () => useAccessTokenMock(),
}));

jest.mock("../../lib/reportError", () => ({
  __esModule: true,
  reportError: jest.fn(),
}));

const originalBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

function jsonResponse(body: unknown, overrides: Partial<Response> = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    ...overrides,
  } as Response;
}

function failureResponse(status: number, body: unknown) {
  return {
    ok: false,
    status,
    clone() {
      return this;
    },
    json: async () => body,
  };
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_BACKEND_URL = "https://api.example.com";
  global.fetch = jest.fn();
  useAccessTokenMock.mockReturnValue("token-123");
  (signOut as jest.Mock).mockClear();
});

afterEach(() => {
  process.env.NEXT_PUBLIC_BACKEND_URL = originalBackendUrl;
  jest.clearAllMocks();
});

// The two cards in the picker, named by the description each one carries.
const conversationCard = () =>
  screen.getByRole("radio", {
    name: /Your agent has a conversation with a user/,
  });
const generalCard = () =>
  screen.getByRole("radio", {
    name: /The agent takes an input and generates an output/,
  });

function renderDialog(
  props: Partial<React.ComponentProps<typeof DuplicateAgentDialog>> = {},
) {
  const onClose = jest.fn();
  const onDuplicated = jest.fn();
  render(
    <DuplicateAgentDialog
      agentUuid="agent-1"
      agentName="Support Bot"
      onClose={onClose}
      onDuplicated={onDuplicated}
      {...props}
    />,
  );
  return { onClose, onDuplicated };
}

const duplicate = (user: ReturnType<typeof setupUser>) =>
  user.click(screen.getByRole("button", { name: "Duplicate" }));

function requestBody() {
  const [, init] = (global.fetch as jest.Mock).mock.calls[0];
  return JSON.parse(init.body);
}

describe("DuplicateAgentDialog", () => {
  it("opens with the original's type chosen for a conversation agent", () => {
    renderDialog({ interactionType: "conversation" });
    expect(conversationCard()).toHaveClass("border-foreground");
    expect(generalCard()).not.toHaveClass("border-foreground");
  });

  it("says the tests are not copied, whichever type is chosen", async () => {
    const user = setupUser();
    renderDialog({ interactionType: "conversation" });
    const note = /The copy takes the agent's tools and evaluators\. Its tests are not copied\./;
    expect(screen.getByText(note)).toBeInTheDocument();

    await user.click(generalCard());
    expect(screen.getByText(note)).toBeInTheDocument();
  });

  it("warns that evaluators are left behind only once the type differs", async () => {
    const user = setupUser();
    renderDialog({ interactionType: "conversation" });
    const warning = /Evaluators that cannot judge what the copy does are left behind/;
    expect(screen.queryByText(warning)).not.toBeInTheDocument();

    await user.click(generalCard());
    expect(screen.getByText(warning)).toBeInTheDocument();

    await user.click(conversationCard());
    expect(screen.queryByText(warning)).not.toBeInTheDocument();
  });

  it("warns a single agent response agent copied as a conversation one too", async () => {
    const user = setupUser();
    renderDialog({ interactionType: "general" });
    const warning = /Evaluators that cannot judge what the copy does are left behind/;
    expect(screen.queryByText(warning)).not.toBeInTheDocument();

    await user.click(conversationCard());
    expect(screen.getByText(warning)).toBeInTheDocument();
  });

  it("falls back to Conversation when no type is given", () => {
    renderDialog();
    expect(conversationCard()).toHaveClass("border-foreground");
  });

  it("opens with Single Agent Response chosen for a general agent", () => {
    renderDialog({ interactionType: "general" });
    expect(generalCard()).toHaveClass("border-foreground");
    expect(conversationCard()).not.toHaveClass("border-foreground");
  });

  it("sends the original's type and the trimmed name when nothing is touched", async () => {
    const user = setupUser();
    const { onDuplicated, onClose } = renderDialog({
      interactionType: "general",
    });
    const input = screen.getByPlaceholderText("Enter agent name");
    await user.clear(input);
    await user.type(input, "  Copy one  ");

    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({ uuid: "dup-1" }),
    );
    await duplicate(user);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("https://api.example.com/agents/agent-1/duplicate");
    expect(init.headers.Authorization).toBe("Bearer token-123");
    expect(requestBody()).toEqual({
      name: "Copy one",
      interaction_type: "general",
    });
    expect(onDuplicated).toHaveBeenCalledWith("dup-1", "Copy one", "general");
  });

  it("sends the other type when the copy is changed to a single response", async () => {
    const user = setupUser();
    const { onDuplicated } = renderDialog({ interactionType: "conversation" });

    await user.click(generalCard());
    expect(generalCard()).toHaveClass("border-foreground");

    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({ uuid: "dup-2" }),
    );
    await duplicate(user);

    await waitFor(() => expect(onDuplicated).toHaveBeenCalled());
    expect(requestBody()).toEqual({
      name: "Copy of Support Bot",
      interaction_type: "general",
    });
    expect(onDuplicated).toHaveBeenCalledWith(
      "dup-2",
      "Copy of Support Bot",
      "general",
    );
  });

  it("sends conversation when the copy is changed back to a conversation", async () => {
    const user = setupUser();
    const { onDuplicated } = renderDialog({ interactionType: "general" });

    await user.click(conversationCard());

    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({ uuid: "dup-3" }),
    );
    await duplicate(user);

    await waitFor(() => expect(onDuplicated).toHaveBeenCalled());
    expect(requestBody().interaction_type).toBe("conversation");
    expect(onDuplicated).toHaveBeenCalledWith(
      "dup-3",
      "Copy of Support Bot",
      "conversation",
    );
  });

  it("does not send anything when the caller's save fails first", async () => {
    const user = setupUser();
    const onBeforeDuplicate = jest.fn().mockResolvedValue(false);
    const { onDuplicated, onClose } = renderDialog({ onBeforeDuplicate });

    await duplicate(user);

    expect(
      await screen.findByText(
        "Your latest changes could not be saved, so the copy was not created. Try again.",
      ),
    ).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(onDuplicated).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("sends the copy once the caller's save succeeds", async () => {
    const user = setupUser();
    const onBeforeDuplicate = jest.fn().mockResolvedValue(true);
    renderDialog({ onBeforeDuplicate, interactionType: "general" });

    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({ uuid: "dup-4" }),
    );
    await duplicate(user);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(requestBody().interaction_type).toBe("general");
  });

  it("shows the name conflict on the box and stays open", async () => {
    const user = setupUser();
    const { onClose, onDuplicated } = renderDialog();

    (global.fetch as jest.Mock).mockResolvedValueOnce(
      failureResponse(409, { detail: "Agent name already exists" }),
    );
    await duplicate(user);

    expect(
      await screen.findByText("Agent name already exists"),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(onDuplicated).not.toHaveBeenCalled();

    // Typing clears the conflict message.
    await user.type(screen.getByPlaceholderText("Enter agent name"), "2");
    expect(
      screen.queryByText("Agent name already exists"),
    ).not.toBeInTheDocument();
  });

  it("shows a general failure message when the copy fails for another reason", async () => {
    const user = setupUser();
    const { onClose } = renderDialog();

    (global.fetch as jest.Mock).mockResolvedValueOnce(failureResponse(500, {}));
    await duplicate(user);

    expect(
      await screen.findByText("Failed to duplicate agent"),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("signs the user out on 401", async () => {
    const user = setupUser();
    renderDialog();

    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(null, { ok: false, status: 401 }),
    );
    await duplicate(user);

    await waitFor(() =>
      expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" }),
    );
  });
});
