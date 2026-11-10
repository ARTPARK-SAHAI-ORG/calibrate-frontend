"use client";

import React from "react";
import { Select } from "@/components/ui/Select";
import { useModelServingProviders, type ServingProvider } from "@/hooks";

/** "DeepInfra, $0.25 per million" — the name, then what OpenRouter charges
 *  for a million tokens of input. A company with no price is named on its
 *  own. */
function optionLabel({ name, pricePerMillionInput: price }: ServingProvider) {
  if (price === null) return name;
  if (price === 0) return `${name}, free`;
  if (price < 0.01) return `${name}, under $0.01 per million`;
  return `${name}, $${price.toFixed(2)} per million`;
}

type Props = {
  modelId: string;
  /** The chosen company, or null to let OpenRouter choose */
  value: string | null;
  onChange: (slug: string | null) => void;
  disabled?: boolean;
};

/**
 * Who serves one model, under its row in the compare-models window. The same
 * model is sold by several companies at different prices, so this is where the
 * reader picks one.
 *
 * Nothing is drawn until the list arrives, and nothing is drawn when no company
 * is known: this sits under a model row, where a box appearing and disappearing
 * reads worse than a beat of nothing. With only one company the box is shown
 * but cannot be changed, so the reader can still see who serves the model.
 */
export function ModelServingProviderSelect({
  modelId,
  value,
  onChange,
  disabled,
}: Props) {
  const { providers } = useModelServingProviders(modelId);

  if (providers.length === 0) return null;

  // A comparison being run again can name a company OpenRouter no longer
  // serves this model from. It still gets a row of its own, named by the
  // company, so the box never shows one company while the run uses another,
  // and the reader can move off it.
  const missing =
    value && !providers.some((p) => p.slug === value) ? value : null;
  // With one company there is nothing to choose, so the box is shown only to
  // say who serves the model.
  const only = providers.length === 1 && !missing ? providers[0] : null;

  return (
    <Select
      aria-label="Who serves this model"
      value={value ?? (only ? only.slug : "")}
      onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
      disabled={disabled || only !== null}
      className="h-8 text-xs text-muted-foreground cursor-pointer"
    >
      {!only && <option value="">Let OpenRouter choose</option>}
      {providers.map((provider) => (
        <option key={provider.slug} value={provider.slug}>
          {optionLabel(provider)}
        </option>
      ))}
      {missing && <option value={missing}>{missing}</option>}
    </Select>
  );
}
