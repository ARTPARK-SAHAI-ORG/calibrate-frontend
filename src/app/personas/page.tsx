"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { AppLayout } from "@/components/AppLayout";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { Tooltip } from "@/components/Tooltip";

type PersonaData = {
  uuid: string;
  name: string;
  description: string;
  config: {
    gender: "male" | "female";
    interruption_sensitivity: "none" | "low" | "medium" | "high";
    language: "english" | "hindi" | "kannada";
  };
  created_at: string;
  updated_at: string;
};

const DEFAULT_CHARACTERISTICS = `You are Rajesh, a 45-year-old farmer from rural Karnataka who speaks primarily in Kannada with limited English proficiency. You are polite and friendly but speak slowly with natural pauses like "uhh" and "umm". You have a calm and patient demeanor but can become frustrated when technical jargon is used. You prefer simple, straightforward explanations and often ask for clarification. You tend to repeat important information to make sure you understood correctly.`;

export default function PersonasPage() {
  // Set page title
  useEffect(() => {
    document.title = "Personas | Pense";
  }, []);
  const router = useRouter();
  const { data: session } = useSession();
  const backendAccessToken = (session as any)?.backendAccessToken;
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [addPersonaSidebarOpen, setAddPersonaSidebarOpen] = useState(false);
  const [personas, setPersonas] = useState<PersonaData[]>([]);
  const [personasLoading, setPersonasLoading] = useState(true);
  const [personasError, setPersonasError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editingPersonaUuid, setEditingPersonaUuid] = useState<string | null>(
    null
  );
  const [isLoadingPersona, setIsLoadingPersona] = useState(false);
  const [validationAttempted, setValidationAttempted] = useState(false);

  // Form fields
  const [personaLabel, setPersonaLabel] = useState("");
  const [personaCharacteristics, setPersonaCharacteristics] = useState(
    DEFAULT_CHARACTERISTICS
  );
  const [personaGender, setPersonaGender] = useState<"male" | "female">("male");
  const [personaInterruptionSensitivity, setPersonaInterruptionSensitivity] =
    useState<"none" | "low" | "medium" | "high">("medium");
  const [personaLanguage, setPersonaLanguage] = useState<
    "english" | "hindi" | "kannada"
  >("english");

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [personaToDelete, setPersonaToDelete] = useState<PersonaData | null>(
    null
  );
  const [isPersonaDeleting, setIsPersonaDeleting] = useState(false);

  // Fetch personas from backend
  useEffect(() => {
    const fetchPersonas = async () => {
      if (!backendAccessToken) return;

      try {
        setPersonasLoading(true);
        setPersonasError(null);
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) {
          throw new Error("BACKEND_URL environment variable is not set");
        }

        const response = await fetch(`${backendUrl}/personas`, {
          method: "GET",
          headers: {
            accept: "application/json",
            "ngrok-skip-browser-warning": "true",
            Authorization: `Bearer ${backendAccessToken}`,
          },
        });

        if (response.status === 401) {
          await signOut({ callbackUrl: "/login" });
          return;
        }

        if (!response.ok) {
          throw new Error("Failed to fetch personas");
        }

        const data: PersonaData[] = await response.json();
        setPersonas(data);
      } catch (err) {
        console.error("Error fetching personas:", err);
        setPersonasError(
          err instanceof Error ? err.message : "Failed to load personas"
        );
      } finally {
        setPersonasLoading(false);
      }
    };

    fetchPersonas();
  }, [backendAccessToken]);

  // Open delete confirmation dialog
  const openDeleteDialog = (persona: PersonaData) => {
    setPersonaToDelete(persona);
    setDeleteDialogOpen(true);
  };

  // Close delete confirmation dialog
  const closeDeleteDialog = () => {
    if (!isPersonaDeleting) {
      setDeleteDialogOpen(false);
      setPersonaToDelete(null);
    }
  };

  // Delete persona from backend
  const deletePersona = async () => {
    if (!personaToDelete) return;

    try {
      setIsPersonaDeleting(true);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      const response = await fetch(
        `${backendUrl}/personas/${personaToDelete.uuid}`,
        {
          method: "DELETE",
          headers: {
            accept: "application/json",
            "ngrok-skip-browser-warning": "true",
            Authorization: `Bearer ${backendAccessToken}`,
          },
        }
      );

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to delete persona");
      }

      // Remove the persona from local state
      setPersonas(
        personas.filter((persona) => persona.uuid !== personaToDelete.uuid)
      );
      closeDeleteDialog();
    } catch (err) {
      console.error("Error deleting persona:", err);
    } finally {
      setIsPersonaDeleting(false);
    }
  };

  // Reset form fields
  const resetForm = () => {
    setPersonaLabel("");
    setPersonaCharacteristics(DEFAULT_CHARACTERISTICS);
    setPersonaGender("male");
    setPersonaInterruptionSensitivity("medium");
    setPersonaLanguage("english");
    setEditingPersonaUuid(null);
    setCreateError(null);
    setValidationAttempted(false);
  };

  // Create persona via POST API
  const createPersona = async () => {
    setValidationAttempted(true);
    if (!personaLabel.trim() || !personaCharacteristics.trim()) return;

    try {
      setIsCreating(true);
      setCreateError(null);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      const response = await fetch(`${backendUrl}/personas`, {
        method: "POST",
        headers: {
          accept: "application/json",
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
          Authorization: `Bearer ${backendAccessToken}`,
        },
        body: JSON.stringify({
          name: personaLabel.trim(),
          description: personaCharacteristics.trim(),
          config: {
            gender: personaGender,
            interruption_sensitivity: personaInterruptionSensitivity,
            language: personaLanguage,
          },
        }),
      });

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to create persona");
      }

      // Refetch the personas list to get the updated data
      const personasResponse = await fetch(`${backendUrl}/personas`, {
        method: "GET",
        headers: {
          accept: "application/json",
          "ngrok-skip-browser-warning": "true",
          Authorization: `Bearer ${backendAccessToken}`,
        },
      });

      if (personasResponse.ok) {
        const updatedPersonas: PersonaData[] = await personasResponse.json();
        setPersonas(updatedPersonas);
      }

      // Reset form fields and close sidebar
      resetForm();
      setAddPersonaSidebarOpen(false);
    } catch (err) {
      console.error("Error creating persona:", err);
      setCreateError(
        err instanceof Error ? err.message : "Failed to create persona"
      );
    } finally {
      setIsCreating(false);
    }
  };

  // Fetch persona details by UUID and open edit sidebar
  const openEditPersona = async (uuid: string) => {
    try {
      setIsLoadingPersona(true);
      setEditingPersonaUuid(uuid);
      setAddPersonaSidebarOpen(true);
      setCreateError(null);

      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      const response = await fetch(`${backendUrl}/personas/${uuid}`, {
        method: "GET",
        headers: {
          accept: "application/json",
          "ngrok-skip-browser-warning": "true",
          Authorization: `Bearer ${backendAccessToken}`,
        },
      });

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to fetch persona details");
      }

      const personaData: PersonaData = await response.json();

      // Populate form fields with persona data
      setPersonaLabel(personaData.name || "");
      setPersonaCharacteristics(
        personaData.description || DEFAULT_CHARACTERISTICS
      );
      setPersonaGender(personaData.config?.gender || "male");
      setPersonaInterruptionSensitivity(
        personaData.config?.interruption_sensitivity || "medium"
      );
      setPersonaLanguage(personaData.config?.language || "english");
    } catch (err) {
      console.error("Error fetching persona:", err);
      setCreateError(
        err instanceof Error ? err.message : "Failed to load persona"
      );
    } finally {
      setIsLoadingPersona(false);
    }
  };

  // Update existing persona via PUT API
  const updatePersona = async () => {
    setValidationAttempted(true);
    if (
      !personaLabel.trim() ||
      !personaCharacteristics.trim() ||
      !editingPersonaUuid
    )
      return;

    try {
      setIsCreating(true);
      setCreateError(null);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      const response = await fetch(
        `${backendUrl}/personas/${editingPersonaUuid}`,
        {
          method: "PUT",
          headers: {
            accept: "application/json",
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
            Authorization: `Bearer ${backendAccessToken}`,
          },
          body: JSON.stringify({
            name: personaLabel.trim(),
            description: personaCharacteristics.trim(),
            config: {
              gender: personaGender,
              interruption_sensitivity: personaInterruptionSensitivity,
              language: personaLanguage,
            },
          }),
        }
      );

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to update persona");
      }

      // Refetch the personas list to get the updated data
      const personasResponse = await fetch(`${backendUrl}/personas`, {
        method: "GET",
        headers: {
          accept: "application/json",
          "ngrok-skip-browser-warning": "true",
          Authorization: `Bearer ${backendAccessToken}`,
        },
      });

      if (personasResponse.ok) {
        const updatedPersonas: PersonaData[] = await personasResponse.json();
        setPersonas(updatedPersonas);
      }

      // Reset and close
      resetForm();
      setAddPersonaSidebarOpen(false);
    } catch (err) {
      console.error("Error updating persona:", err);
      setCreateError(
        err instanceof Error ? err.message : "Failed to update persona"
      );
    } finally {
      setIsCreating(false);
    }
  };

  // Filter personas based on search query
  const filteredPersonas = personas.filter(
    (persona) =>
      (persona.name &&
        persona.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (persona.description &&
        persona.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Helper to display interruption sensitivity
  const getInterruptionSensitivityLabel = (
    value: "none" | "low" | "medium" | "high"
  ) => {
    const labels: Record<string, string> = {
      none: "None",
      low: "Low",
      medium: "Medium",
      high: "High",
    };
    return labels[value] || value;
  };

  return (
    <AppLayout
      activeItem="personas"
      onItemChange={(itemId) => router.push(`/${itemId}`)}
      sidebarOpen={sidebarOpen}
      onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Personas</h1>
            <p className="text-muted-foreground text-base leading-relaxed mt-1">
              Personas define the characteristics of the simulated user
              interacting with your agent
            </p>
          </div>
          <button
            onClick={() => {
              resetForm();
              setAddPersonaSidebarOpen(true);
            }}
            className="h-10 px-4 rounded-md text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer"
          >
            Add persona
          </button>
        </div>

        {/* Search Input */}
        <div className="relative max-w-md">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <svg
              className="w-5 h-5 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
              />
            </svg>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search personas"
            className="w-full h-10 pl-10 pr-4 rounded-md text-base border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          />
        </div>

        {/* Personas List / Loading / Error / Empty State */}
        {personasLoading ? (
          <div className="flex items-center justify-center gap-3 py-8">
            <svg
              className="w-5 h-5 animate-spin"
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
          </div>
        ) : personasError ? (
          <div className="border border-border rounded-xl p-12 flex flex-col items-center justify-center bg-muted/20">
            <p className="text-base text-red-500 mb-2">{personasError}</p>
            <button
              onClick={() => window.location.reload()}
              className="text-base text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : filteredPersonas.length === 0 ? (
          <div className="border border-border rounded-xl p-12 flex flex-col items-center justify-center bg-muted/20">
            <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center mb-4">
              <svg
                className="w-7 h-7 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">
              No personas found
            </h3>
            <p className="text-base text-muted-foreground mb-4">
              {searchQuery
                ? "No personas match your search"
                : "You haven't created any personas yet"}
            </p>
            <button
              onClick={() => {
                resetForm();
                setAddPersonaSidebarOpen(true);
              }}
              className="h-10 px-4 rounded-md text-base font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
            >
              Add persona
            </button>
          </div>
        ) : (
          <div className="border border-border rounded-xl overflow-hidden">
            {/* Table Header */}
            <div className="grid grid-cols-[200px_1fr_100px_100px_120px_auto] gap-4 px-4 py-2 border-b border-border bg-muted/30">
              <div className="text-sm font-medium text-muted-foreground">
                Label
              </div>
              <div className="text-sm font-medium text-muted-foreground">
                Characteristics
              </div>
              {/* Gender column header - commented out to hide gender */}
              <div className="text-sm font-medium text-muted-foreground">
                Gender
              </div>
              <div className="text-sm font-medium text-muted-foreground">
                Language
              </div>
              <div className="text-sm font-medium text-muted-foreground">
                Interruption
              </div>
              <div className="w-8"></div>
            </div>
            {/* Table Rows */}
            {filteredPersonas.map((persona) => (
              <div
                key={persona.uuid}
                onClick={() => openEditPersona(persona.uuid)}
                className="grid grid-cols-[200px_1fr_100px_100px_120px_auto] gap-4 px-4 py-2 border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors cursor-pointer items-center"
              >
                <div className="overflow-x-auto max-w-full">
                  <p className="text-sm font-medium text-foreground whitespace-nowrap">
                    {persona.name}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-1">
                  {persona.description || "—"}
                </p>
                {/* Gender column - commented out to hide gender */}
                <p className="text-sm text-muted-foreground capitalize">
                  {persona.config?.gender || "—"}
                </p>
                <p className="text-sm text-muted-foreground capitalize">
                  {persona.config?.language || "—"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {getInterruptionSensitivityLabel(
                    persona.config?.interruption_sensitivity || "medium"
                  )}
                </p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openDeleteDialog(persona);
                  }}
                  className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
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
                      d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Persona Sidebar */}
      {addPersonaSidebarOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => {
              resetForm();
              setAddPersonaSidebarOpen(false);
            }}
          />
          {/* Sidebar */}
          <div className="relative w-[40%] min-w-[500px] bg-background border-l border-border flex flex-col h-full shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
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
                    d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                  />
                </svg>
                <h2 className="text-lg font-semibold">
                  {editingPersonaUuid ? "Edit persona" : "Add persona"}
                </h2>
              </div>
              <button
                onClick={() => {
                  resetForm();
                  setAddPersonaSidebarOpen(false);
                }}
                className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer"
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
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {isLoadingPersona ? (
                <div className="flex items-center justify-center py-12">
                  <svg
                    className="w-6 h-6 animate-spin"
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
                </div>
              ) : (
                <>
                  {/* Configuration Section */}
                  <div className="space-y-4">
                    {/* Label */}
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Label <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={personaLabel}
                        onChange={(e) => setPersonaLabel(e.target.value)}
                        placeholder="e.g., Rural Farmer - Karnataka"
                        className={`w-full h-10 px-4 rounded-md text-base border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent ${
                          validationAttempted && !personaLabel.trim()
                            ? "border-red-500"
                            : "border-border"
                        }`}
                      />
                    </div>

                    {/* Characteristics */}
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Characteristics <span className="text-red-500">*</span>
                      </label>
                      <p className="text-sm text-muted-foreground mb-2">
                        Define WHO the persona is emulating (e.g., specific
                        details like their name, age, gender, etc.) and HOW they
                        behave (e.g. polite, friendly, impatient, speaks slowly,
                        etc.). Avoid task instructions here — use{" "}
                        <span className="text-white">Scenarios</span> to define
                        WHAT to do.
                      </p>
                      <textarea
                        value={personaCharacteristics}
                        onChange={(e) =>
                          setPersonaCharacteristics(e.target.value)
                        }
                        rows={6}
                        className={`w-full px-4 py-3 rounded-md text-base border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-none ${
                          validationAttempted && !personaCharacteristics.trim()
                            ? "border-red-500"
                            : "border-border"
                        }`}
                      />
                    </div>

                    {/* Gender - commented out to hide gender selection */}
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Gender
                      </label>
                      <div className="flex rounded-md border border-border overflow-hidden w-fit">
                        <button
                          type="button"
                          onClick={() => setPersonaGender("male")}
                          className={`px-6 py-2 text-sm font-medium transition-colors cursor-pointer ${
                            personaGender === "male"
                              ? "bg-foreground text-background"
                              : "bg-background text-muted-foreground hover:bg-muted/50"
                          }`}
                        >
                          Male
                        </button>
                        <button
                          type="button"
                          onClick={() => setPersonaGender("female")}
                          className={`px-6 py-2 text-sm font-medium transition-colors cursor-pointer border-l border-border ${
                            personaGender === "female"
                              ? "bg-foreground text-background"
                              : "bg-background text-muted-foreground hover:bg-muted/50"
                          }`}
                        >
                          Female
                        </button>
                      </div>
                    </div>

                    {/* Language */}
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Language
                      </label>
                      <div className="flex rounded-md border border-border overflow-hidden w-fit">
                        {(["english", "hindi", "kannada"] as const).map(
                          (lang, index) => (
                            <button
                              key={lang}
                              type="button"
                              onClick={() => setPersonaLanguage(lang)}
                              className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
                                index > 0 ? "border-l border-border" : ""
                              } ${
                                personaLanguage === lang
                                  ? "bg-foreground text-background"
                                  : "bg-background text-muted-foreground hover:bg-muted/50"
                              }`}
                            >
                              {lang.charAt(0).toUpperCase() + lang.slice(1)}
                            </button>
                          )
                        )}
                      </div>
                    </div>

                    {/* Interruption Sensitivity */}
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Interruption sensitivity
                      </label>
                      <p className="text-sm text-muted-foreground mb-2">
                        Real users often interrupt agents mid-sentence. Set how
                        likely this persona is to do the same.
                      </p>
                      <div className="flex rounded-md border border-border overflow-hidden w-fit">
                        {(["none", "low", "medium", "high"] as const).map(
                          (level, index) => {
                            const tooltipContent: Record<string, string> = {
                              low: "25% chance that the user will interrupt the agent",
                              medium:
                                "50% chance that the user will interrupt the agent",
                              high: "80% chance that the user will interrupt the agent",
                            };
                            const button = (
                              <button
                                key={level}
                                type="button"
                                onClick={() =>
                                  setPersonaInterruptionSensitivity(level)
                                }
                                className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
                                  index > 0 ? "border-l border-border" : ""
                                } ${
                                  personaInterruptionSensitivity === level
                                    ? "bg-foreground text-background"
                                    : "bg-background text-muted-foreground hover:bg-muted/50"
                                }`}
                              >
                                {level.charAt(0).toUpperCase() + level.slice(1)}
                              </button>
                            );
                            return tooltipContent[level] ? (
                              <Tooltip
                                key={level}
                                content={tooltipContent[level]}
                                position="top"
                              >
                                {button}
                              </Tooltip>
                            ) : (
                              button
                            );
                          }
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-border space-y-3">
              {createError && (
                <p className="text-sm text-red-500">{createError}</p>
              )}
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => {
                    resetForm();
                    setAddPersonaSidebarOpen(false);
                  }}
                  disabled={isCreating || isLoadingPersona}
                  className="h-10 px-4 rounded-md text-base font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={editingPersonaUuid ? updatePersona : createPersona}
                  disabled={isCreating || isLoadingPersona}
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
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      {editingPersonaUuid ? "Saving..." : "Creating..."}
                    </>
                  ) : editingPersonaUuid ? (
                    "Save"
                  ) : (
                    "Add persona"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        isOpen={deleteDialogOpen}
        onClose={closeDeleteDialog}
        onConfirm={deletePersona}
        title="Delete persona"
        message={`Are you sure you want to delete "${personaToDelete?.name}"?`}
        confirmText="Delete"
        isDeleting={isPersonaDeleting}
      />
    </AppLayout>
  );
}
