import {
  DEFAULT_POST_LOGIN_PATH,
  postLoginPath,
  safeCallbackUrl,
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
