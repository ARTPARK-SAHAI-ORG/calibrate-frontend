"use client";

import React, { useState } from "react";
import { CheckIcon, CopyIcon } from "@/components/icons";
import { copyToClipboard } from "@/lib/clipboard";
import { Tooltip } from "@/components/Tooltip";

/**
 * Copies one block of code, and says so for two seconds. Sits in the corner of
 * the block it copies, so a reader can take a request body without selecting
 * it by hand.
 */
export function CopyCodeButton({
  value,
  label = "Copy code",
}: {
  value: string;
  /** What a screen reader announces, when a page has several of these. */
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!(await copyToClipboard(value))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // The corner position stays on a wrapper of its own: the app's Tooltip puts
  // its own `relative` element around what it wraps, which would fight an
  // `absolute` on the same element.
  return (
    <span className="absolute top-1.5 right-1.5">
      <Tooltip content={copied ? "Copied" : label}>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? "Copied" : label}
          className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-background/80 text-muted-foreground hover:text-foreground hover:bg-background cursor-pointer transition-colors"
        >
          {copied ? (
            <CheckIcon className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
          ) : (
            <CopyIcon className="w-3.5 h-3.5" />
          )}
        </button>
      </Tooltip>
    </span>
  );
}
