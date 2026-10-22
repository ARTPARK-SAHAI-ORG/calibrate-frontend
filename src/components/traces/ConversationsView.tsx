"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConversationsTable } from "@/components/traces/ConversationsTable";
import { TraceDetailDialog } from "@/components/traces/TraceDetailDialog";
import { TracesFilter } from "@/components/traces/TracesFilter";
import { SearchIcon } from "@/components/icons";
import { RefreshButton } from "@/components/RefreshButton";
import {
  ErrorNote,
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
        labels,
      });
      if (request !== latestRequest.current) return;
      setPage({ items: res.items, total: res.total, offset });
      setError(null);
    } catch (err) {
      if (request !== latestRequest.current) return;
      reportError("Error fetching conversations:", err);
      setError("Failed to load conversations");
    } finally {
      if (request === latestRequest.current) setIsLoading(false);
    }
    // Keyed on the labels' text, so a new array of the same labels does not
    // load the page again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // Back can close the window while a step to the next page is still
    // loading; that step must not reopen it when the page arrives.
    onClose: () => {
      itemPager.cancel();
      setOpenId(null);
    },
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
  // Held apart from the page, so stepping onto the next page keeps the window
  // up, and a link to a conversation on another page still opens it.
  const [held, setHeld] = useState<TraceConversation | null>(null);
  useEffect(() => {
    if (!openId) return;
    const found = items.find((c) => c.conversation_id === openId);
    if (found) {
      setHeld(found);
      return;
    }
    if (!accessToken || held?.conversation_id === openId) return;
    let current = true;
    fetchTraceConversations(accessToken, {
      limit: 1,
      offset: 0,
      agentId: agentUuid,
      conversationId: openId,
    })
      .then((res) => {
        if (current) setHeld(res.items[0] ?? null);
      })
      .catch((err) => reportError("Error fetching conversation:", err));
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, items, accessToken, agentUuid]);
  const openConversation =
    openId && held?.conversation_id === openId ? held : null;

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
        <ErrorNote className="flex flex-wrap items-center justify-between gap-3">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void load()}
            disabled={isLoading}
            className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-sm font-medium border border-red-300 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"
              />
            </svg>
            {isLoading ? "Trying again" : "Try again"}
          </button>
        </ErrorNote>
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
        traceUuid={null}
        conversation={openConversation}
        hasPrev={itemPager.hasPrev}
        hasNext={itemPager.hasNext}
        onPrev={itemPager.prev}
        onNext={itemPager.next}
        position={itemPager.position}
      />
    </div>
  );
}
