import { render, screen, setupUser } from "@/test-utils";
import { LOGIN, mockFetchOnce, sentBody, setLocation } from "@/test-utils/auth";
import { waitFor } from "@testing-library/react";
import { ResetPasswordForm } from "../ResetPasswordForm";

async function submit(password: string, confirm: string) {
  const user = setupUser();
  render(<ResetPasswordForm />);
  await user.type(screen.getByLabelText("New password"), password);
  await user.type(screen.getByLabelText("Confirm password"), confirm);
  await user.click(screen.getByRole("button", { name: "Save new password" }));
}

beforeEach(() => localStorage.clear());

describe("ResetPasswordForm", () => {
  it("refuses a password under 6 characters without asking the backend", async () => {
    setLocation("?token=tok");
    const fetchMock = mockFetchOnce(200, LOGIN);
    await submit("abc", "abc");
    expect(
      screen.getByText("Password must be at least 6 characters"),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses two passwords that do not match", async () => {
    setLocation("?token=tok");
    const fetchMock = mockFetchOnce(200, LOGIN);
    await submit("secret1", "secret2");
    expect(screen.getByText("Passwords do not match")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("saves the password, keeps the login and goes to the wanted page", async () => {
    setLocation("?token=tok&callbackUrl=%2Fpersonas");
    const fetchMock = mockFetchOnce(200, LOGIN);
    await submit("secret1", "secret1");
    await waitFor(() => expect(window.location.href).toBe("/personas"));
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/auth\/reset-password$/);
    expect(sentBody(fetchMock)).toEqual({ token: "tok", password: "secret1" });
    expect(localStorage.getItem("access_token")).toBe("jwt-123");
  });

  it("says the link is used up and offers a new one", async () => {
    setLocation("?token=old&callbackUrl=%2Fpersonas");
    mockFetchOnce(400, { detail: "invalid_or_expired_token" });
    await submit("secret1", "secret1");
    expect(
      await screen.findByText("This link has expired or was already used."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Get a new reset link" }),
    ).toHaveAttribute("href", "/forgot-password?callbackUrl=%2Fpersonas");
  });

  it("treats an address with no token as a used link", async () => {
    setLocation("");
    const fetchMock = mockFetchOnce(200, LOGIN);
    await submit("secret1", "secret1");
    expect(
      await screen.findByText("This link has expired or was already used."),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the length rule when the backend refuses the password", async () => {
    setLocation("?token=tok");
    mockFetchOnce(422, { detail: [] });
    await submit("secret1", "secret1");
    expect(
      await screen.findByText("Password must be at least 6 characters"),
    ).toBeInTheDocument();
  });

  it("says when saving fails for another reason", async () => {
    setLocation("?token=tok");
    mockFetchOnce(500);
    await submit("secret1", "secret1");
    expect(
      await screen.findByText("Could not save the new password. Please try again."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save new password" })).toBeEnabled();
  });

  it("says when the server cannot be reached", async () => {
    setLocation("?token=tok");
    global.fetch = jest.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await submit("secret1", "secret1");
    expect(
      await screen.findByText("Unable to connect to server. Please try again later."),
    ).toBeInTheDocument();
  });
});
