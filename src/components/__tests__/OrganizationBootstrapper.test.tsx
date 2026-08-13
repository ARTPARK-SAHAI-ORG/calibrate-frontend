import { render } from "@/test-utils";
import { OrganizationBootstrapper } from "../OrganizationBootstrapper";

const installOrgFetchInterceptorMock = jest.fn();

jest.mock("../../lib/fetchInterceptor", () => ({
  __esModule: true,
  installOrgFetchInterceptor: () => installOrgFetchInterceptorMock(),
}));

describe("OrganizationBootstrapper", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("puts nothing on the page and starts sending the workspace with requests", () => {
    const { container } = render(<OrganizationBootstrapper />);
    expect(container).toBeEmptyDOMElement();
    expect(installOrgFetchInterceptorMock).toHaveBeenCalledTimes(1);
  });

  it("starts it once, however many times the page redraws", () => {
    const { rerender } = render(<OrganizationBootstrapper />);
    rerender(<OrganizationBootstrapper />);
    rerender(<OrganizationBootstrapper />);
    expect(installOrgFetchInterceptorMock).toHaveBeenCalledTimes(1);
  });
});
