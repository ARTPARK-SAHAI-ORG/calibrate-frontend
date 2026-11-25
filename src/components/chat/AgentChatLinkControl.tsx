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
            className="flex items-center px-3 py-1.5 rounded-lg text-[13px] font-medium border border-border bg-background text-foreground hover:bg-accent transition-colors cursor-pointer"
          >
            Preview
          </a>
        ) : (
          <button
            type="button"
            disabled
            className="flex items-center px-3 py-1.5 rounded-lg text-[13px] font-medium border border-border bg-background text-foreground cursor-not-allowed opacity-50"
          >
            Preview
          </button>
        )}
      </Tooltip>
    </div>
  );
}
