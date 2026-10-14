"use client";

import { useState } from "react";
import { useAccessToken, useProviderKeys } from "@/hooks";
import { useOrgUuid } from "@/lib/nav";
import { SpinnerIcon } from "@/components/icons";
import type { ProviderKeyProvider } from "@/lib/orgs";
import {
  PROVIDER_KEY_SECTIONS,
  ProviderName,
  providerKeyErrorMessage,
  type ProviderEntry,
} from "./ProviderKeysSection";

const ENTRIES = PROVIDER_KEY_SECTIONS.flatMap((s) => s.providers);

/** One key field per provider and a single Save, for a page that cannot run
 *  until the workspace has a key for at least one of them. */
export function AddProviderKeys({
  message,
  providerIds,
  onDone,
}: {
  message: string;
  providerIds: ProviderKeyProvider[];
  /** Called once every filled field has been saved. */
  onDone: () => void;
}) {
  const accessToken = useAccessToken();
  const orgUuid = useOrgUuid();
  const { keys, saveProviderKey } = useProviderKeys(accessToken, orgUuid);
  const [values, setValues] = useState<
    Partial<Record<ProviderKeyProvider, string>>
  >({});
  const [errors, setErrors] = useState<
    Partial<Record<ProviderKeyProvider, string>>
  >({});
  const [isSaving, setIsSaving] = useState(false);

  const entries = providerIds
    .map((id) => ENTRIES.find((e) => e.id === id))
    .filter((e): e is ProviderEntry => !!e);
  const filled = entries.filter((e) => values[e.id]?.trim());

  const saveAll = async () => {
    if (filled.length === 0 || isSaving) return;
    setIsSaving(true);
    setErrors({});
    const failed: Partial<Record<ProviderKeyProvider, string>> = {};
    for (const provider of filled) {
      try {
        await saveProviderKey(provider.id, values[provider.id]!.trim());
        setValues((v) => ({ ...v, [provider.id]: "" }));
      } catch (err) {
        failed[provider.id] = providerKeyErrorMessage(err);
      }
    }
    setErrors(failed);
    setIsSaving(false);
    if (Object.keys(failed).length === 0) onDone();
  };

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <p className="text-sm text-foreground">{message}</p>
      {entries.map((provider) => {
        const inputId = `add-provider-key-${provider.id}`;
        const errorId = `${inputId}-error`;
        const error = errors[provider.id];
        const savedKey = keys.find((k) => k.provider === provider.id);
        const fieldProps = {
          id: inputId,
          value: values[provider.id] ?? "",
          onChange: (
            e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
          ) => setValues((v) => ({ ...v, [provider.id]: e.target.value })),
          disabled: isSaving,
          "aria-invalid": !!error,
          "aria-describedby": error ? errorId : undefined,
        };
        const border = error
          ? "border-red-500/60 focus:ring-red-500/20"
          : "border-border focus:ring-foreground/10";
        return (
          <div key={provider.id} className="space-y-2">
            <ProviderName provider={provider} inputId={inputId} />
            {savedKey ? (
              <p className="text-sm text-muted-foreground">
                Saved <span className="font-mono">{savedKey.masked_value}</span>
              </p>
            ) : provider.id === "google" ? (
              <textarea
                {...fieldProps}
                rows={6}
                placeholder="Paste your service account JSON"
                spellCheck={false}
                className={`w-full px-3 py-2 rounded-md border bg-background text-sm font-mono text-foreground placeholder:font-sans placeholder:text-muted-foreground focus:outline-none focus:ring-2 disabled:opacity-50 ${border}`}
              />
            ) : (
              <input
                {...fieldProps}
                type="password"
                autoComplete="off"
                placeholder={`Paste your ${provider.name} API key`}
                className={`w-full h-10 px-3 rounded-md border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 disabled:opacity-50 ${border}`}
              />
            )}
            {error && (
              <p id={errorId} role="alert" className="text-[13px] text-red-500">
                {error}
              </p>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => void saveAll()}
        disabled={isSaving || filled.length === 0}
        className="h-10 px-4 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {isSaving && <SpinnerIcon className="w-4 h-4 animate-spin" />}
        {isSaving ? "Verifying" : "Save keys"}
      </button>
    </div>
  );
}
