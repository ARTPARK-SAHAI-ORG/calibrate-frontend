"use client";

import { useState } from "react";
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
 * The name at the top of a run window, with a pencil that opens a small box to
 * change it. Leaving that box empty puts the run back to its automatic name,
 * which the backend hands back ("Run 3").
 */
export function EditableRunName({
  taskId,
  type,
  name,
  onRenamed,
}: EditableRunNameProps) {
  const accessToken = useAccessToken();
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const shown = runDisplayName(type, name);

  const open = () => {
    setDraft(shown);
    setIsOpen(true);
  };

  const close = () => {
    if (isSaving) return;
    setIsOpen(false);
  };

  const save = async () => {
    const trimmed = draft.trim();
    // Nothing typed that differs from what is already on screen: no request,
    // so opening and closing the box cannot quietly store the name the app
    // shows in place of the automatic one.
    if (trimmed === shown) {
      setIsOpen(false);
      return;
    }
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!backendUrl) return;
    setIsSaving(true);
    try {
      onRenamed(await renameRun(backendUrl, accessToken, taskId, trimmed));
      setIsOpen(false);
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

  return (
    <>
      <h2 className="text-base md:text-lg font-semibold text-foreground truncate">
        {shown}
      </h2>
      <Tooltip content="Rename" position="bottom">
        <button
          type="button"
          onClick={open}
          aria-label="Rename"
          className="flex items-center justify-center h-7 w-7 shrink-0 rounded-md border border-border hover:bg-muted transition-colors cursor-pointer"
        >
          <EditIcon className="w-4 h-4" />
        </button>
      </Tooltip>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={close}
        >
          <div
            className="bg-background border border-border rounded-xl p-5 md:p-6 max-w-md w-full shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base md:text-lg font-semibold mb-3 md:mb-4">
              {type === "llm-benchmark"
                ? "Rename the model comparison"
                : "Rename the evaluation run"}
            </h2>
            <input
              type="text"
              aria-label="Run name"
              value={draft}
              autoFocus
              maxLength={MAX_NAME_LENGTH}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void save();
                } else if (e.key === "Escape") {
                  e.stopPropagation();
                  close();
                }
              }}
              className="w-full h-9 md:h-10 px-3 rounded-md text-sm border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent mb-2"
            />
            <p className="text-xs text-muted-foreground mb-4">
              Leave it empty to go back to the automatic name.
            </p>
            <div className="flex items-center justify-end gap-2 md:gap-3">
              <button
                type="button"
                onClick={close}
                disabled={isSaving}
                className="h-9 md:h-10 px-4 rounded-md text-xs md:text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={isSaving}
                className="h-9 md:h-10 px-4 rounded-md text-xs md:text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
