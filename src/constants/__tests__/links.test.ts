// Documentation links come from DOCS_URL; these cover no setting and a
// trailing slash, the two ways it went wrong.

function loadLinks(docsUrl?: string) {
  jest.resetModules();
  const original = process.env.NEXT_PUBLIC_DOCS_URL;
  if (docsUrl === undefined) {
    delete process.env.NEXT_PUBLIC_DOCS_URL;
  } else {
    process.env.NEXT_PUBLIC_DOCS_URL = docsUrl;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const links = require("../links") as typeof import("../links");
  process.env.NEXT_PUBLIC_DOCS_URL = original;
  return links;
}

describe("DOCS_URL", () => {
  it("falls back to the hosted docs when nothing is configured", () => {
    const { DOCS_URL } = loadLinks(undefined);
    expect(DOCS_URL).toBe("https://docs.calibrate.artpark.ai");
  });

  it("uses a configured docs site", () => {
    const { DOCS_URL } = loadLinks("https://docs.example.com");
    expect(DOCS_URL).toBe("https://docs.example.com");
  });

  it("drops a trailing slash so joined addresses do not double up", () => {
    const { DOCS_URL, AGENT_CONNECTIONS_DOCS_URL } = loadLinks(
      "https://docs.example.com/",
    );
    expect(DOCS_URL).toBe("https://docs.example.com");
    expect(AGENT_CONNECTIONS_DOCS_URL).toBe(
      "https://docs.example.com/core-concepts/agent-connections",
    );
  });
});
