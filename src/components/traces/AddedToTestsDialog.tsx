"use client";

import React from "react";
import { ExternalLinkIcon } from "@/components/icons";
import { Button } from "@/components/ui";

/**
 * Says what was just added to an agent's tests, with a link that opens it in
 * a new tab: the one test when one was made, else the agent's Tests tab.
 */
export function AddedToTestsDialog({
  testUuids,
  orgUuid,
  agentUuid,
  noun,
  onClose,
}: {
  testUuids: string[];
  orgUuid?: string | null;
  agentUuid: string;
  /** What each test was made from, such as "reply" or "trace". */
  noun: string;
  onClose: () => void;
}) {
  const one = testUuids.length === 1;
  const tests = `/${orgUuid}/agents/${agentUuid}?tab=tests`;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-background rounded-xl w-full max-w-md p-5 md:p-6 shadow-2xl">
        <h2 className="text-base md:text-lg font-semibold text-foreground mb-2">
          Added to tests
        </h2>
        <p className="text-sm md:text-base text-foreground mb-4">
          {one
            ? `This ${noun} was added to the agent's tests`
            : `${testUuids.length} ${noun}s were added to the agent's tests`}
        </p>
        <div className="flex items-center justify-end gap-2 md:gap-3">
          <Button variant="secondary" size="md" onClick={onClose}>
            Close
          </Button>
          <a
            href={one ? `${tests}&testId=${testUuids[0]}` : tests}
            target="_blank"
            rel="noopener noreferrer"
            className="h-10 px-4 text-base inline-flex items-center gap-2 bg-foreground text-background hover:opacity-90 transition-opacity rounded-md font-medium cursor-pointer"
          >
            {one ? "View test" : "View tests"}
            <ExternalLinkIcon className="w-4 h-4" />
          </a>
        </div>
      </div>
    </div>
  );
}
