"use client";

import { useId, useState } from "react";
import {
  isProviderEnabled,
  useAccessToken,
  useEnabledProviders,
  useProviderKeys,
  useUsesOwnProviderKeys,
} from "@/hooks";
import { useOrgUuid } from "@/lib/nav";
import { SpinnerIcon } from "@/components/icons";
import type { ProviderKeyProvider } from "@/lib/orgs";
import { KeyField } from "./KeyField";
import { providerKeyErrorMessage } from "./ProviderKeysSection";

type ByProvider = Partial<Record<string, string>>;

/**
 * Keys typed into a provider picker for providers the workspace has no key
 * for yet. Only a workspace on its own keys can be missing one: on
 * Calibrate's keys every listed provider already runs.
 */
export function useMissingProviderKeys() {
  const accessToken = useAccessToken();
  const orgUuid = useOrgUuid();
  const usesOwnKeys = useUsesOwnProviderKeys();
  const enabledProviders = useEnabledProviders();
  const { saveProviderKey } = useProviderKeys(accessToken, orgUuid);
  const [values, setValues] = useState<ByProvider>({});
  const [errors, setErrors] = useState<ByProvider>({});
  const [saving, setSaving] = useState<Set<string>>(new Set());

  const isMissingKey = (provider: string) =>
    usesOwnKeys && !isProviderEnabled(enabledProviders, provider);

  const setValue = (provider: string, value: string) => {
    setValues((v) => ({ ...v, [provider]: value }));
    setErrors((e) => ({ ...e, [provider]: undefined }));
  };

  /** Saves the typed key of every given provider that has none. False when
   *  any is empty or refused, with the reason shown under its field. */
  const saveMissingKeys = async (providers: string[]): Promise<boolean> => {
    const missing = [...new Set(providers)].filter(isMissingKey);
    if (missing.length === 0) return true;
    const failed: ByProvider = {};
    for (const p of missing) {
      if (!values[p]?.trim()) failed[p] = "Paste a key for this provider";
    }
    if (Object.keys(failed).length > 0) {
      setErrors((e) => ({ ...e, ...failed }));
      return false;
    }
    setSaving((s) => new Set([...s, ...missing]));
    for (const p of missing) {
      try {
        await saveProviderKey(p as ProviderKeyProvider, values[p]!.trim());
        setValues((v) => ({ ...v, [p]: "" }));
      } catch (err) {
        failed[p] = providerKeyErrorMessage(err);
      }
    }
    setErrors((e) => {
      const next = { ...e, ...failed };
      for (const p of missing) if (!failed[p]) delete next[p];
      return next;
    });
    setSaving((s) => new Set([...s].filter((p) => !missing.includes(p))));
    return Object.keys(failed).length === 0;
  };

  return {
    usesOwnKeys,
    isMissingKey,
    values,
    errors,
    setValue,
    saveMissingKeys,
    isSaving: saving.size > 0,
    isSavingKey: (provider: string) => saving.has(provider),
  };
}

/** The field for pasting one provider's key inside a provider picker. */
export function ProviderKeyInput({
  provider,
  name,
  value,
  error,
  onChange,
  onSave,
  saving,
  disabled,
}: {
  provider: string;
  name: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  /** Checks the key with the provider and stores it. */
  onSave: () => void;
  saving: boolean;
  disabled?: boolean;
}) {
  // The picker draws a desktop and a phone copy of each row, so ids must differ.
  const inputId = `missing-provider-key-${provider}-${useId()}`;
  const errorId = `${inputId}-error`;
  return (
    // w-0 min-w-full: fills its table cell without widening the table.
    <div className="space-y-1 w-0 min-w-full">
      <div
        className={`flex flex-col sm:flex-row gap-2 ${provider === "google" ? "sm:items-start" : "sm:items-center"}`}
      >
        <KeyField
          id={inputId}
          name={name}
          value={value}
          onChange={onChange}
          onEnter={() => value.trim() && onSave()}
          multiline={provider === "google"}
          disabled={disabled || saving}
          error={!!error}
          errorId={errorId}
          ariaLabel={`${name} API key`}
        />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSave();
          }}
          disabled={disabled || saving || !value.trim()}
          aria-label={saving ? "Verifying" : `Save the ${name} key`}
          className="h-10 px-4 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shrink-0"
        >
          {saving && <SpinnerIcon className="w-4 h-4 animate-spin" />}
          {saving ? "Verifying" : "Save"}
        </button>
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-[13px] text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}

/** Marks a provider the workspace cannot run yet, in the app's amber warning colours. */
export function NoKeyBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-500 ${className}`}
    >
      API key needed
    </span>
  );
}
