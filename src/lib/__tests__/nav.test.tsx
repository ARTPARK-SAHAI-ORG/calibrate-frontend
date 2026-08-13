import { render, screen } from "@testing-library/react";
import { renderHook } from "@testing-library/react";

const push = jest.fn();
const replace = jest.fn();
const prefetch = jest.fn();
let pathname = "/";

jest.mock("next/navigation", () => ({
  __esModule: true,
  useRouter: () => ({ push, replace, prefetch, back: jest.fn() }),
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: jest.fn(),
  notFound: jest.fn(),
}));

import { Link, replaceUrl, useOrgUuid, usePathname, useRouter } from "@/lib/nav";

const ORG = "8f3c1a2b-4d5e-4f6a-8b9c-0d1e2f3a4b5c";

beforeEach(() => {
  pathname = "/";
  push.mockClear();
  replace.mockClear();
  prefetch.mockClear();
  window.history.replaceState(null, "", "/");
});

describe("inside a workspace", () => {
  beforeEach(() => {
    pathname = `/${ORG}/simulations/abc`;
  });

  it("reads the workspace off the address", () => {
    expect(renderHook(() => useOrgUuid()).result.current).toBe(ORG);
  });

  it("hides the workspace from the page", () => {
    expect(renderHook(() => usePathname()).result.current).toBe(
      "/simulations/abc",
    );
  });

  it("adds the workspace to every page the app moves to", () => {
    const { result } = renderHook(() => useRouter());
    result.current.push("/agents");
    result.current.replace("/tests?tab=runs", { scroll: false });
    result.current.prefetch("/tools");
    expect(push).toHaveBeenCalledWith(`/${ORG}/agents`);
    expect(replace).toHaveBeenCalledWith(`/${ORG}/tests?tab=runs`, {
      scroll: false,
    });
    expect(prefetch).toHaveBeenCalledWith(`/${ORG}/tools`);
  });

  it("leaves sign-in and shared links out of the workspace", () => {
    const { result } = renderHook(() => useRouter());
    result.current.push("/login");
    expect(push).toHaveBeenCalledWith("/login");
  });

  it("adds the workspace to a link", () => {
    render(<Link href="/evaluators/xyz">Open</Link>);
    expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute(
      "href",
      `/${ORG}/evaluators/xyz`,
    );
  });

  it("writes the workspace into an address the page rewrites itself", () => {
    window.history.replaceState(null, "", `/${ORG}/tests`);
    replaceUrl("/tests?tab=runs");
    expect(window.location.pathname + window.location.search).toBe(
      `/${ORG}/tests?tab=runs`,
    );
  });
});

describe("outside a workspace", () => {
  it("reports no workspace and changes nothing", () => {
    pathname = "/login";
    expect(renderHook(() => useOrgUuid()).result.current).toBeNull();
    expect(renderHook(() => usePathname()).result.current).toBe("/login");

    const { result } = renderHook(() => useRouter());
    result.current.push("/agents");
    expect(push).toHaveBeenCalledWith("/agents");
  });

  it("leaves a link alone", () => {
    pathname = "/";
    render(<Link href="/signup">Join</Link>);
    expect(screen.getByRole("link", { name: "Join" })).toHaveAttribute(
      "href",
      "/signup",
    );
  });
});
