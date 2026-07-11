import { renderHook, act, waitFor } from "@testing-library/react";
import { useCrudResource, useFetchResource } from "@/hooks/useCrudResource";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";

jest.mock("../../lib/api", () => ({
  apiGet: jest.fn(),
  apiPost: jest.fn(),
  apiPut: jest.fn(),
  apiDelete: jest.fn(),
}));

jest.mock("../../lib/reportError", () => ({
  reportError: jest.fn(),
}));

const mockApiGet = apiGet as jest.Mock;
const mockApiPost = apiPost as jest.Mock;
const mockApiPut = apiPut as jest.Mock;
const mockApiDelete = apiDelete as jest.Mock;

type Item = { uuid: string; name: string };

describe("useCrudResource", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not fetch when accessToken is missing", async () => {
    const { result } = renderHook(() =>
      useCrudResource<Item>({ endpoint: "/things", accessToken: undefined })
    );

    // isLoading starts true (default state) but fetchItems bails immediately
    expect(mockApiGet).not.toHaveBeenCalled();
    expect(result.current.items).toEqual([]);
  });

  it("does not fetch when enabled is false", async () => {
    renderHook(() =>
      useCrudResource<Item>({
        endpoint: "/things",
        accessToken: "tok",
        enabled: false,
      })
    );

    expect(mockApiGet).not.toHaveBeenCalled();
  });

  it("fetches items successfully on mount", async () => {
    const items: Item[] = [{ uuid: "1", name: "a" }];
    mockApiGet.mockResolvedValueOnce(items);

    const { result } = renderHook(() =>
      useCrudResource<Item>({ endpoint: "/things", accessToken: "tok" })
    );

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockApiGet).toHaveBeenCalledWith("/things", "tok");
    expect(result.current.items).toEqual(items);
    expect(result.current.error).toBeNull();
  });

  it("sets error state (Error instance) when fetch fails", async () => {
    mockApiGet.mockRejectedValueOnce(new Error("boom"));

    const { result } = renderHook(() =>
      useCrudResource<Item>({ endpoint: "/things", accessToken: "tok" })
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe("boom");
  });

  it("sets generic error message when fetch fails with non-Error", async () => {
    mockApiGet.mockRejectedValueOnce("some string error");

    const { result } = renderHook(() =>
      useCrudResource<Item>({ endpoint: "/things", accessToken: "tok" })
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe("Failed to load data");
  });

  it("refetch triggers another apiGet call", async () => {
    mockApiGet.mockResolvedValue([]);

    const { result } = renderHook(() =>
      useCrudResource<Item>({ endpoint: "/things", accessToken: "tok" })
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockApiGet).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.refetch();
    });

    expect(mockApiGet).toHaveBeenCalledTimes(2);
  });

  describe("create", () => {
    it("returns null and does not call apiPost when accessToken missing", async () => {
      const { result } = renderHook(() =>
        useCrudResource<Item>({ endpoint: "/things", accessToken: undefined })
      );

      let created: Item | null = null;
      await act(async () => {
        created = await result.current.create({ name: "x" });
      });

      expect(created).toBeNull();
      expect(mockApiPost).not.toHaveBeenCalled();
    });

    it("creates an item successfully and refetches", async () => {
      mockApiGet.mockResolvedValue([]);
      const newItem: Item = { uuid: "2", name: "new" };
      mockApiPost.mockResolvedValueOnce(newItem);

      const { result } = renderHook(() =>
        useCrudResource<Item>({ endpoint: "/things", accessToken: "tok" })
      );

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let created: Item | null = null;
      await act(async () => {
        created = await result.current.create({ name: "new" });
      });

      expect(created).toEqual(newItem);
      expect(mockApiPost).toHaveBeenCalledWith("/things", "tok", { name: "new" });
      // fetchItems called once on mount + once after create
      expect(mockApiGet).toHaveBeenCalledTimes(2);
      expect(result.current.isCreating).toBe(false);
      expect(result.current.createError).toBeNull();
    });

    it("sets createError (Error instance) when create fails", async () => {
      mockApiGet.mockResolvedValue([]);
      mockApiPost.mockRejectedValueOnce(new Error("create failed"));

      const { result } = renderHook(() =>
        useCrudResource<Item>({ endpoint: "/things", accessToken: "tok" })
      );
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let created: Item | null = null;
      await act(async () => {
        created = await result.current.create({ name: "new" });
      });

      expect(created).toBeNull();
      expect(result.current.createError).toBe("create failed");
    });

    it("sets generic createError when create fails with non-Error", async () => {
      mockApiGet.mockResolvedValue([]);
      mockApiPost.mockRejectedValueOnce("oops");

      const { result } = renderHook(() =>
        useCrudResource<Item>({ endpoint: "/things", accessToken: "tok" })
      );
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.create({ name: "new" });
      });

      expect(result.current.createError).toBe("Failed to create");
    });
  });

  describe("update", () => {
    it("returns null and does not call apiPut when accessToken missing", async () => {
      const { result } = renderHook(() =>
        useCrudResource<Item>({ endpoint: "/things", accessToken: undefined })
      );

      let updated: Item | null = null;
      await act(async () => {
        updated = await result.current.update("1", { name: "y" });
      });

      expect(updated).toBeNull();
      expect(mockApiPut).not.toHaveBeenCalled();
    });

    it("updates an item successfully and refetches", async () => {
      mockApiGet.mockResolvedValue([]);
      const updatedItem: Item = { uuid: "1", name: "updated" };
      mockApiPut.mockResolvedValueOnce(updatedItem);

      const { result } = renderHook(() =>
        useCrudResource<Item>({ endpoint: "/things", accessToken: "tok" })
      );
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let updated: Item | null = null;
      await act(async () => {
        updated = await result.current.update("1", { name: "updated" });
      });

      expect(updated).toEqual(updatedItem);
      expect(mockApiPut).toHaveBeenCalledWith("/things/1", "tok", { name: "updated" });
      expect(mockApiGet).toHaveBeenCalledTimes(2);
      expect(result.current.isUpdating).toBe(false);
    });

    it("sets createError (Error instance) when update fails", async () => {
      mockApiGet.mockResolvedValue([]);
      mockApiPut.mockRejectedValueOnce(new Error("update failed"));

      const { result } = renderHook(() =>
        useCrudResource<Item>({ endpoint: "/things", accessToken: "tok" })
      );
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let updated: Item | null = null;
      await act(async () => {
        updated = await result.current.update("1", { name: "x" });
      });

      expect(updated).toBeNull();
      expect(result.current.createError).toBe("update failed");
    });

    it("sets generic createError when update fails with non-Error", async () => {
      mockApiGet.mockResolvedValue([]);
      mockApiPut.mockRejectedValueOnce("oops");

      const { result } = renderHook(() =>
        useCrudResource<Item>({ endpoint: "/things", accessToken: "tok" })
      );
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.update("1", { name: "x" });
      });

      expect(result.current.createError).toBe("Failed to update");
    });
  });

  describe("remove", () => {
    it("returns false and does not call apiDelete when accessToken missing", async () => {
      const { result } = renderHook(() =>
        useCrudResource<Item>({ endpoint: "/things", accessToken: undefined })
      );

      let success = true;
      await act(async () => {
        success = await result.current.remove("1");
      });

      expect(success).toBe(false);
      expect(mockApiDelete).not.toHaveBeenCalled();
    });

    it("removes an item optimistically on success", async () => {
      const items: Item[] = [
        { uuid: "1", name: "a" },
        { uuid: "2", name: "b" },
      ];
      mockApiGet.mockResolvedValueOnce(items);
      mockApiDelete.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() =>
        useCrudResource<Item>({ endpoint: "/things", accessToken: "tok" })
      );
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.items).toHaveLength(2);

      let success = false;
      await act(async () => {
        success = await result.current.remove("1");
      });

      expect(success).toBe(true);
      expect(mockApiDelete).toHaveBeenCalledWith("/things/1", "tok");
      expect(result.current.items).toEqual([{ uuid: "2", name: "b" }]);
      expect(result.current.isDeleting).toBe(false);
    });

    it("returns false when delete fails", async () => {
      mockApiGet.mockResolvedValueOnce([{ uuid: "1", name: "a" }]);
      mockApiDelete.mockRejectedValueOnce(new Error("delete failed"));

      const { result } = renderHook(() =>
        useCrudResource<Item>({ endpoint: "/things", accessToken: "tok" })
      );
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let success = true;
      await act(async () => {
        success = await result.current.remove("1");
      });

      expect(success).toBe(false);
      // items unchanged since delete failed before filtering
      expect(result.current.items).toEqual([{ uuid: "1", name: "a" }]);
    });
  });

  it("clearErrors resets error and createError", async () => {
    mockApiGet.mockRejectedValueOnce(new Error("boom"));
    mockApiPost.mockRejectedValueOnce(new Error("create failed"));

    const { result } = renderHook(() =>
      useCrudResource<Item>({ endpoint: "/things", accessToken: "tok" })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe("boom");

    await act(async () => {
      await result.current.create({ name: "x" });
    });
    expect(result.current.createError).toBe("create failed");

    act(() => {
      result.current.clearErrors();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.createError).toBeNull();
  });

  it("setItems allows direct manipulation of items", async () => {
    mockApiGet.mockResolvedValueOnce([]);

    const { result } = renderHook(() =>
      useCrudResource<Item>({ endpoint: "/things", accessToken: "tok" })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.setItems([{ uuid: "9", name: "manual" }]);
    });

    expect(result.current.items).toEqual([{ uuid: "9", name: "manual" }]);
  });
});

describe("useFetchResource", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not fetch when accessToken is missing", () => {
    const { result } = renderHook(() =>
      useFetchResource<Item>({ endpoint: "/things", accessToken: undefined, id: "1" })
    );

    expect(mockApiGet).not.toHaveBeenCalled();
    expect(result.current.data).toBeNull();
  });

  it("does not fetch when id is null", () => {
    renderHook(() =>
      useFetchResource<Item>({ endpoint: "/things", accessToken: "tok", id: null })
    );

    expect(mockApiGet).not.toHaveBeenCalled();
  });

  it("does not fetch when enabled is false", () => {
    renderHook(() =>
      useFetchResource<Item>({
        endpoint: "/things",
        accessToken: "tok",
        id: "1",
        enabled: false,
      })
    );

    expect(mockApiGet).not.toHaveBeenCalled();
  });

  it("fetches a single resource successfully", async () => {
    const item: Item = { uuid: "1", name: "a" };
    mockApiGet.mockResolvedValueOnce(item);

    const { result } = renderHook(() =>
      useFetchResource<Item>({ endpoint: "/things", accessToken: "tok", id: "1" })
    );

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockApiGet).toHaveBeenCalledWith("/things/1", "tok");
    expect(result.current.data).toEqual(item);
    expect(result.current.error).toBeNull();
  });

  it("sets error (Error instance) when fetch fails", async () => {
    mockApiGet.mockRejectedValueOnce(new Error("single failed"));

    const { result } = renderHook(() =>
      useFetchResource<Item>({ endpoint: "/things", accessToken: "tok", id: "1" })
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe("single failed");
    expect(result.current.data).toBeNull();
  });

  it("sets generic error when fetch fails with non-Error", async () => {
    mockApiGet.mockRejectedValueOnce("bad");

    const { result } = renderHook(() =>
      useFetchResource<Item>({ endpoint: "/things", accessToken: "tok", id: "1" })
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe("Failed to load");
  });

  it("refetch triggers another apiGet call and setData allows manual override", async () => {
    const item: Item = { uuid: "1", name: "a" };
    mockApiGet.mockResolvedValue(item);

    const { result } = renderHook(() =>
      useFetchResource<Item>({ endpoint: "/things", accessToken: "tok", id: "1" })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockApiGet).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.refetch();
    });
    expect(mockApiGet).toHaveBeenCalledTimes(2);

    act(() => {
      result.current.setData({ uuid: "2", name: "manual" });
    });
    expect(result.current.data).toEqual({ uuid: "2", name: "manual" });
  });
});
