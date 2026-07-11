// See parseBackendError.test.ts for why a relative specifier is used here.
jest.mock("../api", () => ({
  apiGet: jest.fn(),
  apiPost: jest.fn(),
  apiDelete: jest.fn(),
  apiClient: jest.fn(),
}));

import { apiGet, apiPost, apiDelete, apiClient } from "@/lib/api";
import {
  listDatasets,
  createDataset,
  getDataset,
  renameDataset,
  deleteDataset,
  addDatasetItems,
  updateDatasetItem,
  deleteDatasetItem,
  MAX_ITEMS_PER_REQUEST,
  type DatasetItem,
} from "@/lib/datasets";

const token = "token-123";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("listDatasets", () => {
  it("calls apiGet without a query when no type given", async () => {
    (apiGet as jest.Mock).mockResolvedValue([]);
    await listDatasets(token);
    expect(apiGet).toHaveBeenCalledWith("/datasets", token);
  });

  it("appends dataset_type filter when given", async () => {
    (apiGet as jest.Mock).mockResolvedValue([]);
    await listDatasets(token, "stt");
    expect(apiGet).toHaveBeenCalledWith("/datasets?dataset_type=stt", token);
  });
});

describe("createDataset", () => {
  it("posts name and dataset_type", async () => {
    (apiPost as jest.Mock).mockResolvedValue({ uuid: "d1" });
    await createDataset(token, "My Dataset", "tts");
    expect(apiPost).toHaveBeenCalledWith("/datasets", token, {
      name: "My Dataset",
      dataset_type: "tts",
    });
  });
});

describe("getDataset", () => {
  it("gets the dataset by id", async () => {
    (apiGet as jest.Mock).mockResolvedValue({ uuid: "d1" });
    await getDataset(token, "d1");
    expect(apiGet).toHaveBeenCalledWith("/datasets/d1", token);
  });
});

describe("renameDataset", () => {
  it("PATCHes the name via apiClient", async () => {
    (apiClient as jest.Mock).mockResolvedValue({ uuid: "d1", name: "New" });
    await renameDataset(token, "d1", "New");
    expect(apiClient).toHaveBeenCalledWith("/datasets/d1", token, {
      method: "PATCH",
      body: { name: "New" },
    });
  });
});

describe("deleteDataset", () => {
  it("deletes the dataset", async () => {
    (apiDelete as jest.Mock).mockResolvedValue(undefined);
    await deleteDataset(token, "d1");
    expect(apiDelete).toHaveBeenCalledWith("/datasets/d1", token);
  });
});

describe("addDatasetItems", () => {
  it("sends a single request when items fit under the cap", async () => {
    (apiPost as jest.Mock).mockResolvedValue([{ uuid: "i1" }]);
    const items = [{ audio_path: "a.wav", text: "hi" }];
    const result = await addDatasetItems(token, "d1", items);
    expect(apiPost).toHaveBeenCalledTimes(1);
    expect(apiPost).toHaveBeenCalledWith("/datasets/d1/items", token, items);
    expect(result).toEqual([{ uuid: "i1" }]);
  });

  it("batches items exceeding MAX_ITEMS_PER_REQUEST sequentially", async () => {
    const total = MAX_ITEMS_PER_REQUEST + 5;
    const items = Array.from({ length: total }, (_, i) => ({ text: `t${i}` }));
    let call = 0;
    (apiPost as jest.Mock).mockImplementation(async (_endpoint, _token, batch) => {
      call += 1;
      return (batch as unknown[]).map((_, i) => ({
        uuid: `batch${call}-${i}`,
      })) as DatasetItem[];
    });
    const result = await addDatasetItems(token, "d1", items);
    expect(apiPost).toHaveBeenCalledTimes(2);
    expect((apiPost as jest.Mock).mock.calls[0][2]).toHaveLength(MAX_ITEMS_PER_REQUEST);
    expect((apiPost as jest.Mock).mock.calls[1][2]).toHaveLength(5);
    expect(result).toHaveLength(total);
  });

  it("sends exactly one batch when item count equals the cap", async () => {
    const items = Array.from({ length: MAX_ITEMS_PER_REQUEST }, (_, i) => ({
      text: `t${i}`,
    }));
    (apiPost as jest.Mock).mockResolvedValue([]);
    await addDatasetItems(token, "d1", items);
    expect(apiPost).toHaveBeenCalledTimes(1);
  });
});

describe("updateDatasetItem", () => {
  it("PATCHes the item's text", async () => {
    (apiClient as jest.Mock).mockResolvedValue({ uuid: "i1", text: "new" });
    await updateDatasetItem(token, "d1", "i1", "new");
    expect(apiClient).toHaveBeenCalledWith("/datasets/d1/items/i1", token, {
      method: "PATCH",
      body: { text: "new" },
    });
  });
});

describe("deleteDatasetItem", () => {
  it("deletes the item", async () => {
    (apiDelete as jest.Mock).mockResolvedValue(undefined);
    await deleteDatasetItem(token, "d1", "i1");
    expect(apiDelete).toHaveBeenCalledWith("/datasets/d1/items/i1", token);
  });
});
