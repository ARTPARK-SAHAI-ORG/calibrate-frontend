// Use a relative specifier here (not the "@/" alias): next/jest's SWC
// transform rewrites "@/..." to relative paths only in import/export
// declarations, not in arbitrary string arguments like jest.mock()'s first
// argument. Jest mocks are keyed by the resolved absolute file path though,
// so a relative specifier here still intercepts the "@/lib/orgs" import.
jest.mock("../orgs", () => ({
  getActiveOrgUuid: jest.fn(),
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
  const [fetchInterceptorModule, orgsModule] = await Promise.all([
    import("../fetchInterceptor"),
    import("../orgs"),
  ]);
  return {
    installOrgFetchInterceptor: fetchInterceptorModule.installOrgFetchInterceptor,
    getActiveOrgUuid: orgsModule.getActiveOrgUuid as jest.Mock,
  };
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
