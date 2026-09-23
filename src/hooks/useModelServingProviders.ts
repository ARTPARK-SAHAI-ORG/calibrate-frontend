"use client";

import { useEffect, useState } from "react";
import { createRequestCache } from "@/lib/requestCache";
import { reportError } from "@/lib/reportError";

/**
 * The companies that serve one model on OpenRouter, cheapest first.
 *
 * Read straight from OpenRouter's own public endpoint: the backend does not
 * hold this list, and it carries no secrets, so there is no key to attach.
 * Any failure gives an empty list rather than an error state, because with
 * nothing to choose between the picker simply does not appear.
 */

export type ServingProvider = {
  slug: string;
  name: string;
  pricePerMillionInput: number | null;
};

type EndpointsResponse = {
  data?: {
    endpoints?: unknown;
  };
};

const CACHE_TTL_MS = 10 * 60 * 1000;

const cache = createRequestCache<ServingProvider[]>({ ttlMs: CACHE_TTL_MS });

function parseEndpoints(json: EndpointsResponse): ServingProvider[] {
  const endpoints = json?.data?.endpoints;
  if (!Array.isArray(endpoints)) return [];

  // Keyed by slug: one company can appear twice at different quantizations,
  // and the reader only picks the company, so keep its cheapest offer.
  const bySlug = new Map<string, ServingProvider>();

  for (const raw of endpoints) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as {
      provider_name?: unknown;
      tag?: unknown;
      status?: unknown;
      pricing?: { prompt?: unknown };
    };

    // OpenRouter deranks an endpoint with a negative status, so a reader must
    // not be able to pin one.
    if (typeof entry.status === "number" && entry.status < 0) continue;

    if (typeof entry.tag !== "string") continue;
    const slash = entry.tag.indexOf("/");
    const slug = slash === -1 ? entry.tag : entry.tag.slice(0, slash);
    if (!slug) continue;

    const name =
      typeof entry.provider_name === "string" && entry.provider_name
        ? entry.provider_name
        : slug;

    const perToken = Number(entry.pricing?.prompt);
    const pricePerMillionInput = Number.isFinite(perToken)
      ? perToken * 1e6
      : null;

    const existing = bySlug.get(slug);
    if (
      !existing ||
      (pricePerMillionInput !== null &&
        (existing.pricePerMillionInput === null ||
          pricePerMillionInput < existing.pricePerMillionInput))
    ) {
      bySlug.set(slug, { slug, name, pricePerMillionInput });
    }
  }

  return Array.from(bySlug.values()).sort((a, b) => {
    if (a.pricePerMillionInput === null && b.pricePerMillionInput === null) {
      return a.name.localeCompare(b.name);
    }
    // A company that did not say its price goes last.
    if (a.pricePerMillionInput === null) return 1;
    if (b.pricePerMillionInput === null) return -1;
    if (a.pricePerMillionInput !== b.pricePerMillionInput) {
      return a.pricePerMillionInput - b.pricePerMillionInput;
    }
    return a.name.localeCompare(b.name);
  });
}

async function fetchServingProviders(
  modelId: string,
): Promise<ServingProvider[]> {
  // The model id already carries a slash (`deepseek/deepseek-chat-v3.1`) and
  // OpenRouter wants it as a path, so it is not encoded.
  const response = await fetch(
    `https://openrouter.ai/api/v1/models/${modelId}/endpoints`,
  );
  if (!response.ok) {
    throw new Error(`OpenRouter endpoints error: ${response.status}`);
  }
  return parseEndpoints((await response.json()) as EndpointsResponse);
}

export function useModelServingProviders(modelId: string | null): {
  providers: ServingProvider[];
  isLoading: boolean;
} {
  // Each answer is kept under the model it was asked for, so an answer that
  // arrives after the reader has picked a different model is ignored rather
  // than shown against the new one. A list already in hand is read here, in
  // the same pass that draws the picker, so reopening the window shows it at
  // once with no wait.
  const [answer, setAnswer] = useState<{
    key: string;
    providers: ServingProvider[];
  } | null>(null);
  const ready =
    (modelId ? cache.peek(modelId) : undefined) ??
    (answer && answer.key === modelId ? answer.providers : undefined);

  useEffect(() => {
    if (!modelId || cache.peek(modelId)) return;
    let cancelled = false;

    cache
      .fetch(modelId, () => fetchServingProviders(modelId))
      .then((providers) => {
        if (!cancelled) setAnswer({ key: modelId, providers });
      })
      .catch((err: unknown) => {
        reportError("Failed to fetch model serving providers:", err);
        // Nothing to choose between, so the picker does not appear.
        if (!cancelled) setAnswer({ key: modelId, providers: [] });
      });

    return () => {
      cancelled = true;
    };
  }, [modelId]);

  return {
    providers: ready ?? [],
    isLoading: Boolean(modelId) && ready === undefined,
  };
}
