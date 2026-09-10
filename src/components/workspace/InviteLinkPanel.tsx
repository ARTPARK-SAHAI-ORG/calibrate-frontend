"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAccessToken, useOrgInviteLink } from "@/hooks";
import { LoadingState } from "@/components/ui/LoadingState";
import { Tooltip } from "@/components/Tooltip";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { buildInviteUrl } from "@/lib/invites";
import { copyToClipboard } from "@/lib/clipboard";
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
  const [copied, setCopied] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [confirmTurnOff, setConfirmTurnOff] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

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

  const handleCopy = async () => {
    if (!url) return;
    await copyToClipboard(url);
    setCopied(true);
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
            <Tooltip content={copied ? "Copied" : "Copy link"} position="top">
              <button
                type="button"
                onClick={handleCopy}
                aria-label={copied ? "Copied" : "Copy link"}
                className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-md border transition-colors cursor-pointer ${
                  copied
                    ? "border-green-200 bg-green-100 text-green-700 dark:border-green-500/40 dark:bg-green-500/20 dark:text-green-400"
                    : "border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                {copied ? (
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.8}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                    />
                  </svg>
                )}
              </button>
            </Tooltip>
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
