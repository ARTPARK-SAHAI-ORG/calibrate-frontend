"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAccessToken, useProviderKeys } from "@/hooks";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { LoadingState } from "@/components/ui/LoadingState";
import { formatDate } from "@/lib/formatDate";
import { parseBackendErrorMessage } from "@/lib/parseBackendError";
import type { ProviderKeyProvider } from "@/lib/orgs";
import { ProviderKeyDialog } from "./ProviderKeyDialog";

export const PROVIDER_KEY_PROVIDERS: {
  id: ProviderKeyProvider;
  name: string;
}[] = [
  { id: "openrouter", name: "OpenRouter" },
  { id: "openai", name: "OpenAI" },
  { id: "deepgram", name: "Deepgram" },
  { id: "elevenlabs", name: "ElevenLabs" },
  { id: "sarvam", name: "Sarvam" },
  { id: "cartesia", name: "Cartesia" },
  { id: "smallest", name: "Smallest" },
  { id: "groq", name: "Groq" },
  { id: "gemini", name: "Gemini" },
  { id: "google", name: "Google Cloud" },
];

type Provider = (typeof PROVIDER_KEY_PROVIDERS)[number];

const neutralButton =
  "px-3 rounded-md text-xs font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer";
const removeButton =
  "px-3 rounded-md text-xs font-medium text-red-500 bg-red-500/10 hover:bg-red-500/20 transition-colors cursor-pointer";

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

  // Frozen when the dialog opens, so saving does not change its wording
  // while it is still on screen.
  const [editing, setEditing] = useState<{
    provider: Provider;
    isReplace: boolean;
    isFirstKey: boolean;
  } | null>(null);
  const [providerToRemove, setProviderToRemove] = useState<Provider | null>(
    null,
  );
  const [isRemoving, setIsRemoving] = useState(false);

  const keyFor = (id: ProviderKeyProvider) =>
    keys.find((k) => k.provider === id) ?? null;

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

  const actions = (provider: Provider, fullWidth: boolean) => {
    const hasKey = !!keyFor(provider.id);
    const width = fullWidth ? "flex-1 h-8" : "h-9";
    return (
      <>
        <button
          type="button"
          onClick={() =>
            setEditing({ provider, isReplace: hasKey, isFirstKey: !usesOwnKeys })
          }
          className={`${neutralButton} ${width}`}
          aria-label={`${hasKey ? "Replace" : "Add"} the ${provider.name} key`}
        >
          {hasKey ? "Replace key" : "Add key"}
        </button>
        {hasKey && (
          <button
            type="button"
            onClick={() => setProviderToRemove(provider)}
            className={`${removeButton} ${width}`}
            aria-label={`Remove the ${provider.name} key`}
          >
            Remove key
          </button>
        )}
      </>
    );
  };

  return (
    <section className="space-y-4">
      <p className="text-sm md:text-base text-muted-foreground">
        Add your own keys so this workspace&apos;s runs are billed to your
        accounts. Once you add any key, every run in this workspace uses only
        your keys, and the limits on rows per run and on scored traces are
        removed. Runs that need a provider you have not added will fail. Evaluators run through OpenRouter, so add an
        OpenRouter key.
      </p>

      {isLoading && keys.length === 0 ? (
        <LoadingState />
      ) : loadError ? (
        <div className="border border-border rounded-xl px-4 py-6 bg-muted/20">
          <p className="text-[13px] text-red-500">{loadError}</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block border border-border rounded-xl overflow-hidden">
            <div className="grid grid-cols-[1fr_1.5fr_140px_220px] gap-4 px-4 py-2 border-b border-border bg-muted/30">
              <div className="text-sm font-medium text-muted-foreground">
                Provider
              </div>
              <div className="text-sm font-medium text-muted-foreground">
                Key
              </div>
              <div className="text-sm font-medium text-muted-foreground">
                Updated
              </div>
              <div />
            </div>
            {PROVIDER_KEY_PROVIDERS.map((provider) => {
              const key = keyFor(provider.id);
              return (
                <div
                  key={provider.id}
                  className="grid grid-cols-[1fr_1.5fr_140px_220px] gap-4 px-4 py-3 border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors items-center"
                >
                  <p className="text-sm font-medium text-foreground truncate">
                    {provider.name}
                  </p>
                  <p
                    className={`text-sm text-muted-foreground truncate ${
                      key ? "font-mono" : ""
                    }`}
                  >
                    {key ? key.masked_value : "Not added"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {key ? formatDate(key.updated_at) : ""}
                  </p>
                  <div className="flex items-center justify-end gap-2">
                    {actions(provider, false)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {PROVIDER_KEY_PROVIDERS.map((provider) => {
              const key = keyFor(provider.id);
              return (
                <div
                  key={provider.id}
                  className="border border-border rounded-lg overflow-hidden bg-background"
                >
                  <div className="p-4">
                    <div className="text-sm font-medium text-foreground mb-1 truncate">
                      {provider.name}
                    </div>
                    <div
                      className={`text-xs text-muted-foreground mb-1 truncate ${
                        key ? "font-mono" : ""
                      }`}
                    >
                      {key ? key.masked_value : "Not added"}
                    </div>
                    {key && (
                      <div className="text-xs text-muted-foreground">
                        {`Updated ${formatDate(key.updated_at)}`}
                      </div>
                    )}
                  </div>
                  <div className="px-4 pb-3 pt-0 flex gap-2">
                    {actions(provider, true)}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <ProviderKeyDialog
        isOpen={!!editing}
        onClose={() => setEditing(null)}
        providerName={editing?.provider.name ?? ""}
        isFile={editing?.provider.id === "google"}
        isReplace={editing?.isReplace ?? false}
        isFirstKey={editing?.isFirstKey ?? false}
        onSave={(value) => saveProviderKey(editing!.provider.id, value)}
      />

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
              ? `Remove the ${providerToRemove.name} key? It is the last key, so runs in this workspace go back to the keys Calibrate provides and the limits on rows per run and on scored traces apply again.`
              : `Remove the ${providerToRemove.name} key? Runs that need ${providerToRemove.name} will fail until you add a key again.`
            : ""
        }
        confirmText="Remove"
        isDeleting={isRemoving}
      />
    </section>
  );
}
