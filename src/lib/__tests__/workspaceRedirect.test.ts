import {
  orgUuidFromErrorMessage,
  readOwningOrgUuid,
  switchToOwningWorkspace,
} from "@/lib/workspaceRedirect";
import { ACTIVE_ORG_UUID_KEY } from "@/lib/orgs";

/** Workspace ids are always uuids, so the tests use uuid-shaped ones. */
const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";

const replace = jest.fn();

/** Puts the page at an address, the way the browser would report it. */
function atAddress(pathname: string, search = "", hash = "") {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, pathname, search, hash, replace },
  });
}

beforeEach(() => {
  replace.mockClear();
  window.localStorage.clear();
  atAddress("/agents/agent-1");
});

describe("readOwningOrgUuid", () => {
  it("reads the owning workspace off a 404 body", () => {
    expect(
      readOwningOrgUuid({
        detail: "Agent not found",
        organization_uuid: ORG_B,
      }),
    ).toBe(ORG_B);
  });

  it("returns null when the field is absent, empty, or not a string", () => {
    expect(readOwningOrgUuid({ detail: "Agent not found" })).toBeNull();
    expect(readOwningOrgUuid({ organization_uuid: "   " })).toBeNull();
    expect(readOwningOrgUuid({ organization_uuid: 42 })).toBeNull();
  });

  it("returns null for non-object bodies", () => {
    expect(readOwningOrgUuid(null)).toBeNull();
    expect(readOwningOrgUuid("Not Found")).toBeNull();
    expect(readOwningOrgUuid(undefined)).toBeNull();
  });
});

describe("orgUuidFromErrorMessage", () => {
  it("reads the owning workspace out of an apiClient failure", () => {
    const err = new Error(
      `Request failed: 404 - {"detail":"Task not found","organization_uuid":"${ORG_B}"}`,
    );
    expect(orgUuidFromErrorMessage(err)).toBe(ORG_B);
  });

  it("returns null when the body is not JSON", () => {
    expect(
      orgUuidFromErrorMessage(new Error("Request failed: 404 - nope")),
    ).toBeNull();
  });

  it("returns null when the body names no workspace", () => {
    const err = new Error('Request failed: 404 - {"detail":"Task not found"}');
    expect(orgUuidFromErrorMessage(err)).toBeNull();
  });

  it("returns null for a message that is not an apiClient failure", () => {
    expect(orgUuidFromErrorMessage(new Error("network failure"))).toBeNull();
    expect(orgUuidFromErrorMessage("not an error")).toBeNull();
  });
});

describe("switchToOwningWorkspace", () => {
  it("opens the same page under the owning workspace, keeping the query", () => {
    atAddress(`/${ORG_A}/simulations/x`, "?tab=runs");

    expect(switchToOwningWorkspace(ORG_B)).toBe(true);
    expect(replace).toHaveBeenCalledWith(`/${ORG_B}/simulations/x?tab=runs`);
  });

  it("keeps the part of the address after the hash", () => {
    atAddress(`/${ORG_A}/tests`, "?testId=abc", "#results");

    expect(switchToOwningWorkspace(ORG_B)).toBe(true);
    expect(replace).toHaveBeenCalledWith(`/${ORG_B}/tests?testId=abc#results`);
  });

  it("does nothing when the address already names that workspace", () => {
    atAddress(`/${ORG_B}/simulations/x`, "?tab=runs");

    expect(switchToOwningWorkspace(ORG_B)).toBe(false);
    expect(replace).not.toHaveBeenCalled();
  });

  it("does nothing when the 404 names no workspace", () => {
    atAddress(`/${ORG_A}/agents/agent-1`);

    expect(switchToOwningWorkspace(null)).toBe(false);
    expect(replace).not.toHaveBeenCalled();
  });

  it("adds the workspace to an older link that names none", () => {
    atAddress("/agents/agent-1");

    expect(switchToOwningWorkspace(ORG_B)).toBe(true);
    expect(replace).toHaveBeenCalledWith(`/${ORG_B}/agents/agent-1`);
  });

  it("does not read a first part that is not a uuid as a workspace", () => {
    // "simulations" is a section, not a workspace, so the address gains one
    // instead of having it swapped out.
    atAddress("/simulations/x", "?tab=runs");

    expect(switchToOwningWorkspace(ORG_B)).toBe(true);
    expect(replace).toHaveBeenCalledWith(`/${ORG_B}/simulations/x?tab=runs`);
  });

  it("does nothing when an older link is already showing that workspace", () => {
    // No workspace in the address, so the one last opened is what the page is
    // showing. Moving to it would change nothing.
    atAddress("/agents/agent-1");
    window.localStorage.setItem(ACTIVE_ORG_UUID_KEY, ORG_B);

    expect(switchToOwningWorkspace(ORG_B)).toBe(false);
    expect(replace).not.toHaveBeenCalled();
  });
});
