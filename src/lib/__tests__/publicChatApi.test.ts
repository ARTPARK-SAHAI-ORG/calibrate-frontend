import {
  fetchChatAgent,
  sendChatMessage,
  setChatFeedback,
} from "../publicChatApi";

const OLD = process.env.NEXT_PUBLIC_BACKEND_URL;
beforeEach(() => {
  process.env.NEXT_PUBLIC_BACKEND_URL = "https://api.example.com";
});
afterEach(() => {
  process.env.NEXT_PUBLIC_BACKEND_URL = OLD;
  // @ts-expect-error test-only global
  delete global.fetch;
});

function answer(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status < 400,
    status,
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  });
}

it("reads the agent with no sign-in", async () => {
  answer(200, { agent_name: "Bot", interaction_type: "conversation" });
  expect(await fetchChatAgent("a b")).toEqual({
    ok: true,
    data: { agent_name: "Bot", interaction_type: "conversation" },
  });
  const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
  expect(url).toBe("https://api.example.com/public/agent-chat/a%20b");
  expect(init.headers.Authorization).toBeUndefined();
});

it("posts a message and puts feedback", async () => {
  answer(200, {});
  await sendChatMessage("t", { conversation_id: null, message: "hi", history: [] });
  await setChatFeedback("t", "tr", { is_correct: true, comment: null }, "jwt");
  const calls = (global.fetch as jest.Mock).mock.calls;
  expect(calls[0][0]).toBe("https://api.example.com/public/agent-chat/t/messages");
  expect(calls[0][1].method).toBe("POST");
  expect(JSON.parse(calls[0][1].body)).toEqual({
    conversation_id: null,
    message: "hi",
    history: [],
  });
  expect(calls[1][0]).toBe(
    "https://api.example.com/public/agent-chat/t/traces/tr/feedback",
  );
  expect(calls[1][1].method).toBe("PUT");
  expect(JSON.parse(calls[1][1].body)).toEqual({ is_correct: true, comment: null });
  expect(calls[1][1].headers.Authorization).toBe("Bearer jwt");
  expect(calls[0][1].headers.Authorization).toBeUndefined();
});

it.each([
  [429, { detail: { error: "daily_limit", limit: 200 } }, "daily_limit"],
  [400, { error: "connection_unverified" }, "connection_unverified"],
  [404, "not json", "not_found"],
  [500, "not json", "unknown"],
])("reads the backend's code from a %s", async (status, body, code) => {
  answer(status, body);
  expect(await fetchChatAgent("t")).toEqual({ ok: false, error: code });
});

it("reports a network failure", async () => {
  global.fetch = jest.fn().mockRejectedValue(new Error("offline"));
  expect(await fetchChatAgent("t")).toEqual({ ok: false, error: "network" });
});

it("still reads the status when the failure has no readable body", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status: 404,
    text: async () => {
      throw new Error("stream closed");
    },
  });
  expect(await fetchChatAgent("t")).toEqual({ ok: false, error: "not_found" });
});
