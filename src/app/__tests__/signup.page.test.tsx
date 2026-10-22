import { render, screen, setupUser } from "@/test-utils";
import { LOGIN, fakeBackend, sentBody, setLocation, fullText } from "@/test-utils/auth";
import { waitFor } from "@testing-library/react";
import SignupPage from "../signup/page";

async function signUp() {
  const user = setupUser();
  render(<SignupPage />);
  await user.type(screen.getByLabelText("First name"), "Asha");
  await user.type(screen.getByLabelText("Last name"), "Rao");
  await user.type(screen.getByLabelText("Email"), "asha@example.com");
  await user.type(screen.getByLabelText("Password"), "secret1");
  await user.type(screen.getByLabelText("Confirm password"), "secret1");
  await user.click(screen.getByRole("button", { name: "Create account" }));
}

beforeEach(() => localStorage.clear());

describe("SignupPage", () => {
  it("asks the person to check their email when the backend sends a link", async () => {
    setLocation("?callbackUrl=%2Ftools");
    const fetchMock = fakeBackend([202, {
      status: "verification_sent",
      email: "asha@example.com",
      already_pending: false,
    }]);
    await signUp();

    expect(await screen.findByText("Check your email")).toBeInTheDocument();
    expect(
      screen.getByText(
        fullText("We sent a link to asha@example.com. Click it to verify your email, then you can sign in."),
      ),
    ).toBeInTheDocument();
    // Only the text: nothing to click until the email link is opened
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    expect(sentBody(fetchMock).next).toBe("/tools");
    expect(localStorage.getItem("access_token")).toBeNull();
    expect(window.location.href).toBe("");
  });

  it("says the account is waiting on its email when it already exists", async () => {
    setLocation("");
    const fetchMock = fakeBackend([202, {
      status: "verification_sent",
      email: "asha@example.com",
      already_pending: true,
    }]);
    await signUp();

    expect(
      await screen.findByText(
        fullText("This email already has an account that is not verified yet. We sent a link to asha@example.com. Click it to verify your email, then you can sign in."),
      ),
    ).toBeInTheDocument();
    expect(sentBody(fetchMock)).not.toHaveProperty("next");
  });

  it("still signs in straight away when the backend returns a login", async () => {
    setLocation("?callbackUrl=%2Ftools");
    fakeBackend([200, LOGIN]);
    await signUp();

    await waitFor(() => expect(window.location.href).toBe("/tools"));
    expect(localStorage.getItem("access_token")).toBe("jwt-123");
    expect(document.cookie).toContain("access_token=jwt-123");
  });
});
