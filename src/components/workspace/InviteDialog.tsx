"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useHideFloatingButton } from "@/components/AppLayout";
import { useAccessToken, useOrgInviteLink } from "@/hooks";
import { CopyLinkButton, Switch } from "@/components/ui";
import { LoadingState } from "@/components/ui/LoadingState";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { buildInviteUrl } from "@/lib/invites";
import { parseBackendErrorMessage } from "@/lib/parseBackendError";
import { reportError } from "@/lib/reportError";

/**
 * The one place a workspace invites people: by email, or by a link anyone can
 * join with. A workspace has at most one link at a time, so turning it off and
 * replacing it are both confirmed first.
 */
export function InviteDialog({
  isOpen,
  onClose,
  orgUuid,
  orgName,
  onAddMember,
}: {
  isOpen: boolean;
  onClose: () => void;
  orgUuid: string;
  orgName: string;
  onAddMember: (email: string) => Promise<unknown>;
}) {
  useHideFloatingButton(isOpen);

  const accessToken = useAccessToken();
  const {
    inviteLink,
    isLoading,
    error: loadError,
    refetch,
    createInviteLink,
    revokeInviteLink,
  } = useOrgInviteLink(accessToken, orgUuid);

  const [email, setEmail] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [isCreating, setIsCreating] = useState(false);
  const [isTurningOff, setIsTurningOff] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmTurnOff, setConfirmTurnOff] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setEmail("");
      setAddError(null);
      setIsAdding(false);
      setLinkError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const url = inviteLink ? buildInviteUrl(inviteLink.token) : null;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || isAdding) return;
    setIsAdding(true);
    setAddError(null);
    try {
      await onAddMember(trimmed);
      setEmail("");
    } catch (err) {
      reportError("Error adding a workspace member:", err);
      setAddError(parseBackendErrorMessage(err, "Failed to add member"));
    } finally {
      setIsAdding(false);
    }
  };

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="relative bg-background rounded-xl w-full max-w-md p-5 md:p-6 shadow-2xl">
        <h2 className="text-base md:text-lg font-semibold text-foreground mb-4">
          Invite to {orgName}
        </h2>

        <form onSubmit={handleAdd} className="flex items-center gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setAddError(null);
            }}
            placeholder="teammate@example.com"
            autoFocus
            disabled={isAdding}
            aria-label="Email address"
            className={`flex-1 min-w-0 h-10 px-3 rounded-md border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 disabled:opacity-50 ${
              addError
                ? "border-red-500/60 focus:ring-red-500/20"
                : "border-border focus:ring-foreground/10"
            }`}
          />
          <button
            type="submit"
            disabled={!email.trim() || isAdding}
            className="shrink-0 h-10 px-4 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isAdding ? "Adding..." : "Add"}
          </button>
        </form>
        {addError && <p className="mt-1 text-[13px] text-red-500">{addError}</p>}

        <div className="my-5 border-t border-border" />

        {isSettling ? (
          <LoadingState />
        ) : loadError ? (
          // The link could not be read, which is not the same as the workspace
          // having none. An off switch here would offer to replace the link
          // people are already holding, so the only action is to try again.
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Invite link</p>
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
            <div className="flex items-start gap-3">
              <svg
                aria-hidden="true"
                className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.8}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 01-5.656-5.656l1.5-1.5M10.172 13.828a4 4 0 010-5.656l3-3a4 4 0 015.656 5.656l-1.5 1.5"
                />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">
                  Invite link
                </p>
                {!url && (
                  <p className="text-[13px] text-muted-foreground">
                    Anyone with this link can join this workspace.
                  </p>
                )}
              </div>
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

            {linkError && (
              <p className="text-[13px] text-red-500">{linkError}</p>
            )}
          </div>
        )}

        {/* Done only dismisses. Add is the action in here, and two filled
            buttons in one dialog leaves nothing telling the reader which one
            does something. */}
        <div className="mt-5 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-9 md:h-10 px-4 rounded-md text-xs md:text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>

      <div className="absolute inset-0 -z-10" onClick={onClose} />

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
