// Use a relative specifier here (not the "@/" alias): next/jest's SWC
// transform rewrites "@/..." to relative paths only in import/export
// declarations, not in arbitrary string arguments like jest.mock()'s first
// argument. Jest mocks are keyed by the resolved absolute file path though,
// so a relative specifier here still intercepts the "@/lib/orgs" import.
jest.mock("../orgs", () => ({
  getActiveOrgUuid: jest.fn(),
}));

jest.mock("../workspaceRedirect", () => ({
  readOwningOrgUuid: jest.requireActual("../workspaceRedirect")
    .readOwningOrgUuid,
  switchToOwningWorkspace: jest.fn(),
}));

const ORIGINAL_ENV = process.env.NEXT_PUBLIC_BACKEND_URL;

/**
 * Each test needs a fresh module instance of fetchInterceptor (its
 * `installed` flag is module-level state) *and* the matching instance of the
 * mocked `../orgs` module it pulls in, so `jest.resetModules()` is called per
 * test and both modules are re-imported together from the same fresh
 * registry — importing `orgs` separately via the top-level static import
 * would bind to a stale pre-reset instance.
 */
async function freshModules() {
  const [fetchInterceptorModule, orgsModule, redirectModule] =
    await Promise.all([
      import("../fetchInterceptor"),
      import("../orgs"),
      import("../workspaceRedirect"),
    ]);
  return {
    installOrgFetchInterceptor: fetchInterceptorModule.installOrgFetchInterceptor,
    getActiveOrgUuid: orgsModule.getActiveOrgUuid as jest.Mock,
    switchToOwningWorkspace: redirectModule.switchToOwningWorkspace as jest.Mock,
  };
}

/** Let the interceptor's un-awaited body read settle. */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** A 404 whose body is read through `.clone()`, as the interceptor does. */
function notFoundResponse(body: unknown): Response {
  const response = {
    status: 404,
    clone: () => ({ json: async () => body }),
  };
  return response as unknown as Response;
}

describe("installOrgFetchInterceptor", () => {
  let originalFetch: typeof window.fetch;

  beforeEach(() => {
    jest.resetModules();
    process.env.NEXT_PUBLIC_BACKEND_URL = "http://backend.test";
    originalFetch = window.fetch;
    window.fetch = jest.fn().mockResolvedValue({ ok: true } as Response);
  });

  afterEach(() => {
    window.fetch = originalFetch;
    process.env.NEXT_PUBLIC_BACKEND_URL = ORIGINAL_ENV;
    jest.restoreAllMocks();
  });

  it("is a no-op when window is undefined (SSR)", async () => {
    const { installOrgFetchInterceptor } = await freshModules();
    const originalWindow = global.window;
    // @ts-expect-error simulate SSR
    delete global.window;
    expect(() => installOrgFetchInterceptor()).not.toThrow();
    global.window = originalWindow;
  });

  it("is a no-op when backend URL is not configured", async () => {
    delete process.env.NEXT_PUBLIC_BACKEND_URL;
    const { installOrgFetchInterceptor } = await freshModules();
    const before = window.fetch;
    installOrgFetchInterceptor();
    expect(window.fetch).toBe(before);
  });

  it("installs only once even if called multiple times", async () => {
    const { installOrgFetchInterceptor } = await freshModules();
    installOrgFetchInterceptor();
    const patched = window.fetch;
    installOrgFetchInterceptor();
    expect(window.fetch).toBe(patched);
  });

  it("passes through requests that don't target the backend unmodified", async () => {
    const { installOrgFetchInterceptor, getActiveOrgUuid } = await freshModules();
    getActiveOrgUuid.mockReturnValue(null);
    const original = window.fetch;
    installOrgFetchInterceptor();
    await window.fetch("http://other.test/x");
    expect(original).toHaveBeenCalledWith("http://other.test/x", undefined);
  });

  it("passes through /organizations requests without adding X-Org-UUID", async () => {
    const { installOrgFetchInterceptor, getActiveOrgUuid } = await freshModules();
    getActiveOrgUuid.mockReturnValue("org-1");
    const original = window.fetch;
    installOrgFetchInterceptor();
    await window.fetch("http://backend.test/organizations");
    expect(original).toHaveBeenCalledWith("http://backend.test/organizations", undefined);
  });

  it("passes through unmodified when no active org uuid is set", async () => {
    const { installOrgFetchInterceptor, getActiveOrgUuid } = await freshModules();
    getActiveOrgUuid.mockReturnValue(null);
    const original = window.fetch;
    installOrgFetchInterceptor();
    await window.fetch("http://backend.test/agents");
    expect(original).toHaveBeenCalledWith("http://backend.test/agents", undefined);
  });

  it("adds X-Org-UUID header when an active org is set", async () => {
    const { installOrgFetchInterceptor, getActiveOrgUuid } = await freshModules();
    getActiveOrgUuid.mockReturnValue("org-1");
    const original = window.fetch;
    installOrgFetchInterceptor();
    await window.fetch("http://backend.test/agents", { method: "GET" });
    const [, init] = (original as jest.Mock).mock.calls[0];
    const headers = new Headers(init.headers);
    expect(headers.get("X-Org-UUID")).toBe("org-1");
  });

  it("does not clobber an existing X-Org-UUID header", async () => {
    const { installOrgFetchInterceptor, getActiveOrgUuid } = await freshModules();
    getActiveOrgUuid.mockReturnValue("org-1");
    const original = window.fetch;
    installOrgFetchInterceptor();
    await window.fetch("http://backend.test/agents", {
      headers: { "X-Org-UUID": "explicit-org" },
    });
    const [, init] = (original as jest.Mock).mock.calls[0];
    const headers = new Headers(init.headers);
    expect(headers.get("X-Org-UUID")).toBe("explicit-org");
  });

  it("handles a URL instance as input", async () => {
    const { installOrgFetchInterceptor, getActiveOrgUuid } = await freshModules();
    getActiveOrgUuid.mockReturnValue("org-1");
    const original = window.fetch;
    installOrgFetchInterceptor();
    await window.fetch(new URL("http://backend.test/agents"));
    const [calledInput] = (original as jest.Mock).mock.calls[0];
    expect(calledInput).toBeInstanceOf(URL);
  });

  it("switches workspaces when a 404 names another workspace of the user's", async () => {
    const { installOrgFetchInterceptor, getActiveOrgUuid, switchToOwningWorkspace } =
      await freshModules();
    getActiveOrgUuid.mockReturnValue("org-1");
    (window.fetch as jest.Mock).mockResolvedValue(
      notFoundResponse({ detail: "Agent not found", organization_uuid: "org-2" }),
    );
    installOrgFetchInterceptor();

    await window.fetch("http://backend.test/agent-tools/agent/abc/tools");

    await flushMicrotasks();
    expect(switchToOwningWorkspace).toHaveBeenCalledWith("org-2");
  });

  it("leaves a plain 404 alone", async () => {
    const { installOrgFetchInterceptor, getActiveOrgUuid, switchToOwningWorkspace } =
      await freshModules();
    getActiveOrgUuid.mockReturnValue("org-1");
    (window.fetch as jest.Mock).mockResolvedValue(
      notFoundResponse({ detail: "Agent not found" }),
    );
    installOrgFetchInterceptor();

    await window.fetch("http://backend.test/agents/abc");

    await flushMicrotasks();
    expect(switchToOwningWorkspace).not.toHaveBeenCalled();
  });

  it("returns the response untouched when its body is not readable", async () => {
    const { installOrgFetchInterceptor, getActiveOrgUuid, switchToOwningWorkspace } =
      await freshModules();
    getActiveOrgUuid.mockReturnValue("org-1");
    const broken = {
      status: 404,
      clone: () => ({
        json: async () => {
          throw new Error("not json");
        },
      }),
    } as unknown as Response;
    (window.fetch as jest.Mock).mockResolvedValue(broken);
    installOrgFetchInterceptor();

    await expect(
      window.fetch("http://backend.test/agents/abc"),
    ).resolves.toBe(broken);
    await flushMicrotasks();
    expect(switchToOwningWorkspace).not.toHaveBeenCalled();
  });

  it("does not read the body of a successful response", async () => {
    const { installOrgFetchInterceptor, getActiveOrgUuid, switchToOwningWorkspace } =
      await freshModules();
    getActiveOrgUuid.mockReturnValue("org-1");
    const clone = jest.fn();
    (window.fetch as jest.Mock).mockResolvedValue({
      status: 200,
      clone,
    } as unknown as Response);
    installOrgFetchInterceptor();

    await window.fetch("http://backend.test/agents");

    expect(clone).not.toHaveBeenCalled();
    expect(switchToOwningWorkspace).not.toHaveBeenCalled();
  });

  it("handles a Request-like object (non-string, non-URL) input via its .url", async () => {
    const { installOrgFetchInterceptor, getActiveOrgUuid } = await freshModules();
    getActiveOrgUuid.mockReturnValue("org-1");
    const original = window.fetch;
    installOrgFetchInterceptor();
    const requestLike = { url: "http://backend.test/agents" } as unknown as Request;
    await window.fetch(requestLike);
    const [calledInput] = (original as jest.Mock).mock.calls[0];
    expect(calledInput).toBe(requestLike);
  });
});
