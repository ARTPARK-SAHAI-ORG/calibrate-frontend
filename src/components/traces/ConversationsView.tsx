"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConversationsTable } from "@/components/traces/ConversationsTable";
import { TraceDetailDialog } from "@/components/traces/TraceDetailDialog";
import { TracesFilter } from "@/components/traces/TracesFilter";
import { SearchIcon } from "@/components/icons";
import { RefreshButton } from "@/components/RefreshButton";
import {
  LoadingState,
  SearchInput,
  ServerPaginatedListBar,
} from "@/components/ui";
import {
  useAccessToken,
  useDialogUrlParam,
  useItemPager,
  usePageSize,
} from "@/hooks";
import {
  fetchTraceConversations,
  type TraceConversation,
  type TraceOutputFilter,
} from "@/lib/tracesApi";
import { reportError } from "@/lib/reportError";

/**
 * The Monitoring tab's conversations list: one row per conversation ID, and a
 * window showing the whole conversation. Traces sent without a conversation ID
 * are not listed here.
 */
export function ConversationsView({
  agentUuid,
  outputType,
  labels,
  allLabels,
  onFilterChange,
}: {
  agentUuid: string;
  outputType: TraceOutputFilter;
  labels: string[];
  /** Every label in use, for the filter's choices. */
  allLabels: string[];
  onFilterChange: (next: {
    outputType: TraceOutputFilter;
    labels: string[];
  }) => void;
}) {
  const accessToken = useAccessToken();
  const [pageSize, setPageSize] = usePageSize();
  const [offset, setOffset] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const handle = window.setTimeout(() => setSearch(searchInput), 300);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  const [page, setPage] = useState<{
    items: TraceConversation[];
    total: number;
    offset: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const labelsKey = labels.join("\n");
  // A new search or filter starts again from the first page.
  useEffect(() => setOffset(0), [search, outputType, labelsKey, pageSize]);

  // Only the newest request may fill the list, so a slow answer for an older
  // search cannot replace the one the reader is looking at.
  const latestRequest = useRef(0);
  const load = useCallback(async () => {
    if (!accessToken) return;
    const request = ++latestRequest.current;
    setIsLoading(true);
    try {
      const res = await fetchTraceConversations(accessToken, {
        limit: pageSize,
        offset,
        agentId: agentUuid,
        q: search,
        outputType,
        labels: labelsKey ? labelsKey.split("\n") : [],
      });
      if (request !== latestRequest.current) return;
      setPage({ items: res.items, total: res.total, offset });
      setError(null);
    } catch (err) {
      if (request !== latestRequest.current) return;
      reportError("Error fetching conversations:", err);
      setError("Failed to load conversations. Please try again.");
    } finally {
      if (request === latestRequest.current) setIsLoading(false);
    }
  }, [accessToken, agentUuid, pageSize, offset, search, outputType, labelsKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = useMemo(() => page?.items ?? [], [page]);
  const total = page?.total ?? 0;
  const loadedOffset = page?.offset ?? 0;
  const pagerItems = useMemo(
    () => items.map((c) => ({ ...c, uuid: c.conversation_id })),
    [items],
  );

  const [openId, setOpenId] = useState<string | null>(null);
  const { setParam } = useDialogUrlParam({
    param: "conversationId",
    onOpen: (value) => setOpenId(value),
    onClose: () => setOpenId(null),
  });
  const open = (id: string) => {
    setOpenId(id);
    setParam(id);
  };
  const itemPager = useItemPager({
    items: pagerItems,
    openUuid: openId,
    pageStart: loadedOffset,
    pageSize,
    total,
    onOpen: open,
    onPageStartChange: setOffset,
  });
  const close = () => {
    itemPager.cancel();
    setOpenId(null);
    setParam(null);
  };
  const openConversation = items.find((c) => c.conversation_id === openId);

  const pageCount = pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const currentPage = Math.floor(offset / pageSize) + 1;
  const isNarrowed =
    search.trim() !== "" || outputType !== "all" || labels.length > 0;

  return (
    <div className="flex flex-col space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={searchInput}
          onChange={setSearchInput}
          placeholder="Search conversations"
          className="w-full sm:w-2/5"
        />
        <TracesFilter
          value={{ outputType, labels, scores: {} }}
          labels={allLabels}
          scoreEvaluators={[]}
          forConversations
          onApply={(next) =>
            onFilterChange({ outputType: next.outputType, labels: next.labels })
          }
        />
      </div>

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : !page ? (
        <LoadingState />
      ) : total === 0 ? (
        <div className="border border-border rounded-xl p-8 md:p-12 flex flex-col items-center justify-center bg-muted/20">
          <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-muted flex items-center justify-center mb-3 md:mb-4">
            <SearchIcon className="w-6 h-6 md:w-7 md:h-7 text-muted-foreground" />
          </div>
          <h3 className="text-base md:text-lg font-semibold text-foreground mb-1">
            No conversations found
          </h3>
          <p className="text-sm md:text-base text-muted-foreground text-center">
            {isNarrowed
              ? "No conversations match your search and filters"
              : "Send a conversation ID with each trace to see its conversation here"}
          </p>
        </div>
      ) : (
        <div className="space-y-3 pt-2">
          <ServerPaginatedListBar
            total={total}
            offset={offset}
            loadedCount={items.length}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
            currentPage={currentPage}
            pageCount={pageCount}
            onPrev={() => setOffset(Math.max(0, offset - pageSize))}
            onNext={() => setOffset(offset + pageSize)}
            prevDisabled={offset === 0 || isLoading}
            nextDisabled={offset + pageSize >= total || isLoading}
            itemNoun="conversation"
            trailing={
              <RefreshButton loading={isLoading} onClick={() => void load()} />
            }
          />
          <ConversationsTable
            conversations={items}
            onOpen={itemPager.open}
            agentUuid={agentUuid}
          />
        </div>
      )}

      <TraceDetailDialog
        isOpen={openConversation != null}
        onClose={close}
        accessToken={accessToken}
        traceUuid={openConversation?.last_turn.uuid ?? null}
        conversation={openConversation ?? null}
        hasPrev={itemPager.hasPrev}
        hasNext={itemPager.hasNext}
        onPrev={itemPager.prev}
        onNext={itemPager.next}
        position={itemPager.position}
      />
    </div>
  );
}
