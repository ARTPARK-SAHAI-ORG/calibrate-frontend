"use client";
import { reportError } from "@/lib/reportError";

import { useState, useEffect, useCallback } from "react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import { createRequestCache } from "@/lib/requestCache";

// In-flight dedup for the list fetch, keyed by `${accessToken}:${endpoint}`.
// Dedup-only (no persisted result): several components could mount the same
// resource in one tick and would otherwise each fire a GET; once the shared
// promise settles the next fetch hits the network fresh, so mutations that
// update local state never read a stale cached list.
const listFetch = createRequestCache<unknown>();

type UseCrudResourceOptions<T> = {
  endpoint: string;
  accessToken: string | undefined;
  enabled?: boolean;
};

type UseCrudResourceReturn<T> = {
  // Data
  items: T[];
  setItems: React.Dispatch<React.SetStateAction<T[]>>;
  
  // Loading states
  isLoading: boolean;
  isCreating: boolean;
  isUpdating: boolean;
  isDeleting: boolean;
  
  // Error states
  error: string | null;
  createError: string | null;
  
  // Actions
  refetch: () => Promise<void>;
  create: (data: Partial<T>) => Promise<T | null>;
  update: (id: string, data: Partial<T>) => Promise<T | null>;
  remove: (id: string) => Promise<boolean>;
  
  // Reset errors
  clearErrors: () => void;
};

/**
 * Generic hook for CRUD operations on a resource
 * Handles loading, error states, and optimistic updates
 */
export function useCrudResource<T extends { uuid: string }>({
  endpoint,
  accessToken,
  enabled = true,
}: UseCrudResourceOptions<T>): UseCrudResourceReturn<T> {
  const [items, setItems] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  // Fetch all items
  const fetchItems = useCallback(async () => {
    if (!accessToken || !enabled) return;

    try {
      setIsLoading(true);
      setError(null);
      const data = (await listFetch.fetch(`${accessToken}:${endpoint}`, () =>
        apiGet<T[]>(endpoint, accessToken),
      )) as T[];
      setItems(data);
    } catch (err) {
      reportError(`Error fetching ${endpoint}:`, err);
      setError(err instanceof Error ? err.message : `Failed to load data`);
    } finally {
      setIsLoading(false);
    }
  }, [endpoint, accessToken, enabled]);

  // Initial fetch
  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Create new item
  const create = useCallback(
    async (data: Partial<T>): Promise<T | null> => {
      if (!accessToken) return null;

      try {
        setIsCreating(true);
        setCreateError(null);
        const newItem = await apiPost<T>(endpoint, accessToken, data);

        // Merge the returned item into local state instead of refetching the
        // whole list — the POST already returns the created record. Mirrors
        // the optimistic local update in `remove`.
        setItems((prev) => [...prev, newItem]);

        return newItem;
      } catch (err) {
        reportError(`Error creating ${endpoint}:`, err);
        setCreateError(err instanceof Error ? err.message : "Failed to create");
        return null;
      } finally {
        setIsCreating(false);
      }
    },
    [endpoint, accessToken]
  );

  // Update existing item
  const update = useCallback(
    async (id: string, data: Partial<T>): Promise<T | null> => {
      if (!accessToken) return null;

      try {
        setIsUpdating(true);
        setCreateError(null);
        const updatedItem = await apiPut<T>(`${endpoint}/${id}`, accessToken, data);

        // Replace the item in local state instead of refetching the whole
        // list — the PUT already returns the updated record.
        setItems((prev) =>
          prev.map((item) => (item.uuid === id ? updatedItem : item)),
        );

        return updatedItem;
      } catch (err) {
        reportError(`Error updating ${endpoint}/${id}:`, err);
        setCreateError(err instanceof Error ? err.message : "Failed to update");
        return null;
      } finally {
        setIsUpdating(false);
      }
    },
    [endpoint, accessToken]
  );

  // Delete item
  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      if (!accessToken) return false;

      try {
        setIsDeleting(true);
        await apiDelete(`${endpoint}/${id}`, accessToken);
        
        // Optimistic update - remove from local state
        setItems((prev) => prev.filter((item) => item.uuid !== id));
        
        return true;
      } catch (err) {
        reportError(`Error deleting ${endpoint}/${id}:`, err);
        return false;
      } finally {
        setIsDeleting(false);
      }
    },
    [endpoint, accessToken]
  );

  // Clear all errors
  const clearErrors = useCallback(() => {
    setError(null);
    setCreateError(null);
  }, []);

  return {
    items,
    setItems,
    isLoading,
    isCreating,
    isUpdating,
    isDeleting,
    error,
    createError,
    refetch: fetchItems,
    create,
    update,
    remove,
    clearErrors,
  };
}

/**
 * Hook for fetching a single resource by ID
 */
export function useFetchResource<T>({
  endpoint,
  accessToken,
  id,
  enabled = true,
}: {
  endpoint: string;
  accessToken: string | undefined;
  id: string | null;
  enabled?: boolean;
}) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!accessToken || !id || !enabled) return;

    try {
      setIsLoading(true);
      setError(null);
      const result = await apiGet<T>(`${endpoint}/${id}`, accessToken);
      setData(result);
    } catch (err) {
      reportError(`Error fetching ${endpoint}/${id}:`, err);
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setIsLoading(false);
    }
  }, [endpoint, accessToken, id, enabled]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return {
    data,
    setData,
    isLoading,
    error,
    refetch: fetch,
  };
}
