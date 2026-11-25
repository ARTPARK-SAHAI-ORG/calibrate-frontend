"use client";
import { reportError } from "@/lib/reportError";

import { useState, useEffect, useCallback } from "react";
import type { LLMProvider, LLMModel } from "@/components/agent-tabs/constants/providers";
import { getBackendUrl } from "@/lib/api";
import type { ModelAvailability } from "@/lib/modelAvailability";

type ModelsResult = {
  providers: LLMProvider[];
  availability: ModelAvailability;
};

type CacheEntry = ModelsResult & { timestamp: number };

const CACHE_TTL_MS = 10 * 60 * 1000;

export const OPENROUTER_DISABLED_MESSAGE =
  "OpenRouter models are not supported in this deployment. Please talk to your admin.";

type AllowedProvider = { slug: string; name: string };
type AllowedProviders = "all" | AllowedProvider[];

type ProvidersResponse = null | {
  providers: "all" | AllowedProvider[];
  zero_data_retention?: boolean;
};

let cache: CacheEntry | null = null;
let inflightPromise: Promise<ModelsResult> | null = null;

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  "meta-llama": "Meta",
  mistralai: "Mistral",
  deepseek: "DeepSeek",
  qwen: "Qwen",
  "x-ai": "xAI",
  perplexity: "Perplexity",
  cohere: "Cohere",
  amazon: "Amazon",
  nvidia: "NVIDIA",
  microsoft: "Microsoft",
  "moonshotai": "MoonshotAI",
  "bytedance-seed": "ByteDance Seed",
  minimax: "MiniMax",
  "ai21": "AI21",
  inflection: "Inflection",
  ibm: "IBM",
  tencent: "Tencent",
  inception: "Inception",
  nous: "Nous",
  "allen-ai": "AllenAI",
  "arcee-ai": "Arcee AI",
  "deep-cogito": "Deep Cogito",
  baidu: "Baidu",
  "z-ai": "Z.AI",
  stepfun: "StepFun",
  morph: "Morph",
  "prime-intellect": "Prime Intellect",
};

function getProviderDisplayName(slug: string): string {
  if (PROVIDER_DISPLAY_NAMES[slug]) return PROVIDER_DISPLAY_NAMES[slug];
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function isDeprecated(model: { expiration_date?: string | null }): boolean {
  if (!model.expiration_date) return false;
  const ts = Date.parse(model.expiration_date);
  if (Number.isNaN(ts)) return false;
  return ts < Date.now();
}

async function fetchAllowedProviders(): Promise<{
  allowed: AllowedProviders;
  zdr: boolean;
}> {
  const backendUrl = getBackendUrl();
  const response = await fetch(`${backendUrl}/openrouter/providers`, {
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Failed to load OpenRouter providers: ${response.status}`);
  }

  const text = await response.text();
  const json: ProvidersResponse = text ? JSON.parse(text) : null;

  if (json === null) {
    throw new Error(OPENROUTER_DISABLED_MESSAGE);
  }

  const zdr = json.zero_data_retention === true;
  if (json.providers === "all") return { allowed: "all", zdr };

  if (Array.isArray(json.providers)) {
    const allowed = json.providers
      .filter(
        (p): p is AllowedProvider =>
          !!p && typeof p.slug === "string" && typeof p.name === "string",
      )
      .map((p) => ({ slug: p.slug, name: p.name }));
    return { allowed, zdr };
  }

  throw new Error("Unexpected response format from /openrouter/providers");
}

/** The models with a provider that keeps no copy of the data. Null when the
 *  list cannot be read, so a failed read never blocks a model. */
async function fetchPrivacyAllowed(): Promise<Set<string> | null> {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/models?zdr=true");
    if (!response.ok) return null;
    const json = await response.json();
    if (!Array.isArray(json.data)) return null;
    return new Set(
      json.data
        .map((m: { id?: unknown }) => m.id)
        .filter((id: unknown): id is string => typeof id === "string"),
    );
  } catch {
    return null;
  }
}

async function fetchModelsFromOpenRouter(
  allowed: AllowedProviders,
  zdr: boolean,
): Promise<ModelsResult> {
  const response = await fetch("https://openrouter.ai/api/v1/models");
  if (!response.ok) throw new Error(`OpenRouter API error: ${response.status}`);

  const json = await response.json();

  if (!Array.isArray(json.data)) {
    throw new Error("Unexpected response format from OpenRouter API");
  }

  const allowedSlugSet =
    allowed === "all" ? null : new Set(allowed.map((p) => p.slug));
  const allowedNameOverrides =
    allowed === "all"
      ? null
      : new Map(allowed.map((p) => [p.slug, p.name] as const));

  const grouped = new Map<string, LLMModel[]>();
  const models: ModelAvailability["models"] = new Map();

  for (const model of json.data) {
    if (typeof model.id !== "string" || typeof model.name !== "string") continue;
    models.set(model.id, { expiresOn: model.expiration_date ?? null });
    if (isDeprecated(model)) continue;

    const slashIndex = model.id.indexOf("/");
    const providerSlug = slashIndex !== -1 ? model.id.slice(0, slashIndex) : "other";

    if (allowedSlugSet && !allowedSlugSet.has(providerSlug)) continue;

    const arch = model.architecture ?? {};
    const inputModalities = Array.isArray(arch.input_modalities)
      ? (arch.input_modalities as unknown[]).filter(
          (m): m is string => typeof m === "string",
        )
      : undefined;
    const outputModalities = Array.isArray(arch.output_modalities)
      ? (arch.output_modalities as unknown[]).filter(
          (m): m is string => typeof m === "string",
        )
      : undefined;

    if (!grouped.has(providerSlug)) {
      grouped.set(providerSlug, []);
    }
    grouped.get(providerSlug)!.push({
      id: model.id,
      name: model.name,
      inputModalities,
      outputModalities,
      ...(model.expiration_date ? { expiresOn: model.expiration_date } : {}),
    });
  }

  const privacyAllowed = zdr ? await fetchPrivacyAllowed() : null;

  const providers = Array.from(grouped.entries())
    .map(([slug, models]) => ({
      slug,
      name: allowedNameOverrides?.get(slug) ?? getProviderDisplayName(slug),
      models: models.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { providers, availability: { models, privacyAllowed } };
}

function getOrFetchProviders(): Promise<ModelsResult> {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL_MS) {
    return Promise.resolve(cache);
  }

  if (!inflightPromise) {
    inflightPromise = fetchAllowedProviders()
      .then(({ allowed, zdr }) => fetchModelsFromOpenRouter(allowed, zdr))
      .then((result) => {
        cache = { ...result, timestamp: Date.now() };
        inflightPromise = null;
        return result;
      })
      .catch((err) => {
        inflightPromise = null;
        throw err;
      });
  }

  return inflightPromise;
}

export function useOpenRouterModels(): {
  providers: LLMProvider[];
  /** What OpenRouter says about every model; null while loading or when the
   *  list could not be read. */
  availability: ModelAvailability | null;
  isLoading: boolean;
  error: string | null;
  retry: () => void;
} {
  const [providers, setProviders] = useState<LLMProvider[]>(cache?.providers ?? []);
  const [availability, setAvailability] = useState<ModelAvailability | null>(
    cache?.availability ?? null,
  );
  const [isLoading, setIsLoading] = useState(
    !cache || Date.now() - cache.timestamp >= CACHE_TTL_MS
  );
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const retry = useCallback(() => {
    cache = null;
    inflightPromise = null;
    setError(null);
    setIsLoading(true);
    setRetryCount((c) => c + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const doFetch = () => {
      getOrFetchProviders()
        .then((result) => {
          if (!cancelled) {
            setProviders(result.providers);
            setAvailability(result.availability);
            setIsLoading(false);
            setError(null);
          }
        })
        .catch((err: unknown) => {
          reportError("Failed to fetch OpenRouter models:", err);
          if (!cancelled) {
            setIsLoading(false);
            const isDisabled =
              err instanceof Error && err.message === OPENROUTER_DISABLED_MESSAGE;
            if (isDisabled) {
              cache = null;
              setProviders([]);
            }
            setAvailability(null);
            setError(
              isDisabled
                ? OPENROUTER_DISABLED_MESSAGE
                : "Failed to load models. Please check your connection.",
            );
          }
        });
    };

    doFetch();

    const interval = setInterval(() => {
      if (!cache || Date.now() - cache.timestamp >= CACHE_TTL_MS) {
        doFetch();
      }
    }, CACHE_TTL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [retryCount]);

  return { providers, availability, isLoading, error, retry };
}

export function findModelInProviders(
  providers: LLMProvider[],
  modelId: string
): LLMModel | null {
  for (const provider of providers) {
    const model = provider.models.find((m) => m.id === modelId);
    if (model) return model;
  }
  return null;
}
