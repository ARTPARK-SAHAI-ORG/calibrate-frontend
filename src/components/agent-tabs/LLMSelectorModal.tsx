"use client";

import React, { useState } from "react";
import type { LLMModel } from "./constants/providers";
import { ChevronLeftIcon, CloseIcon } from "@/components/icons";
import { useHideFloatingButton } from "@/components/AppLayout";
import { useOpenRouterModels } from "@/hooks";

type LLMProvider = {
  name: string;
  models: LLMModel[];
};

type LLMSelectorModalProps = {
  isOpen: boolean;
  onClose: () => void;
  selectedLLM: LLMModel | null;
  onSelect: (model: LLMModel) => void;
  availableProviders?: LLMProvider[];
};

export function LLMSelectorModal({
  isOpen,
  onClose,
  selectedLLM,
  onSelect,
  availableProviders,
}: LLMSelectorModalProps) {
  useHideFloatingButton(isOpen);

  const [searchQuery, setSearchQuery] = useState("");
  const { providers: fetchedProviders, isLoading, error, retry } = useOpenRouterModels();

  if (!isOpen) return null;

  const providers = availableProviders || fetchedProviders;

  const handleClose = () => {
    setSearchQuery("");
    onClose();
  };

  const handleSelect = (model: LLMModel) => {
    onSelect(model);
    setSearchQuery("");
    onClose();
  };

  // Filter providers and models by search query
  const filteredProviders = providers
    .map((provider) => ({
      ...provider,
      models: provider.models.filter(
        (model) =>
          model.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          provider.name.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    }))
    .filter((provider) => provider.models.length > 0);

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-16 bg-black/50">
      <div className="bg-background border border-border rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-3">
            <button
              onClick={handleClose}
              className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer"
            >
              <ChevronLeftIcon className="w-5 h-5" />
            </button>
            <h2 className="text-base font-semibold">Select LLM</h2>
          </div>
          <button
            onClick={handleClose}
            className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Search Input */}
        <div className="px-4 py-3 border-b border-border">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search LLM"
            className="w-full h-10 px-4 rounded-md text-base border border-border bg-muted/30 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            autoFocus
          />
        </div>

        {/* Models List */}
        <div className="flex-1 overflow-y-auto">
          {error && providers.length === 0 ? (
            <div className="p-8 flex flex-col items-center gap-3 text-sm text-muted-foreground">
              <span>{error}</span>
              <button
                onClick={retry}
                className="px-4 py-2 text-sm font-medium rounded-md border border-border hover:bg-muted/50 transition-colors cursor-pointer"
              >
                Retry
              </button>
            </div>
          ) : isLoading && providers.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Loading models...
            </div>
          ) : filteredProviders.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No models found
            </div>
          ) : (
            filteredProviders.map((provider) => (
              <div key={provider.name} className="py-2">
                <h3 className="px-4 py-2 text-sm font-medium text-muted-foreground">
                  {provider.name}
                </h3>
                {provider.models.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => handleSelect(model)}
                    className={`w-full px-4 py-3 flex items-center hover:bg-muted/50 transition-colors cursor-pointer ${
                      selectedLLM?.id === model.id ? "bg-muted/50" : ""
                    }`}
                  >
                    <span className="text-base font-medium text-foreground">
                      {model.name}
                    </span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
