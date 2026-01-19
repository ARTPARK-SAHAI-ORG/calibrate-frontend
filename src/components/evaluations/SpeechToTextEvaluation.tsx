"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { sttProviders } from "../agent-tabs/constants/providers";
import { DeleteConfirmationDialog } from "../DeleteConfirmationDialog";
import JSZip from "jszip";

type AudioTextRow = {
  id: string;
  audioFile: File | null;
  audioUrl: string | null;
  text: string;
  s3Path: string | null;
};

type EvaluationResult = {
  task_id: string;
  status: "queued" | "in_progress" | "done";
};

type TabType = "settings" | "input";

// Use provider labels for display
const providerLabels = sttProviders.map((p) => p.label);

export function SpeechToTextEvaluation() {
  const router = useRouter();
  const { data: session } = useSession();
  const backendAccessToken = (session as any)?.backendAccessToken;
  const [activeTab, setActiveTab] = useState<TabType>("settings");
  const [rows, setRows] = useState<AudioTextRow[]>([
    { id: "1", audioFile: null, audioUrl: null, text: "", s3Path: null },
  ]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<string | null>(null);
  const [invalidRowIds, setInvalidRowIds] = useState<Set<string>>(new Set());
  const [selectedProviders, setSelectedProviders] = useState<Set<string>>(
    new Set(providerLabels)
  );
  const [language, setLanguage] = useState<"english" | "hindi">("english");
  const [uploadStatus, setUploadStatus] = useState<{
    [key: string]: "uploading" | "success" | "error";
  }>({});
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isProcessingZip, setIsProcessingZip] = useState(false);
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const zipInputRef = useRef<HTMLInputElement>(null);

  const addRow = () => {
    // Validate existing rows
    const invalidIds = new Set<string>();
    rows.forEach((row) => {
      if (!row.audioFile || !row.text.trim() || !row.s3Path) {
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
    setRows([
      ...rows,
      { id: newId, audioFile: null, audioUrl: null, text: "", s3Path: null },
    ]);
  };

  const deleteRow = (id: string) => {
    if (rows.length === 1) return; // Don't allow deleting the last row
    // Revoke object URL if exists
    const row = rows.find((r) => r.id === id);
    if (row?.audioUrl) {
      URL.revokeObjectURL(row.audioUrl);
    }
    setRows(rows.filter((row) => row.id !== id));
    setDeleteDialogOpen(null);
  };

  const uploadFileToS3 = async (file: File): Promise<string | null> => {
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        console.error("BACKEND_URL environment variable is not set");
        return null;
      }

      // Call presigned URL API
      const response = await fetch(`${backendUrl}/presigned-url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${backendAccessToken}`,
        },
        body: JSON.stringify({
          task_type: "stt",
          content_type: file.type || "audio/wav",
          extension: "wav",
        }),
      });

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return null;
      }

      if (!response.ok) {
        throw new Error("Failed to get presigned URL");
      }

      const data = await response.json();
      const presignedUrl = data.presigned_url;
      const s3Path = data.s3_path;

      if (!presignedUrl || !s3Path) {
        throw new Error("Presigned URL or S3 path not found in response");
      }

      // Upload file to S3 using presigned URL
      const uploadResponse = await fetch(presignedUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "audio/wav",
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload file to S3");
      }

      return s3Path;
    } catch (error) {
      console.error("Error uploading file:", error);
      return null;
    }
  };

  const handleFileChange = async (id: string, file: File | null) => {
    if (!file) {
      // Revoke old URL if exists
      const row = rows.find((r) => r.id === id);
      if (row?.audioUrl) {
        URL.revokeObjectURL(row.audioUrl);
      }
      setRows(
        rows.map((row) =>
          row.id === id
            ? { ...row, audioFile: null, audioUrl: null, s3Path: null }
            : row
        )
      );
      setUploadStatus((prev) => {
        const newStatus = { ...prev };
        delete newStatus[id];
        return newStatus;
      });
      return;
    }

    // Set uploading status
    setUploadStatus((prev) => ({ ...prev, [id]: "uploading" }));

    const s3Path = await uploadFileToS3(file);

    if (s3Path) {
      // Create object URL for audio playback
      const audioUrl = URL.createObjectURL(file);

      // Update the row with the file, audio URL, and S3 path
      setRows(
        rows.map((row) =>
          row.id === id ? { ...row, audioFile: file, audioUrl, s3Path } : row
        )
      );

      // Set success status
      setUploadStatus((prev) => ({ ...prev, [id]: "success" }));

      // Clear validation error for this row if file is added
      setInvalidRowIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    } else {
      setUploadStatus((prev) => ({ ...prev, [id]: "error" }));
    }
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

  const handleDownloadSampleZip = async () => {
    const zip = new JSZip();

    // Create audios folder
    const audiosFolder = zip.folder("audios");

    // Create a simple silent WAV file (minimal valid WAV)
    // This is a 44-byte WAV header with no audio data (silent)
    const createSilentWav = () => {
      const buffer = new ArrayBuffer(44);
      const view = new DataView(buffer);

      // RIFF header
      view.setUint32(0, 0x52494646, false); // "RIFF"
      view.setUint32(4, 36, true); // file size - 8
      view.setUint32(8, 0x57415645, false); // "WAVE"

      // fmt chunk
      view.setUint32(12, 0x666d7420, false); // "fmt "
      view.setUint32(16, 16, true); // chunk size
      view.setUint16(20, 1, true); // audio format (PCM)
      view.setUint16(22, 1, true); // num channels
      view.setUint32(24, 16000, true); // sample rate
      view.setUint32(28, 32000, true); // byte rate
      view.setUint16(32, 2, true); // block align
      view.setUint16(34, 16, true); // bits per sample

      // data chunk
      view.setUint32(36, 0x64617461, false); // "data"
      view.setUint32(40, 0, true); // data size

      return new Uint8Array(buffer);
    };

    // Add sample audio files (placeholder silent WAVs)
    audiosFolder?.file("sample_1.wav", createSilentWav());
    audiosFolder?.file("sample_2.wav", createSilentWav());
    audiosFolder?.file("sample_3.wav", createSilentWav());

    // Create data.csv
    const csvContent =
      "audio_file,text\nsample_1.wav,This is the reference transcription for sample 1.\nsample_2.wav,This is the reference transcription for sample 2.\nsample_3.wav,This is the reference transcription for sample 3.";
    zip.file("data.csv", csvContent);

    // Generate and download
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "sample_stt_input.zip";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleZipUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessingZip(true);

    try {
      const zip = await JSZip.loadAsync(file);

      // Look for data.csv at expected locations:
      // 1. Root level: data.csv
      // 2. Inside a wrapper folder: <folder>/data.csv (common when compressing a folder on macOS)
      let csvFile = zip.file("data.csv");
      let basePath = "";

      if (!csvFile) {
        // Check for a single wrapper folder containing data.csv
        const topLevelEntries = Object.keys(zip.files).filter(
          (path) => !path.includes("__MACOSX") && !path.startsWith("._")
        );
        const folders = topLevelEntries.filter(
          (path) => path.endsWith("/") && path.split("/").length === 2
        );

        for (const folder of folders) {
          const candidate = zip.file(`${folder}data.csv`);
          if (candidate) {
            csvFile = candidate;
            basePath = folder;
            break;
          }
        }
      }

      if (!csvFile) {
        alert("ZIP must contain a data.csv file");
        setIsProcessingZip(false);
        return;
      }

      // Parse CSV
      let csvContent = await csvFile.async("string");

      // Remove BOM (Byte Order Mark) if present - common in Excel-exported CSVs
      if (csvContent.charCodeAt(0) === 0xfeff) {
        csvContent = csvContent.slice(1);
      }

      // Handle different line endings: \r\n (Windows), \n (Unix), \r (old Mac)
      const lines = csvContent
        .split(/\r\n|\n|\r/)
        .filter((line: string) => line.trim());

      if (lines.length < 2) {
        console.error(
          "CSV parsing failed. Raw content length:",
          csvContent.length
        );
        console.error("Lines found:", lines.length);
        console.error("First 500 chars of CSV:", csvContent.substring(0, 500));
        alert(
          `data.csv must have a header and at least one data row. Found ${lines.length} line(s).`
        );
        setIsProcessingZip(false);
        return;
      }

      // Parse header
      const headers = lines[0]
        .split(",")
        .map((h: string) => h.trim().toLowerCase());
      const audioFileIndex = headers.indexOf("audio_file");
      const textIndex = headers.indexOf("text");

      if (audioFileIndex === -1 || textIndex === -1) {
        alert("data.csv must have 'audio_file' and 'text' columns");
        setIsProcessingZip(false);
        return;
      }

      // Parse data rows
      const dataRows: { audioFileName: string; text: string }[] = [];
      for (let i = 1; i < lines.length; i++) {
        // Handle CSV parsing with potential commas in quoted text
        const line = lines[i];
        const values: string[] = [];
        let current = "";
        let inQuotes = false;

        for (let j = 0; j < line.length; j++) {
          const char = line[j];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === "," && !inQuotes) {
            values.push(current.trim());
            current = "";
          } else {
            current += char;
          }
        }
        values.push(current.trim());

        const audioFileName = values[audioFileIndex];
        const text = values[textIndex];

        if (audioFileName && text) {
          dataRows.push({ audioFileName, text });
        }
      }

      if (dataRows.length === 0) {
        alert("No valid data rows found in data.csv");
        setIsProcessingZip(false);
        return;
      }

      // Clear existing rows (revoke URLs)
      rows.forEach((row) => {
        if (row.audioUrl) {
          URL.revokeObjectURL(row.audioUrl);
        }
      });

      // Process each audio file
      const newRows: AudioTextRow[] = [];
      const newUploadStatus: {
        [key: string]: "uploading" | "success" | "error";
      } = {};

      for (let i = 0; i < dataRows.length; i++) {
        const { audioFileName, text } = dataRows[i];
        const rowId = Date.now().toString() + i;

        // Look for audio file in audios/ folder (using basePath for nested ZIPs)
        const audioFileZip =
          zip.file(`${basePath}audios/${audioFileName}`) ||
          zip.file(`${basePath}${audioFileName}`);

        if (!audioFileZip) {
          console.warn(`Audio file not found: ${audioFileName}`);
          newRows.push({
            id: rowId,
            audioFile: null,
            audioUrl: null,
            text,
            s3Path: null,
          });
          continue;
        }

        // Extract audio file
        const audioBlob = await audioFileZip.async("blob");
        const audioFile = new File([audioBlob], audioFileName, {
          type: "audio/wav",
        });

        // Create preview URL
        const audioUrl = URL.createObjectURL(audioFile);

        // Add to rows with pending upload
        newRows.push({
          id: rowId,
          audioFile,
          audioUrl,
          text,
          s3Path: null,
        });
        newUploadStatus[rowId] = "uploading";
      }

      setRows(newRows);
      setUploadStatus(newUploadStatus);
      setInvalidRowIds(new Set());

      // Upload all audio files to S3
      for (let i = 0; i < newRows.length; i++) {
        const row = newRows[i];
        if (row.audioFile) {
          const s3Path = await uploadFileToS3(row.audioFile);
          if (s3Path) {
            setRows((prev) =>
              prev.map((r) => (r.id === row.id ? { ...r, s3Path } : r))
            );
            setUploadStatus((prev) => ({ ...prev, [row.id]: "success" }));
          } else {
            setUploadStatus((prev) => ({ ...prev, [row.id]: "error" }));
          }
        }
      }
    } catch (error) {
      console.error("Error processing ZIP:", error);
      alert("Failed to process ZIP file");
    } finally {
      setIsProcessingZip(false);
      // Reset file input
      if (zipInputRef.current) {
        zipInputRef.current.value = "";
      }
    }
  };

  const handleEvaluate = async () => {
    // Validate all rows
    const invalidIds = new Set<string>();
    rows.forEach((row) => {
      if (!row.audioFile || !row.text.trim() || !row.s3Path) {
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

      // Collect audio paths and texts
      const audioPaths = rows.map((row) => row.s3Path!);
      const texts = rows.map((row) => row.text.trim());

      // Map provider labels to their actual values
      const providers = Array.from(selectedProviders).map((label) => {
        const provider = sttProviders.find((p) => p.label === label);
        return provider ? provider.value : label;
      });

      // Make API call
      const response = await fetch(`${backendUrl}/stt/evaluate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          accept: "application/json",
          "ngrok-skip-browser-warning": "true",
          Authorization: `Bearer ${backendAccessToken}`,
        },
        body: JSON.stringify({
          audio_paths: audioPaths,
          texts: texts,
          providers: providers,
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
        router.push(`/stt/${result.task_id}`);
      }
    } catch (error) {
      console.error("Error evaluating:", error);
      setIsEvaluating(false);
    }
  };

  const getFileName = (file: File | null) => {
    if (!file) return null;
    return file.name.length > 20
      ? `${file.name.substring(0, 20)}...`
      : file.name;
  };

  const isEvaluateDisabled = selectedProviders.size === 0;

  return (
    <div className="space-y-6">
      {/* Header with Evaluate Button */}
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-[15px] leading-relaxed">
          Upload audio files with reference transcriptions to evaluate STT
          quality across multiple providers
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
          {/* Audio-Text Rows */}
          {rows.map((row, index) => {
            const isInvalid = invalidRowIds.has(row.id);
            const isUploading = uploadStatus[row.id] === "uploading";
            const isUploaded = uploadStatus[row.id] === "success";

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

                {/* File Upload / Audio Player */}
                <div className="flex-shrink-0 flex items-center gap-2">
                  <input
                    type="file"
                    ref={(el) => {
                      fileInputRefs.current[row.id] = el;
                    }}
                    accept=".wav,audio/wav,audio/x-wav"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      if (file && !file.name.toLowerCase().endsWith(".wav")) {
                        alert("Please select a .wav file only");
                        e.target.value = "";
                        return;
                      }
                      handleFileChange(row.id, file);
                    }}
                    className="hidden"
                  />

                  {isUploaded && row.audioUrl ? (
                    // Show audio player when uploaded
                    <div className="flex items-center gap-2">
                      <audio
                        src={row.audioUrl}
                        controls
                        className="h-8 w-96"
                        style={{ minWidth: "250px" }}
                      />
                      <button
                        onClick={() => fileInputRefs.current[row.id]?.click()}
                        className="h-7 px-2 rounded text-[11px] font-medium border border-border bg-background hover:bg-accent transition-colors cursor-pointer text-muted-foreground hover:text-foreground"
                        title="Replace audio"
                      >
                        Replace
                      </button>
                    </div>
                  ) : (
                    // Show upload button
                    <button
                      onClick={() => fileInputRefs.current[row.id]?.click()}
                      disabled={isUploading}
                      className="h-8 px-3 rounded text-[12px] font-medium border border-border bg-background hover:bg-accent transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isUploading ? (
                        <>
                          <svg
                            className="w-3.5 h-3.5 animate-spin"
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
                          <span>Uploading...</span>
                        </>
                      ) : (
                        <>
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
                              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                            />
                          </svg>
                          <span>
                            {row.audioFile
                              ? getFileName(row.audioFile)
                              : "Upload .wav"}
                          </span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Text Input */}
                <div className="flex-1">
                  <input
                    type="text"
                    value={row.text}
                    onChange={(e) => handleTextChange(row.id, e.target.value)}
                    placeholder="Enter reference transcription"
                    className="w-full h-8 px-2 rounded text-[13px] border border-border bg-background focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                  />
                </div>

                {/* Delete Button */}
                {rows.length > 1 && (
                  <button
                    onClick={() => {
                      // Skip confirmation if row is empty
                      if (!row.audioFile && !row.text.trim()) {
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

          {/* ZIP Upload Section */}
          <div className="border border-border rounded-xl p-6 bg-muted/10 w-2/3 mx-auto">
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
                    d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-[14px] font-medium text-foreground mb-1">
                  Upload ZIP
                </h3>
                <p className="text-[13px] text-muted-foreground mb-4">
                  Upload a ZIP file containing an{" "}
                  <code className="px-1.5 py-0.5 rounded bg-muted text-foreground font-mono text-[12px]">
                    audios
                  </code>{" "}
                  folder with .wav files and a{" "}
                  <code className="px-1.5 py-0.5 rounded bg-muted text-foreground font-mono text-[12px]">
                    data.csv
                  </code>{" "}
                  file mapping audio files to their reference transcriptions.
                  Refer to the sample zip file for more details.
                </p>
                <div className="flex items-center gap-3">
                  <input
                    ref={zipInputRef}
                    type="file"
                    accept=".zip"
                    onChange={handleZipUpload}
                    className="hidden"
                    id="zip-upload"
                  />
                  <label
                    htmlFor="zip-upload"
                    className={`h-9 px-4 rounded-md text-[13px] font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-2 ${
                      isProcessingZip ? "opacity-50 cursor-not-allowed" : ""
                    }`}
                  >
                    {isProcessingZip ? (
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
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                        Processing...
                      </>
                    ) : (
                      <>
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
                        Choose ZIP file
                      </>
                    )}
                  </label>
                  <button
                    onClick={handleDownloadSampleZip}
                    disabled={isProcessingZip}
                    className="h-9 px-4 rounded-md text-[13px] font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
                    Download sample ZIP
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
