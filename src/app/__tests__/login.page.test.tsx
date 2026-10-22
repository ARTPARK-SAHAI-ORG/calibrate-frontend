import { render, screen, setupUser } from "@/test-utils";
import { LOGIN, fakeBackend, sentBody, setLocation, fullText } from "@/test-utils/auth";
import { waitFor } from "@testing-library/react";
import LoginPage from "../login/page";

async function logIn() {
  const user = setupUser();
  render(<LoginPage />);
  await user.type(screen.getByLabelText("Email"), "asha@example.com");
  await user.type(screen.getByLabelText("Password"), "secret1");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

beforeEach(() => localStorage.clear());

describe("LoginPage", () => {
  it("says the email is not verified and a link went out", async () => {
    setLocation("");
    fakeBackend([403, { detail: "email_not_verified" }]);
    await logIn();

    expect(
      await screen.findByText(
        fullText("Your email is not verified yet. We sent a verification link to asha@example.com. Verify to sign in!"),
      ),
    ).toBeInTheDocument();
    expect(localStorage.getItem("access_token")).toBeNull();
  });

  it("links to the forgot password page, keeping the wanted page", () => {
    setLocation("?callbackUrl=%2Ftools");
    render(<LoginPage />);
    expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute(
      "href",
      "/forgot-password?callbackUrl=%2Ftools",
    );
  });

  it("signs in, sends the wanted page and goes there", async () => {
    setLocation("?callbackUrl=%2Ftools");
    const fetchMock = fakeBackend([200, LOGIN]);
    await logIn();

    await waitFor(() => expect(window.location.href).toBe("/tools"));
    expect(sentBody(fetchMock)).toEqual({
      email: "asha@example.com",
      password: "secret1",
      next: "/tools",
    });
    expect(localStorage.getItem("access_token")).toBe("jwt-123");
  });
});
