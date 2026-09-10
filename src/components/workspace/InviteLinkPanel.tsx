"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAccessToken, useOrgInviteLink } from "@/hooks";
import { CopyLinkButton, Switch } from "@/components/ui";
import { LoadingState } from "@/components/ui/LoadingState";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { buildInviteUrl } from "@/lib/invites";
import { parseBackendErrorMessage } from "@/lib/parseBackendError";
import { reportError } from "@/lib/reportError";

/**
 * The invite link half of the invite dialog: one link anyone can join this
 * workspace with. A workspace has at most one link at a time, so turning it
 * off and replacing it are both confirmed first.
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
  const [linkError, setLinkError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmTurnOff, setConfirmTurnOff] = useState(false);

  const url = inviteLink ? buildInviteUrl(inviteLink.token) : null;

  /**
   * Make a link. Turning the switch on makes the first one straight away, so
   * its failure is shown under the row. Replacing a link is confirmed first,
   * and a message under the row would sit behind that confirmation where
   * nobody would see it, so that one reports through a toast. The
   * confirmation stays open until the request has answered.
   */
  const create = async (fromConfirmation: boolean) => {
    setIsCreating(true);
    setLinkError(null);
    try {
      await createInviteLink();
      if (fromConfirmation) setConfirmReset(false);
    } catch (err) {
      reportError("Error creating invite link:", err);
      const message = parseBackendErrorMessage(
        err,
        "Failed to create the invite link",
      );
      if (fromConfirmation) toast.error(message);
      else setLinkError(message);
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

  // Until the sign-in token has been read out of storage there is nothing to
  // ask with, so nothing is known yet. Treated as still loading, because an
  // off switch here invites the reader to turn on a link that may well exist,
  // which would replace the one people are already holding.
  const isSettling = isLoading || !accessToken;

  return (
    <div className="space-y-3">

      {isSettling ? (
        <LoadingState />
      ) : loadError ? (
        // The link could not be read, which is not the same as the workspace
        // having none. An off switch here would offer to replace the link
        // people are already holding, so the only action is to try again.
        <div className="space-y-2">
          <p className="text-[13px] text-red-500">
            The invite link could not be read. Try again.
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="h-9 px-4 rounded-md text-xs md:text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* The switch sits beside the line it controls, and stays inside
              this branch: it must never appear in the off position while the
              link could not be read, since turning it on replaces a link
              other people are already holding. */}
          <div className="flex items-start justify-between gap-3">
            <p className="text-[13px] text-muted-foreground">
              Anyone with this link can join this workspace.
            </p>
            <Switch
              checked={!!url}
              disabled={isCreating || isTurningOff}
              label="Invite link"
              onChange={(next) => {
                if (next) create(false);
                else setConfirmTurnOff(true);
              }}
            />
          </div>

          {url && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex-1 min-w-0 h-10 px-3 flex items-center rounded-md border border-border bg-muted/30">
                  <span className="text-xs font-mono text-muted-foreground truncate">
                    {url}
                  </span>
                </div>
                <CopyLinkButton value={url} />
              </div>
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                disabled={isCreating || isTurningOff}
                className="text-[13px] text-muted-foreground underline hover:text-foreground transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Reset link
              </button>
            </div>
          )}

          {linkError && <p className="text-[13px] text-red-500">{linkError}</p>}
        </div>
      )}

      <DeleteConfirmationDialog
        isOpen={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => create(true)}
        title="Reset the invite link"
        message="The link you are sharing now will stop working. Anyone who still has it will not be able to join."
        confirmText="Reset link"
        busyText="Resetting the link..."
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
