import { apiGet, apiPost, Paginated, unwrapList } from "./api";
import type { SearchMode } from "@/components/ui/SearchModeInput";
import { matchesTestTypeFilter, type TestTypeFilterValue } from "./testTypes";

/** One test linked to an agent, as the list endpoint returns it. */
export type AgentTest = {
  uuid: string;
  name: string;
  description: string;
  type: "response" | "tool_call" | "conversation" | "general";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: Record<string, any>;
  created_at: string;
  updated_at: string;
};

/** How the backend names each match mode of the search box. */
const Q_MODE_PARAM: Record<SearchMode, string> = {
  contains: "contains",
  "starts-with": "starts_with",
  "ends-with": "ends_with",
  exact: "exact",
};

/**
 * The test types one filter chip covers. "Agent response" is one thing to the
 * reader but two types underneath, so it asks for both. It is the same rule
 * `matchesTestTypeFilter` applies in the browser, kept here in one place.
 */
const TYPE_PARAM_VALUES: (
  "response" | "tool_call" | "conversation" | "general"
)[] = ["response", "tool_call", "conversation", "general"];

function typeParam(filter: TestTypeFilterValue): string | null {
  if (filter === "all") return null;
  return TYPE_PARAM_VALUES.filter((type) =>
    matchesTestTypeFilter(type, filter),
  ).join(",");
}

/**
 * One page of the tests linked to an agent. The backend does the searching and
 * the type filtering before it cuts the page, so the count and the pages cover
 * every matching test and not just the ones on screen.
 */
export async function fetchAgentTestsPage(
  accessToken: string,
  {
    agentUuid,
    limit,
    offset,
    q,
    qMode = "contains",
    type = "all",
  }: {
    agentUuid: string;
    limit: number;
    offset: number;
    q?: string;
    qMode?: SearchMode;
    type?: TestTypeFilterValue;
  },
): Promise<Paginated<AgentTest>> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  if (q?.trim()) {
    params.set("q", q.trim());
    params.set("q_mode", Q_MODE_PARAM[qMode]);
  }
  const types = typeParam(type);
  if (types) params.set("type", types);
  return apiGet<Paginated<AgentTest>>(
    `/agent-tests/agent/${agentUuid}/tests?${params.toString()}`,
    accessToken,
  );
}

/**
 * Take several tests off an agent in one call. The tests stay in the library
 * and on every other agent. A test that was never linked is not an error; it
 * simply is not counted.
 */
export async function unlinkTestsFromAgent(
  accessToken: string,
  agentUuid: string,
  testUuids: string[],
): Promise<{ deleted_count: number }> {
  return apiPost<{ deleted_count: number }>(
    "/agent-tests/bulk-unlink",
    accessToken,
    { agent_uuid: agentUuid, test_uuids: testUuids },
  );
}

/**
 * Every test linked to an agent, in one call. The list is paged everywhere it
 * is shown; this is for the two actions that need the whole set at once:
 * comparing models on all of an agent's tests, and leaving already-linked
 * tests out of the attach-an-existing-test list. Sending no `limit` is what
 * asks the backend for all of them.
 */
export async function fetchAllAgentTests(
  accessToken: string,
  agentUuid: string,
): Promise<AgentTest[]> {
  const data = await apiGet<unknown>(
    `/agent-tests/agent/${agentUuid}/tests`,
    accessToken,
  );
  return unwrapList<AgentTest>(data);
}
