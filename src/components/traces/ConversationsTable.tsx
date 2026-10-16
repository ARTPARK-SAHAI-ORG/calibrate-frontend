"use client";

import React from "react";
import { Link } from "@/lib/nav";
import { openInPlace } from "@/lib/openInPlace";
import type { TraceConversation } from "@/lib/tracesApi";
import { formatTraceDate, traceOutputPreview } from "./TracesTable";

type ConversationsTableProps = {
  conversations: TraceConversation[];
  /** Open the conversation window. */
  onOpen: (conversationId: string) => void;
  /** So each row links to its own conversation and can open in a new tab. */
  agentUuid: string;
};

const ROW_CLASS = "grid gap-4 px-4 min-w-max";
// Fixed tracks, because each row is its own grid; see TracesTable.
const ROW_STYLE = { gridTemplateColumns: "240px 400px 400px 80px 160px" };

/** The conversations list: a table on desktop and cards on mobile. Rows open
 *  the conversation window. */
export function ConversationsTable({
  conversations,
  onOpen,
  agentUuid,
}: ConversationsTableProps) {
  const linkProps = (conversationId: string) => ({
    href: `/agents/${agentUuid}?tab=monitoring&view=conversations&conversationId=${encodeURIComponent(conversationId)}`,
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      openInPlace(e, () => onOpen(conversationId));
    },
  });
  const heading = "text-sm font-medium text-muted-foreground";
  const cell = "min-w-0 self-stretch py-2.5 flex items-center";
  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block border border-border rounded-xl overflow-x-auto">
        <div
          style={ROW_STYLE}
          className={`${ROW_CLASS} py-2 border-b border-border bg-muted/30 items-center`}
        >
          <div className={heading}>Conversation</div>
          <div className={heading}>Last message</div>
          <div className={heading}>Last reply</div>
          <div className={heading}>Turns</div>
          <div className={heading}>Last activity</div>
        </div>
        {conversations.map((c) => (
          <div
            key={c.conversation_id}
            onClick={() => onOpen(c.conversation_id)}
            style={ROW_STYLE}
            className={`${ROW_CLASS} border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors cursor-pointer items-center`}
          >
            <Link {...linkProps(c.conversation_id)} className={cell}>
              <div
                className="text-sm font-medium font-mono text-foreground truncate"
                title={c.conversation_id}
              >
                {c.conversation_id}
              </div>
            </Link>
            <Link {...linkProps(c.conversation_id)} className={cell}>
              <div className="text-sm text-foreground truncate">
                {c.last_turn.input_preview}
              </div>
            </Link>
            <Link {...linkProps(c.conversation_id)} className={cell}>
              <div className="text-sm text-foreground truncate">
                {traceOutputPreview(c.last_turn)}
              </div>
            </Link>
            <Link
              {...linkProps(c.conversation_id)}
              className={`${cell} text-sm text-foreground`}
            >
              {c.turn_count}
            </Link>
            <Link
              {...linkProps(c.conversation_id)}
              className={`${cell} text-sm text-muted-foreground whitespace-nowrap`}
            >
              {formatTraceDate(c.last_turn_at)}
            </Link>
          </div>
        ))}
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {conversations.map((c) => (
          <div
            key={c.conversation_id}
            onClick={() => onOpen(c.conversation_id)}
            className="border border-border rounded-xl p-3 bg-background hover:bg-muted/20 transition-colors cursor-pointer"
          >
            <Link {...linkProps(c.conversation_id)} className="block min-w-0">
              <p className="text-sm font-medium font-mono text-foreground truncate">
                {c.conversation_id}
              </p>
              {c.last_turn.input_preview && (
                <p className="text-sm text-foreground line-clamp-2 mt-1">
                  {c.last_turn.input_preview}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                {c.turn_count} {c.turn_count === 1 ? "turn" : "turns"} · Last
                activity {formatTraceDate(c.last_turn_at)}
              </p>
            </Link>
          </div>
        ))}
      </div>
    </>
  );
}
