import { act, renderHook } from "@testing-library/react";
import { useTicketDensity } from "../useTicketDensity";

const KEY = "calibrate:ticket-density";

describe("useTicketDensity", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => jest.restoreAllMocks());

  it("starts comfortable when nothing is saved", () => {
    const { result } = renderHook(() => useTicketDensity());
    expect(result.current[0]).toBe("comfortable");
  });

  it("starts from the saved choice", () => {
    window.localStorage.setItem(KEY, "compact");
    const { result } = renderHook(() => useTicketDensity());
    expect(result.current[0]).toBe("compact");
  });

  it("ignores a saved value that is not one of the choices", () => {
    window.localStorage.setItem(KEY, "tiny");
    const { result } = renderHook(() => useTicketDensity());
    expect(result.current[0]).toBe("comfortable");
  });

  it("saves every change", () => {
    const { result } = renderHook(() => useTicketDensity());
    act(() => result.current[1]("compact"));
    expect(result.current[0]).toBe("compact");
    expect(window.localStorage.getItem(KEY)).toBe("compact");
    act(() => result.current[1]("comfortable"));
    expect(window.localStorage.getItem(KEY)).toBe("comfortable");
  });

  it("falls back to comfortable when the browser blocks reading saved data", () => {
    jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useTicketDensity());
    expect(result.current[0]).toBe("comfortable");
  });

  it("still applies a choice when the browser blocks saving it", () => {
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useTicketDensity());
    act(() => result.current[1]("compact"));
    expect(result.current[0]).toBe("compact");
  });
});
