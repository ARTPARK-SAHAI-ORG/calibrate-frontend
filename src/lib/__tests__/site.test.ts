import { CANONICAL_HOST, isCanonicalHost } from "@/lib/site";

describe("isCanonicalHost", () => {
  it("accepts the address the site is meant to be found at", () => {
    expect(isCanonicalHost(CANONICAL_HOST)).toBe(true);
  });

  it("ignores a port, so a local server on the same name still counts", () => {
    expect(isCanonicalHost(`${CANONICAL_HOST}:3000`)).toBe(true);
  });

  it("ignores capitals, since a browser may send any mix of them", () => {
    expect(isCanonicalHost(CANONICAL_HOST.toUpperCase())).toBe(true);
  });

  it("rejects a copy of the site on someone else's address", () => {
    expect(isCanonicalHost("calibrate.learning.org.ai")).toBe(false);
  });

  it("rejects a preview build", () => {
    expect(isCanonicalHost("calibrate-frontend-git-main.vercel.app")).toBe(
      false
    );
  });

  it("rejects an address that only ends with ours", () => {
    expect(isCanonicalHost(`not-${CANONICAL_HOST}`)).toBe(false);
    expect(isCanonicalHost(`staging.${CANONICAL_HOST}`)).toBe(false);
  });

  it("rejects a request that carries no address at all", () => {
    expect(isCanonicalHost(null)).toBe(false);
    expect(isCanonicalHost(undefined)).toBe(false);
    expect(isCanonicalHost("")).toBe(false);
  });
});
