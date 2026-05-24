// Helpers for the EvaluatorDetailResponse / per-task evaluator entry
// shape returned by `GET /evaluators/{uuid}` and
// `GET /annotation-tasks/{task_uuid}/evaluators`.
//
// The backend replaced the flattened `live_version` blob with a
// `live_version_index` offset into the `versions[]` array so the live
// version isn't duplicated in the payload. Use `liveVersionOf` instead
// of repeating the index lookup at each call site.

export function liveVersionOf<V>(
  evaluator:
    | {
        live_version_index?: number | null;
        versions?: V[] | null;
      }
    | null
    | undefined,
): V | null {
  if (!evaluator) return null;
  const idx = evaluator.live_version_index;
  if (typeof idx !== "number") return null;
  return evaluator.versions?.[idx] ?? null;
}
