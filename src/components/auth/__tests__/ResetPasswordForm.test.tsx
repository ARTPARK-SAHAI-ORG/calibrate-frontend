import { render, screen, setupUser } from "@/test-utils";
import { LOGIN, fullText, setLocation } from "@/test-utils/auth";
import { waitFor } from "@testing-library/react";
import { ResetPasswordForm } from "../ResetPasswordForm";

const EXPIRED = "This link has expired. Request a new password verification link.";

type Answer = [number, unknown] | "unreachable";

/**
 * The page first checks the link, then saves the password: each call gets its
 * own answer. Returns the mock so a test can read what was sent to each.
 */
function mockBackend(check: Answer, save: Answer = [200, LOGIN]) {
  const reply = (answer: Answer) =>
    answer === "unreachable"
      ? Promise.reject(new TypeError("Failed to fetch"))
      : Promise.resolve({
          ok: answer[0] >= 200 && answer[0] < 300,
          status: answer[0],
          json: async () => answer[1],
        });
  const fetchMock = jest.fn<Promise<unknown>, [string, RequestInit?]>((url) =>
    reply(url.endsWith("/auth/check-reset-link") ? check : save),
  );
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

const saveCalls = (fetchMock: jest.Mock) =>
  fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/auth/reset-password"));

async function submit(password: string, confirm: string) {
  const user = setupUser();
  render(<ResetPasswordForm />);
  await user.type(await screen.findByLabelText("Password"), password);
  await user.type(screen.getByLabelText("Confirm password"), confirm);
  await user.click(screen.getByRole("button", { name: "Save new password" }));
}

beforeEach(() => localStorage.clear());

describe("ResetPasswordForm", () => {
  it("says an expired link has expired before asking for a password", async () => {
    setLocation("?token=old&callbackUrl=%2Fpersonas");
    const fetchMock = mockBackend([400, { detail: "invalid_or_expired_token" }]);
    render(<ResetPasswordForm />);

    expect(await screen.findByText(EXPIRED)).toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).toBeNull();
    // No address in this link, so it can only go to the forgot password page
    expect(
      screen.getByRole("link", { name: "Send reset link" }),
    ).toHaveAttribute("href", "/forgot-password?callbackUrl=%2Fpersonas");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ token: "old" });
  });

  it("sends a new reset link straight away to the address the link carries", async () => {
    setLocation("?token=old&email=a%40b.co&callbackUrl=%2Fpersonas");
    const fetchMock = mockBackend(
      [400, { detail: "invalid_or_expired_token" }],
      [202, { status: "sent" }],
    );
    const user = setupUser();
    render(<ResetPasswordForm />);

    await user.click(await screen.findByRole("button", { name: "Send reset link" }));
    expect(await screen.findByText("Reset email sent")).toBeInTheDocument();
    expect(
      screen.getByText(fullText("We sent a new link to a@b.co. Click it to choose a new password.")),
    ).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toMatch(/\/auth\/forgot-password$/);
    expect(JSON.parse(String(init?.body))).toEqual({ email: "a@b.co", next: "/personas" });
  });

  it("says so and keeps the button when sending a new link fails", async () => {
    setLocation("?token=old&email=a%40b.co");
    mockBackend([400, { detail: "invalid_or_expired_token" }], [500, {}]);
    const user = setupUser();
    render(<ResetPasswordForm />);

    await user.click(await screen.findByRole("button", { name: "Send reset link" }));
    expect(
      await screen.findByText("Could not send a new link. Please try again."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send reset link" })).toBeEnabled();
  });

  it("says when sending a new link cannot reach the server", async () => {
    setLocation("?token=old&email=a%40b.co");
    mockBackend([400, { detail: "invalid_or_expired_token" }], "unreachable");
    const user = setupUser();
    render(<ResetPasswordForm />);

    await user.click(await screen.findByRole("button", { name: "Send reset link" }));
    expect(
      await screen.findByText("Unable to connect to server. Please try again later."),
    ).toBeInTheDocument();
  });

  it("says the same for an address with no token, and asks nothing", async () => {
    setLocation("");
    const fetchMock = mockBackend([200, { valid: true }]);
    render(<ResetPasswordForm />);
    expect(await screen.findByText(EXPIRED)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still shows the boxes when the check cannot reach the server", async () => {
    setLocation("?token=tok");
    mockBackend("unreachable");
    render(<ResetPasswordForm />);
    expect(await screen.findByLabelText("Password")).toBeInTheDocument();
  });

  it("refuses a password under 6 characters without saving", async () => {
    setLocation("?token=tok");
    const fetchMock = mockBackend([200, { valid: true }]);
    await submit("abc", "abc");
    expect(
      screen.getByText("Password must be at least 6 characters"),
    ).toBeInTheDocument();
    expect(saveCalls(fetchMock)).toHaveLength(0);
  });

  it("refuses two passwords that do not match", async () => {
    setLocation("?token=tok");
    const fetchMock = mockBackend([200, { valid: true }]);
    await submit("secret1", "secret2");
    expect(screen.getByText("Passwords do not match")).toBeInTheDocument();
    expect(saveCalls(fetchMock)).toHaveLength(0);
  });

  it("has the signup page's eye button to show the password", async () => {
    setLocation("?token=tok");
    mockBackend([200, { valid: true }]);
    const user = setupUser();
    render(<ResetPasswordForm />);
    const box = await screen.findByLabelText("Password");
    expect(box).toHaveAttribute("type", "password");
    await user.click(screen.getAllByRole("button", { name: "Show password" })[0]);
    expect(box).toHaveAttribute("type", "text");
  });

  it("saves the password, keeps the login and goes to the wanted page", async () => {
    setLocation("?token=tok&callbackUrl=%2Fpersonas");
    const fetchMock = mockBackend([200, { valid: true }]);
    await submit("secret1", "secret1");
    await waitFor(() => expect(window.location.href).toBe("/personas"));
    expect(JSON.parse(String(saveCalls(fetchMock)[0][1]?.body))).toEqual({
      token: "tok",
      password: "secret1",
    });
    expect(localStorage.getItem("access_token")).toBe("jwt-123");
  });

  it("says the link has expired when it runs out while the page is open", async () => {
    setLocation("?token=tok");
    mockBackend([200, { valid: true }], [400, { detail: "invalid_or_expired_token" }]);
    await submit("secret1", "secret1");
    expect(await screen.findByText(EXPIRED)).toBeInTheDocument();
  });

  it("shows the length rule when the backend refuses the password", async () => {
    setLocation("?token=tok");
    mockBackend([200, { valid: true }], [422, { detail: [] }]);
    await submit("secret1", "secret1");
    expect(
      await screen.findByText("Password must be at least 6 characters"),
    ).toBeInTheDocument();
  });

  it("says when saving fails for another reason", async () => {
    setLocation("?token=tok");
    mockBackend([200, { valid: true }], [500, {}]);
    await submit("secret1", "secret1");
    expect(
      await screen.findByText("Could not save the new password. Please try again."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save new password" })).toBeEnabled();
  });

  it("says when saving cannot reach the server", async () => {
    setLocation("?token=tok");
    mockBackend([200, { valid: true }], "unreachable");
    await submit("secret1", "secret1");
    expect(
      await screen.findByText("Unable to connect to server. Please try again later."),
    ).toBeInTheDocument();
  });
});
