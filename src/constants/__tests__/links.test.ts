/**
 * Every documentation link in the app is built from DOCS_URL, so a self-hosted
 * copy can point them at its own docs site with one setting. These check the
 * two ways that goes wrong: no setting at all, and a setting with a trailing
 * slash, which used to put two slashes in the middle of every address.
 */

const DOCS_MODULE = "../links";

function loadLinks(docsUrl?: string) {
  jest.resetModules();
  const original = process.env.NEXT_PUBLIC_DOCS_URL;
  if (docsUrl === undefined) {
    delete process.env.NEXT_PUBLIC_DOCS_URL;
  } else {
    process.env.NEXT_PUBLIC_DOCS_URL = docsUrl;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const links = require(DOCS_MODULE) as typeof import("../links");
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

describe("AGENT_CONNECTIONS_DOCS_URL", () => {
  it("points at the agent connections page of the configured docs site", () => {
    const { AGENT_CONNECTIONS_DOCS_URL } = loadLinks(undefined);
    expect(AGENT_CONNECTIONS_DOCS_URL).toBe(
      "https://docs.calibrate.artpark.ai/core-concepts/agent-connections",
    );
  });
});
