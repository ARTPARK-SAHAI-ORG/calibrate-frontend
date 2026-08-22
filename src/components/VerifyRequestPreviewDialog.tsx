"use client";

import React, { useEffect, useMemo, useState } from "react";
import { SpinnerIcon } from "@/components/icons";
import { CopyCodeButton } from "@/components/ui";
import {
  CustomFieldsEditor,
  deriveInputs,
  seedInputRows,
  type InputRow,
  type InputFieldType,
} from "@/components/CustomFieldsEditor";

export type MessageRow = {
  role: "user" | "assistant";
  content: string;
};

type VerifyRequestPreviewDialogProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: (messages: MessageRow[], inputs?: Record<string, unknown>) => void;
  isVerifying: boolean;
  verifyError?: string | null;
  verifySampleResponse?: Record<string, unknown> | null;
  initialInputs?: Record<string, unknown>;
  initialInputTypes?: Record<string, InputFieldType>;
  /** A general agent is sent one input, so the editor asks for one piece of
   * text instead of a conversation. */
  agentNature?: "conversation" | "general";
};

const DEFAULT_MESSAGES: MessageRow[] = [{ role: "user", content: "Hi" }];

export function VerifyRequestPreviewDialog({
  open,
  onClose,
  onConfirm,
  isVerifying,
  verifyError,
  verifySampleResponse,
  initialInputs,
  initialInputTypes,
  agentNature = "conversation",
}: VerifyRequestPreviewDialogProps) {
  const isGeneral = agentNature === "general";
  const [messages, setMessages] = useState<MessageRow[]>(DEFAULT_MESSAGES);
  const [emptyIndices, setEmptyIndices] = useState<Set<number>>(new Set());
  const [inputRows, setInputRows] = useState<InputRow[]>([]);

  const showInputs = Object.keys(initialInputs ?? {}).length > 0;
  const { inputs: parsedInputs, errors: inputErrors } = useMemo(
    () => deriveInputs(inputRows),
    [inputRows],
  );

  // Seed the override rows from the agent's saved custom fields each time the
  // dialog opens, so the user edits copies rather than the stored values.
  useEffect(() => {
    if (open) setInputRows(seedInputRows(initialInputs, initialInputTypes));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleRoleChange = (index: number, role: MessageRow["role"]) => {
    setMessages((prev) =>
      prev.map((m, i) => (i === index ? { ...m, role } : m)),
    );
  };

  const handleContentChange = (index: number, content: string) => {
    setMessages((prev) =>
      prev.map((m, i) => (i === index ? { ...m, content } : m)),
    );
    if (content.trim().length > 0) {
      setEmptyIndices((prev) => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }
  };

  const handleAddRow = () => {
    const lastRole = messages[messages.length - 1]?.role;
    const nextRole: MessageRow["role"] =
      lastRole === "user" ? "assistant" : "user";
    setMessages((prev) => [...prev, { role: nextRole, content: "" }]);
  };

  const handleRemoveRow = (index: number) => {
    if (messages.length <= 1) return;
    setMessages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleClose = () => {
    if (isVerifying) return;
    setMessages(DEFAULT_MESSAGES);
    setEmptyIndices(new Set());
    setInputRows([]);
    onClose();
  };

  const handleConfirmClick = () => {
    const empty = new Set<number>();
    messages.forEach((m, i) => {
      if (m.content.trim().length === 0) empty.add(i);
    });
    if (empty.size > 0) {
      setEmptyIndices(empty);
      return;
    }
    setEmptyIndices(new Set());
    if (showInputs) {
      // Block on any per-row error (the editor shows them inline).
      if (Object.keys(inputErrors).length > 0) return;
      onConfirm(messages, parsedInputs);
      return;
    }
    onConfirm(messages);
  };

  // What the agent will actually receive, built once so the box and the copy
  // button can never show different things.
  const previewBody = {
    ...(isGeneral
      ? { input: messages[0]?.content ?? "" }
      : {
          messages: messages.map(({ role, content }) => ({ role, content })),
        }),
    ...(showInputs ? parsedInputs : {}),
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={handleClose}
    >
      <div
        className="bg-background border border-border rounded-xl p-5 md:p-6 max-w-3xl w-full shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base md:text-lg font-semibold mb-1">
          Verify connection
        </h2>
        <p className="text-xs md:text-sm text-muted-foreground mb-4">
          This is the sample request body that will be sent to your agent. Edit
          the {isGeneral ? "input" : "messages, add more rows,"} or change the
          custom fields before verifying.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-4">
          {/* Left column: message editor */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              {isGeneral ? "Input" : "Messages"}
            </p>
            <div className="space-y-2 mb-3 max-h-64 overflow-y-auto">
              {messages.map((msg, index) => (
                <div key={index} className="flex items-start gap-2">
                  {!isGeneral && (
                    <select
                      value={msg.role}
                      onChange={(e) =>
                        handleRoleChange(
                          index,
                          e.target.value as MessageRow["role"],
                        )
                      }
                      disabled={isVerifying}
                      className="h-9 px-2 rounded-md text-sm border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer flex-shrink-0 w-[100px] appearance-none"
                    >
                      <option value="user">user</option>
                      <option value="assistant">assistant</option>
                    </select>
                  )}
                  <div className="flex-1">
                    <input
                      type="text"
                      value={msg.content}
                      onChange={(e) =>
                        handleContentChange(index, e.target.value)
                      }
                      disabled={isVerifying}
                      placeholder={isGeneral ? "Input" : "Message content"}
                      className={`w-full h-9 px-3 rounded-md text-sm border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 ${
                        emptyIndices.has(index)
                          ? "border-red-500 focus:ring-red-500"
                          : "border-border focus:ring-accent"
                      }`}
                    />
                    {emptyIndices.has(index) && (
                      <p className="text-[11px] text-red-500 mt-0.5">
                        {isGeneral ? "Input" : "Message"} cannot be empty
                      </p>
                    )}
                  </div>
                  {!isGeneral && (
                    <button
                      type="button"
                      onClick={() => handleRemoveRow(index)}
                      disabled={messages.length <= 1 || isVerifying}
                      className="w-8 h-9 flex items-center justify-center rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <svg
                        className="w-3.5 h-3.5"
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
                  )}
                </div>
              ))}
            </div>

            {!isGeneral && (
              <button
                type="button"
                onClick={handleAddRow}
                disabled={isVerifying}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 4.5v15m7.5-7.5h-15"
                  />
                </svg>
                Add message
              </button>
            )}

            {showInputs && (
              <div className="mt-4">
                <CustomFieldsEditor
                  rows={inputRows}
                  errors={inputErrors}
                  onRowsChange={setInputRows}
                  disabled={isVerifying}
                  lockFields
                />
              </div>
            )}
          </div>

          {/* Right column: JSON preview */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Request body preview
            </p>
            <div className="relative">
              <CopyCodeButton
                value={JSON.stringify(previewBody, null, 2)}
                label="Copy the request body"
              />
              <pre className="text-xs bg-muted rounded-lg p-3 pr-9 overflow-x-auto text-foreground max-h-72 overflow-y-auto">
                {JSON.stringify(previewBody, null, 2)}
              </pre>
            </div>
          </div>
        </div>

        {verifyError && !isVerifying && (
          <div className="space-y-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3 mb-4">
            <p className="text-xs text-red-400">{verifyError}</p>
            {verifySampleResponse && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  Your agent responded with:
                </p>
                <div className="relative">
                  <CopyCodeButton
                    value={JSON.stringify(verifySampleResponse, null, 2)}
                    label="Copy what your agent responded with"
                  />
                  <pre className="text-xs bg-muted rounded-lg p-3 pr-9 overflow-x-auto text-foreground max-h-32 overflow-y-auto">
                    {JSON.stringify(verifySampleResponse, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 md:gap-3">
          <button
            onClick={handleClose}
            disabled={isVerifying}
            className="h-9 md:h-10 px-4 rounded-md text-xs md:text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirmClick}
            disabled={isVerifying}
            className="h-9 md:h-10 px-4 rounded-md text-xs md:text-sm font-medium bg-yellow-500 text-black hover:bg-yellow-400 transition-colors cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isVerifying && <SpinnerIcon className="w-4 h-4 animate-spin" />}
            {isVerifying
              ? "Verifying..."
              : verifyError
                ? "Retry"
                : "Send & Verify"}
          </button>
        </div>
      </div>
    </div>
  );
}
