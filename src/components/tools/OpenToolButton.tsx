"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AddToolDialog, ToolData } from "@/components/AddToolDialog";
import { Tooltip } from "@/components/Tooltip";

export type OnToolSaved = (
  tool: ToolData,
  previousName: string,
  allTools: ToolData[],
) => void;

/**
 * An icon button that opens a workspace tool in the usual side panel, ready
 * to edit. `onToolSaved` gets the saved tool, its name before the edit (so a
 * form can rename the tool calls still carrying the old name) and the
 * workspace's tool list after the save.
 */
export function OpenToolButton({
  tool,
  accessToken,
  onToolSaved,
  className = "w-8 h-8",
}: {
  tool: ToolData;
  accessToken?: string;
  onToolSaved?: OnToolSaved;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Keep key presses inside the panel from the moment it opens, so the arrow
  // keys and Escape that the dialog behind it listens for cannot step to
  // another item or close the tool list, which would close the panel.
  useEffect(() => {
    const panel = panelRef.current;
    if (open && panel && !panel.contains(document.activeElement)) {
      panel.focus();
    }
  }, [open]);

  return (
    <>
      <Tooltip content="Open the tool" position="left">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Open ${tool.name}`}
          className={`${className} flex-shrink-0 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-background cursor-pointer`}
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
            />
          </svg>
        </button>
      </Tooltip>

      {/* The side panel sits above every dialog and dropdown that holds this
          button, and its clicks and key presses stop here so the dialog
          behind it does not read them as a click on its background. */}
      {open &&
        createPortal(
          <div
            ref={panelRef}
            data-tool-side-panel
            // Focusable, so a click on an empty part of the panel keeps the
            // key presses that follow inside it.
            tabIndex={-1}
            className="relative z-[300] outline-none"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <AddToolDialog
              isOpen
              onClose={() => setOpen(false)}
              toolType={
                tool.config?.type === "webhook"
                  ? "webhook"
                  : "structured_output"
              }
              editingToolUuid={tool.uuid}
              backendAccessToken={accessToken}
              onToolsUpdated={(allTools) => {
                const saved = allTools.find((t) => t.uuid === tool.uuid);
                if (saved) onToolSaved?.(saved, tool.name, allTools);
              }}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
