import {
  DEFAULT_POST_LOGIN_PATH,
  loginPathAfterSignOut,
  nextForBackend,
  postLoginPath,
  safeCallbackUrl,
  storeLoginAndRedirect,
  withCallback,
} from "../postLoginRedirect";

describe("safeCallbackUrl", () => {
  it("keeps a path on this site, including its query and hash", () => {
    expect(safeCallbackUrl("/simulations/abc/runs/xyz?scores=1#top")).toBe(
      "/simulations/abc/runs/xyz?scores=1#top"
    );
  });

  it("falls back to the default when nothing was asked for", () => {
    expect(safeCallbackUrl(null)).toBe(DEFAULT_POST_LOGIN_PATH);
    expect(safeCallbackUrl(undefined)).toBe(DEFAULT_POST_LOGIN_PATH);
    expect(safeCallbackUrl("")).toBe(DEFAULT_POST_LOGIN_PATH);
  });

  it("refuses anything that points at another site", () => {
    expect(safeCallbackUrl("https://evil.example/steal")).toBe(
      DEFAULT_POST_LOGIN_PATH
    );
    expect(safeCallbackUrl("//evil.example/steal")).toBe(
      DEFAULT_POST_LOGIN_PATH
    );
    expect(safeCallbackUrl("/\\evil.example/steal")).toBe(
      DEFAULT_POST_LOGIN_PATH
    );
    expect(safeCallbackUrl("agents")).toBe(DEFAULT_POST_LOGIN_PATH);
  });

  it("refuses a path hiding another site behind a tab or line break", () => {
    // Browsers drop these characters, turning the value into "//other-site".
    expect(safeCallbackUrl("/\t/evil.example/steal")).toBe(
      DEFAULT_POST_LOGIN_PATH
    );
    expect(safeCallbackUrl("/\n/evil.example/steal")).toBe(
      DEFAULT_POST_LOGIN_PATH
    );
    expect(safeCallbackUrl("/\r/evil.example/steal")).toBe(
      DEFAULT_POST_LOGIN_PATH
    );
    expect(safeCallbackUrl("/\\\\evil.example/steal")).toBe(
      DEFAULT_POST_LOGIN_PATH
    );
  });

  it("refuses the login page even when a tab is hidden in it", () => {
    expect(safeCallbackUrl("/lo\tgin")).toBe(DEFAULT_POST_LOGIN_PATH);
  });

  it("refuses the login and signup pages so signing in cannot loop", () => {
    expect(safeCallbackUrl("/login")).toBe(DEFAULT_POST_LOGIN_PATH);
    expect(safeCallbackUrl("/signup?callbackUrl=%2Flogin")).toBe(
      DEFAULT_POST_LOGIN_PATH
    );
  });
});

describe("postLoginPath", () => {
  it("reads the wanted page out of the query string", () => {
    expect(postLoginPath("?callbackUrl=%2Ftools%3Fq%3Dweb")).toBe(
      "/tools?q=web"
    );
  });

  it("uses the default when the query string has no wanted page", () => {
    expect(postLoginPath("")).toBe(DEFAULT_POST_LOGIN_PATH);
    expect(postLoginPath("?other=1")).toBe(DEFAULT_POST_LOGIN_PATH);
  });
});

describe("withCallback", () => {
  it("carries the wanted page onto the other auth page", () => {
    expect(withCallback("/signup", "?callbackUrl=%2Ftools%3Fq%3Dweb")).toBe(
      "/signup?callbackUrl=%2Ftools%3Fq%3Dweb"
    );
  });

  it("leaves the link alone when there is nothing to carry", () => {
    expect(withCallback("/signup", "")).toBe("/signup");
  });
});

describe("the opening page as a destination", () => {
  it("refuses to send someone back to the opening page", () => {
    expect(safeCallbackUrl("/opening?to=%2Fopening")).toBe("/agents");
  });
});

describe("loginPathAfterSignOut", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("carries the page they were on", () => {
    window.history.replaceState(null, "", "/invite/tok-123");
    expect(loginPathAfterSignOut()).toBe(
      `/login?callbackUrl=${encodeURIComponent("/invite/tok-123")}`,
    );
  });

  it("keeps the query with it", () => {
    window.history.replaceState(null, "", "/tests?testId=abc");
    expect(loginPathAfterSignOut()).toBe(
      `/login?callbackUrl=${encodeURIComponent("/tests?testId=abc")}`,
    );
  });

  it("does not point back at sign-in itself", () => {
    window.history.replaceState(null, "", "/login");
    expect(loginPathAfterSignOut()).toBe(
      `/login?callbackUrl=${encodeURIComponent("/agents")}`,
    );
  });
});

describe("the pages opened from an account email", () => {
  it.each(["/verify-email?token=a", "/forgot-password", "/reset-password?token=a"])(
    "never sends someone back to %s after signing in",
    (path) => {
      expect(safeCallbackUrl(path)).toBe(DEFAULT_POST_LOGIN_PATH);
    },
  );
});

describe("nextForBackend", () => {
  it("hands over the safe wanted page", () => {
    expect(nextForBackend("?callbackUrl=%2Ftools%3Fq%3Dweb")).toBe("/tools?q=web");
  });

  it("swaps a page on another site for the default", () => {
    expect(nextForBackend("?callbackUrl=https%3A%2F%2Fevil.example")).toBe(
      DEFAULT_POST_LOGIN_PATH,
    );
  });

  it("leaves it out when the address names no page", () => {
    expect(nextForBackend("")).toBeUndefined();
  });
});

describe("storeLoginAndRedirect", () => {
  const original = window.location;
  afterEach(() => {
    Object.defineProperty(window, "location", { configurable: true, value: original });
    localStorage.clear();
  });

  it("keeps the login in storage and the cookie, then goes to the wanted page", () => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { href: "" },
    });
    storeLoginAndRedirect(
      { access_token: "jwt-1", user: { email: "a@b.co" } },
      "?callbackUrl=%2Fpersonas",
    );
    expect(localStorage.getItem("access_token")).toBe("jwt-1");
    expect(localStorage.getItem("user")).toBe('{"email":"a@b.co"}');
    expect(document.cookie).toContain("access_token=jwt-1");
    expect(window.location.href).toBe("/personas");
  });
});
