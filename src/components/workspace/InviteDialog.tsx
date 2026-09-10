"use client";

import { useHideFloatingButton } from "@/components/AppLayout";
import { AddByEmailPanel } from "@/components/workspace/AddByEmailPanel";
import { InviteLinkPanel } from "@/components/workspace/InviteLinkPanel";

/**
 * The one place a workspace invites people, in two columns: by email on the
 * left for people whose address is known, by a link on the right for people
 * whose address is not, or for a group chat.
 *
 * Each column owns its own requests and its own failures, so neither can
 * leave the other half finished.
 */
export function InviteDialog({
  isOpen,
  onClose,
  orgUuid,
  onAddMember,
}: {
  isOpen: boolean;
  onClose: () => void;
  orgUuid: string;
  onAddMember: (email: string) => Promise<unknown>;
}) {
  useHideFloatingButton(isOpen);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      {/* Height is fixed rather than growing with the content, so adding a
          few people does not make the dialog jump about. Same pair as
          AddEvaluatorsDialog, the app's other wide two-column dialog. */}
      <div className="relative bg-background border border-border rounded-xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh] md:h-[85vh]">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-3">
          <h2 className="text-base md:text-lg font-semibold text-foreground">
            Invite team members
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-md hover:bg-muted transition-colors cursor-pointer"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* One column on a phone, two side by side from md up. Side by side,
            each column scrolls on its own, so a long list of people being
            added does not drag the invite link out of view. Stacked, the whole
            body scrolls as one. */}
        <div className="flex-1 min-h-0 overflow-y-auto md:overflow-hidden grid grid-cols-1 md:grid-cols-2">
          <div className="p-6 md:overflow-y-auto">
            <AddByEmailPanel onAddMember={onAddMember} />
          </div>
          <div className="p-6 border-t border-border md:border-t-0 md:overflow-y-auto">
            <InviteLinkPanel orgUuid={orgUuid} />
          </div>
        </div>

        {/* Done only dismisses. Both columns act on their own, so nothing in
            here is waiting on a footer button. */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-end">
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
    </div>
  );
}
