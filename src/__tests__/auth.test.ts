const nextAuthMock = jest.fn(() => ({
  handlers: {},
  signIn: jest.fn(),
  signOut: jest.fn(),
  auth: jest.fn(),
}));

jest.mock("next-auth", () => ({
  __esModule: true,
  default: (config: unknown) => nextAuthMock(config as never),
}));

jest.mock("next-auth/providers/google", () => ({
  __esModule: true,
  default: (options: unknown) => ({ id: "google", options }),
}));

describe("auth config", () => {
  it("sends failed sign-ins to our own login page, not NextAuth's error page", async () => {
    await import("@/auth");

    expect(nextAuthMock).toHaveBeenCalledTimes(1);
    const config = nextAuthMock.mock.calls[0][0] as unknown as {
      pages: { signIn: string; error: string };
    };

    expect(config.pages.signIn).toBe("/login");
    expect(config.pages.error).toBe("/login");
  });
});
