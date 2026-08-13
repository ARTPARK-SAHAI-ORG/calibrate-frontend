import {
  orgUuidFromErrorMessage,
  readOwningOrgUuid,
  switchToOwningWorkspace,
} from "@/lib/workspaceRedirect";
import {
  ACTIVE_ORG_CHANGED_EVENT,
  ACTIVE_ORG_UUID_KEY,
  setActiveOrgUuid,
} from "@/lib/orgs";

const reload = jest.fn();

beforeAll(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, pathname: "/agents/agent-1", reload },
  });
});

beforeEach(() => {
  window.location.pathname = "/agents/agent-1";
  reload.mockClear();
  window.localStorage.clear();
  window.sessionStorage.clear();
  // Reset what this tab believes the workspace to be, the same way a real
  // workspace change tells it.
  window.dispatchEvent(new CustomEvent(ACTIVE_ORG_CHANGED_EVENT));
});

describe("readOwningOrgUuid", () => {
  it("reads the owning workspace off a 404 body", () => {
    expect(
      readOwningOrgUuid({ detail: "Agent not found", organization_uuid: "org-1" }),
    ).toBe("org-1");
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
      'Request failed: 404 - {"detail":"Task not found","organization_uuid":"org-2"}',
    );
    expect(orgUuidFromErrorMessage(err)).toBe("org-2");
  });

  it("returns null when the body is not JSON", () => {
    expect(orgUuidFromErrorMessage(new Error("Request failed: 404 - nope"))).toBeNull();
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
  it("saves the workspace and reloads", () => {
    setActiveOrgUuid("org-current");

    expect(switchToOwningWorkspace("org-other")).toBe(true);
    expect(window.localStorage.getItem(ACTIVE_ORG_UUID_KEY)).toBe("org-other");
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does nothing when there is no owning workspace", () => {
    expect(switchToOwningWorkspace(null)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("does not reload when the workspace is already active", () => {
    setActiveOrgUuid("org-current");

    expect(switchToOwningWorkspace("org-current")).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("leaves a workspace another tab picked after this page loaded", () => {
    setActiveOrgUuid("org-current");
    // Another tab writes the shared setting. No change event reaches this tab,
    // which is how we know the choice was made somewhere else.
    window.localStorage.setItem(ACTIVE_ORG_UUID_KEY, "org-from-other-tab");

    expect(switchToOwningWorkspace("org-current")).toBe(false);
    expect(window.localStorage.getItem(ACTIVE_ORG_UUID_KEY)).toBe(
      "org-from-other-tab",
    );
    expect(reload).not.toHaveBeenCalled();
  });

  it("switches on a first load, before any workspace is known", () => {
    expect(switchToOwningWorkspace("org-other")).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("keeps saying yes to the other requests on a page that is already switching", () => {
    setActiveOrgUuid("org-current");
    // A page makes several requests, so more than one can come back with the
    // same 404 before the page reloads. Every one of them has to be told the
    // switch is happening, or the page shows "Not Found" while it waits.
    expect(switchToOwningWorkspace("org-other")).toBe(true);
    expect(switchToOwningWorkspace("org-other")).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not switch the same page twice out of the same workspace", () => {
    setActiveOrgUuid("org-current");
    expect(switchToOwningWorkspace("org-other")).toBe(true);

    // The reload landed in org-other and the page 404s again, this time
    // naming a third workspace. Following that would bounce forever.
    setActiveOrgUuid("org-other");
    expect(switchToOwningWorkspace("org-third")).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("switches again for the same page from a different workspace", () => {
    setActiveOrgUuid("org-current");
    expect(switchToOwningWorkspace("org-other")).toBe(true);

    // Later the user is back in the workspace they started from and opens the
    // same link again. It has to work, not read "Not Found".
    setActiveOrgUuid("org-current");
    expect(switchToOwningWorkspace("org-other")).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("still switches for a different page in the same tab", () => {
    setActiveOrgUuid("org-current");
    expect(switchToOwningWorkspace("org-other")).toBe(true);

    window.location.pathname = "/simulations/other-uuid";
    setActiveOrgUuid("org-current");
    expect(switchToOwningWorkspace("org-other")).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("still switches when the per-tab record is unavailable", () => {
    const sessionStorage = window.sessionStorage;
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error("storage disabled");
        },
        setItem: () => {
          throw new Error("storage disabled");
        },
      },
    });
    setActiveOrgUuid("org-current");

    expect(switchToOwningWorkspace("org-other")).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);

    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: sessionStorage,
    });
  });

  it("does not reload when the workspace could not be saved", () => {
    const setItem = jest
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("storage disabled");
      });

    expect(switchToOwningWorkspace("org-other")).toBe(false);
    expect(reload).not.toHaveBeenCalled();

    setItem.mockRestore();
  });
});
