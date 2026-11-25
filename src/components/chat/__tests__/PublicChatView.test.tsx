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
  await screen.findByRole("heading", { name: "Support bot" });
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
  expect(mockSend).toHaveBeenCalledWith("tok", {
    conversation_id: null,
    message: "Hello",
  });
  await sendMessage(user, "Again");
  await waitFor(() =>
    expect(mockSend).toHaveBeenLastCalledWith("tok", {
      conversation_id: "c1",
      message: "Again",
    }),
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
    screen.getByText(/at most 4,000 characters. This one has 4,001/),
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
  expect(mockSend).toHaveBeenLastCalledWith("tok", {
    conversation_id: null,
    message: "Hello",
  });
  // The message is shown once, not once per try.
  expect(screen.getAllByText("Hello")).toHaveLength(1);
});

it.each([
  ["daily_limit", "This chat link has reached its limit for today"],
  ["trace_limit", "This agent cannot take more messages right now"],
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
  await user.click(screen.getByRole("button", { name: "New chat" }));
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
  await user.click(screen.getByRole("button", { name: "New chat" }));
  expect(screen.getByLabelText("Message")).toBeEnabled();
  mockSend.mockResolvedValue(reply());
  await sendMessage(user);
  await waitFor(() =>
    expect(mockSend).toHaveBeenLastCalledWith("tok", {
      conversation_id: null,
      message: "Hi",
    }),
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

it("keeps a typed comment when the thumb changes before it is saved", async () => {
  const user = setupUser();
  await open();
  mockSend.mockResolvedValue(reply());
  await sendMessage(user);
  await screen.findByText("Simulated agent reply.");
  await user.click(screen.getByRole("button", { name: "Bad reply" }));
  await user.type(
    await screen.findByLabelText("Comment on this reply"),
    "Too short",
  );
  await user.click(screen.getByRole("button", { name: "Good reply" }));
  await waitFor(() =>
    expect(mockFeedback).toHaveBeenLastCalledWith("tok", "t1", {
      rating: "up",
      comment: null,
    }),
  );
  expect(screen.getByLabelText("Comment on this reply")).toHaveValue(
    "Too short",
  );
});

it("says a basic agent answers each message on its own", async () => {
  await open("general");
  expect(
    screen.getByText("Each message is answered on its own"),
  ).toBeInTheDocument();
});

it("saves a thumb at once, then an optional comment, and clears on a second click", async () => {
  const user = setupUser();
  await open();
  mockSend.mockResolvedValue(reply());
  await sendMessage(user);
  await screen.findByText("Simulated agent reply.");

  await user.click(screen.getByRole("button", { name: "Bad reply" }));
  expect(mockFeedback).toHaveBeenLastCalledWith("tok", "t1", {
    rating: "down",
    comment: null,
  });
  const box = await screen.findByLabelText("Comment on this reply");
  await user.type(box, "Too short");
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(mockFeedback).toHaveBeenLastCalledWith("tok", "t1", {
    rating: "down",
    comment: "Too short",
  });
  expect(await screen.findByRole("button", { name: "Saved" })).toBeDisabled();

  // Switching thumbs keeps the comment.
  await user.click(screen.getByRole("button", { name: "Good reply" }));
  expect(mockFeedback).toHaveBeenLastCalledWith("tok", "t1", {
    rating: "up",
    comment: "Too short",
  });

  await user.click(screen.getByRole("button", { name: "Good reply" }));
  expect(mockFeedback).toHaveBeenLastCalledWith("tok", "t1", {
    rating: null,
    comment: null,
  });
  await waitFor(() =>
    expect(screen.queryByLabelText("Comment on this reply")).toBeNull(),
  );
});

it("says when a rating could not be saved", async () => {
  const user = setupUser();
  await open();
  mockSend.mockResolvedValue(reply());
  await sendMessage(user);
  await screen.findByText("Simulated agent reply.");
  mockFeedback.mockResolvedValueOnce({ ok: false, error: "network" });
  await user.click(screen.getByRole("button", { name: "Good reply" }));
  expect(
    await screen.findByText("Your rating could not be saved. Try again"),
  ).toBeInTheDocument();
  expect(screen.queryByLabelText("Comment on this reply")).toBeNull();
});
