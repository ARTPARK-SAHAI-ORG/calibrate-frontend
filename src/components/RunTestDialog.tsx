"use client";

import React, { useState, useEffect } from "react";
import { AgentPicker, Agent } from "@/components/AgentPicker";
import { useHideFloatingButton } from "@/components/AppLayout";

type RunTestDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  testName: string;
  testUuid: string;
  onRunTest: (
    agentUuid: string,
    agentName: string,
    attachToAgent: boolean
  ) => void;
};

export function RunTestDialog({
  isOpen,
  onClose,
  testName,
  testUuid,
  onRunTest,
}: RunTestDialogProps) {
  // Hide the floating "Talk to Us" button when this dialog is open
  useHideFloatingButton(isOpen);

  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [attachToAgent, setAttachToAgent] = useState(true);

  // Reset state when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedAgent(null);
      setAttachToAgent(true);
    }
  }, [isOpen]);

  const handleRunTest = () => {
    if (selectedAgent) {
      onRunTest(selectedAgent.uuid, selectedAgent.name, attachToAgent);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Dialog */}
      <div className="relative w-full max-w-lg mx-4 bg-background border border-border rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 md:px-6 pt-4 md:pt-5 pb-1">
          <h2 className="text-lg md:text-xl font-semibold text-foreground">
            Run test
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-4 md:px-6 pb-2 space-y-3 md:space-y-4">
          {/* Subtitle */}
          <p className="text-muted-foreground text-xs md:text-sm">
            Select an agent to run the test &quot;{testName}&quot;
          </p>

          {/* Info Box */}
          <div className="bg-muted rounded-xl px-3 md:px-4 py-2.5 md:py-3 flex gap-2 md:gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <svg
                className="w-4 h-4 md:w-5 md:h-5 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
                />
              </svg>
            </div>
            <p className="text-foreground text-xs md:text-sm leading-relaxed">
              You can save and run tests in bulk. Check out the
              &quot;Tests&quot; tab in the agent&apos;s configuration.
            </p>
          </div>

          {/* Select Agent */}
          <AgentPicker
            selectedAgentUuid={selectedAgent?.uuid || ""}
            onSelectAgent={setSelectedAgent}
            label="Select Agent"
            placeholder="Select an agent"
          />

          {/* Attach checkbox */}
          {selectedAgent && (
            <div className="flex items-center gap-2 md:gap-3">
              <button
                onClick={() => setAttachToAgent(!attachToAgent)}
                className={`w-5 h-5 md:w-6 md:h-6 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-colors cursor-pointer ${
                  attachToAgent
                    ? "bg-foreground border-foreground"
                    : "border-muted-foreground hover:border-foreground"
                }`}
              >
                {attachToAgent && (
                  <svg
                    className="w-3 h-3 md:w-4 md:h-4 text-background"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4.5 12.75l6 6 9-13.5"
                    />
                  </svg>
                )}
              </button>
              <span className="text-xs md:text-sm text-foreground">
                Attach this test to the agent config
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 md:px-6 py-3 flex items-center justify-end gap-2 md:gap-3">
          <button
            onClick={onClose}
            className="h-9 md:h-10 px-4 md:px-5 rounded-lg text-xs md:text-base font-medium bg-muted text-foreground hover:bg-muted/80 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleRunTest}
            disabled={!selectedAgent}
            className="h-9 md:h-10 px-4 md:px-5 rounded-lg text-xs md:text-base font-medium bg-transparent text-foreground border border-border hover:bg-muted transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
            Run test
          </button>
        </div>
      </div>
    </div>
  );
}
