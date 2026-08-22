"use client";

import React, { useState } from "react";
import { CheckIcon, CopyIcon } from "@/components/icons";
import { copyToClipboard } from "@/lib/clipboard";

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
    await copyToClipboard(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
      className="absolute top-1.5 right-1.5 inline-flex items-center justify-center w-6 h-6 rounded-md bg-background/80 text-muted-foreground hover:text-foreground hover:bg-background cursor-pointer transition-colors"
    >
      {copied ? (
        <CheckIcon className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
      ) : (
        <CopyIcon className="w-3.5 h-3.5" />
      )}
    </button>
  );
}
