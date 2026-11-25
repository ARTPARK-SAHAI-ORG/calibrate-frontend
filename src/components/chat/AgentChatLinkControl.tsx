"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { useAccessToken } from "@/hooks";
import { reportError } from "@/lib/reportError";
import { ShareButton, publicSharePath } from "@/components/ShareButton";
import { Tooltip } from "@/components/Tooltip";

type ChatLink = {
  is_public: boolean;
  share_token: string | null;
  connection_verified: boolean;
};

const PREVIEW_CLASS =
  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium border transition-colors bg-indigo-500/14 border-indigo-500/45 text-indigo-900 dark:text-indigo-200";

function OpenIcon() {
  return (
    <svg
      className="w-3.5 h-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
      />
    </svg>
  );
}

/** Makes the agent's chat page public or private, and opens it to preview.
 *  `connectionUnverified` is only there to read the link again once the
 *  connection check passes. */
export function AgentChatLinkControl({
  agentUuid,
  connectionUnverified,
}: {
  agentUuid: string;
  connectionUnverified: boolean;
}) {
  const accessToken = useAccessToken();
  const [link, setLink] = useState<ChatLink | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    apiGet<ChatLink>(`/agents/${agentUuid}/chat-link`, accessToken)
      .then((data) => !cancelled && setLink(data))
      .catch((err) => reportError("Failed to read the chat link", err));
    return () => {
      cancelled = true;
    };
  }, [agentUuid, accessToken, connectionUnverified]);

  if (!link || !accessToken) return null;

  const previewUrl =
    link.is_public && link.share_token
      ? publicSharePath("agent-chat", link.share_token)
      : null;

  return (
    <div className="flex items-center gap-2">
      <ShareButton
        entityType="agent-chat"
        entityId={agentUuid}
        accessToken={accessToken}
        initialIsPublic={link.is_public}
        initialShareToken={link.share_token}
        onChange={(is_public, share_token) =>
          setLink((l) => l && { ...l, is_public, share_token })
        }
        disabledReason={
          // A link already public can still be made private.
          !link.connection_verified && !link.is_public
            ? "Check the connection first"
            : undefined
        }
      />
      <Tooltip
        content={previewUrl ? "Open the chat page" : "Make it public to preview"}
        position="bottom"
      >
        {previewUrl ? (
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`${PREVIEW_CLASS} hover:bg-indigo-500/26 dark:hover:bg-indigo-500/20 cursor-pointer`}
          >
            <OpenIcon />
            Preview
          </a>
        ) : (
          <button
            type="button"
            disabled
            className={`${PREVIEW_CLASS} opacity-50 cursor-not-allowed`}
          >
            <OpenIcon />
            Preview
          </button>
        )}
      </Tooltip>
    </div>
  );
}
