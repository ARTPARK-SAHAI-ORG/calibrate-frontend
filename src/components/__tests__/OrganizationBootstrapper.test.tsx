import { render, waitFor } from "@/test-utils";
import { OrganizationBootstrapper } from "../OrganizationBootstrapper";

const useAuthMock = jest.fn();
const fetchOrganizationsDedupMock = jest.fn();
const getActiveOrgUuidMock = jest.fn();
const pickDefaultOrgMock = jest.fn();
const setActiveOrgUuidMock = jest.fn();
const installOrgFetchInterceptorMock = jest.fn();

jest.mock("../../hooks", () => ({
  __esModule: true,
  useAuth: () => useAuthMock(),
}));

jest.mock("../../hooks/useOrganizations", () => ({
  __esModule: true,
  fetchOrganizationsDedup: (...args: unknown[]) =>
    fetchOrganizationsDedupMock(...args),
}));

jest.mock("../../lib/orgs", () => ({
  __esModule: true,
  getActiveOrgUuid: () => getActiveOrgUuidMock(),
  pickDefaultOrg: (...args: unknown[]) => pickDefaultOrgMock(...args),
  setActiveOrgUuid: (...args: unknown[]) => setActiveOrgUuidMock(...args),
}));

jest.mock("../../lib/fetchInterceptor", () => ({
  __esModule: true,
  installOrgFetchInterceptor: () => installOrgFetchInterceptorMock(),
}));

describe("OrganizationBootstrapper", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getActiveOrgUuidMock.mockReturnValue(null);
  });

  it("renders nothing and installs the fetch interceptor", () => {
    useAuthMock.mockReturnValue({ accessToken: null, isAuthenticated: false });
    const { container } = render(<OrganizationBootstrapper />);
    expect(container).toBeEmptyDOMElement();
    expect(installOrgFetchInterceptorMock).toHaveBeenCalledTimes(1);
  });

  it("does nothing when not authenticated", async () => {
    useAuthMock.mockReturnValue({ accessToken: null, isAuthenticated: false });
    render(<OrganizationBootstrapper />);
    await waitFor(() => {
      expect(fetchOrganizationsDedupMock).not.toHaveBeenCalled();
    });
  });

  it("does nothing when authenticated but there is already an active org", async () => {
    useAuthMock.mockReturnValue({
      accessToken: "token-1",
      isAuthenticated: true,
    });
    getActiveOrgUuidMock.mockReturnValue("existing-org");
    render(<OrganizationBootstrapper />);
    await waitFor(() => {
      expect(fetchOrganizationsDedupMock).not.toHaveBeenCalled();
    });
  });

  it("fetches organizations and sets the active org when none is set", async () => {
    useAuthMock.mockReturnValue({
      accessToken: "token-1",
      isAuthenticated: true,
    });
    const orgs = [{ uuid: "org-1", is_personal: true }];
    fetchOrganizationsDedupMock.mockResolvedValue(orgs);
    pickDefaultOrgMock.mockReturnValue(orgs[0]);

    render(<OrganizationBootstrapper />);

    await waitFor(() => {
      expect(fetchOrganizationsDedupMock).toHaveBeenCalledWith("token-1");
    });
    await waitFor(() => {
      expect(setActiveOrgUuidMock).toHaveBeenCalledWith("org-1");
    });
  });

  it("does not set an active org when fetch returns null (non-fatal)", async () => {
    useAuthMock.mockReturnValue({
      accessToken: "token-1",
      isAuthenticated: true,
    });
    fetchOrganizationsDedupMock.mockResolvedValue(null);

    render(<OrganizationBootstrapper />);

    await waitFor(() => {
      expect(fetchOrganizationsDedupMock).toHaveBeenCalledWith("token-1");
    });
    expect(setActiveOrgUuidMock).not.toHaveBeenCalled();
  });

  it("does not set an active org when pickDefaultOrg returns null (empty list)", async () => {
    useAuthMock.mockReturnValue({
      accessToken: "token-1",
      isAuthenticated: true,
    });
    fetchOrganizationsDedupMock.mockResolvedValue([]);
    pickDefaultOrgMock.mockReturnValue(null);

    render(<OrganizationBootstrapper />);

    await waitFor(() => {
      expect(fetchOrganizationsDedupMock).toHaveBeenCalledWith("token-1");
    });
    expect(setActiveOrgUuidMock).not.toHaveBeenCalled();
  });

  it("skips a re-entrant fetch when the effect re-runs while a fetch is already in flight", async () => {
    let resolveFetch: (v: unknown) => void;
    fetchOrganizationsDedupMock.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );
    useAuthMock.mockReturnValue({
      accessToken: "token-1",
      isAuthenticated: true,
    });

    const { rerender } = render(<OrganizationBootstrapper />);
    expect(fetchOrganizationsDedupMock).toHaveBeenCalledTimes(1);

    // Change the access token while the first fetch is still pending: the
    // effect re-runs (deps changed) but `hasFetchedRef.current` is already
    // true, so the guard at the top of the effect should skip a second call.
    useAuthMock.mockReturnValue({
      accessToken: "token-2",
      isAuthenticated: true,
    });
    rerender(<OrganizationBootstrapper />);

    expect(fetchOrganizationsDedupMock).toHaveBeenCalledTimes(1);

    resolveFetch!([]);
    await waitFor(() => expect(fetchOrganizationsDedupMock).toHaveBeenCalledTimes(1));
  });

  it("does not refetch twice across rerenders with the same token", async () => {
    useAuthMock.mockReturnValue({
      accessToken: "token-1",
      isAuthenticated: true,
    });
    fetchOrganizationsDedupMock.mockResolvedValue([]);
    pickDefaultOrgMock.mockReturnValue(null);

    const { rerender } = render(<OrganizationBootstrapper />);
    await waitFor(() => {
      expect(fetchOrganizationsDedupMock).toHaveBeenCalledTimes(1);
    });

    rerender(<OrganizationBootstrapper />);
    await waitFor(() => {
      expect(fetchOrganizationsDedupMock).toHaveBeenCalledTimes(1);
    });
  });
});
