"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useAccessToken } from "@/hooks";
import { toast } from "sonner";
import { ttsProviders, TTSProvider } from "../agent-tabs/constants/providers";
import { LIMITS, CONTACT_LINK } from "@/constants/limits";
import { listDatasets, Dataset } from "@/lib/datasets";
import { DatasetPicker } from "./DatasetPicker";
import { TTSDatasetEditor, TTSDatasetEditorHandle } from "./TTSDatasetEditor";

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
  initialDatasetId?: string;
};

export function TextToSpeechEvaluation({ evaluateRef, onEvaluatingChange, initialDatasetId }: TextToSpeechEvaluationProps = {}) {
  const router = useRouter();
  const backendAccessToken = useAccessToken();
  const [activeTab, setActiveTab] = useState<TabType>(
    initialDatasetId ? "settings" : "input"
  );
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
  const [inputMode, setInputMode] = useState<"inline" | "dataset">(
    initialDatasetId ? "dataset" : "inline"
  );
  const [availableDatasets, setAvailableDatasets] = useState<Dataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>(
    initialDatasetId ?? ""
  );
  const [datasetName, setDatasetName] = useState("");
  const [datasetNameInvalid, setDatasetNameInvalid] = useState(false);

  const editorRef = useRef<TTSDatasetEditorHandle | null>(null);

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

      const newRows = editorRef.current?.getNewRows() ?? [];
      if (newRows.length === 0) {
        toast.error("Add at least one text row before evaluating.");
        setActiveTab("input");
        return;
      }

      const longTextRow = newRows.find(
        (r) => r.text.length > LIMITS.TTS_MAX_TEXT_LENGTH
      );
      if (longTextRow) {
        toast.error(
          <span>
            Text must be {LIMITS.TTS_MAX_TEXT_LENGTH} characters or less.{" "}
            <a href={CONTACT_LINK} target="_blank" rel="noopener noreferrer" className="underline">
              Contact us
            </a>{" "}
            to extend your limits.
          </span>
        );
        setActiveTab("input");
        return;
      }
    }

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
        const newRows = editorRef.current?.getNewRows() ?? [];
        requestBody = {
          texts: newRows.map((r) => r.text),
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
          onClick={() => setActiveTab("input")}
          className={`pb-2 text-sm md:text-base font-medium transition-colors cursor-pointer ${
            activeTab === "input"
              ? "text-foreground border-b-2 border-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Dataset
        </button>
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
            <TTSDatasetEditor
              ref={editorRef}
              showDatasetName
              datasetName={datasetName}
              onDatasetNameChange={(v) => {
                setDatasetName(v);
                if (v.trim()) setDatasetNameInvalid(false);
              }}
              datasetNameInvalid={datasetNameInvalid}
            />
          </div>
          )}
        </div>
      )}

    </div>
  );
}
