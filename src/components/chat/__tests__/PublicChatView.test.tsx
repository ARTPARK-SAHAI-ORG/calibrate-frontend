import { render, screen, setupUser, waitFor, fireEvent } from "@/test-utils";
import { PublicChatView } from "../PublicChatView";
import {
  fetchChatAgent,
  sendChatMessage,
  setChatFeedback,
} from "@/lib/publicChatApi";

jest.mock("../../../lib/publicChatApi", () => ({
  fetchChatAgent: jest.fn(),
  sendChatMessage: jest.fn(),
  setChatFeedback: jest.fn(),
}));

const mockAgent = fetchChatAgent as jest.Mock;
const mockSend = sendChatMessage as jest.Mock;
const mockFeedback = setChatFeedback as jest.Mock;

const reply = (over: Record<string, unknown> = {}) => ({
  ok: true,
  data: {
    conversation_id: "c1",
    trace_uuid: "t1",
    reply: "Simulated agent reply.",
    tool_calls: [],
    ended: false,
    ...over,
  },
});

async function open(interaction_type = "conversation") {
  mockAgent.mockResolvedValue({
    ok: true,
    data: { agent_name: "Support bot", interaction_type },
  });
  render(<PublicChatView token="tok" />);
  await screen.findByText("Send a message to start chatting with Support bot");
}

async function sendMessage(user: ReturnType<typeof setupUser>, text = "Hi") {
  await user.type(screen.getByLabelText("Message"), text);
  await user.keyboard("{Enter}");
}

beforeEach(() => {
  jest.clearAllMocks();
  // The public page chrome asks the browser whether it is in dark mode.
  window.matchMedia = jest.fn().mockReturnValue({
    matches: false,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  });
  mockFeedback.mockImplementation(async (_t, _id, body) => ({
    ok: true,
    data: body,
  }));
});

it("names the tab after the agent", async () => {
  await open();
  expect(document.title).toBe("Support bot chat");
});

it("says the link is not available when the token is unknown", async () => {
  mockAgent.mockResolvedValue({ ok: false, error: "not_found" });
  render(<PublicChatView token="tok" />);
  expect(
    await screen.findByText("This chat link is not available"),
  ).toBeInTheDocument();
});

it("says the chat could not be opened on any other failure", async () => {
  mockAgent.mockResolvedValue({ ok: false, error: "network" });
  render(<PublicChatView token="tok" />);
  expect(
    await screen.findByText(/This chat could not be opened/),
  ).toBeInTheDocument();
});

it("sends on Enter, shows the reply and carries the conversation on", async () => {
  const user = setupUser();
  await open();
  mockSend.mockResolvedValue(reply());
  await sendMessage(user, "Hello");
  expect(await screen.findByText("Simulated agent reply.")).toBeInTheDocument();
  expect(screen.getByText("Hello")).toBeInTheDocument();
  expect(mockSend).toHaveBeenCalledWith(
    "tok",
    { conversation_id: null, message: "Hello", history: [] },
    null,
  );
  await sendMessage(user, "Again");
  await waitFor(() =>
    expect(mockSend).toHaveBeenLastCalledWith(
      "tok",
      {
        conversation_id: "c1",
        message: "Again",
        history: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Simulated agent reply.", tool_calls: [] },
        ],
      },
      null,
    ),
  );
});

it("adds a line on Shift+Enter and keeps Send off for an empty box", async () => {
  const user = setupUser();
  await open();
  const send = screen.getByRole("button", { name: "Send" });
  expect(send).toBeDisabled();
  await user.type(screen.getByLabelText("Message"), "a{Shift>}{Enter}{/Shift}b");
  expect(screen.getByLabelText("Message")).toHaveValue("a\nb");
  expect(mockSend).not.toHaveBeenCalled();
});

it("refuses a message over 4,000 characters and says why", async () => {
  await open();
  fireEvent.change(screen.getByLabelText("Message"), {
    target: { value: "x".repeat(4001) },
  });
  expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  expect(
    screen.getByText(
      "This message is 4,001 characters. Shorten it to 4,000 or fewer to send it",
    ),
  ).toBeInTheDocument();
});

it("shows tool calls the agent made", async () => {
  const user = setupUser();
  await open();
  mockSend.mockResolvedValue(
    reply({
      reply: null,
      tool_calls: [{ tool: "lookup", arguments: { id: 1 }, output: "ok" }],
    }),
  );
  await sendMessage(user);
  expect(await screen.findByText("lookup")).toBeInTheDocument();
});

it("retries the same message when the agent did not reply", async () => {
  const user = setupUser();
  await open();
  mockSend.mockResolvedValueOnce({ ok: false, error: "agent_failed" });
  await sendMessage(user, "Hello");
  expect(
    await screen.findByText("The agent did not reply. Try again"),
  ).toBeInTheDocument();
  mockSend.mockResolvedValueOnce(reply());
  await user.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("Simulated agent reply.")).toBeInTheDocument();
  expect(mockSend).toHaveBeenLastCalledWith(
    "tok",
    { conversation_id: null, message: "Hello", history: [] },
    null,
  );
  // The message is shown once, not once per try.
  expect(screen.getAllByText("Hello")).toHaveLength(1);
});

it.each([
  ["daily_limit", "This chat link has reached its limit for today"],
  [
    "agent_unavailable",
    "This agent cannot reply right now. Tell the person who shared this link",
  ],
  ["something_new", "The message could not be sent. Try again"],
])("explains %s", async (error, text) => {
  const user = setupUser();
  await open();
  mockSend.mockResolvedValue({ ok: false, error });
  await sendMessage(user);
  expect(await screen.findByText(text)).toBeInTheDocument();
});

it("locks the box when the chat is too long until a new chat", async () => {
  const user = setupUser();
  await open();
  mockSend.mockResolvedValue({ ok: false, error: "conversation_too_long" });
  await sendMessage(user);
  expect(
    await screen.findByText("This chat is too long. Start a new one"),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Message")).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  await user.click(screen.getAllByRole("button", { name: "New chat" })[0]);
  expect(screen.getByLabelText("Message")).toBeEnabled();
  expect(screen.queryByText("Hi")).toBeNull();
});

it("locks the box once the agent ends the conversation", async () => {
  const user = setupUser();
  await open();
  mockSend.mockResolvedValue(reply({ ended: true }));
  await sendMessage(user);
  expect(
    await screen.findByText("The agent ended the conversation"),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Message")).toBeDisabled();
  await user.click(screen.getAllByRole("button", { name: "New chat" })[0]);
  expect(screen.getByLabelText("Message")).toBeEnabled();
  mockSend.mockResolvedValue(reply());
  await sendMessage(user);
  await waitFor(() =>
    expect(mockSend).toHaveBeenLastCalledWith(
      "tok",
      { conversation_id: null, message: "Hi", history: [] },
      null,
    ),
  );
});

it("locks the box once the link is no longer available", async () => {
  const user = setupUser();
  await open();
  mockSend.mockResolvedValue({ ok: false, error: "not_found" });
  await sendMessage(user);
  expect(
    await screen.findByText("This chat link is not available"),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Message")).toBeDisabled();
});

it("says a basic agent answers each message on its own", async () => {
  await open("general");
  expect(
    screen.getByText("Each message is answered on its own"),
  ).toBeInTheDocument();
});

it("does not offer thumbs on a reply the workspace had no room to keep", async () => {
  const user = setupUser();
  await open();
  mockSend.mockResolvedValue(reply({ trace_uuid: null }));
  await sendMessage(user);
  await screen.findByText("Simulated agent reply.");
  expect(screen.queryByRole("button", { name: "Good reply" })).toBeNull();
});

it("shows the agent is replying and locks the box until it answers", async () => {
  const user = setupUser();
  await open();
  let answer: (v: unknown) => void = () => {};
  mockSend.mockReturnValue(new Promise((r) => (answer = r)));
  await sendMessage(user);
  expect(screen.getByText("The agent is replying")).toBeInTheDocument();
  expect(screen.getByLabelText("Message")).toBeDisabled();
  answer(reply());
  expect(await screen.findByText("Simulated agent reply.")).toBeInTheDocument();
  expect(screen.getByLabelText("Message")).toBeEnabled();
});

async function replied(user: ReturnType<typeof setupUser>) {
  await open();
  mockSend.mockResolvedValue(reply());
  await sendMessage(user);
  await screen.findByText("Simulated agent reply.");
}

it("saves a thumbs down at once, then the comment, and keeps only that thumb", async () => {
  const user = setupUser();
  await replied(user);

  await user.click(screen.getByRole("button", { name: "Bad reply" }));
  expect(mockFeedback).toHaveBeenLastCalledWith(
    "tok",
    "t1",
    { is_correct: false, comment: null },
    null,
  );
  const box = await screen.findByLabelText(
    "What was wrong with this reply? (optional)",
  );
  expect(screen.queryByRole("button", { name: "Good reply" })).toBeNull();
  await user.type(box, "Too short");
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(mockFeedback).toHaveBeenLastCalledWith(
    "tok",
    "t1",
    { is_correct: false, comment: "Too short" },
    null,
  );
  await waitFor(() => expect(screen.queryByRole("textbox", { name: /wrong/ })).toBeNull());
  expect(screen.queryByText("Too short")).toBeNull();
  expect(screen.getByRole("button", { name: "Bad reply" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

it("asks what was good after a thumbs up, and Cancel keeps the thumb", async () => {
  const user = setupUser();
  await replied(user);
  await user.click(screen.getByRole("button", { name: "Good reply" }));
  expect(mockFeedback).toHaveBeenLastCalledWith(
    "tok",
    "t1",
    { is_correct: true, comment: null },
    null,
  );
  await screen.findByLabelText("What was good about this reply? (optional)");
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(
    screen.queryByLabelText("What was good about this reply? (optional)"),
  ).toBeNull();
  expect(mockFeedback).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Good reply" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

it("asks before clearing a picked thumb, and clears it on confirm", async () => {
  const user = setupUser();
  await replied(user);
  await user.click(screen.getByRole("button", { name: "Bad reply" }));
  await user.click(await screen.findByRole("button", { name: "Cancel" }));

  await user.click(screen.getByRole("button", { name: "Bad reply" }));
  expect(screen.getByText("Clear your feedback?")).toBeInTheDocument();
  expect(
    screen.getByText(
      "This removes your thumbs down and your comment from this reply.",
    ),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByText("Clear your feedback?")).toBeNull();
  expect(mockFeedback).toHaveBeenCalledTimes(1);

  await user.click(screen.getByRole("button", { name: "Bad reply" }));
  await user.click(screen.getByRole("button", { name: "Clear feedback" }));
  expect(mockFeedback).toHaveBeenLastCalledWith(
    "tok",
    "t1",
    { is_correct: null, comment: null },
    null,
  );
  await waitFor(() =>
    expect(screen.queryByText("Clear your feedback?")).toBeNull(),
  );
  expect(screen.getByRole("button", { name: "Good reply" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Bad reply" })).not.toHaveAttribute(
    "aria-pressed",
  );
});

it("names a thumbs up in the clear question", async () => {
  const user = setupUser();
  await replied(user);
  await user.click(screen.getByRole("button", { name: "Good reply" }));
  await user.click(await screen.findByRole("button", { name: "Cancel" }));
  await user.click(screen.getByRole("button", { name: "Good reply" }));
  expect(
    screen.getByText(
      "This removes your thumbs up and your comment from this reply.",
    ),
  ).toBeInTheDocument();
});

it("says when feedback could not be saved and leaves the thumbs as they were", async () => {
  const user = setupUser();
  await replied(user);
  mockFeedback.mockResolvedValueOnce({ ok: false, error: "network" });
  await user.click(screen.getByRole("button", { name: "Good reply" }));
  expect(
    await screen.findByText("Your feedback could not be saved. Try again"),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Bad reply" })).toBeInTheDocument();
});

it("sends the signed-in login so a member can open a private chat", async () => {
  localStorage.setItem("access_token", "member-jwt");
  try {
    const user = setupUser();
    await replied(user);
    expect(mockAgent).toHaveBeenCalledWith("tok", "member-jwt");
    expect(mockSend).toHaveBeenLastCalledWith(
      "tok",
      { conversation_id: null, message: "Hi", history: [] },
      "member-jwt",
    );
  } finally {
    localStorage.removeItem("access_token");
  }
});

it("starts a new chat from the ended note", async () => {
  const user = setupUser();
  await open();
  mockSend.mockResolvedValue(reply({ ended: true }));
  await sendMessage(user);
  await screen.findByText("The agent ended the conversation");
  const buttons = screen.getAllByRole("button", { name: "New chat" });
  await user.click(buttons[buttons.length - 1]);
  expect(screen.queryByText("The agent ended the conversation")).toBeNull();
  expect(screen.getByLabelText("Message")).toBeEnabled();
});

it("sends each reply's tool calls back with the next message", async () => {
  const user = setupUser();
  await open();
  const calls = [{ tool: "book", arguments: { day: 1 }, output: { ok: true } }];
  mockSend.mockResolvedValueOnce(reply({ reply: "Booked", tool_calls: calls }));
  await sendMessage(user, "Book it");
  expect(await screen.findByText("Booked")).toBeInTheDocument();
  mockSend.mockResolvedValueOnce(reply());
  await sendMessage(user, "Thanks");
  await waitFor(() =>
    expect(mockSend).toHaveBeenLastCalledWith(
      "tok",
      {
        conversation_id: "c1",
        message: "Thanks",
        history: [
          { role: "user", content: "Book it" },
          { role: "assistant", content: "Booked", tool_calls: calls },
        ],
      },
      null,
    ),
  );
});

it("leaves a message that failed out of the conversation sent later", async () => {
  const user = setupUser();
  await open();
  mockSend.mockResolvedValueOnce({ ok: false, error: "agent_failed" });
  await sendMessage(user, "First");
  expect(
    await screen.findByText("The agent did not reply. Try again"),
  ).toBeInTheDocument();
  mockSend.mockResolvedValueOnce(reply());
  await sendMessage(user, "Second");
  expect(await screen.findByText("Simulated agent reply.")).toBeInTheDocument();
  mockSend.mockResolvedValueOnce(reply());
  await sendMessage(user, "Third");
  await waitFor(() =>
    expect(mockSend).toHaveBeenLastCalledWith(
      "tok",
      {
        conversation_id: "c1",
        message: "Third",
        history: [
          { role: "user", content: "Second" },
          { role: "assistant", content: "Simulated agent reply.", tool_calls: [] },
        ],
      },
      null,
    ),
  );
});
