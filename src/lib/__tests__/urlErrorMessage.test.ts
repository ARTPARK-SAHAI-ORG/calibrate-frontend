import { friendlyUrlError } from "../urlErrorMessage";

const PRIVATE =
  "This URL points to a private or internal network address. Use a public URL that can be reached from the internet.";
const UNRESOLVED =
  "This URL could not be found. Check that it is spelled correctly and can be reached from the internet.";

describe("friendlyUrlError", () => {
  it.each([
    [
      "webhook url must not resolve to a private or reserved network address",
      PRIVATE,
    ],
    ["webhook url must not point to localhost", PRIVATE],
    ["webhook url must not point to a private network address", PRIVATE],
    [
      "agent_url must not resolve to a private or reserved network address",
      PRIVATE,
    ],
    ["Webhook URL points at an internal address", PRIVATE],
    ["webhook url hostname could not be resolved", UNRESOLVED],
    [
      "webhook url must use http or https",
      "This URL must start with http:// or https://",
    ],
    [
      "webhook url must include a hostname",
      "This URL is missing the website address. Enter a full URL, such as https://api.example.com/orders.",
    ],
  ])("rewrites %j", (backend, expected) => {
    expect(friendlyUrlError(backend)).toBe(expected);
  });

  it.each([
    "Tool name already exists",
    "webhook url is something new",
    "Something went wrong on our end. Please try again in a moment.",
  ])("leaves %j unchanged", (message) => {
    expect(friendlyUrlError(message)).toBe(message);
  });
});
