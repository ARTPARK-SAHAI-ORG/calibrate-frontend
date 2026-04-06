"use client";

import React, { useState } from "react";
import {
  sttProviders,
  ttsProviders,
  type LLMModel,
} from "./constants/providers";
import { LLMSelectorModal } from "./LLMSelectorModal";

export type { LLMModel };

type AgentTabContentProps = {
  systemPrompt: string;
  setSystemPrompt: (value: string) => void;
  sttProvider: string;
  setSttProvider: (value: string) => void;
  ttsProvider: string;
  setTtsProvider: (value: string) => void;
  selectedLLM: LLMModel | null;
  setSelectedLLM: (value: LLMModel | null) => void;
};

export function AgentTabContent({
  systemPrompt,
  setSystemPrompt,
  sttProvider,
  setSttProvider,
  ttsProvider,
  setTtsProvider,
  selectedLLM,
  setSelectedLLM,
}: AgentTabContentProps) {
  const [llmModalOpen, setLlmModalOpen] = useState(false);

  return (
    <>
      <div className="flex flex-col md:grid md:grid-cols-2 gap-6 md:gap-8 md:h-[calc(100vh-200px)]">
        {/* Left Column: System Prompt */}
        <div className="flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            <label className="text-sm md:text-base font-medium text-foreground">
              System prompt
            </label>
            <div className="relative group">
              <button className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"
                  />
                </svg>
              </button>
              <div className="absolute left-0 top-full mt-2 w-72 p-3 bg-white text-gray-900 text-base leading-relaxed rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                The system prompt is used to determine the persona of the agent
                and the context of the conversation.
              </div>
            </div>
          </div>
          <div className="bg-muted/30 rounded-xl overflow-hidden border border-border md:flex-1 h-[350px] md:h-auto">
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="w-full h-full px-3 md:px-4 py-3 text-sm md:text-base bg-muted/30 text-foreground focus:outline-none resize-none"
            />
          </div>
        </div>

        {/* Right Column: STT, TTS, LLM */}
        <div className="space-y-6 md:space-y-8">
          {/* Speech To Text */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-sm md:text-base font-medium text-foreground">
                  Speech To Text
                </h3>
                <p className="text-sm md:text-base text-muted-foreground mt-0.5">
                  Select the STT provider for the agent
                </p>
              </div>
            </div>
            <div className="mt-2 md:mt-3">
              <div className="relative">
                <select
                  value={sttProvider}
                  onChange={(e) => setSttProvider(e.target.value)}
                  className="w-full h-9 md:h-10 px-3 md:px-4 pr-10 rounded-md text-sm md:text-base border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent cursor-pointer appearance-none"
                >
                  {sttProviders.map((provider) => (
                    <option key={provider.value} value={provider.value}>
                      {provider.label}
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <svg
                    className="w-4 h-4 text-muted-foreground"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                    />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Text To Speech */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-sm md:text-base font-medium text-foreground">
                  Text To Speech
                </h3>
                <p className="text-sm md:text-base text-muted-foreground mt-0.5">
                  Select the TTS provider for the agent
                </p>
              </div>
            </div>
            <div className="mt-2 md:mt-3">
              <div className="relative">
                <select
                  value={ttsProvider}
                  onChange={(e) => setTtsProvider(e.target.value)}
                  className="w-full h-9 md:h-10 px-3 md:px-4 pr-10 rounded-md text-sm md:text-base border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent cursor-pointer appearance-none"
                >
                  {ttsProviders.map((provider) => (
                    <option key={provider.value} value={provider.value}>
                      {provider.label}
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <svg
                    className="w-4 h-4 text-muted-foreground"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                    />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* LLM */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-sm md:text-base font-medium text-foreground">
                  LLM
                </h3>
                <p className="text-sm md:text-base text-muted-foreground mt-0.5">
                  Select which provider and model to use for the LLM
                </p>
              </div>
            </div>
            <div className="mt-2 md:mt-3">
              <button
                onClick={() => setLlmModalOpen(true)}
                className="w-full h-9 md:h-10 px-3 md:px-4 rounded-md text-sm md:text-base border border-border bg-background hover:bg-muted/50 flex items-center justify-between cursor-pointer transition-colors"
              >
                <span
                  className={
                    selectedLLM ? "text-foreground" : "text-muted-foreground"
                  }
                >
                  {selectedLLM ? selectedLLM.name : "Select LLM model"}
                </span>
                <svg
                  className="w-4 h-4 text-muted-foreground"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* LLM Selection Modal */}
      <LLMSelectorModal
        isOpen={llmModalOpen}
        onClose={() => setLlmModalOpen(false)}
        selectedLLM={selectedLLM}
        onSelect={setSelectedLLM}
      />
    </>
  );
}
