"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { ttsProviders } from "../agent-tabs/constants/providers";
import { DeleteConfirmationDialog } from "../DeleteConfirmationDialog";

type TextRow = {
  id: string;
  text: string;
};

type EvaluationResult = {
  task_id: string;
  status: "queued" | "in_progress" | "done";
};

type TabType = "settings" | "input";

// Use provider labels for display
const providerLabels = ttsProviders.map((p) => p.label);

export function TextToSpeechEvaluation() {
  const router = useRouter();
  const { data: session } = useSession();
  const backendAccessToken = (session as any)?.backendAccessToken;
  const [activeTab, setActiveTab] = useState<TabType>("settings");
  const [rows, setRows] = useState<TextRow[]>([{ id: "1", text: "" }]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<string | null>(null);
  const [invalidRowIds, setInvalidRowIds] = useState<Set<string>>(new Set());
  const [selectedProviders, setSelectedProviders] = useState<Set<string>>(
    new Set(providerLabels)
  );
  const [language, setLanguage] = useState<"english" | "hindi">("english");
  const [isEvaluating, setIsEvaluating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDownloadSampleCsv = () => {
    const csvContent =
      'text\n"Hello, how are you today?"\nThe weather is nice outside.\nThis is a sample text for TTS evaluation.';
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "sample_tts_input.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCsvUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (!content) return;

      const lines = content.split(/\r?\n/).filter((line) => line.trim());
      if (lines.length === 0) return;

      // Find the text column index from header
      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
      const textColumnIndex = headers.indexOf("text");

      if (textColumnIndex === -1) {
        alert("CSV must have a 'text' column header");
        return;
      }

      // Parse rows (skip header)
      const newRows: TextRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const columns = lines[i].split(",");
        const text = columns[textColumnIndex]?.trim();
        if (text) {
          newRows.push({
            id: Date.now().toString() + i,
            text: text,
          });
        }
      }

      if (newRows.length > 0) {
        setRows(newRows);
        setInvalidRowIds(new Set());
      }
    };
    reader.readAsText(file);

    // Reset file input so the same file can be uploaded again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const addRow = () => {
    // Validate existing rows
    const invalidIds = new Set<string>();
    rows.forEach((row) => {
      if (!row.text.trim()) {
        invalidIds.add(row.id);
      }
    });

    if (invalidIds.size > 0) {
      // Highlight invalid rows
      setInvalidRowIds(invalidIds);
      return; // Don't add new row if validation fails
    }

    // Clear validation errors and add new row
    setInvalidRowIds(new Set());
    const newId = Date.now().toString();
    setRows([...rows, { id: newId, text: "" }]);
  };

  const deleteRow = (id: string) => {
    if (rows.length === 1) return; // Don't allow deleting the last row
    setRows(rows.filter((row) => row.id !== id));
    setDeleteDialogOpen(null);
  };

  const handleTextChange = (id: string, text: string) => {
    setRows(rows.map((row) => (row.id === id ? { ...row, text } : row)));
    // Clear validation error for this row if text is entered
    if (text.trim()) {
      setInvalidRowIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    }
  };

  const toggleProvider = (provider: string) => {
    setSelectedProviders((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(provider)) {
        newSet.delete(provider);
      } else {
        newSet.add(provider);
      }
      return newSet;
    });
  };

  const toggleAllProviders = () => {
    if (selectedProviders.size === providerLabels.length) {
      // Deselect all
      setSelectedProviders(new Set());
    } else {
      // Select all
      setSelectedProviders(new Set(providerLabels));
    }
  };

  const handleEvaluate = async () => {
    // Validate all rows (same check as addRow)
    const invalidIds = new Set<string>();
    rows.forEach((row) => {
      if (!row.text.trim()) {
        invalidIds.add(row.id);
      }
    });

    if (invalidIds.size > 0) {
      // Highlight invalid rows and switch to input tab
      setInvalidRowIds(invalidIds);
      setActiveTab("input");
      return; // Don't evaluate if validation fails
    }

    // Clear validation errors and proceed with evaluation
    setInvalidRowIds(new Set());
    setIsEvaluating(true);

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        console.error("BACKEND_URL environment variable is not set");
        setIsEvaluating(false);
        return;
      }

      // Collect texts
      const texts = rows.map((row) => row.text.trim());

      // Make API call
      const response = await fetch(`${backendUrl}/tts/evaluate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          accept: "application/json",
          "ngrok-skip-browser-warning": "true",
          Authorization: `Bearer ${backendAccessToken}`,
        },
        body: JSON.stringify({
          texts: texts,
          // Map provider labels to their actual values
          providers: Array.from(selectedProviders).map((label) => {
            const provider = ttsProviders.find((p) => p.label === label);
            return provider ? provider.value : label;
          }),
          language: language,
        }),
      });

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to evaluate");
      }

      const result: EvaluationResult = await response.json();

      // Redirect to the evaluation detail page
      if (result.task_id) {
        router.push(`/tts/${result.task_id}`);
      }
    } catch (error) {
      console.error("Error evaluating:", error);
      setIsEvaluating(false);
    }
  };

  const isEvaluateDisabled = selectedProviders.size === 0;

  return (
    <div className="space-y-6">
      {/* Header with Evaluate Button */}
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-[15px] leading-relaxed">
          Provide text inputs to evaluate TTS quality across multiple providers
        </p>
        {isEvaluating ? (
          <div className="flex items-center gap-2 h-9 px-6">
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
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            <span className="text-sm font-medium">Evaluating...</span>
          </div>
        ) : (
          <button
            onClick={handleEvaluate}
            disabled={isEvaluateDisabled}
            className="h-9 px-6 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
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
                d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z"
              />
            </svg>
            Evaluate
          </button>
        )}
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-6 border-b border-border">
        <button
          onClick={() => setActiveTab("settings")}
          className={`pb-2 text-base font-medium transition-colors cursor-pointer ${
            activeTab === "settings"
              ? "text-foreground border-b-2 border-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Settings
        </button>
        <button
          onClick={() => setActiveTab("input")}
          className={`pb-2 text-base font-medium transition-colors cursor-pointer ${
            activeTab === "input"
              ? "text-foreground border-b-2 border-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Input
        </button>
      </div>

      {/* Settings Tab Content */}
      {activeTab === "settings" && (
        <div className="space-y-8">
          {/* Language Selection */}
          <div className="space-y-3">
            <div className="flex items-center">
              <label className="text-[13px] font-medium text-foreground">
                Language
              </label>
            </div>
            <div className="relative w-fit">
              <select
                value={language}
                onChange={(e) =>
                  setLanguage(e.target.value as "english" | "hindi")
                }
                className="h-10 px-4 pr-10 rounded-md text-[13px] border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent cursor-pointer appearance-none min-w-[140px]"
              >
                <option value="english">English</option>
                <option value="hindi">Hindi</option>
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

          {/* Provider Selection */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-[13px] font-medium text-foreground">
                Select providers to evaluate
              </h3>
              <span className="text-[12px] text-muted-foreground">
                ({selectedProviders.size} selected)
              </span>
              <button
                onClick={toggleAllProviders}
                className="ml-auto text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                {selectedProviders.size === providerLabels.length
                  ? "Deselect all"
                  : "Select all"}
              </button>
            </div>
            <div className="flex flex-wrap gap-3">
              {providerLabels.map((providerLabel) => {
                const isSelected = selectedProviders.has(providerLabel);
                return (
                  <button
                    key={providerLabel}
                    onClick={() => toggleProvider(providerLabel)}
                    className={`h-9 px-4 rounded-md text-[13px] font-medium border transition-colors cursor-pointer flex items-center gap-2 ${
                      isSelected
                        ? "bg-foreground text-background border-foreground"
                        : "bg-background text-muted-foreground border-border hover:bg-accent/50 hover:text-foreground hover:border-border"
                    }`}
                  >
                    {isSelected && (
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
                          d="M4.5 12.75l6 6 9-13.5"
                        />
                      </svg>
                    )}
                    {providerLabel}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Input Tab Content */}
      {activeTab === "input" && (
        <div className="space-y-2">
          {/* Text Rows */}
          {rows.map((row, index) => {
            const isInvalid = invalidRowIds.has(row.id);
            return (
              <div
                key={row.id}
                className={`border rounded-lg py-1.5 px-3 flex items-center gap-2 transition-colors ${
                  isInvalid
                    ? "border-red-500 bg-red-500/10"
                    : "border-border bg-muted/10"
                }`}
              >
                {/* Row Number */}
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[11px] font-medium text-muted-foreground">
                  {index + 1}
                </div>

                {/* Text Input */}
                <div className="flex-1">
                  <input
                    type="text"
                    value={row.text}
                    onChange={(e) => handleTextChange(row.id, e.target.value)}
                    placeholder="Enter text to synthesize"
                    className="w-full h-8 px-2 rounded text-[13px] border border-border bg-background focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                  />
                </div>

                {/* Delete Button */}
                {rows.length > 1 && (
                  <button
                    onClick={() => {
                      // Skip confirmation if row is empty
                      if (!row.text.trim()) {
                        deleteRow(row.id);
                      } else {
                        setDeleteDialogOpen(row.id);
                      }
                    }}
                    className="flex-shrink-0 w-7 h-7 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors flex items-center justify-center cursor-pointer"
                    aria-label="Delete row"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                      />
                    </svg>
                  </button>
                )}
              </div>
            );
          })}

          {/* Add Row Button */}
          <button
            onClick={addRow}
            className="w-full h-8 px-3 rounded-lg text-[12px] font-medium border border-dashed border-border bg-muted/20 hover:bg-muted/40 transition-colors flex items-center justify-center gap-1.5 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4.5v15m7.5-7.5h-15"
              />
            </svg>
            Add another sample
          </button>

          {/* OR Divider */}
          <div className="flex items-center gap-4 py-2">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[13px] font-medium text-muted-foreground">
              OR
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* CSV Upload Section */}
          <div className="border border-border rounded-xl p-6 bg-muted/10">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-muted flex items-center justify-center">
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
                    d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-[14px] font-medium text-foreground mb-1">
                  Upload CSV
                </h3>
                <p className="text-[13px] text-muted-foreground mb-4">
                  Upload a CSV file with all the texts you want to be spoken
                </p>
                <div className="flex items-center gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleCsvUpload}
                    className="hidden"
                    id="csv-upload"
                  />
                  <label
                    htmlFor="csv-upload"
                    className="h-9 px-4 rounded-md text-[13px] font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-2"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                      />
                    </svg>
                    Choose CSV file
                  </label>
                  <button
                    onClick={handleDownloadSampleCsv}
                    className="h-9 px-4 rounded-md text-[13px] font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer flex items-center gap-2"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                      />
                    </svg>
                    Download sample CSV
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        isOpen={deleteDialogOpen !== null}
        onClose={() => setDeleteDialogOpen(null)}
        onConfirm={() => {
          if (deleteDialogOpen) {
            deleteRow(deleteDialogOpen);
          }
        }}
        title="Delete row"
        message="Are you sure you want to delete this row? This action cannot be undone."
        confirmText="Delete"
      />
    </div>
  );
}
