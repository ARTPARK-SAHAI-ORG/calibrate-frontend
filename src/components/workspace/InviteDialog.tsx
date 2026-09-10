"use client";

import { useState } from "react";
import { useHideFloatingButton } from "@/components/AppLayout";
import { SegmentedFilter } from "@/components/ui";
import { AddByEmailPanel } from "@/components/workspace/AddByEmailPanel";
import { InviteLinkPanel } from "@/components/workspace/InviteLinkPanel";

const WAYS = [
  { value: "email" as const, label: "By email" },
  { value: "link" as const, label: "With a link" },
];
type Way = (typeof WAYS)[number]["value"];

/**
 * The one place a workspace invites people. The two ways in are different
 * enough that showing both at once left most of the dialog empty, so they take
 * turns: by email for people whose address is known, by a link for people
 * whose address is not, or for a group chat.
 *
 * There is no footer. Each way has its own action, and a second button next to
 * it would only be there to close the dialog, which the cross already does.
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

  const [way, setWay] = useState<Way>("email");

  // Closing puts it back to the email side, so it opens the same way every
  // time. Remembering the side used last would be a surprise on a screen
  // opened this rarely.
  const close = () => {
    setWay("email");
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="relative bg-background border border-border rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
        <div className="px-5 md:px-6 py-4 border-b border-border flex items-center justify-between gap-3">
          <h2 className="text-base md:text-lg font-semibold text-foreground">
            Invite team members
          </h2>
          <button
            type="button"
            onClick={close}
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

        <div className="px-5 md:px-6 py-5 overflow-y-auto space-y-4">
          <SegmentedFilter
            value={way}
            onChange={setWay}
            options={WAYS}
            ariaLabel="How to invite"
            className="w-fit"
          />

          {/* A floor under the two sides, so switching between them does not
              make the dialog jump, and a few addresses fit before it grows. */}
          <div className="min-h-[10rem]">
            {way === "email" ? (
              <AddByEmailPanel onAddMember={onAddMember} />
            ) : (
              <InviteLinkPanel orgUuid={orgUuid} />
            )}
          </div>
        </div>
      </div>

      <div className="absolute inset-0 -z-10" onClick={close} />
    </div>
  );
}
