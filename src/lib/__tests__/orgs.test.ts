import {
  ACTIVE_ORG_UUID_KEY,
  ACTIVE_ORG_CHANGED_EVENT,
  ORGANIZATIONS_CHANGED_EVENT,
  notifyOrganizationsChanged,
  getActiveOrgUuid,
  setActiveOrgUuid,
  clearActiveOrgUuid,
  pickDefaultOrg,
  type Organization,
} from "@/lib/orgs";

const org = (overrides: Partial<Organization> = {}): Organization => ({
  uuid: "u1",
  name: "Org",
  is_personal: false,
  created_by_user_id: "user1",
  member_role: "owner",
  created_at: "2024-01-01",
  updated_at: "2024-01-01",
  ...overrides,
});

describe("notifyOrganizationsChanged", () => {
  it("dispatches ORGANIZATIONS_CHANGED_EVENT with the source in detail", () => {
    const listener = jest.fn();
    window.addEventListener(ORGANIZATIONS_CHANGED_EVENT, listener);
    const source = Symbol("test");
    notifyOrganizationsChanged(source);
    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toEqual({ source });
    window.removeEventListener(ORGANIZATIONS_CHANGED_EVENT, listener);
  });

  it("dispatches with an undefined source when none is given", () => {
    const listener = jest.fn();
    window.addEventListener(ORGANIZATIONS_CHANGED_EVENT, listener);
    notifyOrganizationsChanged();
    const event = listener.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toEqual({ source: undefined });
    window.removeEventListener(ORGANIZATIONS_CHANGED_EVENT, listener);
  });

  it("is a no-op when window is undefined", () => {
    const originalWindow = global.window;
    // @ts-expect-error simulate SSR
    delete global.window;
    expect(() => notifyOrganizationsChanged()).not.toThrow();
    global.window = originalWindow;
  });
});

describe("getActiveOrgUuid", () => {
  afterEach(() => {
    window.localStorage.clear();
    jest.restoreAllMocks();
  });

  it("returns null when nothing is stored", () => {
    expect(getActiveOrgUuid()).toBeNull();
  });

  it("returns the stored uuid", () => {
    window.localStorage.setItem(ACTIVE_ORG_UUID_KEY, "abc-123");
    expect(getActiveOrgUuid()).toBe("abc-123");
  });

  it("returns null when localStorage throws", () => {
    jest.spyOn(window.localStorage.__proto__, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(getActiveOrgUuid()).toBeNull();
  });

  it("returns null when window is undefined", () => {
    const originalWindow = global.window;
    // @ts-expect-error simulate SSR
    delete global.window;
    expect(getActiveOrgUuid()).toBeNull();
    global.window = originalWindow;
  });
});

describe("setActiveOrgUuid", () => {
  afterEach(() => {
    window.localStorage.clear();
    jest.restoreAllMocks();
  });

  it("stores the uuid and dispatches ACTIVE_ORG_CHANGED_EVENT", () => {
    const listener = jest.fn();
    window.addEventListener(ACTIVE_ORG_CHANGED_EVENT, listener);
    setActiveOrgUuid("abc-123");
    expect(window.localStorage.getItem(ACTIVE_ORG_UUID_KEY)).toBe("abc-123");
    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toEqual({ uuid: "abc-123" });
    window.removeEventListener(ACTIVE_ORG_CHANGED_EVENT, listener);
  });

  it("is a no-op when window is undefined", () => {
    const originalWindow = global.window;
    // @ts-expect-error simulate SSR
    delete global.window;
    expect(() => setActiveOrgUuid("x")).not.toThrow();
    global.window = originalWindow;
  });

  it("swallows localStorage errors", () => {
    jest.spyOn(window.localStorage.__proto__, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => setActiveOrgUuid("abc")).not.toThrow();
  });
});

describe("clearActiveOrgUuid", () => {
  afterEach(() => {
    window.localStorage.clear();
    jest.restoreAllMocks();
  });

  it("removes the uuid and dispatches with uuid: null", () => {
    window.localStorage.setItem(ACTIVE_ORG_UUID_KEY, "abc-123");
    const listener = jest.fn();
    window.addEventListener(ACTIVE_ORG_CHANGED_EVENT, listener);
    clearActiveOrgUuid();
    expect(window.localStorage.getItem(ACTIVE_ORG_UUID_KEY)).toBeNull();
    const event = listener.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toEqual({ uuid: null });
    window.removeEventListener(ACTIVE_ORG_CHANGED_EVENT, listener);
  });

  it("is a no-op when window is undefined", () => {
    const originalWindow = global.window;
    // @ts-expect-error simulate SSR
    delete global.window;
    expect(() => clearActiveOrgUuid()).not.toThrow();
    global.window = originalWindow;
  });

  it("swallows localStorage errors", () => {
    jest.spyOn(window.localStorage.__proto__, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => clearActiveOrgUuid()).not.toThrow();
  });
});

describe("pickDefaultOrg", () => {
  it("returns null for an empty list", () => {
    expect(pickDefaultOrg([])).toBeNull();
  });

  it("prefers the personal workspace", () => {
    const personal = org({ uuid: "p1", is_personal: true });
    const team = org({ uuid: "t1", is_personal: false });
    expect(pickDefaultOrg([team, personal])).toBe(personal);
  });

  it("falls back to the first entry when none is personal", () => {
    const a = org({ uuid: "a" });
    const b = org({ uuid: "b" });
    expect(pickDefaultOrg([a, b])).toBe(a);
  });
});
