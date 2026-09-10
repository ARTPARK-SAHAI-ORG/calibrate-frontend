"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAccessToken, useOrgInviteLink } from "@/hooks";
import { LoadingState } from "@/components/ui/LoadingState";
import { CopyLinkButton } from "@/components/ui";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { buildInviteUrl } from "@/lib/invites";
import { parseBackendErrorMessage } from "@/lib/parseBackendError";
import { reportError } from "@/lib/reportError";

/**
 * One invite link per workspace, shown under the add-by-email form. Making a
 * new link replaces the old one, so both the replace and the turn-off actions
 * are confirmed first.
 */
export function InviteLinkPanel({ orgUuid }: { orgUuid: string }) {
  const accessToken = useAccessToken();
  const {
    inviteLink,
    isLoading,
    error: loadError,
    refetch,
    createInviteLink,
    revokeInviteLink,
  } = useOrgInviteLink(accessToken, orgUuid);

  const [isCreating, setIsCreating] = useState(false);
  const [isTurningOff, setIsTurningOff] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [confirmTurnOff, setConfirmTurnOff] = useState(false);

  const url = inviteLink ? buildInviteUrl(inviteLink.token) : null;

  /**
   * Make a link. The first one is made straight from the button, so its
   * failure is shown under the button, the way the add-by-email form above
   * shows its own. Replacing a link is confirmed in a dialog first, and a
   * message under the button would sit behind that dialog where nobody would
   * see it, so that one reports through a toast, the way removing a member
   * does. The dialog stays open until the request has answered.
   */
  const create = async (fromConfirmation: boolean) => {
    setIsCreating(true);
    setActionError(null);
    try {
      await createInviteLink();
      if (fromConfirmation) setConfirmReplace(false);
    } catch (err) {
      reportError("Error creating invite link:", err);
      const message = parseBackendErrorMessage(
        err,
        "Failed to create the invite link",
      );
      if (fromConfirmation) toast.error(message);
      else setActionError(message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleTurnOff = async () => {
    setIsTurningOff(true);
    try {
      await revokeInviteLink();
      setConfirmTurnOff(false);
    } catch (err) {
      reportError("Error turning off invite link:", err);
      toast.error(
        parseBackendErrorMessage(err, "Failed to turn off the invite link"),
      );
    } finally {
      setIsTurningOff(false);
    }
  };

  // Until the token has been read out of storage there is nothing to ask with,
  // so the answer is not yet known. Treated as still loading, because showing
  // the create button here would offer to replace a link that may well exist.
  const isSettling = isLoading || !accessToken;

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Anyone with this link can join this workspace. Only one link works at a
        time.
      </p>

      {isSettling ? (
        <LoadingState />
      ) : loadError ? (
        // The link could not be read, which is not the same as the workspace
        // having none. Offering to create one here would turn off the link
        // people are already holding, so the only action is to try again.
        <div className="space-y-2">
          <p className="text-[13px] text-red-500">
            The invite link could not be read. Try again.
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="h-10 px-4 rounded-md text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
          >
            Try again
          </button>
        </div>
      ) : url ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex-1 min-w-0 h-10 px-3 flex items-center rounded-md border border-border bg-muted/30">
              <span className="text-xs font-mono text-muted-foreground truncate">
                {url}
              </span>
            </div>
            <CopyLinkButton value={url} />
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => setConfirmReplace(true)}
              disabled={isCreating || isTurningOff}
              className="h-10 px-4 rounded-md text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create a new link
            </button>
            <button
              type="button"
              onClick={() => setConfirmTurnOff(true)}
              disabled={isCreating || isTurningOff}
              className="h-10 px-4 rounded-md text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Turn off the link
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => create(false)}
          disabled={isCreating}
          className="h-10 px-4 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isCreating ? "Creating..." : "Create an invite link"}
        </button>
      )}

      {actionError && (
        <p className="mt-1 text-[13px] text-red-500">{actionError}</p>
      )}

      <DeleteConfirmationDialog
        isOpen={confirmReplace}
        onClose={() => setConfirmReplace(false)}
        onConfirm={() => create(true)}
        title="Create a new invite link"
        message="The link you are sharing now will stop working. Anyone who still has it will not be able to join."
        confirmText="Create a new link"
        busyText="Creating the new link..."
        isDeleting={isCreating}
      />

      <DeleteConfirmationDialog
        isOpen={confirmTurnOff}
        onClose={() => setConfirmTurnOff(false)}
        onConfirm={handleTurnOff}
        title="Turn off the invite link"
        message="The link will stop working and nobody new can join with it. People already in this workspace stay."
        confirmText="Turn off the link"
        busyText="Turning the link off..."
        isDeleting={isTurningOff}
      />
    </div>
  );
}
