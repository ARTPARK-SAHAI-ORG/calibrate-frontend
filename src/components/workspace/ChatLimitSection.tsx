"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAccessToken, useOrgLimits, useOrganizations } from "@/hooks";
import { clearOrgLimitsCache } from "@/hooks/useMaxRowsPerEval";
import { LIMITS } from "@/constants/limits";
import { parseBackendErrorMessage } from "@/lib/parseBackendError";
import { workspaceChatLimitWithOwnKeys, type Organization } from "@/lib/orgs";

/**
 * Whether the chat links of a workspace on its own provider keys keep their
 * daily limit on replies. Shown only to such a workspace, since every other
 * workspace always has the limit. Saves at once, like `RunModelsSection`,
 * and puts the box back when the save fails.
 */
export function ChatLimitSection({ org }: { org: Organization }) {
  const accessToken = useAccessToken();
  const { updateOrganization } = useOrganizations(accessToken);
  const limits = useOrgLimits();
  const [value, setValue] = useState(workspaceChatLimitWithOwnKeys(org));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!limits.uses_own_provider_keys) return null;

  // The backend reports no number while the limit is off, so fall back to
  // the default to say what turning it on would bring back.
  const perDay =
    limits.max_chat_replies_per_day ?? LIMITS.DEFAULT_MAX_CHAT_REPLIES_PER_DAY;

  const handleChange = async (next: boolean) => {
    setError(null);
    setIsSaving(true);
    setValue(next);
    try {
      await updateOrganization(org.uuid, {
        settings: { chat_link: { limit_with_own_keys: next } },
      });
      clearOrgLimitsCache();
      toast.success("Saved the limit on chat link replies");
    } catch (err) {
      setValue(!next);
      setError(
        parseBackendErrorMessage(
          err,
          "Failed to save the limit on chat link replies",
        ),
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base md:text-lg font-semibold text-foreground">
          Chat links
        </h2>
        <p className="text-sm text-muted-foreground">
          Replies sent through an agent&apos;s chat link use this
          workspace&apos;s own provider keys
        </p>
        {error && <p className="text-[13px] text-red-500 mt-1">{error}</p>}
      </div>
      <label
        className={`flex items-center gap-3 py-1 select-none ${
          isSaving ? "cursor-not-allowed opacity-50" : "cursor-pointer"
        }`}
      >
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => handleChange(e.target.checked)}
          disabled={isSaving}
          className="w-4 h-4 cursor-pointer accent-foreground disabled:cursor-not-allowed"
        />
        <span className="text-sm">
          Limit each chat link to {perDay.toLocaleString("en-US")} replies a
          day
        </span>
      </label>
    </section>
  );
}
