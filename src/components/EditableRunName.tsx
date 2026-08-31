"use client";

import { useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { toast } from "sonner";
import { Tooltip } from "@/components/Tooltip";
import { EditIcon } from "@/components/icons";
import { useAccessToken } from "@/hooks";
import { renameRun, UnauthorizedError } from "@/lib/testRunApi";
import { runDisplayName } from "@/lib/testTypes";
import { reportError } from "@/lib/reportError";

/** The longest name the backend accepts. */
const MAX_NAME_LENGTH = 200;

type EditableRunNameProps = {
  /** The run being named. Both kinds use the same address. */
  taskId: string;
  type: "llm-unit-test" | "llm-benchmark";
  /** The name as the backend last gave it. */
  name: string | null | undefined;
  /** The name as it now reads, for the caller to hold on to. */
  onRenamed: (name: string) => void;
};

/**
 * The name at the top of a run window, which anyone in the workspace can
 * change. Clearing the box puts the run back to its automatic name, which the
 * backend hands back ("Run 3").
 *
 * Enter or clicking away saves, Escape leaves the name as it was.
 */
export function EditableRunName({
  taskId,
  type,
  name,
  onRenamed,
}: EditableRunNameProps) {
  const accessToken = useAccessToken();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  // Set by Escape so the blur that follows leaves the name alone.
  const cancelledRef = useRef(false);

  const shown = runDisplayName(type, name);

  const startEditing = () => {
    setDraft(shown);
    cancelledRef.current = false;
    setIsEditing(true);
  };

  const save = async () => {
    const trimmed = draft.trim();
    setIsEditing(false);
    // Nothing typed that differs from what is already on screen: no request,
    // so reopening and closing the box cannot quietly store the name the app
    // shows in place of the automatic one.
    if (trimmed === shown) return;
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!backendUrl) return;
    setIsSaving(true);
    try {
      onRenamed(await renameRun(backendUrl, accessToken, taskId, trimmed));
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        await signOut({ callbackUrl: "/login" });
        return;
      }
      reportError("Error renaming run:", error);
      toast.error("Could not rename the run. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isEditing) {
    return (
      <input
        type="text"
        aria-label="Run name"
        value={draft}
        autoFocus
        maxLength={MAX_NAME_LENGTH}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            e.stopPropagation();
            cancelledRef.current = true;
            e.currentTarget.blur();
          }
        }}
        onBlur={() => {
          if (cancelledRef.current) {
            cancelledRef.current = false;
            setIsEditing(false);
            return;
          }
          void save();
        }}
        className="h-8 w-56 md:w-72 px-2 rounded-md border border-border bg-background text-base md:text-lg font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
      />
    );
  }

  return (
    <>
      <h2 className="text-base md:text-lg font-semibold text-foreground truncate">
        {shown}
      </h2>
      <Tooltip content="Rename" position="bottom">
        <button
          type="button"
          onClick={startEditing}
          disabled={isSaving}
          aria-label="Rename"
          className="flex items-center justify-center h-7 w-7 shrink-0 rounded-md border border-border hover:bg-muted transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <EditIcon className="w-4 h-4" />
        </button>
      </Tooltip>
    </>
  );
}
