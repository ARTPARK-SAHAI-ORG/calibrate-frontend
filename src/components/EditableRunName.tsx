"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { Tooltip } from "@/components/Tooltip";
import { EditIcon } from "@/components/icons";
import { RenameDialog } from "@/components/ui";
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
 * The name at the top of a run window, with a pencil that opens the box to
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

  const shown = runDisplayName(type, name);

  const rename = async (newName: string) => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!backendUrl) return "The backend address is not set.";
    try {
      onRenamed(await renameRun(backendUrl, accessToken, taskId, newName));
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        await signOut({ callbackUrl: "/login" });
        return;
      }
      reportError("Error renaming run:", error);
      return "Could not rename the run. Please try again.";
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
          onClick={() => setIsOpen(true)}
          aria-label="Rename"
          className="flex items-center justify-center h-7 w-7 shrink-0 rounded-md border border-border hover:bg-muted transition-colors cursor-pointer"
        >
          <EditIcon className="w-4 h-4" />
        </button>
      </Tooltip>

      <RenameDialog
        isOpen={isOpen}
        title="Rename the run"
        initialName={shown}
        maxLength={MAX_NAME_LENGTH}
        allowEmpty
        onClose={() => setIsOpen(false)}
        onRename={rename}
      />
    </>
  );
}
