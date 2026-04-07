import { apiGet, apiPost, apiDelete, apiClient } from "./api";

export type DatasetType = "stt" | "tts";

export type DatasetItem = {
  uuid: string;
  audio_path?: string;
  text: string;
  order_index: number;
  created_at: string;
};

export type Dataset = {
  uuid: string;
  name: string;
  dataset_type: DatasetType;
  item_count: number;
  eval_count: number;
  created_at: string;
  updated_at: string;
};

export type DatasetDetail = Dataset & {
  items: DatasetItem[];
};

// List datasets, optionally filtered by type
export function listDatasets(
  accessToken: string,
  datasetType?: DatasetType
): Promise<Dataset[]> {
  const query = datasetType ? `?dataset_type=${datasetType}` : "";
  return apiGet<Dataset[]>(`/datasets${query}`, accessToken);
}

// Create a new dataset
export function createDataset(
  accessToken: string,
  name: string,
  datasetType: DatasetType
): Promise<Dataset> {
  return apiPost<Dataset>("/datasets", accessToken, {
    name,
    dataset_type: datasetType,
  });
}

// Get dataset with items
export function getDataset(
  accessToken: string,
  datasetId: string
): Promise<DatasetDetail> {
  return apiGet<DatasetDetail>(`/datasets/${datasetId}`, accessToken);
}

// Rename a dataset
export function renameDataset(
  accessToken: string,
  datasetId: string,
  name: string
): Promise<Dataset> {
  return apiClient<Dataset>(`/datasets/${datasetId}`, accessToken, {
    method: "PATCH",
    body: { name },
  });
}

// Delete a dataset
export function deleteDataset(
  accessToken: string,
  datasetId: string
): Promise<void> {
  return apiDelete<void>(`/datasets/${datasetId}`, accessToken);
}

// Add items to a dataset
export type NewSTTItem = { audio_path: string; text: string };
export type NewTTSItem = { text: string };

export function addDatasetItems(
  accessToken: string,
  datasetId: string,
  items: NewSTTItem[] | NewTTSItem[]
): Promise<DatasetItem[]> {
  return apiPost<DatasetItem[]>(
    `/datasets/${datasetId}/items`,
    accessToken,
    items
  );
}

// Update a single item's text
export function updateDatasetItem(
  accessToken: string,
  datasetId: string,
  itemUuid: string,
  text: string
): Promise<DatasetItem> {
  return apiClient<DatasetItem>(
    `/datasets/${datasetId}/items/${itemUuid}`,
    accessToken,
    { method: "PATCH", body: { text } }
  );
}

// Delete a single item from a dataset
export function deleteDatasetItem(
  accessToken: string,
  datasetId: string,
  itemUuid: string
): Promise<void> {
  return apiDelete<void>(
    `/datasets/${datasetId}/items/${itemUuid}`,
    accessToken
  );
}
