"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAccessToken, useProviderKeys } from "@/hooks";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ExternalLinkIcon, SpinnerIcon } from "@/components/icons";
import { Tooltip } from "@/components/Tooltip";
import { KeyField } from "./KeyField";
import { LoadingState } from "@/components/ui/LoadingState";
import {
  getErrorStatusCode,
  parseBackendErrorMessage,
} from "@/lib/parseBackendError";
import type { ProviderKey, ProviderKeyProvider } from "@/lib/orgs";
import { sttProviders } from "@/components/agent-tabs/constants/providers";

export type ProviderEntry = {
  id: ProviderKeyProvider;
  name: string;
  website: string;
  note?: string;
};

// The speech pickers already hold each speech provider's website.
const websiteOf = (id: ProviderKeyProvider): string =>
  sttProviders.find((p) => p.value === id)?.website ?? "";

export const PROVIDER_KEY_SECTIONS: {
  title: string;
  description?: string;
  providers: ProviderEntry[];
}[] = [
  {
    title: "Language models",
    providers: [
      {
        id: "openrouter",
        name: "OpenRouter",
        website: "https://openrouter.ai",
        note: "Used by every evaluator, and by LLM tests, benchmarks and simulations",
      },
    ],
  },
  {
    title: "Voice evaluation",
    description: "Speech-to-text, text-to-speech and voice simulations",
    providers: [
      { id: "openai", name: "OpenAI", website: websiteOf("openai") },
      {
        id: "deepgram",
        name: "Deepgram",
        website: websiteOf("deepgram"),
      },
      {
        id: "elevenlabs",
        name: "ElevenLabs",
        website: websiteOf("elevenlabs"),
      },
      { id: "sarvam", name: "Sarvam", website: websiteOf("sarvam") },
      { id: "cartesia", name: "Cartesia", website: websiteOf("cartesia") },
      { id: "gemini", name: "Gemini", website: websiteOf("gemini") },
      { id: "google", name: "Google Cloud", website: websiteOf("google") },
      { id: "smallest", name: "Smallest AI", website: websiteOf("smallest") },
    ],
  },
];

/**
 * The backend answers 503 with a sentence written for the reader (the server
 * is not set up to store keys), so it is shown as is rather than replaced with
 * the generic server error line.
 */
export function providerKeyErrorMessage(err: unknown): string {
  const fallback = "Failed to save the key";
  if (getErrorStatusCode(err) === 503 && err instanceof Error) {
    const body = err.message.match(/Request failed:\s*\d+\s*-\s*(.+)$/)?.[1];
    try {
      const detail = (JSON.parse(body ?? "") as { detail?: unknown }).detail;
      if (typeof detail === "string" && detail.trim()) return detail;
    } catch {
      // not JSON: fall through to the generic line
    }
  }
  return parseBackendErrorMessage(err, fallback);
}

/** The provider's name, as the label of its key field, with a link to its site. */
export function ProviderName({
  provider,
  inputId,
}: {
  provider: ProviderEntry;
  inputId: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <h3 className="text-sm font-medium text-foreground">
        <label htmlFor={inputId}>{provider.name}</label>
      </h3>
      <Tooltip
        content={`Visit ${provider.name} website`}
        position="top"
        className="inline-flex"
      >
        <a
          href={provider.website}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Visit ${provider.name} website`}
          className="flex text-muted-foreground hover:text-foreground transition-colors"
        >
          <ExternalLinkIcon className="w-4 h-4" />
        </a>
      </Tooltip>
    </div>
  );
}

function ProviderKeyRow({
  provider,
  saved,
  needsConfirm,
  onSave,
  onRemove,
}: {
  provider: ProviderEntry;
  saved: ProviderKey | null;
  needsConfirm: boolean;
  onSave: (value: string) => Promise<unknown>;
  onRemove: () => void;
}) {
  const [value, setValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = `provider-key-${provider.id}`;
  const errorId = `${inputId}-error`;

  const save = async () => {
    setIsConfirming(false);
    setIsSaving(true);
    setError(null);
    try {
      await onSave(value.trim());
      setValue("");
    } catch (err) {
      setError(providerKeyErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const isJson = provider.id === "google";

  const handleSave = () => {
    if (!value.trim() || isSaving) return;
    if (needsConfirm) setIsConfirming(true);
    else void save();
  };

  return (
    <section className="space-y-2">
      <div>
        <ProviderName provider={provider} inputId={inputId} />
        {provider.note && (
          <p className="text-[13px] text-muted-foreground">{provider.note}</p>
        )}
      </div>

      {saved ? (
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="flex-1 min-w-0 h-10 px-3 flex items-center rounded-md border border-border bg-muted/30 text-sm text-muted-foreground">
            <span className="font-mono truncate">{saved.masked_value}</span>
          </div>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove the ${provider.name} key`}
            className="h-10 px-4 rounded-md text-sm font-medium text-red-500 bg-red-500/10 hover:bg-red-500/20 transition-colors cursor-pointer"
          >
            Remove
          </button>
        </div>
      ) : (
        <div>
          <div
            className={`flex flex-col sm:flex-row gap-2 ${isJson ? "sm:items-start" : "sm:items-center"}`}
          >
            <KeyField
              id={inputId}
              name={provider.name}
              value={value}
              onChange={(v) => {
                setValue(v);
                setError(null);
              }}
              onEnter={handleSave}
              multiline={isJson}
              disabled={isSaving}
              error={!!error}
              errorId={errorId}
            />
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !value.trim()}
              aria-label={
                isSaving ? "Verifying" : `Save the ${provider.name} key`
              }
              className="h-10 px-4 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSaving && <SpinnerIcon className="w-4 h-4 animate-spin" />}
              {isSaving ? "Verifying" : "Save"}
            </button>
          </div>
          {error && (
            <p
              id={errorId}
              role="alert"
              className="mt-1 text-[13px] text-red-500"
            >
              {error}
            </p>
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={isConfirming}
        onClose={() => setIsConfirming(false)}
        onConfirm={() => void save()}
        title={`Save the ${provider.name} key`}
        message="After this, every run in this workspace uses only your keys. Runs that need a provider without a key will fail"
        confirmText="Save the key"
      />
    </section>
  );
}

export function ProviderKeysSection({ orgUuid }: { orgUuid: string }) {
  const accessToken = useAccessToken();
  const {
    keys,
    usesOwnKeys,
    isLoading,
    error: loadError,
    refetch,
    saveProviderKey,
    removeProviderKey,
  } = useProviderKeys(accessToken, orgUuid);

  const [providerToRemove, setProviderToRemove] =
    useState<ProviderEntry | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const handleRemove = async () => {
    if (!providerToRemove) return;
    setIsRemoving(true);
    try {
      await removeProviderKey(providerToRemove.id);
      setProviderToRemove(null);
    } catch (err) {
      refetch();
      toast.error(parseBackendErrorMessage(err, "Failed to remove the key"));
    } finally {
      setIsRemoving(false);
    }
  };

  const isLastKey = keys.length === 1;

  return (
    <div className="space-y-6">
      <p className="text-sm md:text-base text-muted-foreground">
        Add your own API keys to remove the limits on evaluation runs and have
        them billed to your account
      </p>

      {isLoading && keys.length === 0 ? (
        <LoadingState />
      ) : loadError ? (
        <div className="border border-border rounded-xl px-4 py-6 bg-muted/20">
          <p className="text-[13px] text-red-500">{loadError}</p>
        </div>
      ) : (
        PROVIDER_KEY_SECTIONS.map((group) => (
          <section key={group.title} className="space-y-4">
            <h2 className="text-base md:text-lg font-semibold text-foreground">
              {group.title}
            </h2>
            {group.description && (
              <p className="-mt-3 text-[13px] text-muted-foreground">
                {group.description}
              </p>
            )}
            {group.providers.map((provider) => (
              <ProviderKeyRow
                key={provider.id}
                provider={provider}
                saved={keys.find((k) => k.provider === provider.id) ?? null}
                needsConfirm={!usesOwnKeys}
                onSave={(value) => saveProviderKey(provider.id, value)}
                onRemove={() => setProviderToRemove(provider)}
              />
            ))}
          </section>
        ))
      )}

      <DeleteConfirmationDialog
        isOpen={!!providerToRemove}
        onClose={() => {
          if (!isRemoving) setProviderToRemove(null);
        }}
        onConfirm={handleRemove}
        title={
          providerToRemove ? `Remove the ${providerToRemove.name} key` : ""
        }
        message={
          providerToRemove
            ? isLastKey
              ? "This will make the evaluation runs rely on Calibrate's default API keys and rate limits"
              : `Runs that need ${providerToRemove.name} will fail until you add a key for ${providerToRemove.name} again`
            : ""
        }
        confirmText="Remove"
        isDeleting={isRemoving}
      />
    </div>
  );
}
