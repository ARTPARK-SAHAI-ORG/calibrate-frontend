"use client";

import type { Dispatch, SetStateAction } from "react";
import {
  EVALUATOR_TYPE_LABELS,
  EVALUATOR_TYPE_TOOLTIPS,
  type EvaluatorType,
} from "@/components/EvaluatorPills";
import type { LLMModel } from "@/components/agent-tabs/constants/providers";
import {
  RatingScaleEditor,
  type RatingScaleRow,
} from "@/components/evaluators/RatingScaleEditor";

type CreateRatingScaleRow = RatingScaleRow & {
  value: number;
};

type CreateEvaluatorSidebarProps = {
  isOpen: boolean;
  evaluatorName: string;
  evaluatorDescription: string;
  evaluatorType: EvaluatorType | null;
  evaluatorOutputType: "binary" | "rating";
  evaluatorScale: CreateRatingScaleRow[];
  judgeModel: LLMModel | null;
  systemPrompt: string;
  detectedPromptVariables: string[];
  variableDescriptions: Record<string, string>;
  variablesSupported: boolean;
  validationAttempted: boolean;
  createNameError: string | null;
  createError: string | null;
  isCreating: boolean;
  isNameDuplicate: (name: string) => boolean;
  onClose: () => void;
  onOpenUseCasePicker: () => void;
  onOpenModelPicker: () => void;
  onCreate: () => void;
  setEvaluatorName: (value: string) => void;
  setEvaluatorDescription: (value: string) => void;
  setEvaluatorOutputType: (value: "binary" | "rating") => void;
  setEvaluatorScale: (value: CreateRatingScaleRow[]) => void;
  setSystemPrompt: (value: string) => void;
  setVariableDescriptions: Dispatch<SetStateAction<Record<string, string>>>;
  setCreateNameError: (value: string | null) => void;
};

export function CreateEvaluatorSidebar({
  isOpen,
  evaluatorName,
  evaluatorDescription,
  evaluatorType,
  evaluatorOutputType,
  evaluatorScale,
  judgeModel,
  systemPrompt,
  detectedPromptVariables,
  variableDescriptions,
  variablesSupported,
  validationAttempted,
  createNameError,
  createError,
  isCreating,
  isNameDuplicate,
  onClose,
  onOpenUseCasePicker,
  onOpenModelPicker,
  onCreate,
  setEvaluatorName,
  setEvaluatorDescription,
  setEvaluatorOutputType,
  setEvaluatorScale,
  setSystemPrompt,
  setVariableDescriptions,
  setCreateNameError,
}: CreateEvaluatorSidebarProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full md:max-w-xl bg-background md:border-l border-border flex flex-col h-full shadow-2xl">
        <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <svg
              className="w-5 h-5 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z"
              />
            </svg>
            <h2 className="text-base md:text-lg font-semibold">Add evaluator</h2>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-4 md:gap-6">
          <div>
            <label className="block text-xs md:text-sm font-medium mb-2">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={evaluatorName}
              placeholder="e.g., Follows Refund Policy"
              onChange={(e) => {
                setEvaluatorName(e.target.value);
                setCreateNameError(null);
              }}
              className={`w-full h-9 md:h-10 px-3 md:px-4 rounded-md text-sm md:text-base border bg-background dark:bg-muted text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent ${
                validationAttempted &&
                (!evaluatorName.trim() ||
                  isNameDuplicate(evaluatorName) ||
                  createNameError)
                  ? "border-red-500"
                  : "border-border"
              }`}
            />
            {validationAttempted && isNameDuplicate(evaluatorName) && (
              <p className="text-xs md:text-sm text-red-500 mt-1">
                An evaluator with this name already exists
              </p>
            )}
            {createNameError && (
              <p className="text-xs md:text-sm text-red-500 mt-1">
                {createNameError}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs md:text-sm font-medium mb-2">
              Description
            </label>
            <textarea
              value={evaluatorDescription}
              onChange={(e) => setEvaluatorDescription(e.target.value)}
              placeholder="One-line summary shown in the list"
              className="w-full px-3 md:px-4 py-2 rounded-md text-sm md:text-base border border-border bg-background dark:bg-muted text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-none min-h-[72px]"
            />
          </div>

          {evaluatorType && (
            <div>
              <label className="block text-xs md:text-sm font-medium mb-2">
                Use case
              </label>
              <div className="flex items-center justify-between gap-3 px-3 md:px-4 h-9 md:h-10 rounded-md border border-border bg-muted/40 dark:bg-muted">
                <span className="text-sm md:text-base text-foreground">
                  {EVALUATOR_TYPE_LABELS[evaluatorType]}
                </span>
                <button
                  type="button"
                  onClick={onOpenUseCasePicker}
                  className="text-xs md:text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  Change
                </button>
              </div>
              <p className="text-xs md:text-sm text-muted-foreground mt-2">
                {EVALUATOR_TYPE_TOOLTIPS[evaluatorType]}
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs md:text-sm font-medium mb-2">
              Output type <span className="text-red-500">*</span>
            </label>
            <div className="inline-flex rounded-md border border-border p-1">
              {(["binary", "rating"] as const).map((type) => {
                const active = evaluatorOutputType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setEvaluatorOutputType(type)}
                    className={`h-8 md:h-9 px-4 md:px-5 rounded-md text-sm md:text-base font-medium transition-colors cursor-pointer capitalize ${
                      active
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {type}
                  </button>
                );
              })}
            </div>
            <p className="text-xs md:text-sm text-muted-foreground mt-2">
              {evaluatorOutputType === "binary"
                ? "Returns a pass/fail judgement for each evaluation."
                : "Returns a score on a custom rating scale you define below."}
            </p>
          </div>

          {evaluatorOutputType === "rating" && (
            <RatingScaleEditor
              rows={evaluatorScale}
              onChange={setEvaluatorScale}
              validationAttempted={validationAttempted}
              description="Add at least two rows. Label is required; the description is optional rubric text fed to the judge."
              descriptionPlaceholder="(optional) description for the response to receive this rating; a detailed rubric helps the LLM judge evaluate more reliably"
            />
          )}

          <div>
            <label className="block text-xs md:text-sm font-medium mb-2">
              Judge model <span className="text-red-500">*</span>
            </label>
            <button
              type="button"
              onClick={onOpenModelPicker}
              className={`w-full h-9 md:h-10 px-3 md:px-4 rounded-md text-sm md:text-base border bg-background dark:bg-muted hover:bg-muted/50 dark:hover:bg-accent flex items-center justify-between cursor-pointer transition-colors ${
                validationAttempted && !judgeModel
                  ? "border-red-500"
                  : "border-border"
              }`}
            >
              <span className={judgeModel ? "text-foreground" : "text-muted-foreground"}>
                {judgeModel ? judgeModel.name : "Select judge model"}
              </span>
              <svg
                className="w-4 h-4 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
          </div>

          <div className="flex flex-col">
            <label className="block text-xs md:text-sm font-medium mb-2">
              Judge prompt <span className="text-red-500">*</span>
            </label>
            {variablesSupported && (
              <p className="text-xs md:text-sm text-muted-foreground mb-2 leading-relaxed">
                You can build reusable prompts by adding{" "}
                <code className="font-mono px-1 py-0.5 rounded bg-muted text-foreground">
                  {`{{ variable }}`}
                </code>{" "}
                placeholders so the same evaluator can be applied to multiple
                LLM tests while customising the value for each test
              </p>
            )}
            {variablesSupported && detectedPromptVariables.length > 0 && (
              <div className="space-y-2 mb-3">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Variables
                </div>
                <div className="flex items-start gap-2 rounded-md border border-blue-500/20 bg-blue-500/5 p-3 text-xs md:text-sm text-muted-foreground">
                  <svg
                    className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-600 dark:text-blue-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.75}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
                    />
                  </svg>
                  <span>
                    When this evaluator is added to an LLM test, you will be
                    able to fill in the value of each variable for that test
                  </span>
                </div>
                <div className="border border-border rounded-md overflow-hidden">
                  {detectedPromptVariables.map((name, i) => {
                    const missingDescription =
                      validationAttempted &&
                      !(variableDescriptions[name] ?? "").trim();
                    return (
                      <div
                        key={name}
                        className={`p-3 md:p-4 bg-background dark:bg-muted flex flex-col md:flex-row md:items-start gap-2 md:gap-3 ${
                          i > 0 ? "border-t border-border" : ""
                        }`}
                      >
                        <code className="self-start inline-flex items-center px-2 py-0.5 rounded-md text-sm font-mono font-semibold bg-blue-500/10 text-blue-700 dark:text-blue-300 md:flex-shrink-0 md:mt-1.5">
                          {`{{${name}}}`}
                        </code>
                        <input
                          type="text"
                          value={variableDescriptions[name] ?? ""}
                          onChange={(e) =>
                            setVariableDescriptions((prev) => ({
                              ...prev,
                              [name]: e.target.value,
                            }))
                          }
                          placeholder="Short description explaining the purpose of the variable"
                          className={`flex-1 px-3 py-2 rounded-md text-sm bg-background dark:bg-muted text-foreground placeholder:text-muted-foreground border focus:outline-none focus:ring-2 focus:ring-accent ${
                            missingDescription ? "border-red-500" : "border-border"
                          }`}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder={
                variablesSupported
                  ? "Describe how the judge should grade a response. Use {{variable}} to mark values you'll fill in per test."
                  : "Describe how the judge should grade a response"
              }
              className={`w-full px-4 py-3 rounded-md text-sm md:text-base border bg-background dark:bg-muted text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-none h-[280px] md:h-[320px] ${
                validationAttempted && !systemPrompt.trim()
                  ? "border-red-500"
                  : "border-border"
              }`}
            />
          </div>

          {!variablesSupported && evaluatorType && detectedPromptVariables.length > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs md:text-sm text-amber-700 dark:text-amber-300">
              <svg
                className="w-4 h-4 mt-0.5 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.75}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                />
              </svg>
              <span>
                Variables are not supported for {EVALUATOR_TYPE_LABELS[evaluatorType]}{" "}
                evaluators. The <code className="font-mono">{`{{...}}`}</code>{" "}
                placeholders in your prompt will be treated as literal text by
                the evaluator
              </span>
            </div>
          )}
          <div className="h-4 md:h-6 shrink-0" aria-hidden="true" />
        </div>

        <div className="px-6 py-4 border-t border-border space-y-3">
          {createError && <p className="text-sm text-red-500">{createError}</p>}
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              disabled={isCreating}
              className="h-10 px-4 rounded-md text-base font-medium border border-border bg-background dark:bg-muted hover:bg-muted/50 dark:hover:bg-accent transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={onCreate}
              disabled={isCreating}
              className="h-10 px-4 rounded-md text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isCreating ? (
                <>
                  <svg
                    className="w-4 h-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Creating...
                </>
              ) : (
                "Create evaluator"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
