import { apiGet } from "../api";
import { fetchChatLink } from "../chatLinkApi";

jest.mock("../api", () => ({ apiGet: jest.fn() }));

it("reads the agent's chat link", async () => {
  const link = {
    is_public: false,
    share_token: "tok-1",
    connection_verified: true,
    messages_today: 2,
    daily_message_limit: 7,
  };
  (apiGet as jest.Mock).mockResolvedValue(link);
  await expect(fetchChatLink("jwt", "agent 1")).resolves.toEqual(link);
  expect(apiGet).toHaveBeenCalledWith("/agents/agent%201/chat-link", "jwt");
});
