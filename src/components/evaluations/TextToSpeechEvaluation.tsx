"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useAccessToken } from "@/hooks";
import { toast } from "sonner";
import { ttsProviders, TTSProvider } from "../agent-tabs/constants/providers";
import { DeleteConfirmationDialog } from "../DeleteConfirmationDialog";
import { LIMITS, CONTACT_LINK } from "@/constants/limits";
import { listDatasets, Dataset } from "@/lib/datasets";
import { DatasetPicker } from "./DatasetPicker";

type TextRow = {
  id: string;
  text: string;
};

type EvaluationResult = {
  task_id: string;
  status: "queued" | "in_progress" | "done";
};

type TabType = "settings" | "input";

type LanguageOption =
  | "english"
  | "hindi"
  | "kannada"
  | "bengali"
  | "malayalam"
  | "marathi"
  | "odia"
  | "punjabi"
  | "tamil"
  | "telugu"
  | "gujarati"
  | "sindhi";

// Map language option to the format used in supportedLanguages arrays
const languageDisplayName: Record<LanguageOption, string> = {
  english: "English",
  hindi: "Hindi",
  kannada: "Kannada",
  bengali: "Bengali",
  malayalam: "Malayalam",
  marathi: "Marathi",
  odia: "Odia",
  punjabi: "Punjabi",
  tamil: "Tamil",
  telugu: "Telugu",
  gujarati: "Gujarati",
  sindhi: "Sindhi",
};

// Filter providers based on selected language
const getFilteredProviders = (language: LanguageOption): TTSProvider[] => {
  const langName = languageDisplayName[language];
  return ttsProviders.filter(
    (provider) =>
      !provider.supportedLanguages ||
      provider.supportedLanguages.includes(langName)
  );
};

type TextToSpeechEvaluationProps = {
  evaluateRef?: React.MutableRefObject<(() => void) | null>;
  onEvaluatingChange?: (v: boolean) => void;
};

export function TextToSpeechEvaluation({ evaluateRef, onEvaluatingChange }: TextToSpeechEvaluationProps = {}) {
  const router = useRouter();
  const backendAccessToken = useAccessToken();
  const [activeTab, setActiveTab] = useState<TabType>("settings");
  const [rows, setRows] = useState<TextRow[]>([{ id: "1", text: "" }]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<string | null>(null);
  const [invalidRowIds, setInvalidRowIds] = useState<Set<string>>(new Set());
  const [providersInvalid, setProvidersInvalid] = useState(false);
  const [selectedProviders, setSelectedProviders] = useState<Set<string>>(
    new Set()
  );
  const [language, setLanguage] = useState<LanguageOption>("english");
  const [isEvaluating, setIsEvaluatingRaw] = useState(false);
  const setIsEvaluating = (v: boolean) => {
    setIsEvaluatingRaw(v);
    onEvaluatingChange?.(v);
  };

  // Dataset mode
  const [inputMode, setInputMode] = useState<"inline" | "dataset">("inline");
  const [availableDatasets, setAvailableDatasets] = useState<Dataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>("");
  const [datasetName, setDatasetName] = useState("");
  const [datasetNameInvalid, setDatasetNameInvalid] = useState(false);

  useEffect(() => {
    if (!backendAccessToken) return;
    listDatasets(backendAccessToken, "tts")
      .then(setAvailableDatasets)
      .catch(() => {});
  }, [backendAccessToken]);

  // Keep evaluateRef current so the parent can call it
  const handleEvaluateRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (evaluateRef) {
      evaluateRef.current = () => handleEvaluateRef.current();
    }
  });

  // Get filtered providers based on selected language
  const filteredProviders = getFilteredProviders(language);
  const providerLabels = filteredProviders.map((p) => p.label);

  // Handle language change - clear providers that don't support the new language
  const handleLanguageChange = (newLanguage: LanguageOption) => {
    setLanguage(newLanguage);
    const newFilteredProviders = getFilteredProviders(newLanguage);
    const supportedLabels = new Set(newFilteredProviders.map((p) => p.label));
    setSelectedProviders((prev) => {
      const newSet = new Set<string>();
      prev.forEach((label) => {
        if (supportedLabels.has(label)) {
          newSet.add(label);
        }
      });
      return newSet;
    });
  };
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

      // Check row limit
      if (newRows.length > LIMITS.TTS_MAX_ROWS) {
        toast.error(
          <span>
            You can only upload up to {LIMITS.TTS_MAX_ROWS} rows at a time.{" "}
            <a
              href={CONTACT_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Contact us
            </a>{" "}
            to extend your limits.
          </span>
        );
        return;
      }

      // Check text length limit
      const longTextRow = newRows.find(
        (row) => row.text.length > LIMITS.TTS_MAX_TEXT_LENGTH
      );
      if (longTextRow) {
        toast.error(
          <span>
            Text must be {LIMITS.TTS_MAX_TEXT_LENGTH} characters or less. Found
            text with {longTextRow.text.length} characters.{" "}
            <a
              href={CONTACT_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Contact us
            </a>{" "}
            to extend your limits.
          </span>
        );
        return;
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
    // Check row limit
    if (rows.length >= LIMITS.TTS_MAX_ROWS) {
      toast.error(
        <span>
          You can only add up to {LIMITS.TTS_MAX_ROWS} rows at a time.{" "}
          <a
            href={CONTACT_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Contact us
          </a>{" "}
          to extend your limits.
        </span>
      );
      return;
    }

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
        // Clear providers invalid state when a provider is selected
        setProvidersInvalid(false);
      }
      return newSet;
    });
  };

  const selectAllProviders = () => {
    setSelectedProviders(new Set(providerLabels));
    setProvidersInvalid(false);
  };

  const handleEvaluate = async () => {
    // Validate providers first
    if (selectedProviders.size === 0) {
      setProvidersInvalid(true);
      setActiveTab("settings");
      return;
    }

    if (inputMode === "dataset") {
      if (!selectedDatasetId) {
        setActiveTab("input");
        toast.error("Please select a dataset.");
        return;
      }
    } else {
      // Validate dataset name
      if (!datasetName.trim()) {
        setDatasetNameInvalid(true);
        setActiveTab("input");
        return;
      }

      // Validate all rows
      const invalidIds = new Set<string>();
      rows.forEach((row) => {
        if (!row.text.trim()) {
          invalidIds.add(row.id);
        }
      });

      if (invalidIds.size > 0) {
        setInvalidRowIds(invalidIds);
        setActiveTab("input");
        return;
      }

      // Check text length limit
      const longTextRow = rows.find(
        (row) => row.text.length > LIMITS.TTS_MAX_TEXT_LENGTH
      );
      if (longTextRow) {
        toast.error(
          <span>
            Text must be {LIMITS.TTS_MAX_TEXT_LENGTH} characters or less. Found
            text with {longTextRow.text.length} characters.{" "}
            <a
              href={CONTACT_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Contact us
            </a>{" "}
            to extend your limits.
          </span>
        );
        setActiveTab("input");
        return;
      }
    }

    // Clear validation errors and proceed with evaluation
    setInvalidRowIds(new Set());
    setProvidersInvalid(false);
    setIsEvaluating(true);

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        console.error("BACKEND_URL environment variable is not set");
        setIsEvaluating(false);
        return;
      }

      const providers = Array.from(selectedProviders).map((label) => {
        const provider = ttsProviders.find((p) => p.label === label);
        return provider ? provider.value : label;
      });

      let requestBody: Record<string, unknown>;
      if (inputMode === "dataset") {
        requestBody = {
          dataset_id: selectedDatasetId,
          providers,
          language,
        };
      } else {
        const texts = rows.map((row) => row.text.trim());
        requestBody = {
          texts,
          providers,
          language,
          ...(datasetName.trim() ? { dataset_name: datasetName.trim() } : {}),
        };
      }

      const response = await fetch(`${backendUrl}/tts/evaluate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          accept: "application/json",
          "ngrok-skip-browser-warning": "true",
          Authorization: `Bearer ${backendAccessToken}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to evaluate");
      }

      const result: EvaluationResult = await response.json();

      if (result.task_id) {
        router.push(`/tts/${result.task_id}`);
      }
    } catch (error) {
      console.error("Error evaluating:", error);
      setIsEvaluating(false);
    }
  };

  handleEvaluateRef.current = handleEvaluate;

  return (
    <div className="space-y-6">
      {/* Tabs Navigation */}
      <div className="flex items-center gap-4 md:gap-6 border-b border-border">
        <button
          onClick={() => setActiveTab("settings")}
          className={`pb-2 text-sm md:text-base font-medium transition-colors cursor-pointer ${
            activeTab === "settings"
              ? "text-foreground border-b-2 border-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Settings
        </button>
        <button
          onClick={() => setActiveTab("input")}
          className={`pb-2 text-sm md:text-base font-medium transition-colors cursor-pointer ${
            activeTab === "input"
              ? "text-foreground border-b-2 border-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Dataset
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
                  handleLanguageChange(e.target.value as LanguageOption)
                }
                className="h-10 px-4 pr-10 rounded-md text-[13px] border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent cursor-pointer appearance-none min-w-[140px]"
              >
                <option value="english">English</option>
                <option value="hindi">Hindi</option>
                <option value="kannada">Kannada</option>
                <option value="bengali">Bengali</option>
                <option value="malayalam">Malayalam</option>
                <option value="marathi">Marathi</option>
                <option value="odia">Odia</option>
                <option value="punjabi">Punjabi</option>
                <option value="tamil">Tamil</option>
                <option value="telugu">Telugu</option>
                <option value="gujarati">Gujarati</option>
                <option value="sindhi">Sindhi</option>
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
          <div
            className={`space-y-3 p-4 -m-4 rounded-lg transition-colors ${
              providersInvalid ? "bg-red-500/10 border border-red-500" : ""
            }`}
          >
            <div className="flex items-center gap-2">
              <h3 className="text-[13px] font-medium text-foreground">
                Select providers to evaluate
              </h3>
              <span className="text-[12px] text-muted-foreground">
                ({selectedProviders.size} selected)
              </span>
            </div>
            {/* Desktop: Table layout */}
            <div className="hidden md:block border border-border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="w-12 px-4 py-2 text-left">
                      <div
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors cursor-pointer ${
                          selectedProviders.size === providerLabels.length
                            ? "bg-foreground border-foreground"
                            : selectedProviders.size > 0
                            ? "bg-foreground/50 border-foreground"
                            : "border-border hover:border-foreground/50"
                        }`}
                        onClick={() => {
                          if (selectedProviders.size === providerLabels.length) {
                            setSelectedProviders(new Set());
                          } else {
                            selectAllProviders();
                          }
                        }}
                      >
                        {selectedProviders.size === providerLabels.length ? (
                          <svg
                            className="w-3 h-3 text-background"
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
                        ) : selectedProviders.size > 0 ? (
                          <svg
                            className="w-3 h-3 text-background"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={3}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M5 12h14"
                            />
                          </svg>
                        ) : null}
                      </div>
                    </th>
                    <th className="px-4 py-2 text-left text-[12px] font-medium text-foreground">
                      Label
                    </th>
                    <th className="px-4 py-2 text-left text-[12px] font-medium text-foreground">
                      Model
                    </th>
                    <th className="px-4 py-2 text-left text-[12px] font-medium text-foreground">
                      Voice ID
                    </th>
                    <th className="w-12 px-4 py-2 text-left text-[12px] font-medium text-foreground">
                      Website
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProviders.map((provider) => {
                    const isSelected = selectedProviders.has(provider.label);
                    return (
                      <tr
                        key={provider.label}
                        className="border-b border-border last:border-b-0 hover:bg-muted/30 cursor-pointer transition-colors"
                        onClick={() => toggleProvider(provider.label)}
                      >
                        <td className="w-12 px-4 py-2">
                          <div
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                              isSelected
                                ? "bg-foreground border-foreground"
                                : "border-border"
                            }`}
                          >
                            {isSelected && (
                              <svg
                                className="w-3 h-3 text-background"
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
                          </div>
                        </td>
                        <td className={`px-4 py-2 text-[13px] ${isSelected ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                          {provider.label}
                        </td>
                        <td className="px-4 py-2 text-[13px] text-muted-foreground font-mono">
                          {provider.modelOverrides?.[languageDisplayName[language]] || provider.model}
                        </td>
                        <td className="px-4 py-2 text-[13px] text-muted-foreground font-mono">
                          {provider.voiceId}
                        </td>
                        <td className="w-12 px-4 py-2">
                          {provider.website && (
                            <a
                              href={provider.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-muted-foreground hover:text-foreground transition-colors"
                              title={`Visit ${provider.label} website`}
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
                                  d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                                />
                              </svg>
                            </a>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile: Card layout */}
            <div className="md:hidden space-y-2">
              {/* Select All */}
              <div
                className="flex items-center gap-3 px-3 py-2.5 border border-border rounded-lg cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => {
                  if (selectedProviders.size === providerLabels.length) {
                    setSelectedProviders(new Set());
                  } else {
                    selectAllProviders();
                  }
                }}
              >
                <div
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0 ${
                    selectedProviders.size === providerLabels.length
                      ? "bg-foreground border-foreground"
                      : selectedProviders.size > 0
                      ? "bg-foreground/50 border-foreground"
                      : "border-border"
                  }`}
                >
                  {selectedProviders.size === providerLabels.length ? (
                    <svg
                      className="w-3 h-3 text-background"
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
                  ) : selectedProviders.size > 0 ? (
                    <svg
                      className="w-3 h-3 text-background"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 12h14"
                      />
                    </svg>
                  ) : null}
                </div>
                <span className="text-[13px] font-medium text-foreground">
                  Select all
                </span>
              </div>

              {filteredProviders.map((provider) => {
                const isSelected = selectedProviders.has(provider.label);
                return (
                  <div
                    key={provider.label}
                    className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                      isSelected
                        ? "border-foreground/30 bg-muted/30"
                        : "border-border hover:bg-muted/20"
                    }`}
                    onClick={() => toggleProvider(provider.label)}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0 ${
                          isSelected
                            ? "bg-foreground border-foreground"
                            : "border-border"
                        }`}
                      >
                        {isSelected && (
                          <svg
                            className="w-3 h-3 text-background"
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
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-[13px] ${isSelected ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                            {provider.label}
                          </span>
                          {provider.website && (
                            <a
                              href={provider.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                              title={`Visit ${provider.label} website`}
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
                                  d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                                />
                              </svg>
                            </a>
                          )}
                        </div>
                        <p className="text-[12px] text-muted-foreground font-mono truncate mt-0.5">
                          {provider.modelOverrides?.[languageDisplayName[language]] || provider.model}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Input Tab Content */}
      {activeTab === "input" && (
        <div className="space-y-4">
          {/* Mode toggle */}
          <div className="flex items-center gap-1 p-1 bg-muted border border-border rounded-lg w-fit">
            <button
              onClick={() => setInputMode("inline")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                inputMode === "inline"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Enter manually
            </button>
            <button
              onClick={() => setInputMode("dataset")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                inputMode === "dataset"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Use existing dataset
            </button>
          </div>

          {/* Dataset picker */}
          {inputMode === "dataset" && (
            <div className="space-y-2">
              {availableDatasets.length === 0 ? (
                <div className="border border-border rounded-xl p-6 flex flex-col items-center justify-center bg-muted/20 text-center">
                  <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mb-3">
                    <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium mb-1">No TTS datasets yet</p>
                  <p className="text-xs text-muted-foreground mb-3">Enter text manually and give it a name to save it as a reusable dataset.</p>
                  <button
                    onClick={() => setInputMode("inline")}
                    className="h-8 px-3 rounded-md text-xs font-medium border border-border hover:bg-muted/50 transition-colors cursor-pointer"
                  >
                    Enter manually
                  </button>
                </div>
              ) : (
                <DatasetPicker
                  datasets={availableDatasets}
                  selectedId={selectedDatasetId}
                  onSelect={setSelectedDatasetId}
                />
              )}
            </div>
          )}

          {/* Inline mode */}
          {inputMode === "inline" && (
          <div className="space-y-4">
          {/* Dataset name (required) */}
          <div>
            <label className="text-[13px] font-medium text-foreground block mb-2">
              Dataset name
            </label>
            <input
              type="text"
              value={datasetName}
              onChange={(e) => {
                setDatasetName(e.target.value);
                if (e.target.value.trim()) setDatasetNameInvalid(false);
              }}
              placeholder="e.g. English TTS test set"
              className={`w-full max-w-sm h-9 px-3 rounded-md text-sm border bg-background focus:outline-none focus:ring-1 focus:ring-foreground/30 ${
                datasetNameInvalid ? "border-red-500 bg-red-500/10" : "border-border"
              }`}
            />
          </div>
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
          <div className="border border-border rounded-xl p-4 md:p-6 bg-muted/10">
            <div className="flex items-start gap-3 md:gap-4">
              <div className="flex-shrink-0 w-9 h-9 md:w-10 md:h-10 rounded-full bg-muted flex items-center justify-center">
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
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
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
          </div>
          )}
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
