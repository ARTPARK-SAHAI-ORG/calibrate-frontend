"use client";

import { useState, useEffect, useCallback } from "react";
import type { LLMProvider, LLMModel } from "@/components/agent-tabs/constants/providers";

type CacheEntry = {
  providers: LLMProvider[];
  timestamp: number;
};

const CACHE_TTL_MS = 10 * 60 * 1000;

let cache: CacheEntry | null = null;
let inflightPromise: Promise<LLMProvider[]> | null = null;

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

async function fetchModelsFromOpenRouter(): Promise<LLMProvider[]> {
  const response = await fetch("https://openrouter.ai/api/v1/models");
  if (!response.ok) throw new Error(`OpenRouter API error: ${response.status}`);

  const json = await response.json();

  if (!Array.isArray(json.data)) {
    throw new Error("Unexpected response format from OpenRouter API");
  }

  const grouped = new Map<string, LLMModel[]>();

  for (const model of json.data) {
    if (typeof model.id !== "string" || typeof model.name !== "string") continue;

    const slashIndex = model.id.indexOf("/");
    const providerSlug = slashIndex !== -1 ? model.id.slice(0, slashIndex) : "other";

    if (!grouped.has(providerSlug)) {
      grouped.set(providerSlug, []);
    }
    grouped.get(providerSlug)!.push({ id: model.id, name: model.name });
  }

  return Array.from(grouped.entries())
    .map(([slug, models]) => ({
      name: getProviderDisplayName(slug),
      models: models.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function getOrFetchProviders(): Promise<LLMProvider[]> {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL_MS) {
    return Promise.resolve(cache.providers);
  }

  if (!inflightPromise) {
    inflightPromise = fetchModelsFromOpenRouter()
      .then((providers) => {
        cache = { providers, timestamp: Date.now() };
        inflightPromise = null;
        return providers;
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
  isLoading: boolean;
  error: string | null;
  retry: () => void;
} {
  const [providers, setProviders] = useState<LLMProvider[]>(cache?.providers ?? []);
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
            setProviders(result);
            setIsLoading(false);
            setError(null);
          }
        })
        .catch((err) => {
          console.error("Failed to fetch OpenRouter models:", err);
          if (!cancelled) {
            setIsLoading(false);
            setError("Failed to load models. Please check your connection.");
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

  return { providers, isLoading, error, retry };
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
