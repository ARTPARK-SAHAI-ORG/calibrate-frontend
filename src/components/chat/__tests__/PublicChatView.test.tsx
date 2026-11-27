import {
  act,
  render,
  screen,
  setupUser,
  waitFor,
  fireEvent,
} from "@/test-utils";
import { PublicChatView } from "../PublicChatView";
import { setActiveOrgUuid } from "@/lib/orgs";
import { fetchTrace } from "@/lib/tracesApi";
import { toast } from "sonner";
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

jest.mock("../../traces/ConvertTracesToTestsDialog", () => ({
  ConvertTracesToTestsDialog: (props: {
    isOpen: boolean;
    traceUuids: string[];
    testType: string;
    agentUuid: string;
    agentNature: string;
    nameFrom?: { comment?: string | null; userMessage?: string | null };
    traceLabels?: Record<string, string>;
    accessToken: string | null;
    onClose: () => void;
    onConverted: (result: { created: number; test_uuids: string[] }) => void;
  }) =>
    props.isOpen ? (
      <div data-testid="convert-dialog">
        <pre data-testid="convert-props">
          {JSON.stringify({
            traceUuids: props.traceUuids,
            testType: props.testType,
            agentUuid: props.agentUuid,
            agentNature: props.agentNature,
            nameFrom: props.nameFrom,
            traceLabels: props.traceLabels,
          })}
        </pre>
        <button
          onClick={() =>
            props.onConverted({ created: 1, test_uuids: ["test-1"] })
          }
        >
          Convert
        </button>
        <button onClick={props.onClose}>Dismiss</button>
      </div>
    ) : null,
}));

jest.mock("../../traces/TraceLabellingEvaluatorsDialog", () => ({
  TraceLabellingEvaluatorsDialog: (props: {
    agentUuid: string;
    agentNature: string;
    traces: { uuid: string; label: string }[];
    onClose: () => void;
    onChosen: (
      evaluators: { uuid: string; name?: string }[],
      variables: Record<string, Record<string, Record<string, string>>>,
    ) => void;
  }) => (
    <div data-testid="evaluators-dialog">
      <pre data-testid="evaluators-props">
        {JSON.stringify({
          agentUuid: props.agentUuid,
          agentNature: props.agentNature,
          traces: props.traces,
        })}
      </pre>
      <button
        onClick={() =>
          props.onChosen([{ uuid: "e1", name: "Correct" }], {
            t1: { e1: { topic: "billing" } },
          })
        }
      >
        Choose evaluators
      </button>
      <button onClick={props.onClose}>Close evaluators</button>
    </div>
  ),
}));

jest.mock("../../human-labelling/AddRunToLabellingTaskDialog", () => ({
  ...jest.requireActual("../../human-labelling/AddRunToLabellingTaskDialog"),
  AddRunToLabellingTaskDialog: (props: {
    source: unknown;
    openTaskInNewTab?: boolean;
    onClose: () => void;
  }) => (
    <div data-testid="task-dialog">
      <pre data-testid="task-props">
        {JSON.stringify({
          source: props.source,
          openTaskInNewTab: props.openTaskInNewTab,
        })}
      </pre>
      <button onClick={props.onClose}>Close task</button>
    </div>
  ),
}));

jest.mock("../../../lib/tracesApi", () => ({
  ...jest.requireActual("../../../lib/tracesApi"),
  fetchTrace: jest.fn(),
}));

jest.mock("sonner", () => ({ toast: { error: jest.fn() } }));

jest.mock("../../../lib/orgs", () => ({
  ...jest.requireActual("../../../lib/orgs"),
  setActiveOrgUuid: jest.fn(),
}));

const mockFetchTrace = fetchTrace as jest.Mock;
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

async function open(
  interaction_type = "conversation",
  extra: Record<string, unknown> = {},
) {
  mockAgent.mockResolvedValue({
    ok: true,
    data: { agent_name: "Support bot", interaction_type, ...extra },
  });
  render(<PublicChatView token="tok" />);
  await screen.findByText("Talk to the agent");
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

it("says there is no access when the token is unknown or the link is off", async () => {
  mockAgent.mockResolvedValue({ ok: false, error: "not_found" });
  render(<PublicChatView token="tok" />);
  expect(
    await screen.findByText("You do not have access to this page"),
  ).toBeInTheDocument();
  expect(screen.queryByText(/The link may have been/)).not.toBeInTheDocument();
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
    { conversation_id: null, message: "Hello" },
    null,
  );
  await sendMessage(user, "Again");
  await waitFor(() =>
    expect(mockSend).toHaveBeenLastCalledWith(
      "tok",
      { conversation_id: "c1", message: "Again" },
      null,
    ),
  );
});

it("adds a line on Shift+Enter and keeps Send off for an empty box", async () => {
  const user = setupUser();
  await open();
  const send = screen.getByRole("button", { name: "Send" });
  expect(send).toBeDisabled();
  await user.type(
    screen.getByLabelText("Message"),
    "a{Shift>}{Enter}{/Shift}b",
  );
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
    { conversation_id: null, message: "Hello" },
    null,
  );
  // The message is shown once, not once per try.
  expect(screen.getAllByText("Hello")).toHaveLength(1);
});

it.each([
  ["daily_limit", "This agent has reached its limit of messages for today"],
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
      { conversation_id: null, message: "Hi" },
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
    await screen.findByText("This chat is not available"),
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

it("saves a thumbs down at once, then the comment, and keeps the other thumb unpicked", async () => {
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
  expect(
    screen.getByRole("button", { name: "Good reply" }),
  ).not.toHaveAttribute("aria-pressed");
  await user.type(box, "Too short");
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(mockFeedback).toHaveBeenLastCalledWith(
    "tok",
    "t1",
    { is_correct: false, comment: "Too short" },
    null,
  );
  await waitFor(() =>
    expect(screen.queryByRole("textbox", { name: /wrong/ })).toBeNull(),
  );
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
    screen.getByText("Are you sure you want to delete your feedback?"),
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
  expect(
    screen.getByRole("button", { name: "Good reply" }),
  ).toBeInTheDocument();
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
    screen.getByText("Are you sure you want to delete your feedback?"),
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
      { conversation_id: null, message: "Hi" },
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

it("says when the agent was stopped after too many tool calls", async () => {
  const user = setupUser();
  await open();
  mockSend.mockResolvedValueOnce(reply({ reply: null, stopped_early: true }));
  await sendMessage(user, "Book it");
  expect(
    await screen.findByText(
      /stopped after using tools too many times in a row/,
    ),
  ).toBeInTheDocument();
  mockSend.mockResolvedValueOnce(reply());
  await sendMessage(user, "Again");
  expect(await screen.findByText("Simulated agent reply.")).toBeInTheDocument();
  expect(screen.getAllByText(/stopped after using tools/)).toHaveLength(1);
});

it("keeps New chat usable, and does nothing before a message is sent", async () => {
  const user = setupUser();
  await open();
  const newChat = screen.getByRole("button", { name: "New chat" });
  expect(newChat).toBeEnabled();
  await user.type(screen.getByLabelText("Message"), "Half typed");
  await user.click(newChat);
  expect(screen.getByLabelText("Message")).toHaveValue("Half typed");
  expect(mockSend).not.toHaveBeenCalled();
});

it("starts a new chat while a reply is on its way, and drops that reply", async () => {
  const user = setupUser();
  await open();
  let answer!: (value: unknown) => void;
  mockSend.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
  await sendMessage(user, "First chat");
  expect(screen.getByText("First chat")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "New chat" }));
  expect(screen.queryByText("First chat")).toBeNull();
  expect(screen.getByLabelText("Message")).toBeEnabled();

  await act(async () => answer(reply({ reply: "Late reply" })));
  expect(screen.queryByText("Late reply")).toBeNull();
});

it("puts a starter message in the message box without sending it", async () => {
  const user = setupUser();
  await open();
  await user.click(
    screen.getByRole("button", {
      name: "What do you need from me to get started?",
    }),
  );
  expect(screen.getByText("Here are a few examples")).toBeInTheDocument();
  expect(
    screen.getByText("Click one to put it in the message box"),
  ).toBeInTheDocument();
  const box = screen.getByLabelText("Message");
  expect(box).toHaveValue("What do you need from me to get started?");
  expect(box).toHaveFocus();
  expect(mockSend).not.toHaveBeenCalled();

  mockSend.mockResolvedValueOnce(reply());
  await user.keyboard("{Enter}");
  expect(await screen.findByText("Simulated agent reply.")).toBeInTheDocument();
  expect(screen.queryByText("Talk to the agent")).toBeNull();
});

it("scrolls the comment box into view when a thumb opens it", async () => {
  const user = setupUser();
  await open();
  mockSend.mockResolvedValue(reply());
  mockFeedback.mockResolvedValue({ ok: true, data: { feedback: null } });
  await sendMessage(user);
  await screen.findByText("Simulated agent reply.");
  const scroll = jest.spyOn(Element.prototype, "scrollIntoView");
  scroll.mockClear();
  await user.click(screen.getByRole("button", { name: "Good reply" }));
  await screen.findByText("What was good about this reply? (optional)");
  expect(scroll).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
  scroll.mockRestore();
});

it("closes an empty comment box when the next message is sent, and keeps one with text", async () => {
  const user = setupUser();
  await open();
  mockSend
    .mockResolvedValueOnce(reply())
    .mockResolvedValueOnce(reply({ trace_uuid: "t2" }))
    .mockResolvedValueOnce(reply({ trace_uuid: "t3" }));
  mockFeedback.mockResolvedValue({ ok: true, data: { feedback: null } });
  await sendMessage(user, "First");
  await screen.findByText("Simulated agent reply.");
  await user.click(screen.getByRole("button", { name: "Bad reply" }));
  expect(
    await screen.findByText("What was wrong with this reply? (optional)"),
  ).toBeInTheDocument();

  await sendMessage(user, "Second");
  await waitFor(() =>
    expect(
      screen.queryByText("What was wrong with this reply? (optional)"),
    ).toBeNull(),
  );
  // The thumb itself stays picked.
  expect(
    screen
      .getAllByRole("button", { name: "Bad reply" })
      .filter((b) => b.getAttribute("aria-pressed") === "true"),
  ).toHaveLength(1);

  const goods = await screen.findAllByRole("button", { name: "Good reply" });
  await user.click(goods[goods.length - 1]);
  await user.type(
    await screen.findByRole("textbox", { name: /What was good/ }),
    "Clear",
  );
  await sendMessage(user, "Third");
  expect(screen.getByRole("textbox", { name: /What was good/ })).toHaveValue(
    "Clear",
  );
});

it("shows the saved comment from an icon beside the thumb, and none without a comment", async () => {
  const user = setupUser();
  await open();
  mockSend
    .mockResolvedValueOnce(reply())
    .mockResolvedValueOnce(reply({ trace_uuid: "t2" }));
  mockFeedback.mockResolvedValue({ ok: true, data: { feedback: null } });
  await sendMessage(user, "First");
  await screen.findByText("Simulated agent reply.");
  await user.click(screen.getByRole("button", { name: "Bad reply" }));
  await user.type(
    await screen.findByRole("textbox", { name: /What was wrong/ }),
    "Wrong clinic hours",
  );
  await user.click(screen.getByRole("button", { name: "Save" }));

  const icon = await screen.findByRole("button", { name: "Edit your comment" });
  await user.hover(icon);
  expect(await screen.findByText("Wrong clinic hours")).toBeInTheDocument();

  // A thumb saved with no comment gets no icon.
  await sendMessage(user, "Second");
  const goods = await screen.findAllByRole("button", { name: "Good reply" });
  await user.click(goods[goods.length - 1]);
  await user.click(await screen.findByRole("button", { name: "Save" }));
  expect(
    screen.getAllByRole("button", { name: "Edit your comment" }),
  ).toHaveLength(1);
});

it("opens the saved comment in the comment box to edit it", async () => {
  const user = setupUser();
  await replied(user);
  mockFeedback.mockResolvedValue({ ok: true, data: { feedback: null } });
  await user.click(screen.getByRole("button", { name: "Bad reply" }));
  await user.type(
    await screen.findByRole("textbox", { name: /What was wrong/ }),
    "Wrong hours",
  );
  await user.click(screen.getByRole("button", { name: "Save" }));

  await user.click(
    await screen.findByRole("button", { name: "Edit your comment" }),
  );
  const box = screen.getByRole("textbox", { name: /What was wrong/ });
  expect(box).toHaveValue("Wrong hours");
  // The icon stays while the box is open, and clicking it again closes the box.
  const icon = screen.getByRole("button", { name: "Edit your comment" });
  expect(icon).toHaveAttribute("aria-pressed", "true");
  await user.click(icon);
  expect(
    screen.queryByRole("textbox", { name: /What was wrong/ }),
  ).not.toBeInTheDocument();
  await user.click(icon);
  await user.type(
    screen.getByRole("textbox", { name: /What was wrong/ }),
    " on Sunday",
  );
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(mockFeedback).toHaveBeenLastCalledWith(
    "tok",
    "t1",
    { is_correct: false, comment: "Wrong hours on Sunday" },
    null,
  );
});

it("switches to the other thumb after asking once", async () => {
  const user = setupUser();
  await replied(user);
  mockFeedback.mockResolvedValue({ ok: true, data: { feedback: null } });
  await user.click(screen.getByRole("button", { name: "Bad reply" }));
  await screen.findByLabelText("What was wrong with this reply? (optional)");

  await user.click(screen.getByRole("button", { name: "Good reply" }));
  expect(
    screen.getByText("Your previous feedback will be erased and replaced"),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Confirm" }));

  expect(mockFeedback).toHaveBeenLastCalledWith(
    "tok",
    "t1",
    { is_correct: true, comment: null },
    null,
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Good reply" })).toHaveAttribute(
      "aria-pressed",
      "true",
    ),
  );
  expect(screen.getByRole("button", { name: "Bad reply" })).not.toHaveAttribute(
    "aria-pressed",
  );
  expect(
    screen.getByLabelText("What was good about this reply? (optional)"),
  ).toBeInTheDocument();
});

describe("Add to tests", () => {
  const member = { agent_id: "a1", org_uuid: "o1" };
  const dialogProps = () =>
    JSON.parse(screen.getByTestId("convert-props").textContent!);

  it("is not offered to a visitor outside the workspace", async () => {
    const user = setupUser();
    mockSend.mockResolvedValue(reply());
    await open("conversation", { agent_id: null, org_uuid: null });
    await sendMessage(user);
    await user.click(await screen.findByLabelText("Good reply"));
    await screen.findByLabelText(/What was good/);
    expect(screen.queryByText("Add to tests")).not.toBeInTheDocument();
  });

  it("appears for a member once a thumb is picked", async () => {
    const user = setupUser();
    mockSend.mockResolvedValue(reply());
    await open("conversation", member);
    await sendMessage(user);
    await screen.findByLabelText("Good reply");
    expect(screen.queryByText("Add to tests")).not.toBeInTheDocument();
    await user.click(screen.getByLabelText("Bad reply"));
    expect(await screen.findByText("Add to tests")).toBeInTheDocument();
  });

  it.each([
    ["a text reply", "conversation", {}, "response"],
    [
      "a reply with only tool calls",
      "conversation",
      {
        reply: null,
        tool_calls: [{ tool: "lookup", arguments: {}, output: "ok" }],
      },
      "tool_call",
    ],
    ["a basic agent", "general", {}, "general"],
  ])("opens the dialog for %s", async (_name, kind, over, testType) => {
    const user = setupUser();
    mockSend.mockResolvedValue(reply(over));
    await open(kind, member);
    await sendMessage(user);
    await user.click(await screen.findByLabelText("Good reply"));
    await user.click(await screen.findByText("Add to tests"));
    expect(setActiveOrgUuid).toHaveBeenCalledWith("o1");
    expect(dialogProps()).toEqual({
      traceUuids: ["t1"],
      testType,
      agentUuid: "a1",
      agentNature: kind,
      // The test is named after what was asked, there being no comment.
      nameFrom: { comment: null, userMessage: "Hi" },
      // Each trace is named in the dialog by what was asked.
      traceLabels: { t1: "Hi" },
    });
    await user.click(screen.getByText("Dismiss"));
    expect(screen.queryByTestId("convert-dialog")).not.toBeInTheDocument();
  });

  it("saves a comment typed but not saved before opening the dialog", async () => {
    const user = setupUser();
    mockSend.mockResolvedValue(reply());
    await open("conversation", member);
    await sendMessage(user);
    await user.click(await screen.findByLabelText("Bad reply"));
    await user.type(
      await screen.findByLabelText(
        "What was wrong with this reply? (optional)",
      ),
      "Too short",
    );
    mockFeedback.mockClear();
    await user.click(screen.getByText("Add to tests"));
    // An evaluator can read the comment from the trace, so it is saved first.
    expect(mockFeedback).toHaveBeenCalledWith(
      "tok",
      "t1",
      { is_correct: false, comment: "Too short" },
      null,
    );
    expect(await screen.findByTestId("convert-dialog")).toBeInTheDocument();
    expect(dialogProps().nameFrom).toEqual({
      comment: "Too short",
      userMessage: "Hi",
    });
  });

  const saveThenReopenComment = async (user: ReturnType<typeof setupUser>) => {
    mockSend.mockResolvedValue(reply());
    await open("conversation", member);
    await sendMessage(user);
    await user.click(await screen.findByLabelText("Bad reply"));
    await user.type(
      await screen.findByLabelText(
        "What was wrong with this reply? (optional)",
      ),
      "Too short",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(
      await screen.findByRole("button", { name: "Edit your comment" }),
    );
    mockFeedback.mockClear();
  };

  it("saves a cleared comment before opening the dialog", async () => {
    const user = setupUser();
    await saveThenReopenComment(user);
    await user.clear(
      screen.getByLabelText("What was wrong with this reply? (optional)"),
    );
    await user.click(screen.getByText("Add to tests"));
    expect(mockFeedback).toHaveBeenCalledWith(
      "tok",
      "t1",
      { is_correct: false, comment: null },
      null,
    );
    expect(await screen.findByTestId("convert-dialog")).toBeInTheDocument();
    expect(dialogProps().nameFrom).toEqual({
      comment: null,
      userMessage: "Hi",
    });
  });

  it("does not save again when the reopened comment is unchanged", async () => {
    const user = setupUser();
    await saveThenReopenComment(user);
    await user.click(screen.getByText("Add to tests"));
    expect(await screen.findByTestId("convert-dialog")).toBeInTheDocument();
    expect(mockFeedback).not.toHaveBeenCalled();
    expect(dialogProps().nameFrom).toEqual({
      comment: "Too short",
      userMessage: "Hi",
    });
  });

  it("does not open the dialog when the comment cannot be saved", async () => {
    const user = setupUser();
    mockSend.mockResolvedValue(reply());
    await open("conversation", member);
    await sendMessage(user);
    await user.click(await screen.findByLabelText("Bad reply"));
    await user.type(
      await screen.findByLabelText(
        "What was wrong with this reply? (optional)",
      ),
      "Too short",
    );
    mockFeedback.mockResolvedValueOnce({ ok: false, error: "network" });
    await user.click(screen.getByText("Add to tests"));

    expect(
      await screen.findByText("Your feedback could not be saved. Try again"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("convert-dialog")).not.toBeInTheDocument();
  });

  it("confirms once added, linking to the test it made", async () => {
    const user = setupUser();
    mockSend.mockResolvedValue(reply());
    await open("conversation", member);
    await sendMessage(user);
    await user.click(await screen.findByLabelText("Good reply"));
    await user.click(await screen.findByText("Add to tests"));
    await user.click(screen.getByText("Convert"));
    expect(screen.queryByTestId("convert-dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Added to tests")).toBeInTheDocument();
    expect(
      screen.getByText("This reply was added to the agent's tests"),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /View test/ });
    expect(link).toHaveAttribute(
      "href",
      "/o1/agents/a1?tab=tests&testId=test-1",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.getByText("Add to tests")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByText("Added to tests")).not.toBeInTheDocument();
  });
});

describe("Submit for labelling", () => {
  const member = { agent_id: "a1", org_uuid: "o1" };
  const fullTrace = {
    uuid: "t1",
    input: [
      { role: "system", content: "Be kind" },
      { role: "user", content: "Hi" },
    ],
    output: { response: "Simulated agent reply.", tool_calls: [] },
    conversation_id: "c1",
    message_id: null,
  };
  const props = (id: string) => JSON.parse(screen.getByTestId(id).textContent!);

  // Signed in, since a member's login is what loads the whole reply.
  beforeEach(() => {
    localStorage.setItem("access_token", "jwt");
  });
  afterEach(() => {
    localStorage.removeItem("access_token");
  });

  it("is not offered to a visitor outside the workspace", async () => {
    const user = setupUser();
    mockSend.mockResolvedValue(reply());
    await open("conversation", { agent_id: null, org_uuid: null });
    await sendMessage(user);
    await user.click(await screen.findByLabelText("Good reply"));
    await screen.findByLabelText(/What was good/);
    expect(screen.queryByText("Submit for labelling")).not.toBeInTheDocument();
  });

  it("appears for a member once a thumb is picked", async () => {
    const user = setupUser();
    mockSend.mockResolvedValue(reply());
    await open("conversation", member);
    await sendMessage(user);
    await screen.findByLabelText("Good reply");
    expect(screen.queryByText("Submit for labelling")).not.toBeInTheDocument();
    await user.click(screen.getByLabelText("Bad reply"));
    expect(await screen.findByText("Submit for labelling")).toBeInTheDocument();
  });

  it("picks evaluators, loads the reply, then opens the task window", async () => {
    const user = setupUser();
    mockSend.mockResolvedValue(reply());
    let resolveTrace: (t: unknown) => void = () => {};
    mockFetchTrace.mockReturnValue(
      new Promise((resolve) => (resolveTrace = resolve)),
    );
    await open("conversation", member);
    await sendMessage(user);
    await user.click(await screen.findByLabelText("Good reply"));
    await user.click(await screen.findByText("Submit for labelling"));

    expect(setActiveOrgUuid).toHaveBeenCalledWith("o1");
    expect(props("evaluators-props")).toEqual({
      agentUuid: "a1",
      agentNature: "conversation",
      traces: [{ uuid: "t1", label: "Hi" }],
    });
    await user.click(screen.getByText("Choose evaluators"));
    expect(screen.queryByTestId("evaluators-dialog")).not.toBeInTheDocument();
    // The button cannot be pressed again while the reply loads.
    expect(screen.getByRole("button", { name: "Loading..." })).toBeDisabled();
    expect(screen.getByText("Add to tests").closest("button")).toBeDisabled();
    expect(mockFetchTrace).toHaveBeenCalledWith(expect.any(String), "t1");

    await act(async () => resolveTrace(fullTrace));
    expect(props("task-props")).toEqual({
      openTaskInNewTab: true,
      source: {
        type: "traces",
        agentUuid: "a1",
        agentNature: "conversation",
        evaluators: [{ uuid: "e1", name: "Correct" }],
        traces: [
          {
            name: "t1",
            input: [{ role: "user", content: "Hi" }],
            output: { response: "Simulated agent reply.", tool_calls: [] },
            metadata: [{ key: "conversation_id", value: "c1" }],
            evaluatorVariables: { e1: { topic: "billing" } },
          },
        ],
      },
    });
    expect(screen.getByText("Submit for labelling")).toBeEnabled();
    await user.click(screen.getByText("Close task"));
    expect(screen.queryByTestId("task-dialog")).not.toBeInTheDocument();
  });

  it("is not offered for a reply with neither text nor tool calls", async () => {
    const user = setupUser();
    mockSend.mockResolvedValue(reply({ reply: null, tool_calls: [] }));
    await open("conversation", member);
    await sendMessage(user);
    await user.click(await screen.findByLabelText("Good reply"));
    expect(await screen.findByText("Add to tests")).toBeInTheDocument();
    expect(screen.queryByText("Submit for labelling")).not.toBeInTheDocument();
  });

  it("locks every reply's buttons while one reply loads", async () => {
    const user = setupUser();
    mockSend
      .mockResolvedValueOnce(reply())
      .mockResolvedValueOnce(reply({ trace_uuid: "t2" }));
    mockFetchTrace.mockReturnValue(new Promise(() => {}));
    await open("conversation", member);
    await sendMessage(user);
    await user.click(await screen.findByLabelText("Good reply"));
    await sendMessage(user, "Again");
    await waitFor(() =>
      expect(screen.getAllByLabelText("Good reply")).toHaveLength(2),
    );
    await user.click(screen.getAllByLabelText("Good reply")[1]);
    await waitFor(() =>
      expect(screen.getAllByText("Submit for labelling")).toHaveLength(2),
    );
    await user.click(screen.getAllByText("Submit for labelling")[0]);
    await user.click(screen.getByText("Choose evaluators"));

    // Only the reply being loaded says so; the other cannot be used either.
    expect(screen.getAllByText("Loading...")).toHaveLength(1);
    const other = screen.getByText("Submit for labelling").closest("button");
    expect(other).toBeDisabled();
    for (const button of screen.getAllByText("Add to tests")) {
      expect(button.closest("button")).toBeDisabled();
    }
  });

  it("drops a reply still loading when a new chat is started", async () => {
    const user = setupUser();
    mockSend.mockResolvedValue(reply());
    let resolveTrace: (t: unknown) => void = () => {};
    mockFetchTrace.mockReturnValue(
      new Promise((resolve) => (resolveTrace = resolve)),
    );
    await open("conversation", member);
    await sendMessage(user);
    await user.click(await screen.findByLabelText("Good reply"));
    await user.click(await screen.findByText("Submit for labelling"));
    await user.click(screen.getByText("Choose evaluators"));
    await user.click(screen.getByRole("button", { name: "New chat" }));
    await act(async () => resolveTrace(fullTrace));
    expect(screen.queryByTestId("task-dialog")).not.toBeInTheDocument();
  });

  it("skips the evaluators for a reply with only tool calls", async () => {
    const user = setupUser();
    mockSend.mockResolvedValue(
      reply({
        reply: null,
        tool_calls: [{ tool: "lookup", arguments: {}, output: "ok" }],
      }),
    );
    mockFetchTrace.mockResolvedValue(fullTrace);
    await open("conversation", member);
    await sendMessage(user);
    await user.click(await screen.findByLabelText("Good reply"));
    await user.click(await screen.findByText("Submit for labelling"));
    await screen.findByTestId("task-dialog");
    expect(screen.queryByTestId("evaluators-dialog")).not.toBeInTheDocument();
    expect(props("task-props").source.evaluators).toEqual([]);
  });

  it("says so and opens nothing when the reply cannot be loaded", async () => {
    const user = setupUser();
    mockSend.mockResolvedValue(reply());
    mockFetchTrace.mockRejectedValue(new Error("boom"));
    await open("conversation", member);
    await sendMessage(user);
    await user.click(await screen.findByLabelText("Good reply"));
    await user.click(await screen.findByText("Submit for labelling"));
    await user.click(screen.getByText("Choose evaluators"));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "This reply could not be loaded. Try again.",
      ),
    );
    expect(screen.queryByTestId("task-dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Submit for labelling")).toBeEnabled();
  });

  it("saves a comment typed but not saved first", async () => {
    const user = setupUser();
    mockSend.mockResolvedValue(reply());
    await open("conversation", member);
    await sendMessage(user);
    await user.click(await screen.findByLabelText("Bad reply"));
    await user.type(
      await screen.findByLabelText(
        "What was wrong with this reply? (optional)",
      ),
      "Too short",
    );
    mockFeedback.mockClear();
    await user.click(screen.getByText("Submit for labelling"));
    expect(mockFeedback).toHaveBeenCalledWith(
      "tok",
      "t1",
      { is_correct: false, comment: "Too short" },
      expect.any(String),
    );
    expect(await screen.findByTestId("evaluators-dialog")).toBeInTheDocument();
  });

  it("opens nothing when the comment cannot be saved", async () => {
    const user = setupUser();
    mockSend.mockResolvedValue(reply());
    await open("conversation", member);
    await sendMessage(user);
    await user.click(await screen.findByLabelText("Bad reply"));
    await user.type(
      await screen.findByLabelText(
        "What was wrong with this reply? (optional)",
      ),
      "Too short",
    );
    mockFeedback.mockResolvedValueOnce({ ok: false, error: "network" });
    await user.click(screen.getByText("Submit for labelling"));
    expect(
      await screen.findByText("Your feedback could not be saved. Try again"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("evaluators-dialog")).not.toBeInTheDocument();
  });
});
