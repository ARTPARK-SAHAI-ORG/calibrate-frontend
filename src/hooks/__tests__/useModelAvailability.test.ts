import { renderHook } from "@testing-library/react";
import { useModelAvailability } from "@/hooks/useModelAvailability";

const mockModels = jest.fn();
jest.mock("../useOpenRouterModels", () => ({
  useOpenRouterModels: () => mockModels(),
}));
const mockOwnKeys = jest.fn();
jest.mock("../useOrgLimits", () => ({
  useUsesOwnProviderKeysIfKnown: () => mockOwnKeys(),
}));

const availability = {
  models: new Map([["a/x", { expiresOn: null }]]),
  privacyAllowed: new Set(["a/x"]),
};

describe("useModelAvailability", () => {
  it("passes the list through for a workspace on the server's keys", () => {
    mockModels.mockReturnValue({ availability });
    mockOwnKeys.mockReturnValue(false);
    const { result } = renderHook(() => useModelAvailability());
    expect(result.current).toBe(availability);
  });

  it("drops the privacy list for a workspace on its own keys", () => {
    mockModels.mockReturnValue({ availability });
    mockOwnKeys.mockReturnValue(true);
    const { result } = renderHook(() => useModelAvailability());
    expect(result.current).toEqual({
      models: availability.models,
      privacyAllowed: null,
    });
  });

  it("drops the privacy list when someone else's server calls the model", () => {
    mockModels.mockReturnValue({ availability });
    mockOwnKeys.mockReturnValue(false);
    const { result } = renderHook(() => useModelAvailability(false));
    expect(result.current).toEqual({
      models: availability.models,
      privacyAllowed: null,
    });
  });

  it("drops the privacy list while the workspace's keys are not known yet", () => {
    mockModels.mockReturnValue({ availability });
    mockOwnKeys.mockReturnValue(null);
    const { result } = renderHook(() => useModelAvailability());
    expect(result.current).toEqual({
      models: availability.models,
      privacyAllowed: null,
    });
  });

  it("is null while the list is loading", () => {
    mockModels.mockReturnValue({ availability: null });
    mockOwnKeys.mockReturnValue(true);
    const { result } = renderHook(() => useModelAvailability());
    expect(result.current).toBeNull();
  });
});
