import {
  orgUuidFromErrorMessage,
  readOwningOrgUuid,
  switchToOwningWorkspace,
} from "@/lib/workspaceRedirect";
import { ACTIVE_ORG_UUID_KEY } from "@/lib/orgs";

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
    window.localStorage.setItem(ACTIVE_ORG_UUID_KEY, "org-current");

    expect(switchToOwningWorkspace("org-other")).toBe(true);
    expect(window.localStorage.getItem(ACTIVE_ORG_UUID_KEY)).toBe("org-other");
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does nothing when there is no owning workspace", () => {
    expect(switchToOwningWorkspace(null)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("does not reload when the workspace is already active", () => {
    window.localStorage.setItem(ACTIVE_ORG_UUID_KEY, "org-current");

    expect(switchToOwningWorkspace("org-current")).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("switches only once for the same page in one tab", () => {
    window.localStorage.setItem(ACTIVE_ORG_UUID_KEY, "org-current");
    expect(switchToOwningWorkspace("org-other")).toBe(true);

    // Another tab put its own workspace back; this page must not reload again.
    window.localStorage.setItem(ACTIVE_ORG_UUID_KEY, "org-current");
    expect(switchToOwningWorkspace("org-other")).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("still switches for a different page in the same tab", () => {
    window.localStorage.setItem(ACTIVE_ORG_UUID_KEY, "org-current");
    expect(switchToOwningWorkspace("org-other")).toBe(true);

    window.location.pathname = "/simulations/other-uuid";
    window.localStorage.setItem(ACTIVE_ORG_UUID_KEY, "org-current");
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
    window.localStorage.setItem(ACTIVE_ORG_UUID_KEY, "org-current");

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
