import { getDefaultHeaders } from "./api";

// Result of a bulk-delete call. `unauthorized` signals a 401 so the caller can
// sign the user out; `deletedCount` is how many tests the backend actually
// removed (foreign/unknown/already-deleted ids are silently skipped, so it can
// be less than the number requested).
export interface BulkDeleteTestsResult {
  unauthorized: boolean;
  deletedCount: number;
}

/**
 * Delete one or more tests in a single `POST /tests/bulk-delete` round-trip,
 * replacing the old per-uuid `DELETE /tests/{uuid}` fan-out.
 *
 * The backend soft-deletes each test and cascades to its agent_tests links.
 * Ids outside the caller's org (or already deleted) are skipped rather than
 * erroring, so `deletedCount < testUuids.length` indicates a partial delete.
 *
 * Throws on any non-OK response other than 401 (which is surfaced via
 * `unauthorized` so the caller can trigger sign-out).
 */
export async function bulkDeleteTests(
  backendUrl: string,
  accessToken: string | null | undefined,
  testUuids: string[],
): Promise<BulkDeleteTestsResult> {
  const response = await fetch(`${backendUrl}/tests/bulk-delete`, {
    method: "POST",
    headers: {
      ...getDefaultHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ test_uuids: testUuids }),
  });

  if (response.status === 401) {
    return { unauthorized: true, deletedCount: 0 };
  }

  if (!response.ok) {
    throw new Error("Failed to delete test(s)");
  }

  const data: { deleted_count?: number } = await response.json();
  return { unauthorized: false, deletedCount: data.deleted_count ?? 0 };
}
