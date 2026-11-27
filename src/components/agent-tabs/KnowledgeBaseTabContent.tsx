"use client";

import React, { useId } from "react";
import { InfoNote } from "@/components/ui";
import {
  characterCount,
  knowledgeBaseLength,
  knowledgeBaseOverBy,
} from "@/lib/knowledgeBase";

type KnowledgeBaseTabContentProps = {
  text: string;
  onTextChange: (text: string) => void;
  /** The backend's limit; null until it has answered. */
  maxChars: number | null;
};

export function KnowledgeBaseTabContent({
  text,
  onTextChange,
  maxChars,
}: KnowledgeBaseTabContentProps) {
  const textareaId = useId();
  const overBy = knowledgeBaseOverBy(text, maxChars);
  const isOver = overBy > 0;

  return (
    <div className="flex flex-col md:grid md:grid-cols-3 gap-6 md:gap-8 md:h-[calc(100vh-200px)]">
      <div className="flex flex-col md:col-span-2">
        <label
          htmlFor={textareaId}
          className="text-sm md:text-base font-medium text-foreground"
        >
          Knowledge base
        </label>
        <p className="text-sm md:text-base text-muted-foreground mt-0.5 mb-2">
          Add the information the agent needs to answer users&apos; queries,
          such as program details and FAQs
        </p>
        <div
          className={`rounded-xl overflow-hidden border md:flex-1 h-[350px] md:h-auto ${
            isOver ? "border-red-500 bg-red-500/10" : "border-border bg-muted/30"
          }`}
        >
          <textarea
            id={textareaId}
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            placeholder="Paste text here, for example your opening hours, services and fees"
            className="w-full h-full px-3 md:px-4 py-3 text-sm md:text-base bg-muted/30 text-foreground placeholder:text-muted-foreground focus:outline-none resize-none"
          />
        </div>
        <div className="flex items-center justify-between gap-3 mt-2 text-xs md:text-sm">
          {isOver ? (
            <p className="text-red-500">
              {characterCount(overBy)} over the limit
            </p>
          ) : (
            <span />
          )}
          <p className={isOver ? "text-red-500" : "text-muted-foreground"}>
            {knowledgeBaseLength(text).toLocaleString("en-US")}
            {maxChars === null
              ? " characters"
              : ` of ${maxChars.toLocaleString("en-US")} characters`}
          </p>
        </div>
      </div>

      <div className="space-y-2 md:space-y-3">
        <h3 className="text-sm md:text-base font-medium text-foreground">
          How the agent uses this text
        </h3>
        <InfoNote>
          <div className="space-y-2">
            <p>
              In chats and in evaluations, the agent reads this text together
              with its system prompt.
            </p>
            <p>
              When you update the text, the agent uses the updated information
              from its next reply.
            </p>
          </div>
        </InfoNote>
      </div>
    </div>
  );
}
