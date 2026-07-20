"use client";

import React from "react";
import { SelectCheckbox } from "@/components/ui/SelectCheckbox";
import { DeleteIconButton } from "@/components/ui";
import type { TraceSummary } from "@/lib/tracesApi";

type CheckboxProps = {
  checked: boolean;
  onToggle: () => void;
  disabled: boolean;
  label: string;
  tooltip?: string;
};

type TracesTableProps = {
  traces: TraceSummary[];
  /** Per-row selection checkbox props, from `useTraceDeletion`. */
  checkboxProps: (trace: TraceSummary) => CheckboxProps;
  allSelected: boolean;
  hasSelectableItems: boolean;
  onToggleSelectAll: () => void;
  /** Open the detail view for a trace. */
  onOpen: (traceUuid: string) => void;
  /** Ask to delete a single trace. */
  onDelete: (trace: TraceSummary) => void;
  /** Filter the list down to one conversation. */
  onFilterConversation: (conversationId: string) => void;
};

export function formatTraceDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ConversationButton({
  conversationId,
  onClick,
}: {
  conversationId: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title="Show this conversation"
      className="max-w-full truncate font-mono text-xs px-2 py-0.5 rounded-full border border-border bg-muted/50 hover:bg-muted text-foreground transition-colors cursor-pointer"
    >
      {conversationId}
    </button>
  );
}

/**
 * The traces list: a table on desktop, cards on mobile. Rows open the detail
 * view; the conversation pill narrows the list to that conversation.
 */
export function TracesTable({
  traces,
  checkboxProps,
  allSelected,
  hasSelectableItems,
  onToggleSelectAll,
  onOpen,
  onDelete,
  onFilterConversation,
}: TracesTableProps) {
  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block border border-border rounded-xl overflow-hidden">
        <table className="w-full table-fixed">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              <th className="w-12 px-4 py-3">
                <SelectCheckbox
                  checked={allSelected}
                  onToggle={onToggleSelectAll}
                  disabled={!hasSelectableItems}
                  label="Select all traces"
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground w-[26%]">
                Message
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                Response
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground w-[16%]">
                Conversation
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground w-16">
                Turns
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground w-16">
                Tools
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground w-40">
                Created
              </th>
              <th className="w-14 px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {traces.map((trace) => (
              <tr
                key={trace.uuid}
                onClick={() => onOpen(trace.uuid)}
                className="border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer"
              >
                <td className="px-4 py-3">
                  <SelectCheckbox {...checkboxProps(trace)} />
                </td>
                <td className="px-4 py-3">
                  <div className="font-mono text-xs text-foreground truncate">
                    {trace.message_id}
                  </div>
                  {trace.input_preview && (
                    <div className="text-[13px] text-muted-foreground truncate mt-0.5">
                      {trace.input_preview}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  {trace.response_preview ? (
                    <div className="text-[13px] text-foreground truncate">
                      {trace.response_preview}
                    </div>
                  ) : (
                    <div className="text-[13px] text-muted-foreground italic">
                      Tool calls only
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <ConversationButton
                    conversationId={trace.conversation_id}
                    onClick={() => onFilterConversation(trace.conversation_id)}
                  />
                </td>
                <td className="px-4 py-3 text-right text-[13px] text-muted-foreground">
                  {trace.turn_count}
                </td>
                <td className="px-4 py-3 text-right text-[13px] text-muted-foreground">
                  {trace.tool_call_count}
                </td>
                <td className="px-4 py-3 text-[13px] text-muted-foreground whitespace-nowrap">
                  {formatTraceDate(trace.created_at)}
                </td>
                <td className="px-4 py-3 text-right">
                  <DeleteIconButton
                    onClick={() => onDelete(trace)}
                    title="Delete trace"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {traces.map((trace) => (
          <div
            key={trace.uuid}
            className="border border-border rounded-lg overflow-hidden bg-background"
          >
            <div
              className="p-4 cursor-pointer"
              onClick={() => onOpen(trace.uuid)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="font-mono text-xs text-foreground truncate">
                  {trace.message_id}
                </div>
                <SelectCheckbox {...checkboxProps(trace)} />
              </div>
              {trace.input_preview && (
                <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                  {trace.input_preview}
                </p>
              )}
              {trace.response_preview ? (
                <p className="text-sm text-foreground mt-1 line-clamp-2">
                  {trace.response_preview}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground italic mt-1">
                  Tool calls only
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 px-4 pb-3 pt-0">
              <ConversationButton
                conversationId={trace.conversation_id}
                onClick={() => onFilterConversation(trace.conversation_id)}
              />
              <span className="text-xs text-muted-foreground">
                {trace.turn_count} turns
              </span>
              <span className="text-xs text-muted-foreground">
                {formatTraceDate(trace.created_at)}
              </span>
              <div className="ml-auto">
                <DeleteIconButton
                  onClick={() => onDelete(trace)}
                  title="Delete trace"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
