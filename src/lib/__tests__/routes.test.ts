import {
  HOME_PATH,
  isPublicPath,
  landingPathAfterSwitch,
  orgFromPath,
  splitWorkspace,
  withWorkspace,
} from "@/lib/routes";

const ORG = "8f3c1a2b-4d5e-4f6a-8b9c-0d1e2f3a4b5c";
const OTHER = "11111111-2222-4333-8444-555555555555";

describe("splitWorkspace", () => {
  it("pulls the workspace off the front", () => {
    expect(splitWorkspace(`/${ORG}/agents`)).toEqual({
      org: ORG,
      path: "/agents",
    });
  });

  it("keeps the rest of a deep address intact", () => {
    expect(splitWorkspace(`/${ORG}/simulations/abc/runs/def`)).toEqual({
      org: ORG,
      path: "/simulations/abc/runs/def",
    });
  });

  it("reads a workspace on its own as the home of that workspace", () => {
    expect(splitWorkspace(`/${ORG}`)).toEqual({ org: ORG, path: "/" });
  });

  it("reports no workspace for an address that names none", () => {
    expect(splitWorkspace("/agents")).toEqual({ org: null, path: "/agents" });
    expect(splitWorkspace("/")).toEqual({ org: null, path: "/" });
  });

  it("does not mistake a section name for a workspace", () => {
    expect(orgFromPath("/human-alignment/tasks/abc")).toBeNull();
  });

  it("is not fooled by something uuid-shaped further along", () => {
    expect(orgFromPath(`/agents/${ORG}`)).toBeNull();
  });

  it("reads an upper case workspace id back in lower case, so it still matches", () => {
    expect(orgFromPath(`/${ORG.toUpperCase()}/agents`)).toBe(ORG);
  });
});

describe("isPublicPath", () => {
  it.each([
    "/",
    "/login",
    "/signup",
    "/public/test-run/tok",
    "/annotate-job/tok",
    "/api/auth/session",
    "/terms",
    "/privacy",
    "/changelog",
  ])("treats %s as public", (path) => {
    expect(isPublicPath(path)).toBe(true);
  });

  it.each([
    "/login?callbackUrl=%2Fagents",
    "/login#top",
    "/signup?callbackUrl=%2Ftests%3Ftab%3Druns",
    "/public/stt/tok?x=1",
    "/?ref=email",
    "/#open-source",
  ])("still treats %s as public with a query or a section on it", (path) => {
    expect(isPublicPath(path)).toBe(true);
  });

  it("leaves a link to a spot on the home page alone", () => {
    expect(withWorkspace("/#open-source", "abc")).toBe("/#open-source");
  });

  it.each(["/agents", "/tests", "/workspace-settings", "/publications"])(
    "treats %s as needing a workspace",
    (path) => {
      expect(isPublicPath(path)).toBe(false);
    },
  );
});

describe("withWorkspace", () => {
  it("puts the workspace in front", () => {
    expect(withWorkspace("/agents", ORG)).toBe(`/${ORG}/agents`);
  });

  it("keeps the query and the section on the address", () => {
    expect(withWorkspace("/tests?tab=runs", ORG)).toBe(
      `/${ORG}/tests?tab=runs`,
    );
  });

  it("leaves an address that already names a workspace alone", () => {
    expect(withWorkspace(`/${OTHER}/agents`, ORG)).toBe(`/${OTHER}/agents`);
  });

  it("leaves public addresses alone", () => {
    expect(withWorkspace("/login", ORG)).toBe("/login");
    expect(withWorkspace("/public/stt/tok", ORG)).toBe("/public/stt/tok");
  });

  it("leaves a public address alone when it carries a query", () => {
    expect(withWorkspace("/login?callbackUrl=%2Fagents", ORG)).toBe(
      "/login?callbackUrl=%2Fagents",
    );
  });

  it("reads a workspace on its own carrying a query", () => {
    expect(splitWorkspace(`/${ORG}?tab=runs`)).toEqual({
      org: ORG,
      path: "/?tab=runs",
    });
    expect(withWorkspace(`/${ORG}?tab=runs`, OTHER)).toBe(`/${ORG}?tab=runs`);
  });

  it("does nothing when there is no workspace", () => {
    expect(withWorkspace("/agents", null)).toBe("/agents");
  });

  it("leaves anything that is not a page on this site alone", () => {
    expect(withWorkspace("https://example.com/agents", ORG)).toBe(
      "https://example.com/agents",
    );
    expect(withWorkspace("#top", ORG)).toBe("#top");
  });
});

describe("landingPathAfterSwitch", () => {
  it("stays in the same section", () => {
    expect(landingPathAfterSwitch("/simulations/abc/runs/def")).toBe(
      "/simulations",
    );
    expect(landingPathAfterSwitch("/tools")).toBe("/tools");
  });

  it("stays on workspace settings", () => {
    expect(landingPathAfterSwitch("/workspace-settings")).toBe(
      "/workspace-settings",
    );
  });

  it("falls back to the agents page for a section with no list page", () => {
    expect(landingPathAfterSwitch("/datasets/abc")).toBe(HOME_PATH);
    expect(landingPathAfterSwitch("/")).toBe(HOME_PATH);
  });
});
