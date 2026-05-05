---
description: "Description of the project"
alwaysApply: true
---

# Calibrate Frontend

**AI Agent Simulation and Evaluation Platform** (first-class **voice** support: STT/TTS benchmarks, voice simulation runs, and speech-oriented agent configuration)

---

## What is Calibrate?

Calibrate is a comprehensive platform for building, configuring, testing, and evaluating **AI agents**—conversational systems you can exercise with **text** simulations, **LLM** component tests, and (where the stack supports it) **voice** end-to-end runs. **Voice** is a major focus: Built agents wire STT/TTS with the LLM for speech-in/speech-out style testing; teams also use the same product to compare speech providers and run simulations that include or omit audio depending on run type and agent type.

The platform addresses quality assurance for agent teams by providing:

- **Component-level testing** (STT/TTS provider benchmarks; LLM tests for tool use and responses)
- **End-to-end simulation testing** (conversations with simulated users—**text** or **voice** runs per product rules)
- **Benchmarking** across AI providers to pick the best configuration

> **Note on naming**: The app is branded as "Calibrate" in all user-facing UI, page titles, and documentation. Legacy infrastructure outside this repo may still reference "pense". Documentation links use `process.env.NEXT_PUBLIC_DOCS_URL` directly. The npm package name is `calibrate-frontend`.
>
> **Community links**: `WHATSAPP_INVITE_URL` and **`ARTPARK_WEBSITE_URL`** live in **`src/constants/links.ts`**. WhatsApp is imported wherever needed: `AppLayout.tsx` (Talk to Us FAB), `page.tsx` (landing Community section), and `LandingFooter.tsx`. **`ARTPARK_WEBSITE_URL`** targets `https://www.artpark.in/` and is consumed by **`page.tsx`** for the landing hero eyebrow’s ARTPARK link—never hardcode either URL alongside WhatsApp. **Discord** is not linked anywhere in the UI; **`LandingFooter`** still exposes LinkedIn under Community as **`https://linkedin.com/company/artpark`** (hardcoded, not centralized in `links.ts`).

---

## Overall Context & Use Cases

### Primary Use Case

Organizations building **AI agents**—including **voice-heavy** products (customer support bots, IVR, voice assistants) and teams that mostly validate over **text** first—use Calibrate to:

1. Configure agent behavior and, for **Built** agents, the speech-ready stack (STT, TTS, and LLM); **Connect** agents point at an external URL and follow separate verification and run-type rules
2. Test individual components (STT, TTS, LLM) to select the best providers
3. Run simulated conversations (**text** and/or **voice** depending on launch options and agent type) to validate behavior
4. Evaluate performance with metrics and custom evaluators before going live

### Workflow Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CALIBRATE WORKFLOW                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   1. CREATE AGENT                                                       │
│      └── Configure: System Prompt, STT, TTS, LLM, Tools                 │
│                                                                         │
│   2. UNIT TEST (Optional)                                               │
│      ├── STT Evaluation: Compare speech-to-text providers               │
│      └── TTS Evaluation: Compare text-to-speech providers               │
│                                                                         │
│   3. SETUP END-TO-END TESTS                                             │
│      ├── Create Personas: Define simulated user characteristics         │
│      ├── Create Scenarios: Define conversation goals/tasks              │
│      └── Define Metrics: Set evaluation criteria                        │
│                                                                         │
│   4. RUN SIMULATIONS                                                    │
│      ├── Create Simulation: Select agent + personas + scenarios         │
│      ├── Execute Run: Simulated conversations (text or voice)           │
│      └── Review Results: Transcripts, metrics, pass/fail status         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Complete Feature List

### 1. Agent Management (`/agents`)

**What you can do:**

- **Create agents** — two types: **Build** (`type: "agent"`) where the platform configures STT/TTS/LLM, or **Connect** (`type: "connection"`) where you provide an external agent URL. The `type` field is `"agent" | "connection"` throughout the codebase (never `"calibrate"`).
  - Build agents get default STT/TTS/LLM config; Connection agents get `agent_url`, `agent_headers`, and connection verification fields
- **View all agents** in a searchable, sortable list (sorted by last updated)
- **Duplicate agents** - clone existing agent configurations
- **Delete agents**
- **Right-click or Cmd/Ctrl+click** any agent row to open in a new browser tab (native browser support)

**Agent Detail Page** (`/agents/[uuid]`) — tabs vary by agent type. Tab navigation is data-driven: `calibrateTabs` and `connectionTabs` arrays define which tabs to show, and `tabLabels` maps tab IDs to display names. The buttons are rendered by mapping over the appropriate array — no per-tab JSX duplication.

Build agents (`type: "agent"`) have 5 tabs:

| Tab                 | Purpose                                                                          |
| ------------------- | -------------------------------------------------------------------------------- |
| **Agent**           | Configure system prompt, STT/TTS providers, and LLM model                        |
| **Tools**           | Attach/detach function calling tools + toggle built-in "End conversation" tool   |
| **Data Extraction** | Define fields to extract from conversations (name, type, description, required)  |
| **Tests**           | Link test cases to agent, run tests, view past runs with results, compare models |
| **Settings**        | Toggle "Agent speaks first" behavior, set max assistant turns before call ends   |

Connection agents (`type: "connection"`) have 3 tabs:

| Tab            | Purpose                                                                          |
| -------------- | -------------------------------------------------------------------------------- |
| **Connection** | Configure agent URL, headers, verify connection, view expected request/response format |
| **Tests**      | Link test cases to agent, run tests, view past runs with results, compare models |
| **Settings**   | Toggle "Agent speaks first" behavior, set max assistant turns before call ends   |

**Connection Tab — Verification Logic** (`AgentConnectionTabContent.tsx`):

The "Verify" button opens a **`VerifyRequestPreviewDialog`** modal that shows editable sample messages (default: `[{"role": "user", "content": "Hi"}]`). Users can edit message roles (user/assistant) and content, add more rows, and see a live JSON preview of the request body in a two-column layout before confirming. Empty message inputs are validated on submit — they show a red border with "Message cannot be empty" and block the request. On "Send & Verify", it calls `verify.verifyAdHoc(agentUrl, headersObj, messages)` → `POST /agents/verify-connection` with `{ agent_url, agent_headers, messages }` in the body. This means the user can verify before saving. The `Authorization: Bearer` header is required. On failure, the dialog stays open and displays the error (and optional sample response) inline in a red-tinted box, with a "Retry" button that instantly re-sends the same messages. The dialog only closes on success or Cancel.

- **Stale closure fix**: `connectionConfig` is mirrored via a `connectionConfigRef` (kept in sync by a `useEffect`). The `handleVerifyConfirm` callback reads `connectionConfigRef.current` instead of the closed-over `connectionConfig` to avoid capturing stale state when updating config after verification.
- **Verified snapshot + draft-change reset**: A `verifiedSnapshotRef` stores the URL, serialized headers, status, and timestamp from the last verification attempt (success or failure). A `useEffect` watches `agentUrl` and `agentHeaders` and compares the current draft against the snapshot. If drafts diverge, `verifyStatus` resets to `"unverified"`, errors are dismissed, **and `onConnectionConfigChange` is called to set `connection_verified: false`** — ensuring the parent `connectionConfig` state matches the UI so that clicking Save sends the correct value to the backend. If the user reverts back to match the snapshot exactly, both the UI status and `connectionConfig.connection_verified` are restored without re-verifying. The snapshot is initialized from `connectionConfig` on mount (if already verified) and updated after each `handleVerify` call.

The basic connection check does not send a `model` field. The same post-save endpoint (`POST /agents/{uuid}/verify-connection`) is also used for per-model benchmark verification by passing `{ "model": "openai/gpt-5.4", "messages": [...] }` in the body — there is no separate benchmark verification endpoint. Both connection-level and benchmark verification use the `VerifyRequestPreviewDialog` to let users customize the sample messages before sending. The response schema for all verify-connection calls is `{ success: boolean, error: string | null, sample_response: object | null }`. The frontend maps `success` → `connection_verified` and `error` → `connection_verified_error` in the local `connectionConfig` state. When verification fails and `sample_response` is present (e.g., the agent returned JSON in an unexpected format), it is displayed below the error message in a scrollable `<pre>` block labeled "Your agent responded with:" so the user can see exactly what their agent returned and fix it.

**Save config payload by agent type**: Both agent types include `settings: { agent_speaks_first, max_assistant_turns }` in the config sent to `PUT /agents/{uuid}`. Connection agents send `{ ...connectionConfig, agent_url, agent_headers, settings }`. Calibrate agents send `{ system_prompt, stt, tts, llm, settings, system_tools, data_extraction_fields }`. The settings values are loaded from `data.config.settings` on fetch for all agent types. For connection agents, the save request **always** includes `connection_verified` as a **top-level boolean** alongside `name` and `config` (matching the backend `AgentUpdate` schema: `name`, `config`, `connection_verified`). It sends `true` if the connection is currently verified, or `false` if not (e.g., the user edited the URL/headers after verifying). This ensures the backend always reflects the current verification state on every save.

**Save response updates verification status**: The `PUT /agents/{uuid}` response returns the full agent including `config.connection_verified`, `config.connection_verified_at`, `config.connection_verified_error`, and `config.benchmark_models_verified`. After a successful save of a connection agent, `AgentDetail.tsx` parses this response and updates `connectionConfig` state with these fields. A `useEffect` in `AgentConnectionTabContent` watches `connectionConfig.connection_verified` and `connectionConfig.connection_verified_error` and syncs the local `verifyStatus` display state accordingly, so the UI immediately reflects any backend-driven reset (e.g., URL/headers changed → backend sets `connection_verified: false` → UI shows "Not verified").

**Connection check UI states**: The button and status pill share a row (`flex items-center justify-between`). The button uses the same yellow style and labeling as the header Verify button: `CheckCircleIcon` + "Verify" (unverified), `SpinnerIcon` + "Verifying..." (in progress), `CheckCircleIcon` + "Re-verify" (verified). The status pill area does not show a separate spinner — it only renders for terminal states (verified, failed, unverified).

**Tools Tab** (`ToolsTabContent.tsx`):

- **Desktop**: Three-column grid layout - tools list (2 columns), in-built tools panel (1 column)
- **Mobile/Tablet**: Single-column stacked layout with in-built tools first (`order-1 lg:order-2`), then search/tools
- **Desktop table** columns: Name (1fr), Type (120px), Description (2fr), Delete button (auto)
- **Mobile card** view: Name, type, description stacked with delete button
- Type shows "Webhook" or "Structured Output" (`text-xs` on mobile, `text-sm` on desktop)

**Default Agent Configuration** (when creating new agent):

```json
{
  "system_prompt": "You are a helpful assistant.",
  "stt": { "provider": "google" },
  "tts": { "provider": "google" },
  "llm": { "model": "google/gemini-3-flash-preview" },
  "settings": { "agent_speaks_first": false, "max_assistant_turns": 50 },
  "system_tools": { "end_call": true }
}
```

**Available Providers:**

- **STT**: deepgram, openai, cartesia, elevenlabs, whisper (groq), google, sarvam, smallest
- **TTS**: cartesia, openai, orpheus (groq), google, elevenlabs, sarvam, smallest
- **LLM**: Fetched dynamically from the OpenRouter API (`https://openrouter.ai/api/v1/models`) via the `useOpenRouterModels` hook. Models are grouped by provider and cached in-memory for 10 minutes. All model IDs use OpenRouter's `provider/model-name` format (e.g., `openai/gpt-5.2-chat`).

**Provider Language Support** (defined in `src/components/agent-tabs/constants/providers.ts`):

> `providers.ts` contains STT/TTS provider definitions and language arrays only. LLM models are fetched at runtime from the OpenRouter API via `useOpenRouterModels` hook (`src/hooks/useOpenRouterModels.ts`). The types `LLMModel` and `LLMProvider` are still defined in `providers.ts` and used throughout the app.

STT and TTS providers have typed definitions with the following fields:

```typescript
type STTProvider = {
  label: string; // Provider name (e.g., "Deepgram")
  value: string; // API identifier (e.g., "deepgram")
  model: string; // Model name (e.g., "nova-3")
  website: string; // Provider website URL (e.g., "https://deepgram.com")
  supportedLanguages?: string[];
  modelOverrides?: Record<string, string>; // Language-specific model overrides
};

type TTSProvider = {
  label: string; // Provider name (e.g., "Cartesia")
  value: string; // API identifier (e.g., "cartesia")
  model: string; // Model name (e.g., "sonic-3")
  voiceId: string; // Voice identifier (e.g., "Riya")
  website: string; // Provider website URL (e.g., "https://cartesia.ai")
  supportedLanguages?: string[];
  modelOverrides?: Record<string, string>; // Language-specific model overrides
};
```

**STT Providers Table:**
| Label | Model | Website |
|-------|-------|---------|
| Deepgram | nova-3 | https://deepgram.com |
| OpenAI | gpt-4o-transcribe | https://openai.com |
| Cartesia | ink | https://cartesia.ai |
| ElevenLabs | scribe-v2 | https://elevenlabs.io |
| Groq | whisper-large-v3-turbo | https://groq.com |
| Google | chirp-3 | https://cloud.google.com/speech-to-text |
| Sarvam | saarika-v2.5 | https://sarvam.ai |
| Smallest | pulse | https://smallest.ai |

**TTS Providers Table:**
| Label | Model | Voice ID | Website |
|-------|-------|----------|---------|
| Cartesia | sonic-3 | Riya | https://cartesia.ai |
| OpenAI | gpt-4o-mini-tts | coral | https://openai.com |
| Groq | orpheus | troy | https://groq.com |
| Google | chirp_3 | Charon | https://cloud.google.com/text-to-speech |
| ElevenLabs | eleven_multilingual_v2 | Krishna | https://elevenlabs.io |
| Sarvam | bulbul:v3-beta | aditya | https://sarvam.ai |
| Smallest | lightning | aditi | https://smallest.ai |

**Provider Website Links in UI:**

Provider website links (external link icons) are shown only on the new evaluation pages (`/stt/new` and `/tts/new`) where providers are selected, not on the list pages. The `getProviderWebsite()` helper function retrieves the website URL from the provider definitions.

**STT Language Arrays** (`*STTSupportedLanguages`):

- `cartesiaSTTSupportedLanguages`: 99 languages - STT only (TTS has separate list)
- `deepgramSTTSupportedLanguages`: 44 languages - STT only provider
- `elevenlabsSTTSupportedLanguages`: 94 languages - STT only (TTS has separate list)
- `googleSTTSupportedLanguages`: 71 languages - STT only (TTS has separate list)
- `openaiSTTSupportedLanguages`: 57 languages - used for both STT and TTS, also used by whisper/groq STT
- `sarvamSTTSupportedLanguages`: 11 Indic languages - used for both STT and TTS
- `smallestAiSTTSupportedLanguages`: 32 languages - used for both STT and TTS

**TTS Language Arrays** (`*TTSSupportedLanguages`):

- `cartesiaTTSSupportedLanguages`: 41 languages
- `elevenlabsTTSSupportedLanguages`: 29 languages
- `googleTTSSupportedLanguages`: 47 languages
- `groqTTSSupportedLanguages`: 1 language (English only) - used by orpheus/groq TTS

**Tests Tab Features:**

- **Two-column layout**: When the tab shows the main tests UI (not the **complete** empty state below), the layout is tests table on the left, Past runs panel (560px at `xl`) on the right — `flex flex-col lg:flex-row`.
- **Empty states (`TestsTabContent`)**:
  - **Complete empty** (no attached tests, past runs finished loading with **zero** runs): single full-width card — icon, "No tests attached", short description, **primary** **Add test** (`renderAddTestControl("primary")`) — **no** Past runs panel.
  - **No tests but history or loading** (`agentTests.length === 0` and (`pastRunsLoading` **or** `pastRuns.length > 0`)): two-column shell — left: a single empty-state **card** (icon + copy) with **primary** **Add test** centered **below** the description text (`renderAddTestControl("primary")`); there is **no** duplicate Add control in a row above the card; right: shared **`pastRunsPanel`** (past runs stay visible after tests are removed or while runs are still loading).
  - **Has tests**: header with Add / Run all / Compare (when applicable), search, table or cards, plus **`pastRunsPanel`** on the right.
- **Tests table**: Shows attached tests with name, type (Tool Call/Next Reply), run button, delete button
  - **Desktop grid columns**: `grid-cols-[40px_minmax(0,1fr)_120px_auto_auto]` — Checkbox (40px), Name (fills remaining space, horizontally scrollable via `overflow-x-auto whitespace-nowrap` when text overflows), Type (fixed 120px), Run button (auto), Delete button (auto)
  - **Individual run button**: Play button on each test row runs only that specific test (not all tests)
- **Past runs panel**: Has "Past runs" heading with `bg-muted/30` background, showing history of test runs (no column headers):
  - **Row content**: Name/count, Run Type pill, Time, Result badges
  - **Row layout (`TestsTabContent`)**: From `sm` breakpoint up, each row is a 4-column CSS grid with **fixed-width tracks** for Type, Time, and Status so those columns stay aligned when the first column (name) varies in length: `sm:grid-cols-[minmax(0,1fr)_5.75rem_5rem_9.25rem]` and **`xl:grid-cols-[minmax(0,1fr)_6.25rem_5.75rem_11.5rem]`** (fixed columns are slightly tighter than the maximum pill/time text needs so **`minmax(0, 1fr)` on column 1 gets more space** for long test names). **`sm:items-start`** (top-align so multi-line names don’t vertically center the other columns), **`sm:justify-items-stretch`**. Gaps: **`sm:gap-2`**, **`xl:gap-3`** (tighter gaps help the name column on the `lg:w-[400px]` past-runs panel). **Column 1 markup**: outer **`flex items-start justify-between gap-2 sm:block min-w-0`**; display name in a **`span`** with **`block min-w-0 break-words`** (wraps long test names and aggregate labels like `N tests` instead of the old **`truncate`** ellipsis). The Type pill is **`hidden sm:flex`** with **`sm:justify-center`** in its cell so "Test" / "Benchmark" stay centered in the fixed type column. Time uses **`text-right tabular-nums`** (no per-cell `w-24` — width comes from the grid track). The result column is a flex row with **`sm:flex-nowrap`** and **`whitespace-nowrap` on each status pill**. Below `sm`, the row stacks with `flex flex-col`. **Gotcha**: Do not use **`auto`** for grid columns 2–4 — that made Type/Time stagger between rows. Do not add a **narrow `w-32` / `sm:w-32`** on the badges flex wrapper (forces pill wrapping); the grid column supplies width. **`break-words`** breaks at word boundaries; unbroken long strings (e.g. no spaces) may still need **`break-all`** if that ever shows up in display names.
  - **Name display logic** (via `getTestRunDisplayName` helper):
    - Single-test runs: Shows `results[0].name` (in-progress) or `results[0].test_case.name` (completed)
    - Multi-test runs: Shows "N tests" (e.g., "2 tests")
    - Benchmarks: Shows "N models" (e.g., "3 models")
  - **Run Type**: "Test" (blue pill) or "Benchmark" (purple pill) based on `type` field
  - **Time**: Short relative time format (e.g., "now", "5 min ago", "7h ago", "2d ago", "3w ago", "2m ago", "1y ago")
  - **Result**: "Running" (yellow, with spinner) for pending/queued/in_progress; **"Error"** (red) for `status === "failed"` (entire run errored); "N Success" and/or "M Fail" badges for completed `llm-unit-test`; "Complete" for completed `llm-benchmark`
- **Clickable rows**: Clicking a past run row opens the appropriate results dialog:
  - `llm-unit-test` → Opens `TestRunnerDialog` in view mode with `taskId`, `tests` (from `results`), and `initialRunStatus`
  - `llm-benchmark` → Opens `BenchmarkResultsDialog` in view mode (with `taskId` prop)
  - For in-progress runs, dialogs show intermediate results as they arrive from the API
- **Real-time updates with coordinated polling**:
  1. A new entry is immediately added to the top of the past runs table with "pending" status
  2. Optimistic `results` array is created from `testsToRun` with test names for immediate display
  3. **Coordinated polling system** prevents duplicate polling:
     - `TestsTabContent` uses a `useEffect` that polls all pending runs every 3 seconds
     - When a run's dialog is open, that run is excluded from parent polling
     - **Uses refs** (`viewingTestResultsRef`, `viewingBenchmarkResultsRef`, `selectedPastRunRef`) to track current viewing state inside polling callbacks, avoiding stale closure issues
     - `TestRunnerDialog` polls its own task and notifies parent via `onStatusUpdate` callback
     - When dialog closes, parent resumes polling for that run if still pending
  4. The "Running" badge with spinner is shown until the run completes
  5. Clicking on an in-progress run opens the dialog with the correct `taskId` for real-time polling
- **Actions**: Add test (button in tests table header), Run all tests (header action button, limit fetched from backend per user — sends empty body so backend runs all linked tests), Run single test (row button — sends `test_uuids: [uuid]`), Compare models (benchmark — sends only `models`, no `test_uuids`), Remove selected (bulk — checkbox selection with "Remove selected (N)" button, calls `DELETE /agent-tests` per test sequentially)
- **Run all tests limit**: Dynamic per-user limit fetched from `GET /user-limits/me/max-rows-per-eval` (default 20). Shows limit toast via `showLimitToast()` if exceeded
- **Connection agent verification (header-level)**: When a connection agent is unverified, a yellow "Verify" button (`bg-yellow-500 text-black`) appears beside the Save button in the `AgentDetail` page header — visible on all tabs **except** the Connection tab (which has its own inline "Verify" / "Re-verify" button in the same yellow style). The header button is hidden via `headerState.activeTab !== "connection"`. Clicking "Verify" opens the `VerifyRequestPreviewDialog` modal where the user can edit sample messages before sending. On confirm, uses the shared `useVerifyConnection` hook (calls `verify.verifySavedAgent(agentUuid, messages)`). On success, updates `connectionConfig.connection_verified` via functional setState and closes the dialog. On failure, the dialog stays open showing error details inline with a "Retry" button. On the Tests tab, "Run all tests" and "Compare models" buttons are disabled (`opacity-50 cursor-not-allowed`) with a hover tooltip ("Verify agent connection first") using Tailwind named groups (`group/runall`, `group/compare`) when the connection is unverified. Additionally, the "Compare models" button has a second disable condition: when `supports_benchmark` is off in the connection config, it is disabled even if the connection is verified, with a distinct tooltip ("You have turned off benchmarking models in connection settings — turn it on to enable this"). The unverified tooltip takes priority if both conditions are true. The `supportsBenchmark` prop is passed from `AgentDetail.tsx` → `TestsTabContent` and used to derive `isBenchmarkDisabled` (`agentType === "connection" && supportsBenchmark !== true`). **Important**: All verification is enforced *before* `TestRunnerDialog` opens — the dialog itself has no verification logic or props. It always runs tests immediately on open.
- **API**: Fetches runs from `GET /agent-tests/agent/{uuid}/runs`
- **Run types**: `llm-unit-test` (has passed/failed counts) and `llm-benchmark` (results in model_results)

### 2. Tools Management (`/tools`)

**What you can do:**

- **Create custom tools** for LLM function calling via two options:
  - **"Add webhook tool"** - Opens AddToolDialog with webhook-specific header and description
  - **"Add structured output tool"** - Opens AddToolDialog with structured output-specific header and description
- **Define tool parameters** with full JSON Schema support:
  - Primitive types: string, number, boolean, integer
  - Complex types: object (with nested properties), array (with item types)
  - Required/optional flags
  - Descriptions for each parameter
- **Edit existing tools** - Click a tool row to open AddToolDialog in edit mode (reads `config.type` to determine webhook vs structured output, defaults to structured output if not present)
- **Delete tools**
- **Search tools** by name or description

**Tools Table Columns:**

- **Name** (200px fixed) - Tool name with horizontal scroll for overflow
- **Type** (150px fixed) - Plain text showing "Webhook" or "Structured Output" (`text-sm text-muted-foreground`) - matches tests page styling pattern
- **Description** (1fr flexible) - Tool description, truncated with ellipsis
- **Delete button** (auto) - Trash icon to delete tool

**Add Tool UI:**

The page displays two buttons below the header:

```tsx
<div className="flex gap-4">
  <button
    onClick={() => openAddToolDialog("webhook")}
    className="h-10 px-4 rounded-xl ..."
  >
    Add webhook tool
  </button>
  <button
    onClick={() => openAddToolDialog("structured_output")}
    className="h-10 px-4 rounded-xl ..."
  >
    Add structured output tool
  </button>
</div>
```

These buttons use standard `h-10 px-4` sizing (same height as other action buttons) with `rounded-xl` for border radius.

**AddToolDialog Component** (`src/components/AddToolDialog.tsx`):

A reusable sidebar dialog for creating and editing tools. Contains all form logic internally:

- **Responsive Design**: Full-width sidebar on mobile (`w-full`), 40% width on desktop (`md:w-[40%] md:min-w-[500px]`). No left border on mobile (`md:border-l`). All padding, spacing, and button sizes are responsive. See "Comprehensive Dialog & Sidebar Responsive Patterns" section for complete patterns.

- **Props**:

  - `isOpen: boolean` - Controls dialog visibility
  - `onClose: () => void` - Callback when dialog closes
  - `toolType: "structured_output" | "webhook"` - Determines header title, description text, and which fields/sections are shown
  - `editingToolUuid: string | null` - UUID of tool being edited (null for new)
  - `backendAccessToken: string | undefined` - Auth token for API calls
  - `onToolsUpdated: (tools: ToolData[]) => void` - Callback with updated tools list after create/update

- **Tool Type Configuration** (`TOOL_TYPE_CONFIG`):

  - `structured_output` type: Shows "Add/Edit structured output tool" header with description about producing data in defined formats
  - `webhook` type: Shows "Add/Edit webhook tool" header with description about calling external APIs/services

- **Common fields** (both tool types): Name, Description (inside Configuration section)

- **Structured Output Tool** (`toolType === "structured_output"`):

  - **Parameters section**: Uses `ParameterCard` component for defining output schema with full JSON Schema support
  - **Default parameter**: New structured output tools automatically start with one empty parameter (required, string type)
  - **Minimum parameter requirement**: Delete button is hidden when only one parameter exists (enforced via `hideDelete` prop)

- **Webhook Tool** (`toolType === "webhook"`):

  - **Configuration section** contains:
    - **Method**: Dropdown for HTTP method (GET, POST, PUT, PATCH, DELETE) - default: POST
    - **URL**: Text input for webhook endpoint (required, validated as valid HTTP/HTTPS URL)
    - **Response timeout**: Range slider (1-120 seconds, default: 20) with hover tooltip showing current value
  - **Headers section**: Add custom HTTP headers with Name and Value fields (vertically stacked in each card). Both fields are required when a header is added - shows red asterisk in labels and red border on validation failure. Delete button uses red styling (`text-red-500 bg-red-500/10`) matching ParameterCard
  - **Query parameters section**: Uses the same `ParameterCard` component as structured output Parameters section - identical fields and behavior (data type, name, required, description, nested object/array support)
  - **Body parameters section** (only for POST, PUT, PATCH methods):
    - Outer container (`bg-muted/50`) with section header and description
    - Inner container (`bg-background`) holding:
      - Description textarea (required - validated with red border on empty, red asterisk in label)
      - Properties section using `NestedContainer` component (theme-aware `bg-muted` styling):
        - "Properties" label above the nested container
        - `ParameterCard` components for each property inside the container
        - Centered "Add property" button at the bottom inside the container

- **Section ordering for webhook tools**: Configuration → Headers → Query parameters → Body parameters (when applicable)

- **Section styling**: All section containers (Configuration, Parameters, Headers, Query parameters, Body parameters) use `bg-muted/50` background to visually distinguish them from the outer dialog background and inner form fields

- **Internal state**:

  - Common: toolName, toolDescription, validationAttempted, isCreating, createError, isLoadingTool
  - Parameters: `parameters` array (for structured output), `queryParameters` array (for webhook - same `Parameter` type)
  - Webhook: webhookMethod, webhookUrl, responseTimeout, showTimeoutTooltip, webhookHeaders array (simplified: id, name, value only)
  - Body: `bodyDescription` string, `bodyParameters` array (same `Parameter` type)

- **Parameter handlers** (all use the same helper functions but operate on different state):

  - Query: `handleQueryUpdateAtPath`, `handleQueryRemoveAtPath`, `handleQueryAddPropertyAtPath`, `handleQuerySetItemsAtPath`, `addQueryParameter`
  - Body: `handleBodyUpdateAtPath`, `handleBodyRemoveAtPath`, `handleBodyAddPropertyAtPath`, `handleBodySetItemsAtPath`, `addBodyParameter`

- **Scroll behavior**: When adding a new query parameter via `addQueryParameter`, scrolls to the newly added parameter (using `scrollIntoView` with `block: "center"`) instead of scrolling to the bottom of the dialog. This is important because body parameters may exist below query parameters, and we want to keep focus on the section being edited. Uses `queryParamRefs` (a Map of param IDs to DOM elements) and `newlyAddedQueryParamId` state to track and scroll to the new element.

- **URL Validation** (`isValidUrl` helper):

  - Uses JavaScript's `URL` constructor to validate format
  - Requires `http:` or `https:` protocol
  - Hostname must contain a `.` (domain.tld) or be `localhost`
  - Shows contextual error messages: "URL is required" (empty) or "Please enter a valid URL" (invalid format)

- **Features**:

  - Loads existing tool data when `editingToolUuid` is provided (including webhook config, headers, query parameters, body parameters if present)
  - **Validation by tool type**:
    - **Structured output tools**: Validates `parameters` array via `hasInvalidParameters` helper
    - **Webhook tools**: Validates URL, headers (via `hasInvalidHeaders`), `queryParameters`, and for POST/PUT/PATCH: `bodyDescription` and `bodyParameters`
  - All string values are trimmed before submission (name, description, URL, header names/values)
  - Creates/updates tools via API with config structure:
    ```javascript
    config: {
      type: "webhook" | "structured_output",  // Tool type stored in config
      parameters: [...],           // Structured output parameters
      webhook: {                   // Only for webhook tools
        method, url, timeout, headers, queryParameters,
        body: { description, parameters }  // Only for POST/PUT/PATCH
      }
    }
    ```
  - Query and body parameters use `buildParametersConfig()` for API - same format as structured output parameters
  - Resets form state when dialog opens/closes
  - Sidebar slides in from right (40% width, min 500px)

- **Tool type persistence**:
  - Tool type is stored in `config.type` ("webhook" or "structured_output")
  - When editing, parent component reads `config.type` to determine which mode to open
  - If `config.type` is not present (legacy tools), defaults to "structured_output"

### 3. Speech-to-Text Evaluation (`/stt`)

**Page Structure:**

- `/stt` - List page showing all STT evaluation jobs
- `/stt/new` - Create a new STT evaluation
- `/stt/[uuid]` - View evaluation details and results

**List Page (`/stt`):**

- **Responsive layout with separate desktop and mobile views**
- **Desktop**: Sortable table (sorted by created date)
  - **Columns**: Providers (as pills), Dataset (link to dataset page), Language, Status, Samples count, Created At
  - **Click any row** to view evaluation details
- **Dataset validation**: After fetching jobs, all unique `dataset_id` values are verified via `getDataset()` API calls. If a dataset no longer exists (deleted), its `dataset_id` and `dataset_name` are nulled out so no broken link is shown
- **Mobile**: Enhanced card-based layout with visual hierarchy
  - **Card design patterns**:
    - Rounded-xl corners with border and hover effects (shadow + border color transition)
    - Increased padding (p-5) for better touch targets
    - Prominent provider pills with semibold text, subtle borders, and background
    - Status badge given dedicated section for visibility
    - Icon-based details with circular icon containers (w-8 h-8 rounded-lg bg-muted/50)
    - Clear label/value distinction: labels are small + muted, values are medium weight
    - Visual separation with subtle border-top before created date
    - Smooth transitions (duration-200) on all interactive elements
  - **Icons used**: Language (translation icon), Samples (document icon), Created (clock icon)
- **Provider pills**: Display provider labels (e.g., "Cartesia", "ElevenLabs", "Google") without external link icons on list page
- **Sort functionality**: Toggle button to sort by created date (ascending/descending)
- **"New evaluation" button** in header - navigates to create page

**Create Page (`/stt/new`):**

- **Upload audio files** (.wav format, max 60 seconds each) with reference transcriptions
- **Add multiple test samples** for batch evaluation (max rows per evaluation fetched from backend via `useMaxRowsPerEval` hook)
- **ZIP upload option**: Upload a ZIP file containing an `audios/` folder with .wav files and a `data.csv` mapping audio files to transcriptions
- **Download sample ZIP**: Button to download a template ZIP with correct structure
- **Select providers to evaluate** (compare multiple simultaneously)
- **Choose language** (11 Indic languages: English, Hindi, Kannada, Bengali, Malayalam, Marathi, Odia, Punjabi, Tamil, Telugu, Gujarati) - provider list filters based on language support
- **Run evaluation** - creates evaluation and redirects to detail page
- **Row limit**: Dynamic per-user limit fetched from `GET /user-limits/me/max-rows-per-eval` (default 20). Shows limit toast via `showLimitToast()` if exceeded
- **Audio duration limit**: Each audio file must be under 60 seconds. Validated client-side using Web Audio API before upload. Shows limit toast via `showLimitToast()` if exceeded
- **Audio file size limit**: Each audio file must be under 5 MB. Validated client-side before upload. Shows limit toast via `showLimitToast()` if exceeded

**Detail Page (`/stt/[uuid]`):**

- **Polls for results** while status is `queued` or `in_progress`
- **Shows intermediate results** as each provider completes (doesn't wait for all to finish)
- **Default tab behavior**:
  - When evaluation is already complete on page load: defaults to "Leaderboard"
  - When evaluation is in progress: defaults to "Outputs" to show results as they arrive
  - Automatically switches to "Leaderboard" when evaluation completes during polling
- **Language pill**: Displayed first (left side) with `bg-muted rounded-full capitalize` styling (e.g., "punjabi" → "Punjabi")
- **Dataset link pill**: If evaluation has a valid `dataset_id`, shows a clickable pill linking to `/datasets/{dataset_id}` with a database icon. On initial fetch, `dataset_id` is verified via `getDataset()` — if the dataset no longer exists, `dataset_id` and `dataset_name` are nulled out (this check runs only on initial fetch, not during polling)
- **Status badge**: Shows "Running" or "Queued" badge with spinner to the right of language pill when evaluation is not done
- **Tabs only appear when at least one provider result exists**:
  - **Leaderboard**: Only visible when status is `done` (needs all providers to compare)
  - **Outputs**: Responsive layout — side-by-side panels on desktop, stacked on mobile
  - **About**: Desktop table / mobile card layout for metric descriptions
- **Outputs tab layout** (responsive):
  - **Desktop** (`md+`): Two-panel side-by-side layout (`flex-row`) with fixed height `h-[calc(100vh-220px)]`
    - **Left panel** (`md:w-64`): Vertical provider list with status icons
    - **Right panel** (`p-6`): Selected provider's overall metrics + results table (ground truth vs predictions)
  - **Mobile** (below `md`): Stacked layout (`flex-col`) with no fixed height
    - **Provider list**: Horizontal scrollable row (`overflow-x-auto`, `flex` with `min-w-max`) with `whitespace-nowrap` items, separated by bottom border
    - **Details panel** (`p-4`): Full-width below providers
    - **Results**: Card layout instead of table — each row is a bordered card showing Ground Truth, Prediction, WER, and one labeled section per attached evaluator (Pass/Fail badge or numeric value + reasoning text). The legacy `String Similarity` field and single-evaluator reasoning block only render when `evaluatorColumns` is omitted.
  - **Provider status icons** (both layouts):
    - Yellow pulsing dot when `success === null` (in progress)
    - Green checkmark when `success === true` AND no empty predictions
    - Red X when `success === false` OR any row has empty prediction
  - First provider is selected by default
  - **Auto-scroll**: Clicking a provider with empty predictions scrolls to the first empty row
- **About tab responsive**: Desktop shows 4-column table (Metric, Description, Preference, Range). Mobile shows stacked cards with metric name, description, and Preference/Range side by side
- **Metrics**: WER + one column per attached evaluator (Pass/Fail for binary, numeric value for rating). The authenticated `/stt/[uuid]` page no longer renders `String Similarity`; the public STT page still does (legacy single-column path).

### 4. Text-to-Speech Evaluation (`/tts`)

**Page Structure:**

- `/tts` - List page showing all TTS evaluation jobs
- `/tts/new` - Create a new TTS evaluation
- `/tts/[uuid]` - View evaluation details and results

**List Page (`/tts`):**

- **Responsive layout with separate desktop and mobile views**
- **Desktop**: Sortable table (sorted by created date)
  - **Columns**: Providers (as pills), Dataset (link to dataset page), Language, Status, Samples count, Created At
  - **Click any row** to view evaluation details
- **Dataset validation**: After fetching jobs, all unique `dataset_id` values are verified via `getDataset()` API calls (same pattern as STT list page). If a dataset no longer exists, its `dataset_id` and `dataset_name` are nulled out
- **Mobile**: Enhanced card-based layout with visual hierarchy (same pattern as STT)
  - **Card design patterns**:
    - Rounded-xl corners with border and hover effects (shadow + border color transition)
    - Increased padding (p-5) for better touch targets
    - Prominent provider pills with semibold text, subtle borders, and background
    - Status badge given dedicated section for visibility
    - Icon-based details with circular icon containers (w-8 h-8 rounded-lg bg-muted/50)
    - Clear label/value distinction: labels are small + muted, values are medium weight
    - Visual separation with subtle border-top before created date
    - Smooth transitions (duration-200) on all interactive elements
  - **Icons used**: Dataset (database icon, conditional), Language (translation icon), Samples (document icon), Created (clock icon)
- **Provider pills**: Display provider labels (e.g., "Cartesia", "ElevenLabs", "Google") without external link icons on list page
- **Sort functionality**: Toggle button to sort by created date (ascending/descending)
- **"New evaluation" button** in header - navigates to create page

**Create Page (`/tts/new`):**

- **Add text samples** to convert to speech (manual input OR CSV upload, max rows fetched from backend per user)
- **CSV upload option**: Upload a CSV file with a `text` column to bulk import samples
- **Download sample CSV**: Button to download a template CSV with correct format
- **Select language** (11 Indic languages: English, Hindi, Kannada, Bengali, Malayalam, Marathi, Odia, Punjabi, Tamil, Telugu, Gujarati) - provider list filters based on language support
- **Select providers to compare**
- **Run evaluation** - creates evaluation and redirects to detail page
- **Row limit**: Dynamic per-user limit fetched from `GET /user-limits/me/max-rows-per-eval` (default 20). Shows limit toast via `showLimitToast()` if exceeded
- **Text length limit**: Each text input must be 200 characters or less. Validated on CSV upload and before evaluation. Shows limit toast via `showLimitToast()` if exceeded

**Detail Page (`/tts/[uuid]`):**

- **Polls for results** while status is `queued` or `in_progress`
- **Default tab behavior**:
  - When evaluation is already complete on page load: defaults to "Leaderboard"
  - When evaluation is in progress: defaults to "Outputs" to show results as they arrive
  - Automatically switches to "Leaderboard" when evaluation completes during polling
- **Intermediate results**: Shows Outputs and About tabs during `in_progress` status
- **Language pill**: Displayed first (left side) with `bg-muted rounded-full capitalize` styling
- **Dataset link pill**: If evaluation has a valid `dataset_id`, shows a clickable pill linking to `/datasets/{dataset_id}` with a database icon. On initial fetch, `dataset_id` is verified via `getDataset()` — if the dataset no longer exists, `dataset_id` and `dataset_name` are nulled out (this check runs only on initial fetch, not during polling)
- **Status badge**: Shows "Running" or "Queued" badge with spinner to the right of language/dataset pills when evaluation is not done
- **Tabs**:
  - **Leaderboard**: Only visible when status is `done` - comparative table and charts
  - **Outputs**: Responsive layout — side-by-side panels on desktop, stacked on mobile (same pattern as STT)
  - **About**: Desktop table / mobile card layout for metric descriptions
- **Outputs tab layout** (responsive, same structure as STT):
  - **Desktop** (`md+`): Two-panel side-by-side layout with vertical provider sidebar (`md:w-64`) + details panel with results table and audio players
  - **Mobile** (below `md`): Stacked — horizontal scrollable provider row on top, then card-based results below. Each card shows Text, Audio player (full-width), and one labeled section per attached evaluator (Pass/Fail badge or numeric value + reasoning text). The legacy single-evaluator reasoning block only renders when `evaluatorColumns` is omitted.
  - **Provider status icons**: Yellow dot (in progress), green checkmark (success), red X (failed)
  - First provider is selected by default
  - Clicking a provider shows its details
- **Metrics**: One column / metric / chart per attached evaluator (Pass/Fail badge for binary, numeric value for rating), plus TTFB latency. See "Dynamic per-evaluator columns" under the STT/TTS Detail Page section below for how the columns are derived.
- **Intermediate results structure**: `results` array contains `id`, `text`, `audio_path`; per-evaluator score / reasoning columns (in the new format `result[name]` + `result[`${name}_reasoning`]`; legacy `_info` jobs use `result[`${name}_score`]` + `result[`${name}_reasoning`]`; truly legacy single-evaluator jobs use `result.llm_judge_score` + `result.llm_judge_reasoning`) are only present once each row is complete

### 5. LLM Tests (`/tests`)

**Page heading:** "LLM Evaluation"

**What you can do:**

- **Create test cases** with:
  - Name and description
  - Test type: "response" (check agent response) or "tool_call" (check tool invocation)
  - Test configuration
  - **Tool invocation defaults**: When selecting a webhook tool, "Accept any parameter values" is enabled by default (since webhook responses are unpredictable). Structured output tools default to requiring specific parameter values
  - **Tool-invocation expectation (suppressed)**: the per-tool "Should have been called / Should not have been called" segmented control is intentionally **hidden for now** — the dialog renders only a full-width selected-state pill (`bg-foreground text-background`, no click handler) labelled `Should have been called` so the layout stays visually consistent without exposing the should-not-call branch. The `SelectedToolConfig.expectation: "should-call" | "should-not-call"` type and the hydration logic that reads `is_called === false` from existing tests are both kept intact, but the **submit path always emits the should-call payload** (`{ tool, arguments, accept_any_arguments }`) for every selected tool — the legacy should-not-call branch in the `tool_calls` builder is gone, so any pre-existing should-not-call test that the user re-saves through this dialog migrates to should-call. Treat this as a temporary product call: don't reintroduce the toggle UI and don't add new code paths that emit `is_called: false`. The bulk-upload helper / README follow the same convention (see "Bulk upload tests via CSV" → CSV format for Tool Call).
  - **Conversation history** (before evaluation):
    - Message types: `agent`, `user`, `tool_call`, `tool_response`
    - Add messages via dropdown menu on last message
    - **Webhook tool calls**: When a webhook tool is selected:
      - Parameters grouped into separate containers: Query, Body (headers are NOT shown in conversation history UI)
      - Each group is in its own container (`bg-background border border-border rounded-xl p-3`) with uppercase section title
      - Input fields within containers use `bg-muted` for contrast
      - A "Tool Response" message is automatically added after the tool call
      - Tool response requires valid JSON input (textarea with real-time validation)
      - User cannot proceed without valid JSON in all tool responses
      - Deleting a webhook tool call also removes its linked tool response
    - **Structured output tool calls**: Show flat parameter list as inputs (no tool response added - only the tool call is sent to backend)
    - **Tool call param validation**: All tool call parameters in conversation history must have non-empty values. On save attempt, empty params are highlighted with `border-red-500` with error message "This field cannot be empty". Validation only triggers on `localValidationAttempted` (set when clicking Save), not the parent's `validationAttempted` prop - this prevents showing errors when a new tool call message is first added
    - **Backend history format**: Webhook tool calls include both the tool call AND linked tool response in history. Structured output tool calls only include the tool call (no fake response injected)
  - **Evaluators (next-reply tab only)**: Each next-reply test attaches one or more LLM evaluators that score the agent's reply. Evaluators are stored server-side in the `test_evaluators` join table (separate from the test's `config`) and are returned hydrated on `GET /tests` / `GET /tests/{uuid}` as a top-level `evaluators[]` array (joined evaluator + pinned-version row from `get_evaluators_for_test()`).
    - **Default correctness evaluator** (slug **`default-llm-next-reply`**, name "Correctness", `evaluator_type: "llm"`, `output_type: "binary"`) is the canonical "did the reply meet the user-defined criteria?" judge. It declares a single variable `criteria` and its system prompt templates `{{criteria}}` into the rubric. The frontend resolves it by **slug**, not by name or UUID — both are tenant-mutable.
    - **Auto-attach on new tests**: when the AddTestDialog opens for a brand-new next-reply test, the dialog auto-attaches the `default-llm-next-reply` evaluator with empty variable values (gated until both `GET /evaluators?include_defaults=true` and any pending edit-GET have settled, via the `attachedEvaluatorsInitialized` one-shot flag).
    - **Legacy test migration (edit flow)**: tests created before this contract have `evaluators: []` in the GET response and only a free-text `config.evaluation.criteria` string. The dialog detects this case and auto-attaches the correctness evaluator with `variable_values.criteria` pre-filled from the legacy string, transparently migrating on the next save. There is no offline backfill — old tests "upgrade" the first time their author re-saves them.
    - **Attached-evaluator card layout**: the card header shows the evaluator's `name` as a heading with the evaluator's one-line `description` (`text-xs text-muted-foreground line-clamp-2`) directly underneath, plus a remove (X) button on the right. `description` is threaded through `AttachedEvaluatorInit.description` (from the hydrated GET row), `LLMEvaluatorOption.description` (from the `/evaluators` list response when adding via picker), and the auto-attach paths (correctness on new tests, correctness on legacy edits) so it never needs a re-fetch. If an evaluator has zero variables (e.g. Helpfulness, Safety), the card is **just** name + description — no placeholder text, no empty stub.
    - **Per-evaluator variable inputs**: each attached evaluator's `live_version.variables: [{ name, description?, default? }]` (sourced from the GET list endpoint or the hydrated test row) renders one textarea per variable inside the evaluator's card. **Uniform layout — no special cases per evaluator/variable**: above each textarea, a small monospace `{{name}}` hint (`text-xs text-muted-foreground font-mono`) identifies the variable; the textarea's placeholder is the variable's `description` (falling back to `default`, then to `Enter value for {{name}}` if both are empty). The variable's description is the canonical user-facing copy — author it on the evaluator (see "Variables — overall rules" §2/§3 for the create / new-version edit flows), not in dialog code. There is no longer a "Describe expected next reply" label or any `criteria`-specific override; if the correctness evaluator's description ever needs to change, ship a new version of the evaluator with the new variable description rather than special-casing it in `AddTestDialog`.
    - **Add more evaluators**: an "Add evaluator" button in the Evaluators section header opens a dropdown listing the remaining LLM evaluators (filtered to `evaluator_type === "llm"`, with currently-attached ones excluded), grouped under **Default** (`owner_user_id === null`) and **My evaluators** (`owner_user_id !== null`). The dropdown has a sticky `autoFocus` search input at the top (case-insensitive substring match against both `name` AND `description`); the empty-state copy switches to `No evaluators match "<query>".` when the search returns nothing, vs `No more LLM evaluators to add.` when there's nothing to show even before searching. The search box is reset (cleared back to `""`) by the `closeEvaluatorPicker()` helper whenever the picker is dismissed — clicking the toggle, clicking the backdrop, or selecting an evaluator. Selecting a row appends it with values seeded from each variable's `default` (falls back to empty string) and propagates the option's `description` onto the attached card.
    - **Validation gating** (next-reply only): Save is rejected if (a) zero evaluators are attached or (b) any variable on any attached evaluator has an empty trimmed value. Empty cells are highlighted with `border-red-500` after `localValidationAttempted` is set. Tool-invocation tests skip this entirely.
    - **Write contract** (`POST /tests` and `PUT /tests/{uuid}`): the dialog emits `evaluators: [{ evaluator_uuid, variable_values? }]` to the parent's `onSubmit(config, evaluators)` callback (`AddTestDialog`'s new `EvaluatorRefPayload[]` type). `variable_values` is omitted when the evaluator has no variables. The parent (`src/app/tests/page.tsx`) only attaches `evaluators` to the request body when `config.evaluation.type === "response"` — for tool-invocation tests `evaluators` is **omitted entirely** so the backend's `set_test_evaluators` is not invoked and any existing pivot rows are left untouched. Including `evaluators` on a PUT replaces the whole pivot set (soft-delete + insert) — there is no patch-style "add one" call.
    - **`config.evaluation.criteria` is no longer sent** on next-reply POST/PUT bodies: the user-supplied criteria now lives in `variable_values.criteria` on the attached correctness evaluator. The legacy field is still readable for edit-flow migration (see above) and for older run snapshots that captured it. Don't reintroduce the legacy `criteria` writer in the dialog.
    - **Result-side counterpart — `judge_results`**: the run result endpoints (`GET /agent-tests/run/{task_id}`, `GET /agent-tests/benchmark/{task_id}`, and the corresponding `/public/test-run/{token}` / `/public/benchmark/{token}` shares) now expose a `judge_results: JudgeResult[] | null` field on each `TestCaseResult`, with one entry per evaluator referenced by the test (see `JudgeResult` shape under "Test Results Components"). For benchmarks the same array hangs off `model_results[i].test_results[j].judge_results` and the same evaluator UUIDs appear across all models in the run (the snapshot is per-test, not per-model). Tool-call tests always have `judge_results: null` — the verdict is a deterministic tool-call diff and the legacy single-`reasoning` UI continues to render for them. New response rows render evaluator cards (name/link + `description` when present + binary/rating verdict + variable values + reasoning); the top-level inline `reasoning` is suppressed in this case to avoid duplication. The `description` is snapshotted at job creation time and may be null for older jobs; render it with normal wrapping (`whitespace-normal break-words`), not `line-clamp-*`, and do not fetch live evaluator metadata just to fill it.
    - **Legacy run-result rendering**: response rows that pre-date `judge_results` but still carry `test_case.evaluation.criteria` are rendered as a synthetic default-correctness evaluator card, not as a standalone "Criteria" block. `TestRunnerDialog` and `BenchmarkResultsDialog` fetch `default-llm-next-reply` via `src/lib/defaultEvaluators.ts` (`GET /evaluators?include_defaults=true`, resolved by slug) and pass it to `TestRunOutputsPanel` / `BenchmarkOutputsPanel` as `legacyDefaultEvaluator`. The shared `EvaluationCriteriaPanel` / mobile `TestDetailView` then maps `criteria` to `variable_values.criteria` and uses the fetched evaluator `uuid`/`name`/`description` so authenticated dialogs can link to `/evaluators/{uuid}`. If the fetch fails or the evaluator is missing, the UI still shows the variable value under a generic non-linked evaluator label. Public share pages must keep evaluator links disabled and use public-safe endpoints only.
    - **Benchmark leaderboard label**: benchmark `leaderboard_summary.pass_rate` uses the same labels as `main`: table header and primary chart title **`Test pass rate (%)`** in both authenticated `BenchmarkResultsDialog` and `/public/benchmark/{token}`. Keep evaluator names/descriptions in the per-test output cards; do not use the default next-reply evaluator name as the leaderboard table/chart title.
    - **Benchmark `model_results[].evaluator_summary` (additive)**: optional per-model array when that model’s run folder finished with a Calibrate `metrics.json` that includes a **criteria** object (response judges only). Absent/`null` while the model is queued, running, or only partial; absent on jobs completed before the backend stored this field. Each element mirrors **one evaluator key** from `metrics.json.criteria`: `metric_key` (column key), `name` / `description` / `evaluator_uuid` / `type` (`binary` | `rating`). **Binary**: `passed`, `total`, `pass_rate` (0–100). **Rating**: `mean`, `min`, `max`, `count`, `scale_min`, `scale_max` — use mean vs scale for cross-model comparison (not a fake “%”). Top-level `passed` / `total_tests` / `failed`, `leaderboard_summary`, and per-test `test_results` / `judge_results` are unchanged. The frontend merges overall **`leaderboard_summary`** with per-evaluator columns via **`buildBenchmarkCombinedLeaderboardPayload`** (`src/lib/benchmarkEvaluatorSummary.ts`) and renders a single **`BenchmarkCombinedLeaderboard`** (`@/components/eval-details`): one **`LeaderboardTab`** table (Model, optional Passed/Total, **`Test pass rate (%)`**, then one column per evaluator) and one chart grid (**two charts per row** — overall first, then per-evaluator). Per-evaluator **header text and chart titles** are short labels only (**`name ?? metric_key`**); details in Shared Components ▸ **`BenchmarkCombinedLeaderboard`**. Missing `evaluator_summary` everywhere → only the overall columns/charts appear. Evaluator summaries without `leaderboard_summary` → evaluator-only columns/charts.
    - **Bulk upload (`POST /tests/bulk`)** uses the same `evaluators: [{ evaluator_uuid, variable_values? }]` shape per test as the single-test write. In `BulkUploadTestsModal`, **Next Reply** uploads no longer use an `evaluators` column in the CSV: the user picks evaluators up-front (`MultiSelectPicker` over `GET /evaluators?include_defaults=true`, LLM-only), and each row supplies `name`, `conversation_history`, plus **one column per declared variable** on those evaluators, with headers `EvalName/varName` (see `variableColumnName` in `BulkUploadTestsModal.tsx`). The parser builds `EvaluatorRefPayload[]` with `evaluator_uuid` from the committed selection and `variable_values` from those cells; evaluators with zero variables are attached without `variable_values`. The legacy free-text `criteria` field is not sent.
    - **Versions are pinned server-side**: the dialog never sends `evaluator_version_id`. The backend always pins `evaluators.live_version_id` at link time, so on the next GET the test surfaces the version that was live when the user clicked Save (this is what `system_prompt` / `variables` / `output_config` on each `evaluators[i]` row reflect — a snapshot, not "live today"). When previewing an attached evaluator's prompt, prefer the row's pinned fields over re-fetching `GET /evaluators/{uuid}`.
  - **Loading saved tests** (when `initialConfig` and/or `initialEvaluators` are provided):
    - Parses `history` array and converts to chatMessages format
    - **Waits for tools fetch to complete**: Uses a `toolsFetched` state flag that's set to `true` in the `finally` block of the tools API call. The useEffect depends on `initialConfig`, `toolsFetched`, and `availableTools` - it only processes when `toolsFetched` is true. This ensures the form populates even if no tools exist or the tools API fails
    - **Webhook tool call detection**: Looks up the tool by name in `availableTools` and checks `tool?.config?.type === "webhook"`. This is more reliable than checking for body/query argument keys (which could misclassify structured-output tools with params named "body" or "query")
    - **Webhook param extraction**: For webhook tools, extracts nested properties from body/query and assigns `group` property to each param so they display in the correct container (e.g., `{body: {task_type: "x"}}` → `{name: "task_type", value: "x", group: "body"}`). Headers are intentionally excluded from the UI
    - **Tool response parsing**: `role: "tool"` messages are included as `tool_response` type, linked to their corresponding tool call via `tool_call_id`
    - Non-webhook tools show params as flat list without group containers
    - **Param update matching**: `updateToolCallParam` matches by both `name` AND `group` to avoid updating params with the same name across different groups (e.g., "id" in both body and query)
    - **Evaluator hydration**: `src/app/tests/page.tsx`'s `openEditTest` reads the GET response's top-level `evaluators[]` (joined rows from `get_evaluators_for_test()`) and maps each row's `uuid` → `evaluator_uuid`, plus `name`, `description`, `slug`, `variables`, and `variable_values`, into the dialog's `initialEvaluators: AttachedEvaluatorInit[]` prop. `description` is also threaded through so the attached-evaluator card can show the one-line description below the evaluator name without a re-fetch. The dialog's initialization effect prefers `initialEvaluators` over the legacy-criteria fallback. An empty array (`evaluators: []`) is the legacy-test signal, not "the user removed all evaluators".
- **Bulk upload tests** via CSV:
  - Opens `BulkUploadTestsModal` from "Bulk upload" button beside "Add test"
  - **Step 1**: "Select the type of test" — "Next Reply" or "Tool Call" (segmented toggle buttons: `flex rounded-lg border border-border overflow-hidden w-fit`, active = `bg-foreground text-background`)
  - **Backing-list prefetch (silent, gates parsing)**: as soon as the user picks a test type, the modal fires the corresponding list fetch — `GET /evaluators?include_defaults=true` for "Next Reply" (filtered to `evaluator_type === "llm"`, stored as `{ uuid, name, slug, variables }` in `availableLLMEvaluators`) or `GET /tools` for "Tool Call" (stored in `availableTools`, combined with `INBUILT_TOOLS` to form the `knownToolNames` `Set`). Both are required for CSV validation, so parsing is **gated on the relevant `*Fetched` flag** and follows an identical "deferred parse" pattern: the fetch runs silently in the background (no visible "Loading…" indicator), a CSV dropped while it's still in flight is stashed on a single `pendingFile` slot by `handleFileChange`, and a deferred-parse `useEffect` watching `[pendingFile, evaluatorsFetched, toolsFetched, isResponseType]` re-invokes `handleFileChange(pendingFile)` exactly once when the right gate flips — `evaluatorsFetched` for response uploads, `toolsFetched` for tool-call uploads. The only state surfaced inline is a hard fetch failure (`evaluatorsFetchError` / `toolsFetchError` → red message under the format description), which blocks parsing until the user refreshes. `pendingFile` is reset on modal close, on every test-type toggle (so a stale Next-Reply drop never gets re-parsed in Tool-Call mode), on file-remove, and at the top of every `handleFileChange` call (so a fresh drop supersedes any stashed file). Each list is only fetched for the test type that needs it — response uploads never hit `/tools`, and tool-call uploads never hit `/evaluators`.
  - **What `availableLLMEvaluators` is for**: name lookup + variable-completeness check during CSV validation, and the plain-string-criteria fallback (resolved by `slug === "default-llm-next-reply"`, never by name).
  - **What `knownToolNames` is for**: parser-level validation that every `tool_calls[].tool` value matches a tool the tenant can actually run, plus the parsed-tests preview's known/unknown link rendering. The set is `availableTools.map(t => t.name) ∪ INBUILT_TOOLS.map(t => t.id)`, `useMemo`-stabilised so the preview doesn't recompute on every render.
  - **Step 2**: Upload CSV file (drag-and-drop or click-to-browse). Above the dropzone, a structured bulleted overview describes the expected CSV format and adapts to the selected test type — one bullet per column (`name` / `conversation_history` / `evaluators` for next-reply; `name` / `conversation_history` / `tool_calls` for tool-call), with column names rendered as inline `<code>` chips bumped to `text-foreground` so they stand out from the otherwise muted body copy. The `evaluators` and `tool_calls` bullets nest a sub-list to lay out their accepted forms / per-entry fields (next-reply: plain string vs JSON array; tool-call: `tool` / `arguments` / `accept_any_arguments`). The tool-call helper deliberately does **NOT** mention `is_called` even though the parser still accepts it — see "Tool-invocation expectation" under AddTestDialog for the wider product call to suppress the should-not-call assertion in user-facing surfaces; the bulk-upload README and in-modal helper follow the same convention. The detailed column documentation lives in the bundled `README.txt`, not in this in-modal helper. The next-reply helper inlines two `next/link` anchors styled via the shared `HELPER_LINK_CLASS` constant (`text-foreground` + subtle `decoration-foreground/30` underline that darkens on hover): "Evaluators" → `/evaluators`, and "Correctness" → `/evaluators/{correctnessEvaluatorUuid}` where the UUID is resolved from `availableLLMEvaluators` by slug `default-llm-next-reply`. Both links use `target="_blank" rel="noopener noreferrer"` so clicking them doesn't blow away the in-progress upload. The Correctness anchor **gracefully degrades** to a plain `text-foreground` span when the slug lookup returns nothing (fetch still in flight, or tenant has removed the default evaluator) — never render `/evaluators/undefined`. "Download sample CSV" button generates a ZIP file (via `jszip`) containing the sample CSV(s) and a `README.txt` with detailed column descriptions, value formats, JSON escaping rules, and examples. For **Next Reply**, the ZIP ships **two** CSVs side-by-side — `sample_next_reply_tests_basic.csv` (plain-string `evaluators` cell) and `sample_next_reply_tests_advanced.csv` (JSON-array `evaluators` cell, where evaluators with no declared variables are written as just `{"name":"..."}` — variables key omitted, not `"variables":{}` — to demonstrate the parser's tolerated-shape) — plus the README; for **Tool Call** the ZIP has the single sample + README.
  - **Collapsible format helper**: the helper bullet list above the dropzone auto-collapses as soon as a CSV parses successfully (`parsedTests.length > 0`) so the parsed-tests preview can own the screen. State lives on a `formatHelpOpen` boolean (default `true`) that a single `useEffect` driven by `parsedTests.length` flips on every transition: empty → expanded, non-empty → collapsed. When collapsed, a small disclosure button (chevron + `Show CSV format details` / `Hide CSV format details`) renders in place of the help body and toggles `formatHelpOpen` manually so the user can re-open the spec without clearing the upload. `formatHelpOpen` is also reset to `true` on modal close so each fresh open lands in the help-visible state.
  - **CSV format for Next Reply**: columns `name`, `conversation_history` (OpenAI chat format JSON array), `evaluators`. The `evaluators` cell accepts EITHER:
    - **A plain-text criteria string** — auto-mapped to a single attached evaluator: the LLM next-reply default (resolved by stable slug `default-llm-next-reply`) with `variable_values.criteria` set to the cell value. If that evaluator isn't present in the tenant's evaluators list, the row errors out with a hint to use the JSON-array form instead.
    - **A JSON array** of `{ "name": <evaluator name>, "variables"?: { <var>: <string>, ... } }` objects. Each `name` is matched against `availableLLMEvaluators` by exact name (names are unique in the user's visible namespace: their custom evaluators plus visible seeded defaults). For evaluators that declare variables in their pinned `live_version.variables`, every variable name must be present in the row's `variables` object with a non-empty string value; missing values, unknown extras, duplicate evaluator entries, and non-object cells all fail the row with a specific error message. Evaluators with zero variables can pass `"variables": {}` or omit the field.
    - The form is detected by the cell's first non-whitespace character: leading `[` ⇒ JSON-array path (strict parse), otherwise plain-string path. Criteria strings that genuinely start with `[` need to be expressed via the JSON-array form.
  - **CSV format for Tool Call**: columns `name`, `conversation_history` (OpenAI chat format JSON array), `tool_calls` (JSON array matching `TestConfig.evaluation.tool_calls` format — documented fields are `tool`, `arguments`, `accept_any_arguments`). The parser also accepts the legacy `is_called: false` flag so existing should-not-call rows keep round-tripping, but it is **not** documented in either the in-modal helper or the bundled `README.txt` — new tests should never set it (consistent with the AddTestDialog change that suppresses the should-not-call expectation in the UI).
  - **Validation**: Checks required columns, unique test names, valid JSON in `conversation_history` and `tool_calls` fields, and enforces a **max 500 tests per upload** limit. For Next Reply, also: (a) every evaluator name must exist in the tenant's evaluators list, (b) every variable declared by each evaluator must be filled with a non-empty string, and (c) **all rows must attach the same set of evaluators** (compared by sorted resolved UUIDs against the first successfully-parsed row — variable VALUES can vary per row, but the evaluator set cannot). For Tool Call, also: every concrete `tool` value referenced in any row's `tool_calls` array must be present in `knownToolNames` — rows referencing unknown tools fail with a per-row error (`Row N: tool(s) "X", "Y" not found in your Tools tab`), and the parse error is **prefixed with a single clear summary line** listing every distinct unknown tool collected across the entire CSV and instructing the user to add them under the Tools tab before uploading. Empty / missing `tool` values are intentionally not flagged here (left to the backend's payload validation) so we only complain about concretely-named tools that don't exist. Errors with row numbers are shown up to 5 at a time, with the rest summarized as `...and N more errors`. The summary preamble (when present) sits above the per-row list, separated by a blank line — both render together inside the same `parseError` red panel via `whitespace-pre-line`.
  - **Parsed-tests preview (table view)**: Once `parsedTests.length > 0`, the modal pivots from a compact upload UI to a wide preview-and-confirm UI. Three coordinated changes happen at this point:
    - **Animated width expansion**: the modal container's `max-w-xl` flips to `max-w-5xl` with `transition-[max-width] duration-300 ease-out`, so the dialog noticeably grows to accommodate the per-row table. The `mx-4` margin and `max-h-[85vh]` height cap stay put.
    - **Evaluators section** (response only): rendered as a **standalone borderless section** between the dropzone and the parsed-preview card — explicitly NOT nested inside the same `bg-muted/50 border` container as the "Found N tests" header and the per-row table. The intent is for it to read as upload-level metadata ("here's the set of evaluators every row attaches") rather than a striped header on the preview itself. Markup is `<div className="mt-4">` containing a section title `<h4 className="text-sm font-semibold text-foreground mb-2">Evaluators</h4>` (no trailing colon — it's a heading, not an inline label, so it doesn't fade into the layout the way a muted-text label would) followed by a `<div className="flex items-center gap-1.5 flex-wrap">` of pill chips below it. No internal divider/border between this section and the preview card. The set comes from `previewEvaluators` — a `useMemo` derived from `parsedTests[0].evaluators` hydrated against `availableLLMEvaluators` (we trust the parser invariant that all rows attach the same evaluators and don't re-check the rest). Each pill is a `next/link` chip → `/evaluators/{uuid}` (new tab) with a small external-link glyph; the whole section is gated on `parsedTests.length > 0 && isResponseType && previewEvaluators.length > 0` and hides entirely otherwise (e.g. tool-call uploads, or response uploads where evaluator hydration somehow returned empty).
    - **Per-test table** with sticky header, `overflow-x-auto`, and a `max-h-[420px]` vertical scroll cap (so a 500-row CSV doesn't blow out the dialog). Columns:
      - `#` / `Name` / `Conversation history` for both test types.
      - **Next-reply only** — one extra column **per evaluator that declares variables** (heading = evaluator name). Cells render the row's `variable_values` for that evaluator: if the evaluator declares a single variable (the default-correctness `criteria` case) the value is dumped directly with `line-clamp-4 whitespace-pre-wrap`; multi-variable evaluators show each value labelled with a tiny `text-[10px] font-mono text-muted-foreground` `varName` prefix. Evaluators with **zero** variables intentionally do not get a column — they're already represented by the pill row, so a column would just be a permanently-empty stripe.
      - **Tool-call only** — a single `Expected tool calls` column rendered by `renderToolCallsCell`. For each entry: the `tool` value is matched against `knownToolNames` (custom tool names ∪ inbuilt tool ids) and rendered as one of three states:
        - **known** → `next/link` to `/tools` (new tab) with `HELPER_LINK_CLASS`-styled monospace text.
        - **unknown** → red `bg-red-500/10 text-red-600` pill with a warning glyph and a `title` tooltip nudging the user to add the tool under Tools first. **Defensive guard only** — parser-level validation now rejects rows referencing unknown tools (see "Validation" above), so a fully-parsed test should never hit this branch in practice. The render path is kept so the preview is robust to any future loosening of parser validation.
        - **loading** → plain `font-mono` text (no link, no error styling). Also defensive-only now that parsing is gated on `toolsFetched`: the preview only renders for parsed tests, and parsed tests only exist after the fetch lands. Kept as a flicker-safe fallback in case `parsedTests` is ever populated by some other code path while `toolsFetched` is still false.
        - In addition: `accept_any_arguments: true` renders an italic `any arguments accepted`; otherwise the `arguments` object is laid out as inline `key="value"` monospace pairs. The preview still flags any legacy `is_called: false` row with an uppercase red `should NOT be called` badge so users can spot the deprecated assertion in pre-existing CSVs, but `is_called` is no longer documented in the helper or README and `AddTestDialog` no longer emits it. An empty `tool_calls: []` array renders as italic red `empty tool_calls array` — there is **no** "empty array means no tools should be called" assertion in the platform; the row would be a misconfigured test, so we surface it visibly in the preview rather than silently styling it as a valid assertion.
    - **Conversation-history rendering** is shared by both branches. `renderConversationHistory` parses the cell, then stacks each message as `[ROLE-BADGE] content`, where the badge is `text-[10px] uppercase tracking-wide` styled (user = blue tint, assistant/other = neutral) and the content uses `line-clamp-3` so long messages don't blow out the row. Defensive `try`/`catch` around the JSON parse keeps a row from crashing the whole table even though parser validation has already accepted it.
  - **Step 3** (optional): Checkbox "Assign tests to agents" → uses `MultiAgentPicker` component from `AgentPicker.tsx` for multi-select agent selection. Agent state lives inside `MultiAgentPicker` — when the modal closes, the component unmounts and state is naturally reset (no stale agent cache)
  - **API**: `POST /tests/bulk` with body `{ type, tests: [...], agent_uuids? }`. Response: `{ uuids, count, message, warnings }`. `warnings` is `null` on full success, or an array of strings when some agent linking failed (test creation itself is all-or-nothing)
  - **Warnings handling**: If the response contains `warnings`, the modal stays open showing a yellow warning banner listing each warning, with a "Done" button to dismiss. If no warnings, the modal auto-closes
  - **Bulk API structure differs from single-test API**: The `type` is top-level (applies to all tests in the batch), not per-test. Type values are `"response"` and `"tool_call"` (same as `POST /tests`). Each test is a flat object with `name`, `conversation_history`, and either `evaluators` (response) or `tool_calls` (tool_call) — not wrapped in the nested `config.evaluation` structure used by `POST /tests`. The per-test `evaluators` field is the same `[{ evaluator_uuid, variable_values? }]` shape as the single-test write contract — names from the CSV are resolved to UUIDs client-side before submit. The legacy per-test `criteria` field is no longer sent.
  - **Error handling**: Status-specific fallback messages for 400 (duplicate names/missing fields/batch > 500), 403 (agent not owned), 404 (agent not found). Backend's `detail` field (FastAPI standard) is preferred, then `message`, then fallback
  - **Bulk API is atomic for test creation**: If any test name conflicts (within batch or with existing tests), none are created. Agent linking is best-effort — tests are created first, then linking is attempted per-agent. Partial linking failures produce `warnings` in the response, not errors
  - Uses `papaparse` for robust CSV parsing (handles quoted fields containing JSON with commas/quotes)
  - **Type imports**: `BulkUploadTestsModal` re-uses the `EvaluatorRefPayload` type from `@/components/AddTestDialog` for its resolved per-test evaluators payload, the `AvailableTool` type from `@/components/ToolPicker` for the tool-call preview's tool list, and `INBUILT_TOOLS` from `@/constants/inbuilt-tools` to seed `knownToolNames` with platform-built-ins. Keep all three in sync with their canonical definitions rather than duplicating shapes.
  - **Data refresh**: The tests page uses a shared `fetchTests` function (wrapped in `useCallback`) for both initial load and post-upload refresh, with consistent 401 handling and loading/error states
- **View all tests**
- **Edit/delete tests** (single or bulk — checkbox selection with "Delete selected (N)" button)
- **Link tests to agents** for benchmarking

### 6. Personas Management (`/personas`)

**What you can do:**

- **Create user personas** that define WHO the simulated user is:
  - **Label**: Persona identifier
  - **Characteristics**: Detailed personality description (age, background, speaking style, temperament)
  - **Gender**: Male or Female (affects voice synthesis)
  - **Language**: English, Hindi, or Kannada
  - **Interruption Sensitivity**: None, Low, Medium, or High (simulates real users interrupting agents mid-sentence)
    - Low: 25% probability of interruption
    - Medium: 50% probability of interruption
    - High: 80% probability of interruption
    - UI includes helper text and tooltips showing probability percentages
- **Edit existing personas**
- **Delete personas**
- **Search personas**

**UI Patterns:**

- **List view**: Desktop table with mobile card view (see "List Page Structure" section)
  - **Desktop table**: Shows Name, Description, Gender (capitalize), Language (capitalize), Interruption Sensitivity, and Delete button
  - **Mobile cards**: Pill-based layout with visual hierarchy
    - Name displayed as heading (text-sm font-medium)
    - Description shown below name (text-xs text-muted-foreground line-clamp-2)
    - Attributes displayed as pills (px-2.5 py-1 bg-muted rounded-md):
      - **Gender in Hindi**: Male → पुरुष (purush), Female → महिला (mahila) - uses `getGenderInHindi()` helper function
      - **Language**: Capitalized (English, Hindi, Kannada)
      - **Interruption Sensitivity**: None, Low, Medium, or High
    - Pills use consistent spacing (gap-2 flex-wrap)
    - Delete button at bottom (full-width, red styling)
- **Add/Edit sidebar**: Full-page responsive slide-in panel with form fields (full-width on mobile, 40% width on desktop). See "Comprehensive Dialog & Sidebar Responsive Patterns" section.

### 7. Scenarios Management (`/scenarios`)

**What you can do:**

- **Create test scenarios** that define WHAT the simulated user does:
  - **Label**: Scenario identifier
  - **Description**: Task or conversation goal (e.g., "Call to inquire about crop insurance")
- **Edit existing scenarios**
- **Delete scenarios**
- **Search scenarios**

**UI Patterns:**

- **List view**: Desktop table with mobile card view (see "List Page Structure" section)
- **Add/Edit sidebar**: Full-page responsive slide-in panel with form fields (full-width on mobile, 40% width on desktop). See "Comprehensive Dialog & Sidebar Responsive Patterns" section.

### 8. Evaluators Management (`/evaluators`)

**What you can do:**

- **Define evaluation criteria** for simulations and tests
- **Configure pass/fail thresholds**
- **Set up custom evaluators**
- **Duplicate existing evaluators** with a new name

**Evaluator type (use case)** — every evaluator is scoped to one of four use cases via the `evaluator_type` field on the create payload and the GET response:

| `evaluator_type` | Label          | Purpose                                                                        | Derived `data_type` |
| ---------------- | -------------- | ------------------------------------------------------------------------------ | ------------------- |
| `tts`            | Text to Speech | Evaluate the quality of generated audio (naturalness, pronunciation, clarity). | `audio`             |
| `stt`            | Speech to Text | Evaluate the accuracy of transcribed text from an audio input.                 | `audio`             |
| `llm`            | LLM Response   | Given a conversation history, evaluate the agent's next response.              | `text`              |
| `simulation`     | Simulation     | Evaluate an entire conversation history.                                       | `text`              |

The backend uses `stt` (not `speech_to_text`) as the wire value for the speech-to-text use case — keep the `EvaluatorType` union in `src/components/EvaluatorPills.tsx` aligned with this, and never reintroduce `speech_to_text` as a frontend identifier.

`data_type` (`"text" | "audio"`) is derived from `evaluator_type` on POST and is no longer chosen directly in the UI. The `EVALUATOR_TYPE_TO_DATA_TYPE` map in `src/app/evaluators/page.tsx` is the single source of truth for this backend persistence mapping.

**Judge model modality** is a *separate* concern from `data_type`. Only `tts` requires an audio-capable judge model — every other use case (including `stt`) reads text, so `LLMSelectorModal` is opened with `requiredInputModality="audio"` only when `evaluator_type === "tts"`, and `"text"` otherwise. On the detail page (new-version flow), legacy evaluators without `evaluator_type` fall back to `data_type === "audio" ? "audio" : "text"` so older audio evaluators keep their original judge-model filter.

**Kind is hard-coded to `"single"`** for now. The create flow does not render a Single / Side-by-side picker, and `createEvaluator` always sends `kind: "single"` in the POST body. The `KindPill` component is still exported from `EvaluatorPills.tsx` but is not rendered on the list page or the detail header. If side-by-side support is brought back, restore the picker UI, the `newEvaluatorKind` state, and the validation check, and re-add `<KindPill />` next to `<EvaluatorTypePill />` / `<OutputTypePill />`.

**Create flow** — clicking "Add evaluator" opens a `UseCasePickerDialog` *before* the create sidebar:

1. **Use case picker** (centered modal): four cards (Text to Speech / Speech to Text / LLM response / Simulation) with one-line descriptions explaining each. User picks one, clicks "Continue".
2. **Default-prompt prefill** — on use-case select, the page calls `GET /evaluators/default-prompt?purpose=<llm|stt|tts|simulation>` and seeds the form: `evaluatorName` from `data.name` (`null` for `simulation` ⇒ left blank for the user to type), `newEvaluatorSystemPrompt` from `data.system_prompt`, `newEvaluatorOutputType` from `data.output_type`, `newEvaluatorJudgeModel` looked up via `findModelInProviders(llmProviders, data.judge_model)` (with a `{ id, name: id }` stub fallback that a follow-up `useEffect` upgrades once OpenRouter providers finish loading — same pattern as `AgentDetail.tsx`), and `newEvaluatorScale` from `data.output_config.scale` *only when* `output_type === "rating"` (binary keeps the placeholder 1/2/3 rows so the form still looks sensible if the user later flips the toggle). Per-row `color` from the API response is intentionally dropped — the form doesn't track it. Prefill is best-effort: a non-401 failure logs and leaves the fields blank rather than blocking the create flow. **Re-selecting the same purpose** via the "Change" link is a no-op — prefill (and the `setNewEvaluatorJudgeModel(null)` clear) only fires when `prevType !== value` so the user's edits survive a round-trip through the picker.
3. **Create sidebar opens** with the chosen use case shown as a read-only "Use case" row at the top with a "Change" link that re-opens the picker (closes the sidebar while picker is open). The audio/text data-type toggle is no longer rendered.
4. The rest of the sidebar (name, description, output type, judge model, judge prompt, rating scale) is unchanged. There is no kind picker — `kind` is hard-coded to `"single"` in the POST body.

**Evaluator API contract** — the frontend should use the `/evaluators` API family for evaluator CRUD flows. The list/refetch endpoint is `GET /evaluators?include_defaults=true`; the detail page loads with `GET /evaluators/{evaluator_uuid}`; updates use `PUT /evaluators/{evaluator_uuid}`; deletion uses `DELETE /evaluators/{evaluator_uuid}`; duplication uses `POST /evaluators/{evaluator_uuid}/duplicate`. Do not call the legacy `/metrics` endpoints from evaluator UI — those routes are no longer part of the active evaluator contract and will 404.

**Name uniqueness** — evaluator names are unique within the user's visible evaluator namespace. `POST /evaluators`, `PUT /evaluators/{evaluator_uuid}`, and `POST /evaluators/{evaluator_uuid}/duplicate` reject empty names and reject names that collide with either one of the user's custom evaluators or a seeded default evaluator visible to that user. Different users may still use the same custom evaluator name. Duplicate-name conflicts return HTTP `409` with `{ "detail": "Evaluator name already exists" }`; UI flows should parse that response and show the detail as an inline name-field error, not as a generic footer/dialog error. The frontend still keeps local duplicate checks for quick feedback, but backend 409 handling is authoritative because the visible namespace can change after the list was fetched.

List rows navigate to `/evaluators/{uuid}`; editing is handled on the detail page, not by clicking a list row into an edit drawer. The list page owns create, duplicate, delete, filtering, and navigation only — don't add edit state, edit-loading spinners, or PUT handlers back to `src/app/evaluators/page.tsx`. The detail-page Edit dialog skips the picker *and* default-prompt prefill — `evaluator_type` is fixed once created, existing field values come from `GET /evaluators/{uuid}`, and save sends `PUT /evaluators/{uuid}`. `EVALUATOR_TYPE_OPTIONS` (in `src/app/evaluators/page.tsx`) is the canonical option list for the create picker; copy lives in `EVALUATOR_TYPE_LABELS` and `EVALUATOR_TYPE_TOOLTIPS` exported from `src/components/EvaluatorPills.tsx`.

**Evaluator component boundaries** — large evaluator UI blocks live under `src/components/evaluators/` instead of being defined inline inside the app routes:

- `CreateEvaluatorSidebar` owns the create-only slide-in form UI. The list page keeps the fetch/save state and passes values/setters down as props.
- `UseCasePickerDialog` owns the pre-create use-case modal and accepts the page's `EVALUATOR_TYPE_OPTIONS` array.
- `VersionCard` owns rendering of each evaluator version on `/evaluators/[uuid]`, including variables, rating output config, default-evaluator chrome hiding, and "Set as current".
- `RatingScaleEditor` is shared by the create sidebar and the detail-page new-version dialog. Use this instead of duplicating rating-scale row JSX; callers provide the row array, `onChange`, validation flag, and copy for the helper/description placeholder.

Keep route files focused on data loading, API calls, URL state, and orchestration. When adding evaluator UI, prefer extending these components before adding another large local JSX block to `src/app/evaluators/page.tsx` or `src/app/evaluators/[uuid]/page.tsx`.

**Pills** (`src/components/EvaluatorPills.tsx`) — list rows and the detail header show small status pills near the evaluator name. Components:

- `EvaluatorTypePill` — shows `Text to Speech` / `Speech to Text` / `LLM Response` / `Simulation` with a hover `Tooltip` containing the `EVALUATOR_TYPE_TOOLTIPS` blurb. Use this whenever `evaluator.evaluator_type` is present.
- `DataTypePill` — legacy `audio`/`text` pill. Kept as a fallback for evaluators returned without `evaluator_type` (e.g. older defaults). Pattern: `evaluator.evaluator_type ? <EvaluatorTypePill /> : <DataTypePill />`.
- `KindPill` — `Single` / `Side by side` (with tooltip). **Currently unused on the list and detail pages** while kind is hard-coded to `"single"`; left in place for future use.
- `OutputTypePill` — `Binary` / `Rating` (with tooltip).
- `DefaultPill` — solid `Default` badge for system-owned evaluators (no `owner_user_id`).

**Detail header layout** (`src/app/evaluators/[uuid]/page.tsx`) — the name and `DefaultPill` sit on the first row; `EvaluatorTypePill` and `OutputTypePill` sit on a separate row below the name (`mt-2`), with the description rendered below that. The list page (`src/app/evaluators/page.tsx`) renders the same pills inline next to each evaluator's name.

**Default vs user-owned** — `isDefault` is computed as `!evaluator.owner_user_id` (the only check; backend returns `owner_user_id: null` for system-seeded evaluators). On the detail page this hides the Edit button, the New version button, the Prompts tab strip, and the per-version chrome (`v#` pill, `Current` pill, "Set as current" button, timestamp), and removes the delete button on the list row. The list page partitions evaluators into the **Default** tab (`!e.owner_user_id`) and **My evaluators** tab (`!!e.owner_user_id`). The list fetch passes `?include_defaults=true` to `/evaluators`; without that query param the backend would return only the caller's evaluators and the **Default** tab would be empty.

**Active tab persistence** — the selected tab is mirrored to the URL as `?tab=default|mine` so it survives page reloads and back-navigation from `/evaluators/[uuid]`. The pattern: `activeTab` is lazily initialized from `useSearchParams().get("tab")` (falling back to `"default"`); a `useEffect` on `searchParams` re-syncs state if the URL changes (browser back/forward); a `changeActiveTab(tab)` helper wraps `setActiveTab` + `router.replace("/evaluators?tab=" + tab)`. Use `changeActiveTab` everywhere the tab needs to flip — never call the raw `setActiveTab` (this includes the post-create switch to "mine" after a successful POST). `replace` (not `push`) is intentional: each tab toggle should not produce a new history entry, but pressing a list row's `router.push("/evaluators/[uuid]")` will snapshot the current `?tab=...` URL into the history stack so browser-back lands on the same tab.

**Evaluator detail page — URL tabs `prompts` / `agreement`** (`src/app/evaluators/[uuid]/page.tsx`) — **Not** the list-page `?tab=default|mine` above. The evaluator UUID route mirrors **`?tab=prompts|agreement`** (default **`prompts`**). The **Agreement** tab fetches **`GET /annotation-agreement/evaluator/{uuid}/trend`** (`fetchTrend`) and renders **`AgreementTrendTab`**. **Loading vs empty** for that chart: **`trendFetchCompleted`** + merged **`trendLoading`** prop — see **Human Labelling → Loading vs empty — Human labelling & evaluator agreement UI**.

**Version timeline** — the `versions` `useMemo` in `[uuid]/page.tsx` builds the list from `evaluator.versions` (preferred) or falls back to `[evaluator.live_version]`, then sorts by `version_number` descending so the most recent is index 0. **For default evaluators it slices to `[0]` so only the most recent version of the prompt is ever rendered**, regardless of how many versions the backend returns. User-owned evaluators get the full sorted timeline. If you add new per-version actions (e.g. compare, rollback) keep this slicing rule in mind — it must remain applied for defaults. Existing non-live versions can still be promoted with `POST /evaluators/{uuid}/versions/live` and `{ version_uuid }`; the `VersionCard` action is intentionally styled as a prominent emerald secondary button labeled "Mark as current" so it stands out in the timeline without competing with the black primary "New version" button.

**Variables — overall rules**

Variables are **only supported for `evaluator_type === "llm"`**. The variable **name set** is pinned by the live version's variables — names cannot be added, renamed, or removed across versions of the same evaluator (the frontend enforces this with an amber-callout gate against newly-typed placeholders). **`description` and `default`, however, can be updated on every new version** — they're forwarded with each `POST /evaluators/{uuid}/versions` body. **`description` is required** in the create and new-version flows (validation gates in §2 and §3 below); on the wire it remains an optional field on the backend `VariableSpec` shape, so the POST body still defensively drops it when blank, but the frontend gate prevents that branch from being reached for LLM evaluators in normal flow. The frontend mirrors this contract in four places:

1. **Detail-page version display** (`src/app/evaluators/[uuid]/page.tsx`) — when `v.variables?.length` is truthy, a blue-tinted info callout (`bg-blue-500/5` / `border-blue-500/20`) sits between the `Variables` label and the variable list. It reads "When this evaluator is added to an LLM test, you will be able to fill in the value of each variable for that test." This is purely informational; it does not render for evaluators with no variables (e.g. `pronunciation`, `Helpfulness`). Don't move this callout into the variable rows themselves — it's a one-time hint, not per-variable copy.

2. **Create flow** (`src/components/evaluators/CreateEvaluatorSidebar.tsx`, orchestrated by `src/app/evaluators/page.tsx`) — `extractVariableNames(prompt)` from `src/lib/evaluatorVariables.ts` (regex `/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g`, dedup, first-seen order) is invoked by the page on every render of `newEvaluatorSystemPrompt` and passed into the sidebar. The result powers a **Variables** section that lives **inside the Judge prompt block, between the helper description and the `<textarea>`** — so the user can see the detected variables in the same viewport as the textarea they're editing, without scrolling. Placement order: label → helper description → Variables section (when populated) → textarea. There is intentionally no auto-scroll behaviour on this section; rendering it above the textarea means it's always already in view as the user types.
   - **Header description (LLM only)**: directly under the "Judge prompt" label a muted helper line explains the feature: *"You can build reusable prompts by adding `{{ variable }}` placeholders so the same evaluator can be applied to multiple LLM tests while customising the value for each test."* The `{{ variable }}` token is wrapped in a `<code>` with `bg-muted` so it reads as syntax. The line only renders when `variablesSupported` — TTS / STT / Simulation already get the amber warning below the textarea if they try to use placeholders, and don't need this hint.
   - **LLM** (`variablesSupported === true`): the section renders only when at least one placeholder is detected. Each detected variable is rendered as a row containing a `{{name}}` monospace badge **and an editable single-line `<input>` next to it** for the variable's `description` — keyed in `newEvaluatorVariableDescriptions: Record<string, string>` so the description is preserved if the user momentarily removes the placeholder from the prompt and re-adds it. Layout is `flex-col` on mobile / `md:flex-row` on `md+` so the badge sits above the input on small screens. **Variable description is required**: `createEvaluator` rejects submission if any detected variable has an empty trimmed description (`variableDescriptionsValid` check inside the validation gate — only enforced when `newEvaluatorType === "llm"`). After `validationAttempted` is set, each input with an empty trimmed value gets `border-red-500` (same pattern as the Name / Judge prompt / rating-scale label fields). The placeholder copy reads "Short description shown when filling this variable in tests" (no "(optional)" suffix — that copy was removed when descriptions became required). The detected names + descriptions are persisted on POST as `version.variables: [{ name, description? }, ...]` — the POST body still drops `description` from each entry when its trimmed value is empty (preserved as a defensive fallback; in normal flow the validation gate prevents this branch from being reached for LLM evaluators). `default` is not user-editable in this flow.
   - **Other types** (TTS / STT / Simulation): no Variables section and no description line. If the user nonetheless types `{{...}}`, an **amber callout** (`bg-amber-500/10` / `border-amber-500/30`) is rendered **below** the textarea (outside the prompt block, sibling of the spacer) stating variables aren't supported for that evaluator type and that the placeholders will be treated as literal text.

3. **New version dialog** (`src/app/evaluators/[uuid]/page.tsx`) — uses the same shared `extractVariableNames` helper from `src/lib/evaluatorVariables.ts` as the create flow. Keep the recognized placeholder shape centralized there; don't add page-local copies. The dialog is wide (`max-w-5xl`) and uses a two-column layout on `lg+`: the Judge prompt textarea owns the left column (`lg:h-[560px]`), while Summary of change, live-version checkbox, Judge model, rating scale, and variable-description controls live in the right column. On smaller screens it stacks into one column. The editable Variables section's **name set** is sourced from `evaluator.live_version?.variables` (NOT from the prompt being edited — names are pinned), but its **descriptions** are user-editable via `newVersionVariableDescriptions: Record<string, string>` (seeded in `openNewVersionDialog` from each existing variable's `description`). The dialog also includes a default-checked `newVersionMarkLive` checkbox labeled "Mark the new version as the live version"; its value is sent directly on the create request as `make_live`. This checkbox card uses the same emerald color family as the timeline `VersionCard` "Mark as current" button (`emerald` border/background/text/accent) because both controls promote a version to live. When `make_live` is true, the backend promotes the newly-created version in the same `POST /evaluators/{uuid}/versions` call. Do **not** add a second frontend `/versions/live` request after creating a version — reserve that endpoint for promoting an already-existing version from the timeline. Each variable row uses the same `{{name}}` badge + description `<input>` layout as the create flow. The blue callout reads: *"Variable names cannot be added, renamed, or removed on a new version, but you can update each variable's description below — that's the hint shown to users when they fill the variable in an LLM test."* Three branches inside an inline IIFE:
   - LLM with existing variables → render the editable list + callout. If the user types any placeholder *not* in the existing set, an amber warning lists the unknown placeholders and explains they'll be treated as literal text (the new POST does NOT extend the variable set even if the user types `{{newvar}}`).
   - LLM with no existing variables but the user typed `{{...}}` → amber warning explaining variables can only be defined at create time.
   - Non-LLM with `{{...}}` in the prompt → amber warning explaining variables aren't supported for that evaluator type.

   **Variable description is required** on the new-version flow too: `createNewVersion` rejects submission if any existing variable has an empty trimmed description (`variableDescriptionsValid` check inside the validation gate, only enforced for LLM evaluators). The check uses `newVersionVariableDescriptions[v.name] ?? v.description ?? ""` so a description that already exists on the live version satisfies the gate even if the user hasn't touched the input — only inputs the user has explicitly cleared (or live versions that somehow shipped with empty descriptions) will block submission. After `newVersionValidated` is set, each input with an empty trimmed value gets `border-red-500`. The placeholder copy is "Short description shown when filling this variable in tests" (no "(optional)" suffix).

The new-version POST body **does** include `variables` for LLM evaluators with at least one existing variable: `body.variables = evaluator.live_version.variables.map(v => ({ name: v.name, description?: edited-or-existing, default?: v.default-if-non-empty }))`. It also includes `make_live: newVersionMarkLive` for every output type. The variable **name** comes verbatim from the live version (never from the prompt the user is editing in the dialog), `description` is taken from `newVersionVariableDescriptions[v.name] ?? v.description ?? ""` (dropped from the entry when its trimmed value is empty — preserved as a defensive fallback now that the validation gate above requires non-empty descriptions in normal flow), and the existing `default` is forwarded unchanged when non-empty. For non-LLM evaluators, or LLM evaluators with zero existing variables, the `variables` field is omitted entirely. Don't widen this to "modify variable names" — the amber-callout gate is the design intent and the backend will treat any newly-introduced placeholder as literal text.

4. **Test-attachment input rendering** (`src/components/AddTestDialog.tsx`) — the consumer side of the callout copy. When an LLM evaluator is attached to a next-reply test the dialog renders one textarea per `live_version.variables[]` entry inside the evaluator's card; the user-supplied values are sent on `POST` / `PUT /tests` as `evaluators[i].variable_values: Record<string, string>` (sibling to `evaluator_uuid`). Save is gated on every variable having a non-empty trimmed value. **Every variable input renders identically** — a small monospace `{{name}}` hint above a textarea whose placeholder is the variable's `description` (no per-evaluator or per-variable special cases). This means the `description` field on the evaluator is the user-facing copy at attachment time — author it in the create / new-version flows above (sections 2 and 3) so it reads as a clear instruction (e.g. correctness's `criteria.description` is "Natural-language description of what the reply should satisfy."). See section 5 "Evaluators (next-reply tab only)" for the full lifecycle (auto-attach, legacy migration, picker, validation).

**List page filters** (`src/app/evaluators/page.tsx`) — the search input is followed by two filter dropdowns on the same row (`md:flex-row`, stacked on mobile). The `<select>` elements use `appearance-none` to suppress the native browser arrow and render a custom chevron SVG positioned at `right-3` with `pointer-events-none` so clicks still hit the underlying select; the select itself has `pl-3 pr-9` so option text never overlaps the chevron. Re-use this pattern (relative wrapper + appearance-none select + absolutely positioned chevron) anywhere you add a styled select on this page so the visual stays consistent.

- **Purpose** (`purposeFilter` state, `EvaluatorType | "all"`): options driven by `EVALUATOR_TYPE_OPTIONS` and labeled with `EVALUATOR_TYPE_LABELS`, so adding a new use case automatically extends this dropdown. Filters on `evaluator.evaluator_type === purposeFilter`.
- **Output** (`outputTypeFilter` state, `"binary" | "rating" | "all"`): filters on `evaluator.output_type`.

Filters compose AND-style with the search query and the Default / My evaluators tab inside the single `filteredEvaluators` reducer. Empty-state copy switches to "No evaluators match your filters" when *any* of `searchQuery` / `purposeFilter !== "all"` / `outputTypeFilter !== "all"` is active, and the inline "Add evaluator" CTA in the empty state only shows when none of those are active (and the user is on the **My evaluators** tab).

**Dark-mode surface elevation** — Tailwind v4 sets `--background: #0f0f0f`, `--muted: #1a1a1a`, and `--accent: #1f1f1f` in dark mode (see `src/app/globals.css`). On the evaluators list, sidebar, picker, duplicate, and new-version dialog forms we use a three-step elevation hierarchy via `dark:` overrides only — light mode is unchanged because white-on-white surfaces are already separated by `border-border`:

| Layer                                                                             | Light bg                  | Dark bg (override) | Used for                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------- | ------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page / sidebar / dialog                                                           | `bg-background` (#fff)    | `#0f0f0f`          | Sidebar shell, dialog shell, page background                                                                                                                                                                                                                                                                                                                      |
| Inputs, buttons, selects, list-row cards, sub-cards directly in a sidebar/dialog  | `bg-background`           | `dark:bg-muted` (#1a1a1a) | List row cards (`/evaluators`), search & filter dropdowns on the list page, every editable field in the Add evaluator sidebar (Name, Description, Use-case readonly box, Judge model selector, Judge prompt, Variables list rows), every editable field in the detail-page Edit and New version dialogs, the dashed "Add row" rating-scale button, the use-case picker option cards, every secondary Cancel button, the duplicate dialog name input |
| Inputs nested **inside** a `dark:bg-muted` row card (rating-scale row inputs)     | `bg-background`           | `dark:bg-accent` (#1f1f1f) | Value/label inputs and description textarea inside each rating scale row in both create flow and new-version dialog                                                                                                                                                                                                                                               |
| Hover for layer-2 secondary controls (Cancel buttons, Judge model selector, etc.) | `hover:bg-muted/50`       | `dark:hover:bg-accent` | Required because plain `hover:bg-muted/<n>` overlays go *darker* than a `bg-muted` rest state in dark mode (translucent muted on `#0f0f0f` ≈ `#13–15`); explicit `dark:hover:bg-accent` keeps hover one step *lighter* than rest                                                                                                                                |
| Active state in the use-case picker                                               | `bg-muted/40`             | `dark:bg-accent` + `border-foreground` | The selected purpose card uses `border-foreground` plus an accent fill so the active card is visibly lighter than the inactive `dark:bg-muted` siblings; without `dark:bg-accent`, a translucent `bg-muted/40` on a `dark:bg-muted` rest sibling would read *darker* than the unselected siblings                                                                  |

The same convention applies to the rating-scale **row container** itself: `bg-muted/10 dark:bg-muted` (the `bg-muted/10` light tint preserves the existing card look in light mode; `dark:bg-muted` gives it the layer-2 fill in dark mode so the row reads as a nested card).

When adding a new control on `/evaluators` or `/evaluators/[uuid]`, follow the same pattern:

- Default for any input/button/select/sub-card sitting directly in the sidebar or dialog body: add `dark:bg-muted` to the existing `bg-background`.
- If the new control hovers, also add `dark:hover:bg-accent` so hover stays brighter than rest.
- If the control sits *inside* another `dark:bg-muted` card (e.g. a rating-scale row), use `dark:bg-accent` instead of `dark:bg-muted` so the nested layer is one step elevated again.
- Don't add light-mode overrides — every change here is `dark:` only. Pre-existing light-mode styling is correct and breaking it is a regression.

Don't introduce new pill colors here; reuse the per-type Tailwind classes already defined in `EvaluatorPills.tsx`.

**UI Patterns:**

- **List view**: Desktop table with mobile card view showing duplicate and delete actions (see "List Page Structure" section)
- **Add evaluator sidebar**: Full-page responsive slide-in panel with create-only fields (full-width on mobile, max-width on desktop). Implemented as `CreateEvaluatorSidebar`; see "Comprehensive Dialog & Sidebar Responsive Patterns" section.
- **Use case picker dialog**: Centered modal (`max-w-2xl`) with a 2-column card grid on `sm:` and above, single column on mobile. Implemented as `UseCasePickerDialog` and opened from the "Add evaluator" buttons (header + empty-state) on the list page. Uses `useHideFloatingButton(true)` to hide the floating "Talk to Us" button while open.
- **Duplicate dialog**: Centered modal dialog for entering new evaluator name (fully responsive). See "Comprehensive Dialog & Sidebar Responsive Patterns" section.

### 9. Simulations (`/simulations`)

**What you can do:**

- **Create simulations** with a name
- **View all simulations** in a searchable, sortable list
- **Delete simulations**
- **Rename simulations** — click the simulation name in the header to open an edit name dialog (same pattern as agent name editing: modal with text input, Enter/Escape keyboard support, 50 char max, `PUT /simulations/{uuid}` with `{ name }`)
- **Right-click or Cmd/Ctrl+click** any simulation row to open in a new browser tab (native browser support)

**Simulation Detail Page** (`/simulations/[uuid]`) has 2 tabs:

| Tab        | Purpose                                                                                                                                                                                                               |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Config** | Select agent, personas (max 2), scenarios (max 5) for the simulation                                                                                                                                                  |
| **Runs**   | View history of simulation runs (right-click or Cmd/Ctrl+click to open run in new tab). **Responsive**: Desktop table view (`hidden md:block`) with sortable columns, mobile card view with pills for status and type |

**Config Tab — Agent Selection** (`SimulationConfigTab.tsx` + `AgentPicker.tsx`):

- Uses the `AgentPicker` component (single-select, custom dropdown, not a native `<select>`) with search, type tags (Agent/Connection), and verification status
- `MultiAgentPicker` (also in `AgentPicker.tsx`) provides multi-select with selected agent tags (removable chips), fixed-position dropdown with smart above/below placement, search, and type/verification badges. Used by `BulkUploadTestsModal`. Each instance manages its own agent fetch — when unmounted, state is naturally cleaned up
- The `Agent` type (`AgentPicker.tsx`) has fields: `uuid`, `name`, `type` (`"agent" | "connection"`), and `verified` (`boolean`). The `verified` field is derived from `config.connection_verified` for connection agents; built agents are always considered verified
- **Unverified agent tag**: Unverified agents show a yellow "Unverified" pill with an exclamation-mark triangle icon inline next to the agent name (left side), not grouped with the type tags on the right
- **Unverified agent warning**: When an unverified connection agent is selected, a yellow warning banner appears below the picker: "This agent needs to be verified before the simulation can be run."
- **Verification error popover**: When the Verify button is clicked and fails, a dropdown popover appears beneath the Verify button (not in the config tab) with a "Verification Failed" header, close button, error message, and optional sample response in a scrollable `<pre>` block. Dismissed by clicking outside or the X button. State (`verifyError`, `verifySampleResponse`) lives in the simulation page and is cleared on each new verify attempt.
- **Voice simulation restriction**: When a connection agent is selected, a blue info banner explains that voice simulations are only supported for built agents. Uses theme-aware colors: `text-blue-600 dark:text-blue-300/90` for text, `text-blue-500 dark:text-blue-400` for the icon
- The simulation detail page (`/simulations/[uuid]/page.tsx`) pre-populates `selectedAgent` from the simulation's agent data. Agent type is read directly from `data.agent.type` (the backend returns `"agent"` or `"connection"`). The `verified` field is derived from `data.agent.config?.connection_verified` for connection agents; built agents are always considered verified. **Important**: Always use the backend-provided `type` field — never infer agent type from the presence/absence of config fields like `agent_url`.

**Config Tab — Evaluators Picker:**

- The evaluators picker on the simulation Config tab fetches `GET /evaluators?include_defaults=true` (not the legacy `/metrics` endpoint) and **filters client-side to `evaluator_type === "simulation"`** before mapping to `PickerItem`s. This keeps LLM / TTS / STT evaluators out of the simulation picker since they can't run against a full conversation. The fetch lives in `src/app/simulations/[uuid]/page.tsx` (the `fetchMetrics` effect; the local state variables and `SimulationConfigTab` props are still named `metrics` / `selectedMetrics` / `onMetricsChange` for internal naming continuity — only the API surface uses `evaluators`).
- **Save payload (`PUT /simulations/{uuid}`) is `evaluators: selectedMetrics.map((m) => ({ evaluator_uuid: m.uuid }))`**. The backend's `SimulationUpdate` / `SimulationCreate` / `EvaluatorRef` use `model_config = ConfigDict(extra="forbid")`, so any other key (the legacy `metric_uuids`, plain `metrics`, a flat `metric_uuid` array, etc.) now produces a **422** instead of being silently dropped. `m.uuid` here is already the evaluator's UUID — the picker is populated from `/evaluators?include_defaults=true`, so we never accidentally send a legacy `metrics.uuid` row. Sending one (e.g. via stale local state) returns a **400** with the migrated `evaluator_uuid` to use.
- **Hydration on load** reads from `data.evaluators` on the `GET /simulations/{uuid}` response (the response field renamed from `metrics` → `evaluators` to match the new join table `simulation_evaluators`). Each row has `{ uuid, name, description, ... }` where `uuid` is the evaluator's stable UUID — the same value that gets sent back as `evaluator_uuid` on the next PUT. The local row type is `EvaluatorData` (was `MetricData`).
- **Already-selected evaluators on existing simulations are preserved** even if they don't pass the new `evaluator_type === "simulation"` filter: `selectedMetrics` is hydrated from `data.evaluators` on load (separate from the picker list), so legacy non-simulation evaluators that were saved on a simulation before this filter existed are still rendered as selected chips. Only the *available-to-add* list is filtered.

**Selection Limits:**

- **Personas**: Maximum 2 personas per simulation. Shows limit toast via `showLimitToast()` if exceeded
- **Scenarios**: Maximum 5 scenarios per simulation. Shows limit toast via `showLimitToast()` if exceeded

**Running Simulations:**

- **Run types**: chat (text-based), audio, voice (full pipeline)
- Runs are executed asynchronously with polling for status updates
- Status flow: queued → in_progress → done (or failed). When a run is aborted, the API returns `status: "done"` with individual `simulation_results` entries having `aborted: true`
- **Launch button**: Appears in header actions after simulation is configured. Uses a dropdown with "Text Simulation" and "Voice Simulation" options. Disabled with a hover tooltip ("Agent must be verified before launching a simulation") when `selectedAgent.verified === false`. Voice option is separately disabled for connection agents with its own tooltip using a Tailwind named group (`group/voice` + `group-hover/voice:`) to scope the tooltip to only the voice option — avoids leaking to sibling items when nested `group` classes exist.
- **Verify button**: Shown beside the Launch button only when the selected agent is unverified. Styled with a prominent yellow background (`bg-yellow-500 text-black`) to attract attention. Clicking opens the `VerifyRequestPreviewDialog` modal. Uses the shared `useVerifyConnection` hook (`verify.verifySavedAgent(agentUuid, messages)`). On success, updates `selectedAgent.verified` to `true` in local state (hides the Verify button and enables Launch) with a success toast, and closes the dialog. On failure, the dialog stays open showing error details inline with a "Retry" button (no toast). Uses shared `SpinnerIcon` and `CheckCircleIcon` from `@/components/icons`.

**Runs Tab UI** (`SimulationRunsTab` component):

- **Desktop**: Table with columns (Name, Status, Type, Created At) with sortable created date
- **Mobile**: Enhanced card layout with:
  - Mobile sort button above cards
  - Name as heading, status and type as prominent pills (px-3 py-1.5, semibold)
  - Created date with clock icon in circular container
  - Cards use enhanced styling: rounded-xl, hover effects (shadow-lg, border transition)
  - Same sorting logic as desktop

**Simulation Run Results** (`/simulations/[uuid]/runs/[runId]`):

- **Responsive Design**: Page follows the standard detail page responsive patterns with `space-y-4 md:space-y-6` spacing, responsive section headings (`text-base md:text-lg`), and responsive page title (`text-xl md:text-2xl`). Performance/latency metric grids stack on mobile (`grid-cols-2 md:grid-cols-4`).

- **Responsive Tab Structure** (for voice simulations with metrics):

  - **Mobile (3 tabs)**: Results, Performance, Latency
    - Results tab shows the simulation results table/cards (default on mobile)
    - Performance tab shows performance metrics only
    - Latency tab shows latency metrics only
    - Tab buttons use smaller sizing: `text-xs md:text-sm`, `px-3 md:px-4`
    - "Results" tab is hidden on desktop with `md:hidden`
    - **Section headers hidden on mobile**: Both "Overall Metrics" and "Simulation Results" headers use `hidden md:block` to avoid redundancy with tab names (cleaner mobile UI)
    - **Default tab**: Set via `useEffect` checking `window.innerWidth < 768` to select "results" on mobile
  - **Desktop (2 tabs)**: Performance, Latency
    - Both section headers visible for context
    - Performance tab is default on desktop (set via `useEffect`)
    - Simulation results always shown below Overall Metrics section (not tab-dependent)
    - Performance tab shows performance metrics only
    - Latency tab shows latency metrics only
  - **Text simulations**: No tabs shown, all metrics displayed inline with visible headers
  - **Responsive metric fonts**: Metric labels use `text-xs md:text-sm`, values use `text-sm md:text-base`, icons use `w-3.5 md:w-4 h-3.5 md:h-4` for better readability on mobile

- **Polling & Intermediate Results**:

  - Page polls API every 3 seconds while status is `in_progress`
  - Simulation results appear incrementally as each simulation completes
  - Overall metrics only shown after run completes (status === "done")
  - **Failed state error banner**: When `runData.status === "failed"`, a red error banner is displayed below the status pills with a warning triangle icon and "Simulation Failed" text (styled with `border-red-500/30`, `bg-red-500/10`, `text-red-500`)
  - **Abort button**: Shown inline next to the status/type pills when status is `in_progress` or `queued`. Red-outlined button (`border-red-500/50 text-red-500`) with stop icon. Calls `POST /simulations/run/{runId}/abort`. Shows spinner and "Aborting..." while request is in flight (`isAborting` state), disabled during the request. The abort API returns the same `RunData` response structure as the status GET endpoint, so the response is parsed and used to immediately update the UI via `setRunData(data)` — no need to wait for the next poll cycle
  - **Aborted simulations**: When a run is aborted, individual `SimulationResult` entries may have `aborted: true`. Aborted simulations are treated as terminal — no spinners are shown, `isSimulationProcessing()` and `isSimulationWaiting()` both return `false` for aborted rows. Metric cells show "N/A" instead of spinners when `evaluation_results` is null and `aborted` is true. Aborted simulations with transcript still show the play button in red (`text-red-500` in table, `bg-red-500/10 border-red-500/30 text-red-500` button in cards); those without transcript show a red "Simulation aborted by user" indicator in the card view
  - Individual simulation rows can have `evaluation_results: null` while still processing
  - **Row spinner states**:
    - **Play button only**: Row has `evaluation_results` (metrics complete), or row is `aborted` with transcript
    - **Spinner around play button (yellow)**: Row has transcript but no `evaluation_results` (processing, not aborted)
    - **Spinner only (gray)**: Row has no transcript and no `evaluation_results` (waiting, not aborted)
    - **Aborted with no transcript**: No spinner, no play button. Card view shows red "Simulation aborted by user" label
    - **First column structure**: Uses `relative` container with spinner positioned `absolute inset-0`, play button centered with `relative z-10`. Spinner wraps around the play button visually.
    - **Metric column spinners**: Each metric cell shows `w-5 h-5 flex-shrink-0` spinner when `evaluation_results` is null and not aborted; yellow when processing, gray when waiting. Aborted simulations show "N/A" text instead

- **Overall Metrics Section** (only shown when status is "done", aggregated across all simulations):

  - Displays below status pills and above simulation results
  - **Tab structure**: For voice simulations with metrics, shows Results/Performance/Latency tabs on mobile, Performance/Latency tabs on desktop
  - **Metrics shown** (cards rendered from `runData.metrics`):
    - Performance: one card per attached evaluator. Card label is the evaluator name (the dict key in `runData.metrics`); card value depends on `metric.type`:
      - `rating` → **`{mean}/{scale_max}`** (e.g. `3.0/5`); falls back to just `parseFloat(mean.toFixed(2))` if `scale_max` is missing.
      - `binary` and anything else / older runs without `type` → **`Math.round(mean * 100)%`** (e.g. `0%`, `100%`). Binary intentionally renders as a percent, not `passCount/total`, to keep parity with the legacy display and with built-ins like `tool_calls` / `answer_completeness` / `stt_llm_judge` that ship without a `type`.
    - Latency: STT/LLM/TTS TTFB and processing time (millisecond/second display) — unchanged, driven by hardcoded `latencyKeys` and unaffected by `metric.type`.
  - **Evaluator descriptions and linking**: when an evaluator description is available, overall metric cards show an info-icon `Tooltip` beside the evaluator/metric name (same pattern as the built-in `stt_llm_judge` description), not a muted text line inside the card. Descriptions are resolved from `runData.evaluators[].description` first, then `simulation_results[].evaluation_results[].description`; both are job snapshot fields and may be null for older runs. Missing descriptions render as no icon. Authenticated pages also wrap the entire card in `<Link href="/evaluators/{uuid}">` when an evaluator UUID is resolvable for a metric name (not just the label). The card adds `group block hover:border-foreground/40 hover:bg-muted/30 transition-colors cursor-pointer` for the hover affordance, and a small external-link arrow SVG pinned to `ml-auto` in the label row darkens on `group-hover:text-foreground`. Built-in keys like `stt_llm_judge` (no UUID) keep the plain `<div>` rendering — no arrow, no hover, no link. The shared `SimulationMetricsGrid` mirrors this behaviour when a caller passes `evaluatorUuidByName`; the public `/public/simulation-run/{token}` page intentionally omits the prop (the `/evaluators/{uuid}` route is authenticated and would 404 anonymous viewers) but still passes `evaluatorDescriptionByName`.
  - **`evaluatorUuidByName` resolution** (auth page, `useMemo` over `runData` + the parent-simulation fetch). Resolution priority:
    1. **`runData.evaluators?: { evaluator_uuid, name }[]`** (top-level, newer runs) — rename-safe live `name` keyed to a stable `evaluator_uuid`.
    2. **`simulation_results[i].evaluation_results[].evaluator_uuid`** (per-row, newer runs) — scanned for any name not yet in the map.
    3. **`simulationEvaluatorUuidByName`** — populated from the parent simulation's config (`GET /simulations/{uuid}` → `data.evaluators[].{ uuid, name }`, the same fetch used to set the page title). This is the only path that works for **older runs that have neither (1) nor (2)** and is the reason the run page already calls `/simulations/{uuid}` — it's an existing fetch, not a new round-trip.
    4. Older runs whose backend doesn't return any of (1)–(3), or whose evaluators were detached after the run, fall through to plain-text labels (no arrow, no hover, no link).
    - **Gotcha**: paths (2) and (3) are matched by **name**, so renaming an evaluator after a run was created can mis-link to the *current* evaluator with that name. Path (1) is rename-safe (uses the live `evaluator_uuid` field directly).
  - **Defensive numeric coercion** (gotcha): `metric.mean`, `metric.values[]`, and `evaluation_results[].value` are typed as `number` but the backend has been observed to serialize decimal columns as **strings** on some responses. `formatOverviewMetricValue` (auth page) and `formatMetricCardValue` (`SimulationMetricsGrid`) therefore wrap every read with `Number(...)` + `Number.isFinite(...)` before calling `.toFixed(...)` or comparing against `1`. Without this, the public page crashed at runtime with `val.toFixed is not a function` (rating branch) and binary `Pass/Fail` mis-rendered because `"1" === 1` is `false`. Apply the same coercion if you add new arithmetic over these fields.
  - Calculated from `runData.metrics` or derived from individual simulation `evaluation_results` for legacy latency-only fallbacks

- **Per-Simulation Results Table** (shows intermediate results as each simulation completes):

  - **Per-cell value formatter** (shared between desktop and mobile, lives as the `formatRowMetricValue` callback on the page):
    - `metric.type === "rating"` → numeric `value/scale_max` chip with neutral `text-foreground` styling (e.g. `4.0/5`); falls back to just `value.toFixed(2)` if `scale_max` is missing. Pass/Fail does not apply to scalar scores.
    - `metric.type === "binary"` (or older runs without `type`) → green `Pass` / red `Fail` badge based on `value === 1`. This preserves the legacy rendering for runs predating the typed-metrics migration.
    - `stt_llm_judge` / `stt_llm_judge_score` is handled by the caller (special-cased above this formatter) and renders as `{percentage}%`. Keep that local `isSttLlmJudge` branch in both desktop rows and mobile cards even if description rendering changes; otherwise mobile cards can crash at runtime or fall through to Pass/Fail rendering. The mobile view reuses the same chip but rewrites `px-2.5 py-1 rounded-md` → `px-2 py-0.5 rounded` for the tighter compact card layout.

  - **Desktop** (`hidden md:block`): Table with columns for play button, persona, scenario, and metric columns

    - Persona + Scenario combination
    - Individual metric scores rendered via `formatRowMetricValue` with reasoning tooltips
    - Metric columns derived from `runData.metrics` keys, or from `simulation_results[].evaluation_results` when metrics is null. Column headers show metric keys only; do not render evaluator descriptions in desktop table headers or mobile result-card metric rows. Evaluator descriptions belong only in the Overall Metrics cards as tooltip icons.
    - Latency metrics (stt/ttft, llm/ttft, etc.) are excluded from the table (shown in latency tab instead)
    - `stt_llm_judge_score` displayed as percentage; rating evaluators displayed as `value/max`; binary / legacy evaluators as Pass/Fail
    - View transcript button (only shown for rows with transcript history; available even while evaluation is pending)
    - Audio playback (for voice simulations)
    - **Processing state**: Rows with `evaluation_results: null` (and not aborted) show spinners in metric cells (yellow if has transcript/processing, gray if waiting) and a spinner beside the play button. Aborted rows show "N/A" in metric cells instead

  - **Mobile** (`md:hidden`): Card-based layout with clear label/value structure:

    - **Persona section**: "Persona" label (text-xs muted) with value below (text-sm font-medium)
    - **Scenario section**: "Scenario" label (text-xs muted) with value below (text-sm font-medium)
    - Visual separator (border-bottom) between info sections and metrics
    - **Metrics section**: "Metrics" heading (text-xs font-semibold) followed by metric list
    - Each metric shows: spinner (if processing), "N/A" (if aborted), percentage (for stt_llm_judge), `value/max` chip (rating), or Pass/Fail badge with info icon (binary / legacy)
    - Metrics displayed as list items with label/value pairs (border-bottom separators)
    - "View Transcript" button at bottom (full-width, only shown when transcript exists)
    - Processing state indicator: button text changes to "Processing..." when evaluation pending
    - **Aborted without transcript**: Shows red "Simulation aborted by user" indicator (`bg-red-500/10 border-red-500/30 text-red-500`) in place of the transcript button
    - Cards use standard styling: p-5, rounded-xl borders, space-y-3 for sections

  - **Row sorting** (same for desktop and mobile): Rows are sorted by processing state priority:
    1. Completed rows (have transcript and evaluation_results) - at the top
    2. Processing rows (have transcript but no evaluation_results - yellow spinner) - middle
    3. Waiting rows (no transcript - gray spinner) - at the bottom

- **Transcript Dialog**:

  - **Responsive Layout**:

    - **Mobile**: Full-screen dialog (`w-full`), padding reduced to `px-4 py-4`, all message bubbles use `w-full` (simulation transcripts need full width due to audio players)
    - **Desktop**: 40% width sidebar (`md:w-[40%] md:min-w-[500px]`), standard padding `md:px-6 md:py-4`, message bubbles use `md:w-1/2`
    - Smooth transition between layouts as viewport changes
    - **Note**: Simulation transcript bubbles use full width on mobile. **Test / benchmark result** conversation (`TestDetailView` in `shared.tsx` — middle column of `TestRunnerDialog` / `BenchmarkOutputsPanel`) uses **`w-[88%] md:w-3/4`** for user/agent/tool bubbles (wider than the previous 70% / half-column pattern). **`AddTestDialog`**’s conversation editor preview still uses **`w-1/2`** where its layout defines message columns — not the same width tokens as `TestDetailView`.

  - **Live updates with freeze-on-complete**: Dialog stays in sync with polling while simulation is in progress, then freezes:

    - Stores `selectedSimulationKey` using `simulation_name` (unique identifier)
    - Uses `frozenSimulationRef` to store a stable copy once simulation has `evaluation_results`
    - `useMemo` logic: if frozen and complete → use frozen data; if just completed → freeze it; if in progress → use live data
    - Prevents audio reload when polling updates other rows while viewing a completed simulation
    - `frozenSimulationRef` is cleared when dialog closes

  - **Auto-scroll**: Transcript container scrolls to bottom only when new messages are added (tracks `prevTranscriptLengthRef` and only scrolls if `currentLength > previous`)
  - **Empty state**: Shows "No transcript available yet" when transcript is empty or undefined
  - **Processing indicator**: Shows a yellow spinner at the bottom of transcript while metrics are being fetched (when `evaluation_results` is null, transcript has content, and simulation is not aborted)
  - **Graceful null handling**: All transcript accesses use optional chaining (`transcript?.length ?? 0`, `transcript ?? []`) since transcript can be undefined during intermediate results
  - **Transcript filtering**: Entries are filtered before display - `role: "end_reason"` is always filtered out, and `role: "tool"` messages are only included if they have valid JSON content with `type: "webhook_response"` (other tool messages like "COMPLETED" are hidden)
  - **End reason handling**: When the last entry in the **full** (unfiltered) transcript has `role: "end_reason"` and `content: "max_turns"`, an informational banner is shown after the message list: "Maximum number of assistant turns reached". **Implementation** appears in two places with the same markup: inline transcript on `src/app/simulations/[uuid]/runs/[runId]/page.tsx` and `SimulationTranscriptDialog` (`src/components/eval-details/SimulationTranscriptDialog.tsx`). **Styling (light-mode contrast)**: Container `bg-yellow-500/10 border border-yellow-500/30`; message `text-sm font-medium text-foreground` (not `text-yellow-500` on the tint — unreadable in light mode); warning icon `text-amber-900 dark:text-amber-400` with `shrink-0` on the SVG
  - **Aborted simulation banner**: When `selectedSimulation.aborted` is true, a red informational banner is shown at the bottom of the transcript: "Simulation aborted by user" (`bg-red-500/10 border border-red-500/30`, icon and label `text-red-500`). Same centered flex layout as the max_turns banner; text remains semantic red for errors (unlike max_turns, which uses `text-foreground` for the body copy)
  - **Stable audio keys**: All audio elements use `key={audioUrl}` to prevent React from remounting them during polling re-renders (avoids audio restart/reload)
  - **Presigned URL refresh on error**: Audio elements include `onError={refreshRunData}` handler to automatically fetch fresh presigned URLs when they expire. The `refreshRunData` callback clears `frozenSimulationRef` before updating state so new URLs are used instead of stale frozen data
  - Full conversation audio player below header (from `conversation_wav_url`) for voice simulations
  - Full conversation history (user, assistant, tool calls, tool responses)
  - Role-based message styling
  - **Tool call details as form fields**: Arguments are displayed as labeled form fields (matching AddTestDialog style). Each arg key (body, query) is shown as a field label, with its value displayed as pretty-printed JSON. Headers are filtered out and not shown
  - **Tool response display** (for webhook calls): Only shows `role: "tool"` messages where content is valid JSON with `type: "webhook_response"`. Displays the `response` object as **pretty-printed JSON** in a monospace `<pre>` block with "Agent Tool Response" header (intentionally different from tool call form fields to distinguish input vs output). **Error handling**: If `response.status === "error"`, displays with red styling: warning icon, "Tool Response Error" label in red, `border-red-500` border, and `text-red-400` for the JSON content
  - Per-message audio players for voice simulations (matching `audio_urls`). Resolution is centralized in **`@/lib/simulationVoiceAudio`** (`getVoiceSimulationAudioLayout`, `getVoiceSimulationAudioUrlForEntry`). Audio is only shown for user messages and assistant text messages — tool calls (`tool_calls` present) and tool responses (`role: "tool"`) are skipped

- **Simulation Results Conditional Display**:
  - **Mobile with metrics (voice type)**: Only shows in "Results" tab (`activeMetricsTab === "results"`)
  - **Desktop**: Always shows below Overall Metrics section (no tab switching)
  - **Text simulations**: Always shows (no tabs, no conditional display)
  - Implementation uses `window.innerWidth < 768` check combined with `activeMetricsTab` state to conditionally render
  - Prevents duplicate display on mobile when switching between Performance/Latency tabs

### 10. Human Labelling (`/human-labelling`)

**What it is:** Authenticated hub for creating labelling tasks, managing annotators, and viewing cross-task **agreement** metrics (inter-annotator agreement and how each evaluator aligns with human labels). Primary implementation: `src/app/human-labelling/page.tsx` plus nested routes under `src/app/human-labelling/` (task detail, annotator detail, annotation jobs, evaluator run views). Shared UI lives under `src/components/human-labelling/`. **Navigation (`src/components/AppLayout.tsx`):** The sidebar item **`label`** is **`Human alignment`** (what users see in the nav). The **`id`** stays **`human-labelling`**, matching the URL segment and every screen’s `activeItem="human-labelling"` — changing nav labels does not rename routes or folders. **Gotcha:** `document.title`, the hub route `layout.tsx` **metadata** title, and the hub page’s main heading may still say **Human Labelling** unless updated separately; mismatches between sidebar wording and in-page titles are intentional unless product asks for a full rename.

**Tabs** (synced to URL via `?tab=` — valid values: `overview`, `tasks`, `annotators`; default `overview`):

| Tab          | Purpose |
| ------------ | ------- |
| **Overview** | **Agreement summary** (`AgreementOverview` in `page.tsx`): task filter dropdown (`All tasks` or one task), desktop table + mobile cards. Rows include a pinned **Annotator agreement** baseline (`human_human`), then one row per evaluator from agreement API data. Columns: **Name**, **Type** (`HumanTypePill` vs `EvaluatorTypePill`), **Current agreement** (%), expandable chart per row. |
| **Tasks**    | List of labelling tasks; navigates to `/human-labelling/tasks/[uuid]`. |
| **Annotators** | Annotator list; navigates to `/human-labelling/annotators/[uuid]`. |

**Overview — evaluator row labeling (UX copy):** For each **evaluator** row (not the annotator-agreement row), the **Name** column shows the existing pill-shaped **link** to `/evaluators/{evaluator_id}` containing **only** the evaluator display name, immediately followed by the lowercase word **`alignment`** as plain text (`text-sm font-medium text-foreground`, `shrink-0`). **Why:** Distinguishes human–evaluator alignment from the evaluator’s identity and from the **Type** column pill (LLM/STT/TTS/simulation). **Pattern:** Keep the link wrapping **name only** so `title`/`href` stay evaluator-scoped; do not fold `alignment` into `row.name` for charts (`ExpandedChart` still uses `seriesName={row.name}`) or sort keys (name sort uses API name).

**Layout notes:** Desktop uses a 4-column grid for the agreement table header and rows; mobile overview cards use a flex row for name + type pill + chevron. Evaluator rows use `min-w-0` on the link so truncation still works when the suffix is present.

**Loading vs empty — Human labelling & evaluator agreement UI:** Many fetches set **`loading`/`…Loading`** with **`useState(false)`**. On the first paint, that flag is still **`false`** while data is **`null`/`[]`**, so empty placeholders (**No agreement data yet**, **No items yet**, **No evaluation runs yet**, etc.) can flash **before** `useEffect` runs and sets loading **`true`**. **Mitigation:** add a **`…FetchCompleted`** (or equivalent) boolean set in the request’s **`finally`** (success or error), and treat the surface as loading while **`inFlight || !…FetchCompleted`**. Refetches after the first completion still rely on the in-flight flag. Same idea as **`ResourceState`**’s `isLoading` first branch in `src/components/ui/LoadingState.tsx`, but applied ad hoc where list state is split across the page.

**Where implemented (by file):**
- **`src/app/human-labelling/page.tsx`**: **`agreementFetchCompleted`** → **`AgreementOverview`** gets **`agreementLoading={agreementLoading || !agreementFetchCompleted}`**. **`tasksFetchCompleted`** / **`annotatorsFetchCompleted`** — **Tasks** / **Annotators** tabs use **`tasksLoading || !tasksFetchCompleted`** and **`annotatorsLoading || !annotatorsFetchCompleted`** before task or annotator empty states. (**Tasks** still load once on mount for the whole hub — dropdown counters and overview — so the completion flag is “first **`GET /annotation-tasks`** finished”, not tab-specific.)
- **`src/app/human-labelling/tasks/[uuid]/page.tsx`**: **`agreementFetchCompleted`** for the overview agreement strip (**`agreementLoading || !agreementFetchCompleted`**). **`taskFetchCompleted`** (**`fetchTask` `finally`**) gates **Items** (**`itemsLoading = loading || !taskFetchCompleted`**) and **Labelling jobs** (spinner while **`loading || !taskFetchCompleted`**). **`runsFetchCompleted`** (**`fetchRuns` `finally`**) — **`EvaluatorRunsList`** gets **`loading={runsLoading || !runsFetchCompleted}`**. **Route reset:** one **`useEffect([uuid])`** clears **`task`**, **`runs`**, agreement payload + **`agreementFetchCompleted`**, **`taskFetchCompleted`**, **`runsFetchCompleted`**, **`error`**, and **`autoTabSwitchedRef`** so a new **`uuid`** does not reuse prior task/agreement/run rows or suppress the “no items → jump to Items tab” behaviour. **`runs`**, **`runsLoading`**, **`runsError`**, **`runsFetchCompleted`**, and agreement state are declared **above** `fetchTask` / that effect so the reset callback does not reference setters before initialization. **Obsolete here:** deriving items-tab loading only as **`loading && !task`** — it missed the pre-`setLoading(true)` frame; **`taskFetchCompleted`** closes the gap.
- **`src/app/human-labelling/annotators/[uuid]/page.tsx`**: **`detailFetchCompleted`** (**`fetchDetail` `finally`**; reset on **`uuid`**). **Agreement with other annotators** chart: **`detailLoading || !detailFetchCompleted`**. **Jobs** tab: same guard before **No jobs assigned yet**.
- **`src/app/evaluators/[uuid]/page.tsx`** (**Agreement** tab): **`trendFetchCompleted`** in **`fetchTrend`’s `finally`**; on **`uuid`** change reset **`trend`**, **`trendAllTasks`**, **`trendFetchCompleted`**. **`AgreementTrendTab`** receives **`trendLoading={trendLoading || !trendFetchCompleted}`**.

**Gotchas:** Early `return` before **`try`** (e.g. missing **`accessToken`** or empty **`uuid`**) may leave **`…FetchCompleted`** false forever — same as any gated fetch. **`fetchTask`** failure still runs **`finally`** (**`taskFetchCompleted`** true); **Labelling jobs** may still show **No labelling jobs yet** with **`task === null`** if error handling leaves no task — that edge predates this pattern.

**Relationship:** Evaluator **Agreement** tab endpoint and copy live under **Evaluators** (**Evaluator detail page — URL tabs `prompts` / `agreement`**).

**Labelling task detail** (`/human-labelling/tasks/[uuid]`, `src/app/human-labelling/tasks/[uuid]/page.tsx`): Tabs include **Overview**, **Items**, **Labelling jobs**, **Evaluation runs** (`?tab=` mirrors hub pattern). **Loading gates** for agreement, items, jobs, and runs (and route-**`uuid`** reset of **`autoTabSwitchedRef`**) are documented under **Loading vs empty — Human labelling & evaluator agreement UI**. The **Overview** tab’s **agreement strip** — after agreement data has finished loading and is non-empty — renders a row of **`AgreementStatCard`** instances in the same file. **`AgreementStatCard`** (`src/components/human-labelling/AgreementStatCard.tsx`) takes a **discriminated union**: **`staticPillText`** *or* **`evaluatorPill`**, never both. **`staticPillText`** uses **`agreementStatPillBase`** — bordered **`text-xs`** chip aligned with task header evaluator links; long fixed labels still **`truncate`** inside that pill. **`evaluatorPill`** uses **`evaluatorAgreementPillLink`** instead: same chip family visually, but the **`Link`** deliberately omits **`min-w-0`** / **`max-w-full`** (pairing those with **`truncate`** on the name forced single-line ellipsis in flex layouts). Evaluator **`name`** is **`break-words whitespace-normal`**; link adds **`flex-wrap`**, **`shrink-0`**, **`text-left`**. Optional **`versionLabel`** (**`vN`**) stays a monospace **`span`**. Outer card: **`min-w-[160px] w-max shrink-0`** so width tracks wrapped evaluator copy inside the horizontal **`overflow-x-auto`** strip. **Annotator agreement** (`human_human`): **`staticPillText="Annotator agreement"`** — **`cursor-default`**, optional **`title`** — **not** clickable. **Evaluator** rows: **`evaluatorPill`** → **`Link`** **`/evaluators/{evaluator_id}`** with **`hover:bg-muted`**, **`cursor-pointer`**; lowercase **`alignment`** as **`span`** (`text-sm font-medium text-foreground shrink-0`) in **`flex items-center gap-2 min-w-0 flex-wrap`**, matching the hub overview evaluator-row suffix pattern. **Agreement %** below with **`mt-2`** and **`agreementColor`**. **Above the cards**, **`h2` Agreement summary** (`text-sm font-semibold`) plus muted intro (`text-xs text-muted-foreground max-w-2xl mt-1`). **Why:** Cards match header chip language while separating annotator vs evaluator metrics; full evaluator names avoid **`details.evaluators`** omitting **`name`** mid-run while the UI still shows a long title from **`task.evaluators`**. **`alignment`** ties task overview cards to the hub table copy pattern. **Overview — item × evaluator summary** (same tab, below the cards when summary data exists): toolbar **`MultiSelectPicker`** with **`placeholder="All evaluators"`** filters rows; **`Live versions only`** toggle beside it. Those controls use the shared **`MultiSelectPicker`** surface/contrast rules documented under **Component Patterns**. **Gotchas:** **Agreement summary** heading + **AgreementStatCard** strip: spinner while agreement is loading or before the first fetch has settled (**Loading vs empty — Human labelling & evaluator agreement UI**); **No agreement data yet** only after the request completes with no comparable pairs. **Item × evaluator** summary heading + table: unchanged timing relative to **`taskSummary`** — that block is separate from the agreement endpoint. **`EvaluatorTypePill`** stays task-level in the header — not repeated per card. Very long names widen cards / chips; the strip scrolls horizontally rather than clipping with ellipsis.

**Items tab — bulk CSV upload:** Labelling tasks expose bulk item upload through **`BulkUploadLlmItemsDialog`**, **`BulkUploadSttItemsDialog`**, and **`BulkUploadSimulationItemsDialog`** (`src/components/human-labelling/`). Shared chrome is **`BulkUploadDialogShell`** (`bulk-upload-shared.tsx`): inner panel **`w-full`**, **`max-h-[90vh]`**, **`transition-[max-width] duration-200`**. On **`md+`**, **`itemCount > 0`** (parsed rows) sets **`md:max-w-[70vw]`** to cap width after CSV upload; with no rows yet **`md:max-w-[37.5vw]`** keeps the pre-parse dropzone narrow. Those **`max-width`** rules are **`md`-only — below the breakpoint the sheet stays full width inside the overlay padding (`p-4`), not 70vw. Preview **`gridTemplateColumns`** live per dialog (**`gridStyle`** / **`simGridStyle`** / **`sttGridStyle`**), not in the shell: **capped `minmax(…px, …px)`** tracks and tighter annotation **value** vs **reasoning** tracks replace **`minmax(..., 1fr)`** so columns do not stretch to fill the modal; overflow scrolls horizontally. Preview markup: CSS Grid (not `<table>`), **`overflow-auto max-h-[20rem]`**, **`gap-2 px-3`** on header and row grids, sticky header (**`sticky top-0 z-10`**, **`bg-muted`**, **`border-b`**). **Sticky header fill:** wrap the sticky header and body rows in **`min-w-max`** inside **`overflow-auto`** so **`bg-muted`** spans the full scroll width (without it, the muted band can clip to the first visible horizontal slice).

**Bulk upload — `annotated-check`:** **`BulkUploadLlmItemsDialog`**, **`BulkUploadSttItemsDialog`**, and **`BulkUploadSimulationItemsDialog`** all POST **`/annotation-tasks/{task_uuid}/items/annotated-check`** when **upload annotations** is enabled, an **annotator** is selected, and there are parsed rows. Body: **`{ annotator_id, names }`** with **`names`** the ordered **`name`** cell per row (same order as **`POST …/items`**). **Why:** surface name collisions and whether annotations **attach** to an existing item vs **replace** this annotator’s existing labels before the bulk item write. **Shared type:** **`AnnotatedCheckResult`** is defined only in **`bulk-upload-shared.tsx`** (`all_new`; **`existing_without_annotations`** / **`existing_with_annotations`** as **`{ index, name }[]`**). **Shared implementation (not a single mega-dialog):** **`useAnnotatedItemsCheck`** holds the **`apiClient`** POST, **`annotatedCheck`**, and **`annotatedCheckLoading`** — call with **`enabled`** (typically **`uploadAnnotations && !!selectedAnnotatorId && parsedItems.length > 0`**), **`taskUuid`**, **`accessToken`**, **`annotatorId`**, and **`namedItems`** (any **`readonly { name: string }[]`**, usually the dialog’s **`parsedItems`** so the effect tracks the same reference semantics as before). **`BulkUploadItemsPreviewShell`** wraps the preview: item count, **“Checking for existing items…”** spinner, bordered **`max-h-[20rem]`** scroll region with inner **`min-w-max`**, the two amber/red footnotes — **`children`** are only the sticky header grid + **`divide-y`** body that each task type defines. **`bulkUploadAnnotatedRowBgClass(rowIndex, annotatedCheck)`** returns the **amber** / **red** **`bg-* /10`** class for that row. **Why three dialogs:** CSV column sets, PapaParse rules, guideline PDFs, sample CSV builders, and **`POST …/items`** **`payload`** / **`evaluator_variables`** shapes differ materially by task type, so composition beats one parameterized dialog. **Gotchas:** **`index`** is **0-based into the parsed row list** (matches preview order beyond the first 50 visible rows). **`namedItems`** in the hook dependency array uses **array reference** identity — same as the previous **`parsedItems`** effect dependency; toggling **upload annotations** clears parsed rows in each dialog, which disables the hook and clears results. A failed check clears warnings only — it does **not** block upload.

**Evaluation run detail** (`/human-labelling/tasks/[uuid]/evaluator-runs/[runUuid]`, `src/app/human-labelling/tasks/[uuid]/evaluator-runs/[runUuid]/page.tsx`): Fetches **`GET /annotation-tasks/{task_uuid}/evaluator-runs/{job_uuid}`** (polls until terminal). The response may include an **`items`** array: **`{ uuid: string; payload: unknown }[]`**, where **`uuid` matches `runs[].item_id`** (and the same ids appear on agreement payloads such as **`human_agreement.items[].item_id`** on the backend). **`items` is only on this single-job endpoint** — **`GET …/evaluator-runs`** (no job id) is unchanged. **Why:** Per-item previews (**`ItemPane`** from `AnnotationJobView`) must stay correct after **item soft-delete** (live task item rows / item endpoints can 404); the job carries a **payload snapshot** instead of re-fetching each item. **Frontend pattern:** When **`job.items` is non-empty**, build the carousel list from those snapshots (helpers **`orderedSnapshotsForRun`** then **`snapshotToItem`** map each snapshot into the shared **`Item`** shape so **`ItemPane`** still reads **`payload` only**). Ordering: prefer **`job.details.item_ids`**, else **first-seen `runs[].item_id`**, then any snapshots not yet listed, then apply **`job.details.item_count`** when it caps a longer list. **Fallback:** If **`items` is missing or empty** (older API or in-flight edge), the page uses **`GET /annotation-tasks/{task_uuid}`** and the same **`item_ids` / runs / `item_count`** subsetting against **`task.items`** as before — the task fetch remains required for **`type`** (STT / LLM / simulation) in all cases. **Evaluator labels (chips, cards, export):** **`evaluatorDisplayName(ev, evaluatorNamesById, runRow?)`** in the same page picks the human-readable evaluator string for header evaluator **Links**, **`EvaluatorResultsPane`** headings (queued / in-progress “running” placeholders, missing-row errors, and **`EvaluatorVerdictCard`** **`name`**), **`HumanAgreementSummary`** → **`AgreementStatCard.evaluatorPill.name`**, and **`handleExport`** per-sheet titles. **Resolution order** (first non-empty trimmed string wins): **`job.details.evaluators[].name`**, **`runs[].evaluator.name`** for the matching row when it exists, **`evaluatorNamesById[evaluator_id]`** derived from **`task.evaluators`** on that same task GET (**`useMemo`**, map **`uuid → name`**), else **`evaluator_id.slice(0, 8)`**. **Why:** **`details.evaluators` often omits `name` while the job is `queued` or `in_progress`**; linked task evaluators still usually carry display names, so merging avoids ID-prefix-only pills. **Obsolete pattern:** treating **`e.name || e.evaluator_id.slice(0, 8)`** from **`details` alone** as sufficient for on-screen copy during an active run. **Obsolete UI assumption:** evaluator **`AgreementStatCard`** / shared **`agreementStatPillBase`** alone — evaluator pills now split **`evaluatorAgreementPillLink`** vs **`agreementStatPillBase`** so identity chips do not **`truncate`** by default (see **Labelling task detail → agreement strip**). **UI:** **Evaluator identity chips** above the carousel: when **`HumanAgreementSummary`** does not render (non-terminal status, or completed run whose agreement block is suppressed / empty per existing guards), the fallback **`flex-wrap`** row of evaluator **`Link`** chips uses **`shrink-0`**, **`text-left`**, and a name **`span`** with **`break-words whitespace-normal`** (**`text-sm font-semibold`** on the chip), mirroring the visibility rules of **`AgreementStatCard.evaluatorPill`**. When **`HumanAgreementSummary`** shows **`AgreementStatCard`** rows, evaluator names reuse **`AgreementStatCard`** — same **`evaluatorAgreementPillLink`** behavior as task Overview. Header-strip evaluator names are **not** forced into **`truncate max-w-[200px]`**. Pane **`h3`** titles avoid unnecessary **`truncate`** on evaluator names so long labels stay visible inside **`flex-wrap`** layouts. **Relationship:** **`HumanAgreementSummary`** and task Overview agreement strip both consume **`AgreementStatCard`**; only the evaluation-run page adds the pre-completion **`Link`** chip row. **Edge case:** **`SourcePill`** in **`EvaluatorResultsPane`** keeps **`truncate max-w-[160px]`** on **`primaryLabel`** (short **Evaluator** label vs annotator names in a dense toggle row — different UX goal than evaluator identity chips). **Typing:** page-local **`LabellingTaskFull`** includes **`evaluators?: { uuid: string; name: string }[]`** (alongside **`type`**, **`items`**). **Gotchas:** If the task payload has no linked evaluator entry and neither **`details`** nor the run row embeds **`name`**, the short ID prefix remains. Version pills (**`vN`**) still come from the existing lazy **`GET /evaluators/{evaluator_id}/versions`** fetch — independent of name resolution. **Gotchas (items):** An **`item_id`** referenced by **`item_ids` or `runs`** but absent from **`items`** still gets a row with an **empty payload** (defensive). Do not assume the list endpoint returns **`items`**. **“Show disagreements only” (`filterDisagreements`):** Besides **`filteredItemsForRun`** (carousel items with at least one **(item, evaluator)** whose **`human_agreement`** slot has **`agreement !== null && agreement !== 1`** with human labels), **`EvaluatorResultsPane`** drops evaluators that are fully aligned on that item (**`visibleEvaluators`**). For each remaining evaluator, **annotator** **`SourcePill`s** are not the full **`human_annotations`** list: they are filtered to **`annotationPills`** — annotations where **`!isAnnotationAligned(human value, run row value, outputType)`** (same boolean/rating comparison as pill **tone** aligned vs misaligned). **`selectedAnnotation`** resolves only within **`annotationPills`**, so a stored selection that pointed at an agreeing annotator falls back to **Evaluator** (same pattern as a missing id). The **Evaluator** pill + **`AgreementGlyph`** row is shown only when **`annotationPills.length > 0`** after that filter — if every human label agrees with the machine on comparable values, the strip hides even though **`human_annotations`** may be non-empty (**`hasHumans`** keys off pills, not raw annotation count). **`AgreementGlyph`** still reflects the API’s slot-level **`agreement`** / **`pair_count`** for that evaluator when the strip renders. **Obsolete assumption:** disagreement mode only hid **items** and **evaluator cards**; annotator toggles used to list **all** labellers and used alignment only for **styling**. **Excel export:** **`handleExport`** lazy-loads **`exceljs`** via **`import("exceljs").default`** and builds a multi-sheet **`.xlsx`** workbook (**`ExcelJS.Workbook`** — **`writeBuffer`**, programmatic download via blob URL — not SheetJS **`writeFile`**). **Per-evaluator sheets — row filter:** Only **(run item × evaluator)** rows where **`human_agreement.items[].evaluators[].agreement`** is a **`number`** **and** **`agreement < 1`** (below 100% alignment for that evaluator on that item — same meaning as carousel pills / summary “evaluator ↔ human”; requires at least one human annotation). **Export ignores `filterDisagreements`** and always walks **`itemsForRun`**, filtering rows **per sheet** as above (so evaluator B's sheet has no rows for items where only evaluator A disagreed); each exported row still includes **all** annotator columns for that item/slot, not only misaligned humans. **Edge cases:** Rows with **`agreement`** **`null`** (no usable agreement) are **omitted** on that sheet — may yield **header-only** worksheets for an evaluator whose slots are all missing labels or perfectly aligned. **`isBelowFullEvaluatorAgreement`** encapsulates the export predicate. **Per-sheet columns:** task input headers from **`exportInputCols(task.type)`**, then **`{evaluatorDisplayName}/variable`** columns (union of variable names across **included** rows for that sheet — **`agreement < 1`** only), then **`Human agreement`** and **`Evaluator agreement`** (same semantics as **`SummaryRow.human_agreement`** / **`evaluator_agreement`** on **`GET /annotation-tasks/{uuid}/summary`** — inter-annotator agreement vs human-vs-evaluator alignment for that **(item, evaluator)** slot), then **`Evaluator/value`**, **`Evaluator/reasoning`**, then **`{annotator}/value`** and **`{annotator}/reasoning`** pairs. **`HumanAgreementItemEvaluator`** allows optional **`human_agreement`** / **`evaluator_agreement`** when the run API embeds them (mirror of summary fields). **`agreementExportCell(fromApi, computed)`** applies **`formatAgreement`** to an API value whenever the property is present (**`null`** → em dash); when the key is **`undefined`**, it uses **`computeInterAnnotatorAgreement`** or **`computeEvaluatorHumanAgreement`**, with **`runOutputType(run)`** choosing binary vs rating (consistent with **`EvaluatorResultsPane`**). **Gotchas:** **Row inclusion vs cells:** Rows are gated by **`evaluators[].agreement`** (evaluator ↔ human); **`Human agreement`** / **`Evaluator agreement`** cell content uses **`human_agreement`** / **`evaluator_agreement`** and the **`compute*`** fallbacks, so **`Human agreement`** can show unanimous humans (**100%**) while the row still exports as a disagreement for that evaluator. Fallback inter-annotator needs **≥2** comparable human values; evaluator–human fallback needs at least one human label comparable to the run output; mixed or missing value types can leave agreement cells **—**. **`Export results` button:** Rendered only when **`job.status === "completed"`** and the resolved run has at least one item (**`itemsForRun.length > 0`**). It sits in the same **header row** as the status pill (**`flex items-center justify-between`**), calls **`handleExport`**, uses **`type="button"`**, **`disabled`** while **`exporting`**, visible label **`Export results`** (working state **`Exporting…`**), and **`title="Download spreadsheet (XLSX)"`** so the **`.xlsx`** format is explained on hover without technical jargon in the label. **Styling:** **primary** recipe from **`.cursor/rules/design.md`** — **`bg-foreground`**, **`text-background`**, **`h-11`**, **`px-6`**, **`text-[14px]`**, **`font-semibold`**, **`shadow-sm`**, **`hover:opacity-90`**, **`disabled:opacity-50`**, **`disabled:cursor-not-allowed`** — so the control reads as the main download action rather than a muted bordered chip that matched the page chrome. **Relationship:** **`handleExport`** is the only **`exceljs`** workbook path in-app; unrelated to **`ExportResultsButton`** / **`DownloadableTable`** (CSV).

---

## Key Concepts Explained

### Voice Agent Pipeline

A voice agent processes conversations through this pipeline:

```
User Speech → [STT] → Text → [LLM] → Response Text → [TTS] → Agent Speech
                              ↓
                        [Tool Calls]
                              ↓
                       External APIs
```

Calibrate allows testing and benchmarking each component:

- **STT (Speech-to-Text)**: Converts user's voice to text
- **LLM (Large Language Model)**: Generates intelligent responses
- **TTS (Text-to-Speech)**: Converts agent's response to voice
- **Tools**: External functions the LLM can call

### Simulation Testing Approach

Instead of manual testing, Calibrate uses AI-powered simulation:

1. **Personas** act as synthetic users with defined characteristics
2. **Scenarios** give these personas specific tasks to accomplish
3. The system runs automated conversations between the agent and personas
4. **Metrics** evaluate if the agent handled the conversation correctly

This enables:

- Testing edge cases (angry customers, language barriers)
- Regression testing after changes
- Scale testing (run hundreds of simulations)
- Objective evaluation with consistent criteria

---

## Tech Stack

- **Framework**: Next.js 16.1.1 with App Router
- **React**: 19.2.3
- **Styling**: Tailwind CSS 4 with CSS variables for theming
- **Fonts**:
  - **Geist** - Default app font (via `--font-geist-sans`)
  - **Geist Mono** - Monospace font (via `--font-geist-mono`)
  - **Inter** - Available via `--font-inter`
  - **DM Sans** - Used on landing page for Coval-style typography (via `--font-dm-sans`)
- **Authentication**: NextAuth.js v5 (beta) with Google OAuth
- **Charts**: Recharts 3.6.0
- **CSV Parsing**: PapaParse (bulk CSV — agent tests in `BulkUploadTestsModal`, labelling task items in `BulkUploadLlmItemsDialog` / `BulkUploadSttItemsDialog` / `BulkUploadSimulationItemsDialog`)
- **Spreadsheet export (XLSX)**: **`exceljs`** — human labelling **evaluation run detail** only (`import("exceljs").default`). **Export results** builds one worksheet per evaluator; each sheet includes only rows where that evaluator’s **`human_agreement` `agreement`** for the item is **below 1** (see **Human Labelling → Evaluation run detail**). Unrelated to **`ExportResultsButton`** / **`DownloadableTable`** (CSV).
- **TypeScript**: 5.x

---

## Project Structure

```
/                           # Root directory
├── env.example            # Environment variables template
├── docs/                      # Mintlify documentation
│   ├── mint.json             # Mintlify configuration (navigation, colors, socials)
│   ├── introduction.mdx      # Welcome page with platform overview and workflow guide
│   ├── guides/               # Feature guides (4 pages)
│   │   ├── stt.mdx          # STT evaluation
│   │   ├── tts.mdx          # TTS evaluation
│   │   ├── llm-testing.mdx  # LLM testing (agent, tools, tests, benchmarks)
│   │   └── simulations.mdx  # End-to-end simulations (text + voice in one page)
│   └── images/               # Documentation screenshots
│       ├── stt_overview.png     # STT evaluations list page
│       ├── stt_new.png          # STT new evaluation settings tab
│       ├── stt-dataset.png      # STT dataset upload tab
│       ├── stt_outputs.png      # STT outputs view with metrics
│       └── stt_leaderboard.png  # STT leaderboard with charts
│       # Note: Other guides reference placeholder images that need screenshots
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── layout.tsx         # Root layout with default metadata
│   │   ├── agents/            # Agent management (list + [uuid] detail)
│   │   │   ├── layout.tsx     # Route-specific metadata for page title
│   │   │   └── [uuid]/layout.tsx  # Detail page metadata
│   │   ├── tools/             # Tools management (each route has layout.tsx)
│   │   ├── stt/               # Speech-to-Text evaluation (list + new + [uuid] detail)
│   │   │   ├── layout.tsx     # "Speech to Text | Calibrate"
│   │   │   ├── page.tsx       # List of STT evaluation jobs
│   │   │   ├── new/           # Create new STT evaluation (has layout.tsx)
│   │   │   └── [uuid]/        # View STT evaluation results (has layout.tsx)
│   │   ├── tts/               # Text-to-Speech evaluation (list + new + [uuid] detail)
│   │   │   ├── layout.tsx     # "Text to Speech | Calibrate"
│   │   │   ├── page.tsx       # List of TTS evaluation jobs
│   │   │   ├── new/           # Create new TTS evaluation (has layout.tsx)
│   │   │   └── [uuid]/        # View TTS evaluation results (has layout.tsx)
│   │   ├── tests/             # Tests page (has layout.tsx)
│   │   ├── personas/          # User persona definitions (has layout.tsx)
│   │   ├── scenarios/         # Test scenario definitions (has layout.tsx)
│   │   ├── metrics/           # Evaluation metrics (has layout.tsx)
│   │   ├── simulations/       # End-to-end simulation testing (has layout.tsx)
│   │   ├── human-labelling/   # Hub (?tab=overview|tasks|annotators); tasks/[uuid], jobs/[token], annotators/[uuid], evaluator-runs/[runUuid]
│   │   ├── page.tsx           # Landing page (marketing: hero eyebrow + pitch, features, integrations, community, etc.)
│   │   ├── login/             # Login page with email/password and Google OAuth (has layout.tsx)
│   │   ├── signup/            # Signup page with registration form and password validation (has layout.tsx)
│   │   └── api/auth/          # NextAuth.js route handlers
│   ├── components/
│   │   ├── agent-tabs/        # Agent detail tab components
│   │   ├── evaluations/       # Evaluation UI components
│   │   ├── human-labelling/   # Labelling dialogs, AnnotationJobView, `AgreementStatCard` (task Overview + eval-run human agreement strip), bulk-upload shell + shared types (`bulk-upload-shared.tsx`, e.g. `AnnotatedCheckResult`)
│   │   ├── charts/            # Recharts visualization components
│   │   ├── icons/             # Shared SVG icon components
│   │   ├── landing/           # Marketing-only UI (`IntegrationLogoMarquee`, `AboutMarketingSection`, etc.)
│   │   ├── providers/         # React context providers (SessionProvider, FloatingButtonProvider)
│   │   ├── simulation-tabs/   # Simulation detail components
│   │   ├── test-results/      # Shared test result components
│   │   └── ui/                # Reusable UI components (Button, SearchInput, etc.)
│   ├── constants/             # Static configuration data
│   │   ├── inbuilt-tools.ts   # Built-in tool definitions
│   │   ├── limits.tsx         # Usage limits, contact link, and showLimitToast helper
│   │   ├── links.ts           # `WHATSAPP_INVITE_URL`, `ARTPARK_WEBSITE_URL` — shared outbound links
│   │   └── polling.ts         # POLLING_INTERVAL_MS (3000ms) - shared polling interval
│   ├── hooks/                 # Custom React hooks
│   │   ├── index.ts           # Re-exports all hooks
│   │   ├── useCrudResource.ts # CRUD operations hook for resource pages
│   │   ├── useAccessToken.ts  # Unified auth token hook (useAccessToken, useAuth)
│   │   ├── useMaxRowsPerEval.ts # Fetches user-specific max rows per eval from backend API (module-level cached)
│   │   └── useOpenRouterModels.ts # Fetches LLM models from OpenRouter API with 10-min cache
│   ├── lib/                   # Utility libraries (api.ts, status.ts, etc.)
│   ├── auth.ts               # NextAuth.js configuration
│   └── middleware.ts         # Route protection middleware
```

---

## Architecture Patterns

### Responsive Design Architecture

The entire Calibrate application is fully responsive and works seamlessly across mobile, tablet, and desktop devices. This is a fundamental architectural decision that affects all pages and components.

**Key principles:**

1. **Mobile-First Approach**: All pages and components start with mobile styles and progressively enhance for larger screens using Tailwind's `md:` (768px) and `lg:` (1024px) breakpoints.

2. **No Viewport Blocking**: Unlike earlier versions that used a `MobileGuard` component to block mobile access, the current app is fully functional on all screen sizes. The `MobileGuard` component has been removed.

3. **AppLayout Responsive Behavior**:

   - **Sidebar**: Hidden by default on mobile (appears as full-screen overlay), always visible on desktop
   - **Header**: Shows hamburger menu on mobile, regular navigation on desktop
   - **Content**: Responsive padding throughout (`px-4 md:px-6 lg:px-8`)

4. **Adaptive Layouts**:

   - **Desktop**: Tables, multi-column layouts, expanded spacing
   - **Mobile**: Card-based layouts, stacked columns, compact spacing
   - **Touch-Friendly**: Minimum button height of 36px (`h-9`) for mobile usability

5. **Consistent Patterns**:
   - Typography scales: `text-xl md:text-2xl` for headings, `text-base md:text-lg` for subheadings, `text-sm md:text-base` for body text
   - Component sizing: `h-9 md:h-10` for buttons/inputs
   - Spacing: **`space-y-4 md:space-y-6`** is the standard for all page containers and sections (never use fixed `space-y-6`), `gap-4 md:gap-6` for grid gaps, `mb-3 md:mb-4` for section margins
   - Tables convert to cards on mobile using `hidden md:block` and `md:hidden` patterns
   - Chart grids stack on mobile: `grid-cols-1 md:grid-cols-2`

**All responsive patterns are documented in `.cursor/rules/design.md`** under the "App-Specific Responsive Patterns" section. Refer to this document for detailed implementation guidelines.

**Dependencies affected:**

- **Removed**: `src/components/MobileGuard.tsx` (no longer needed)
- **Updated**: All page components, `AppLayout.tsx`, and all dialogs/sidebars for responsive behavior
- **Pattern established**: List pages, detail pages, dialogs, sidebars, and empty states all follow consistent responsive patterns
- **Dialog components updated**: `DeleteConfirmationDialog`, `NewSimulationDialog`, `RunTestDialog`, `AddToolDialog`, `AddTestDialog`, `BulkUploadTestsModal`, and all inline sidebars (personas, scenarios, metrics)

**Gotchas:**

- Always test both mobile and desktop views when making changes
- Use `md:` breakpoint as the primary switch between mobile and desktop layouts
- Preserve desktop UI while adding mobile optimizations (don't break existing desktop experience)
- Tab navigation should use `overflow-x-auto` and `whitespace-nowrap` for mobile horizontal scrolling
- Action buttons in headers should use `flex-shrink-0` to prevent squishing
- **Overlay elements** (like mobile sidebar) must use solid backgrounds (`bg-background`), not semi-transparent ones (`bg-muted/30`), to prevent content showing through
- **Mobile overlay navigation**: Navigation items in mobile overlays (like sidebar) should auto-close the overlay on click for better UX. Use `window.innerWidth < 768` check in `onClick` handlers to apply mobile-only behavior
- **Sidebars must be full-width on mobile**: Always use `w-full md:w-[40%]` pattern, never use percentage width alone. Min-width constraints should only apply on desktop (`md:min-w-[500px]`)
- **Border patterns for sidebars**: Left border should only appear on desktop (`md:border-l`), not on mobile where sidebar is full-width
- **Dialog mobile margins**: Centered dialogs need `p-4` outer container or `mx-4` on dialog element for breathing room on mobile edges
- **Never skip mobile variants**: Fixed sizes like `h-10`, `text-lg`, `p-6`, `space-y-6`, `gap-6` must always have mobile variants (`h-9 md:h-10`, `text-base md:text-lg`, `p-4 md:p-6` or `p-5 md:p-6`, `space-y-4 md:space-y-6`, `gap-4 md:gap-6`)
- **Checkbox sizing in dialogs**: Use responsive sizing (`w-5 h-5 md:w-6 md:h-6` with matching icon sizes `w-3 h-3 md:w-4 md:h-4`)
- **Info boxes in dialogs**: Use responsive padding (`px-3 md:px-4`, `py-2.5 md:py-3`) and gaps (`gap-2 md:gap-3`)
- **Dialog content spacing**: Always use `space-y-3 md:space-y-4` or `space-y-4 md:space-y-6` for vertical spacing, never fixed `space-y-4` or `space-y-6`

### Shared Landing Components

The landing page (`/`), login page, and signup page use shared header/footer components to avoid duplication:

**`LandingHeader`** (`src/components/LandingHeader.tsx`):

- Props: `showLogoLink` (boolean, whether logo links to `/`), `talkToUsHref` (string, defaults to `#join-community`)
- Contains: Logo, "Documentation" text link (tertiary), GitHub icon button, "Talk to us" button (outlined/secondary), "Login" button (filled/primary, links to `/login`)
- Uses Next.js `Link` component for navigation (no longer uses `signIn` from next-auth)
- **GitHub icon button**: Icon-only link to `https://github.com/artpark-sahai-org/calibrate`, opens in new tab, positioned between "Documentation" and "Talk to us", uses inline SVG with responsive sizing (`w-5 h-5 md:w-6 md:h-6`)
- **Responsive behavior**:
  - Nav padding is responsive (`px-4 md:px-8`) so the header fits small screens without crowding
  - Logo and brand text scale with breakpoints (smaller icon + `text-lg` on mobile, `text-xl` on desktop)
  - "Documentation" link is **hidden on the smallest screens** (`hidden sm:inline-block`) to leave room for the CTAs
  - "Talk to us" button is **hidden on mobile** (`hidden sm:inline-block`) to reduce header clutter on small screens
  - "Login" button uses smaller text/padding on mobile (`text-sm`, tighter `px`) and scales up on `md+`

**`LandingFooter`** (`src/components/LandingFooter.tsx`):

- **`"use client"`** (uses `new Date()` for copyright year in JSX)
- No props - self-contained with all links and constants
- **Layout**: **`grid grid-cols-1 md:grid-cols-2`** (**Resources** \| **Community**); each column uses **`border-l border-gray-300 pl-6 md:pl-8`**; **`py-10 md:py-16`**, **`text-gray-500`**, top **`border-t border-gray-200`**, **`bg-gray-50`**
- Imports **`WHATSAPP_INVITE_URL`** from **`@/constants/links`**
- **Resources**: **Documentation** (`NEXT_PUBLIC_DOCS_URL`), **CLI** (`${NEXT_PUBLIC_DOCS_URL}/cli/overview`), **Privacy Policy** (hosted Google Doc), **Terms of Service** (hosted Google Doc) — **`Privacy`** and **`Terms`** use **`target="_blank"`** + **`rel="noopener noreferrer"`**; docs/CLI inherit default navigation (typically same tab unless users cmd-click)
- **Community**: WhatsApp (`WHATSAPP_INVITE_URL`) and LinkedIn (`https://linkedin.com/company/artpark`, hardcoded—not in **`links.ts`**) — both **`target="_blank"`** + **`rel="noopener noreferrer"`**
- **No Company column**: the old **`md:grid-cols-3`** **Company | Resources | Community** footer is obsolete. **Privacy** and **Terms** now sit under **Resources**. There is **no** footer link to **`/about`** — **`GET /about`** is handled in **`middleware.ts`** with a redirect to **`/#about-calibrate`** (legacy bookmarks); the live About copy is **`AboutMarketingSection`** on **`/`**. **Removed historically**: standalone **ARTPARK @ IISc / GoK** footer attribution (hero eyebrow remains canonical).

### Landing Page (`/`)

The root page serves as a marketing-style landing page with a consistent light theme throughout:

**Layout (top to bottom):**

1. **Navigation bar**: Uses `<LandingHeader />` component with "Login" button linking to `/login`
2. **Hero section**: An **eyebrow line** (muted, small type) sits **above** the hero `<h1>` to convey institutional credibility before the pitch—see **Hero eyebrow** below. Then the large responsive headline (**“AI evaluation” / “platform for NGOs”**, with an intentional `<br />` inside the `<h1>`) and muted subtitle about ML researchers / best practices (no hero CTA; primary actions live in `<LandingHeader />`). Heading scales from `text-4xl` (mobile) to `text-6xl` (`md+`). A **launch video** embed (YouTube `…/_VS8KQbBxKs`, autoplay+mute query params, 16:9, rounded iframe) **exists in source but is commented out** below the subtitle in `src/app/page.tsx`; uncomment that block if marketing ships the clip again—while commented, visitors do **not** see a video in the hero.
3. **Feature Tabs section**: Tab switcher with feature previews
4. **Open source — procurement & trust**: **“Proudly open source”** headline plus a **no-paywall / dogfooding** tagline, then a **four-tile** procurement-diligence grid, then one **dark GitHub button** linking to the Calibrate repo — `bg-gray-50`, `border-y` — **see dedicated subsection**. Placement is **before** integrations.
5. **Integrations section** (`bg-white`): Headline “Works with any AI agent stack” and subtitle about major models (both in `max-w-5xl mx-auto text-center`), then **`<IntegrationLogoMarquee />`** (full-width strip, **outside** the headline wrapper), then the primary CTA row (“See all integrations” to docs integrations) in `max-w-5xl` with `mt-8 md:mt-10` — infinite horizontal **logo + name chips** from **`src/components/landing/IntegrationLogoMarquee.tsx`**
6. **Community section** (`bg-gray-50`): WhatsApp bordered CTA plus **calendar CTA** (`https://cal.com/amandalmia/30min`; label in source may read **“Let's talk”** or **“Book a demo”**) laid out in **one horizontal row** (`flex flex-row flex-wrap items-center justify-center gap-3 md:gap-4` on `src/app/page.tsx`); buttons can **wrap to two lines** on very narrow widths instead of overflowing. Has `id="join-community"` for anchor linking (`LandingHeader` "Talk to us" defaults here). No Twitter/X links in this section—LinkedIn appears only in the footer Community column.
7. **Team** (`bg-white`): **`AboutMarketingSection`** — **landing-only** (no **`/about`** page). Outer shell **`id="about-calibrate"`** + **`scroll-mt-20`**, inner **`max-w-5xl mx-auto`**, **between** Community and **Get Started**. Deep link **`/#about-calibrate`**. **`GET /about`** **redirects** in **`middleware.ts`** to **`/#about-calibrate`** for legacy links.
8. **Get Started section** (`bg-gray-50`): Two-column card layout with CTAs (**headline in source**: *“Start Calibrating today”*)
9. **Final CTA section**: Dark background (`bg-gray-900`) with "Ready to get started?" headline and "Get started free" button linking to `/login`
10. **Footer**: Two-column **`LandingFooter`** (**Resources**, **Community**) in **`md:grid-cols-2`** + copyright (`bg-gray-50`)

**Hero eyebrow** (`src/app/page.tsx`, inside the centered hero stack above the `<h1>`):

- **Why**: Trust framing before the headline—Artpark linkage (with official site outbound), IISc framing, Karnataka funding, open source—in one line above the `<h1>`. **Typography hierarchy**: **BUILT BY** and **FUNDED BY** are **quiet labels** (`text-gray-400 font-normal`) so **ARTPARK** (link), **`@ IISc`**, **GOVERNMENT OF KARNATAKA** (**semibold**), and the **open-source pill** read as the **scannable** anchors—matching the earlier “dampen lead-in / emphasize entity” treatment for GoK vs “funded by”.
- **What**: Single `<p>` with structure **BUILT BY** in a muted **`<span className="text-gray-400 font-normal">`** (same treatment as **FUNDED BY**) → **linked ARTPARK block** (`<a>` …): **`<span>ARTPARK</span>`** then **`/artpark-mark.webp`** `<img>` — then **`@ IISc ·`** → **`FUNDED BY`** in **`<span className="text-gray-400 font-normal">`** → **`GOVERNMENT OF KARNATAKA`** in **`font-semibold text-gray-800 tracking-wide`** → middot → **open-source pill** **`<span>`**: `rounded-md border border-emerald-200/90 bg-emerald-50/90`, compact padding, **`uppercase`** + **`tracking-wider`** + **`font-semibold text-emerald-950`** (pill-only uppercase — body text **Open source** in JSX becomes **OPEN SOURCE** visually). The mark stays **decorative** `alt=""`.
- **Styling**: Eyebrow `<p>` uses `text-[11px] md:text-[13px]`, **`font-medium`**, **`text-gray-500`**, `tracking-wide`, `text-balance`, `leading-snug`, `max-w-2xl mx-auto`, `mb-3 md:mb-4` (unwrapped runs like **`@ IISc ·`** and middots inherit this **gray-500** + **medium** weight). **Quiet labels** override with **`text-gray-400 font-normal`**. ARTPARK `<a>` remains **`inline`** with `text-inherit`, underline/decoration, hover to darker gray (`cursor-pointer`, `mx-0.5`); `<img>` **`inline-block`**, **`align-[-0.2em]`**, **`object-contain`**, **`ml-1`**, size caps **`max-h-[14px] max-w-[14px] md:max-h-4 md:max-w-4`**, **`h-[1.05em] w-[1.05em]`** — **no `rounded-sm`** on the mark. **Open source** pill: `inline-block align-baseline`, `rounded-md`, `px-1.5 py-0.5`, `text-[10px] md:text-[11px]`, `font-semibold uppercase tracking-wider`, `text-emerald-950`, `border border-emerald-200/90 bg-emerald-50/90`, `shadow-[0_1px_0_rgba(0,0,0,0.04)]` so it **pops** without dominating the hero.
- **Relationship**: **Single placement** for ARTPARK / IISc / GoK / open-source positioning on the public shell still holds for **body copy**: `LandingFooter` does **not** repeat the old attribution block—but the eyebrow is no longer purely plain text because of the outbound ARTPARK link + mark. Coordinate marketing/legal if footer or eyebrow copy changes again.
- **Gotcha**: Do **not** wrap the whole eyebrow (including **@ IISc**) in Tailwind **`uppercase`** / CSS **`text-transform: uppercase`**—it would corrupt **IISc** → **IISC**. **`uppercase`** is **only** on the **open-source pill** `<span>`, not on the whole `<p>`. Keep **`@ IISc`** as a literal JSX string; the **`ARTPARK`** link label stays uppercase by choice. If the institutional site URL changes, update **`ARTPARK_WEBSITE_URL`** only (`links.ts`). **`inline-flex`/`items-center` + icon before the word** was dropped: use **`inline` + `<span>` + `inline-block`** on the **`img`** with **`align-[-0.2em]`** so the favicon aligns with eyebrow caps and **reading order stays “ARTPARK” then mark**.
- **Dependencies**: **`ARTPARK_WEBSITE_URL`** in `links.ts`; static **`public/artpark-mark.webp`**. No npm packages beyond existing stack.

**Feature Tabs:**

- Tabs: "Speech to text", "LLM Tests", "Text to speech", "Simulations"
- State managed via `useState` with `activeTab` (default: "stt")
- Tab data defined as array: `{ id, label, headingBold, headingLight, description, images }` where `images` is an array of image paths
- **Desktop behavior** (`md+`): Tab switcher visible (`hidden md:flex`), clicking tabs switches content via state, two-column layout with sticky text
- **Mobile behavior** (below `md`): Tabs completely hidden, all four sections rendered stacked in a single scrollable flow (`md:hidden space-y-12`), no tab state interaction needed

**Constants:**

- `WHATSAPP_INVITE_URL` and **`ARTPARK_WEBSITE_URL`** — imported from `@/constants/links` (landing `page.tsx` uses both for the Community CTAs and the hero ARTPARK link; `LandingFooter` and `AppLayout` import WhatsApp only)
- **GitHub repo URL** — landing `src/app/page.tsx` defines **`GITHUB_REPO_URL`** (`https://github.com/artpark-sahai-org/calibrate`) for the **open source section’s primary button** only (not `links.ts`). **`LandingHeader`**’s GitHub icon still uses its **own hardcoded** repo URL in **`LandingHeader.tsx`** — keep both in sync if the org/repo moves. **Removed from this page**: module-level **`CALIBRATE_SELF_HOST_README_URL`** / **`CC_BY_SA_LICENSE_URL`** (there is **no** separate self-host or Creative Commons text link under the tiles anymore; those destinations are reached via the **repo** after clicking the button, or via **`README.md`** in this repo for the frontend’s own license blurb).

**Feature Section Layout:**

- **Container**: Full width with responsive padding (`px-6 md:px-8 lg:px-12`) - mobile uses `px-6` for comfortable margin from screen edges
- **Desktop tabs** (`md+`): Centered with `max-w-7xl mx-auto`, pill buttons use `px-5 py-2.5 text-sm`, active tab has `bg-white shadow-sm`
- **Desktop grid** (`md+`): `grid-cols-1 lg:grid-cols-[400px_1fr] gap-6 md:gap-8` - two-column on `lg+`
  - **Left column**: Two-tone headline (`text-2xl md:text-3xl lg:text-4xl`) + description, sticky on scroll (`lg:sticky lg:top-8`)
  - **Right column**: Images stacked vertically (`flex-col gap-4`)
- **Mobile layout** (below `md`): All sections shown sequentially (`space-y-12`), each with heading (`text-2xl`), description (`text-sm`), and images
- Static files in `public/`: **`artpark-mark.webp`** (follows hero eyebrow **`ARTPARK`** link text—it is **after** that word inside the `<a>`), **`team/aman.jpeg`** and **`team/jigar.jpeg`** (**AboutMarketingSection** portraits), `logo.svg` (app logo, uses `currentColor`), `logo-dark.svg` (white stroke for dark backgrounds), **`integrations/`** (mirrored raster marks for the landing integrations marquee—see **Integrations Section**), `stt_1.png` to `stt_4.png`, `tts_1.png` to `tts_4.png`, `llm-leaderboard.png`, `llm-output.png`, `simulation-all.png`, `simulation-run.png`

**Integrations Section:**

- **Shell** (`src/app/page.tsx`): **`bg-white py-16 md:py-24 px-4 md:px-8 lg:px-12`** — sits after procurement **`bg-gray-50` + `border-y`**, before Community (`bg-gray-50`).
- **Placement** (`src/app/page.tsx`): Comes **after** the **open source — procurement & trust** block and **before** **Community**. Headline and subtitle in `max-w-5xl mx-auto text-center`; then the marquee as a **sibling** (full width of the section); then the “See all integrations” CTA row in `max-w-5xl` below the marquee (`mt-8 md:mt-10`; docs URL `NEXT_PUBLIC_DOCS_URL` + `/integrations`). Marquee replaces an older integrations **text grid**: marketing is now **logo + label chips** only.
- **Component & wiring**: **`IntegrationLogoMarquee`** (`src/components/landing/IntegrationLogoMarquee.tsx`, `"use client"`). **`INTEGRATION_BRANDS`**: `{ name, slug: string | null, logoUrl? }` (~20 brands). **Custom marks** (all current **`slug: null`** rows) use **`logoUrl`** values that are **root-relative paths** served from **`public/integrations/`**: `cartesia.jpg`, `cohere.png`, `smallest-ai.jpg`, `sarvam.png`, `ai21.webp`, `groq.png`—wired through module constants **`CARTESIA_LOGO_URL`**, **`COHERE_LOGO_URL`**, **`SMALLEST_AI_LOGO_URL`**, **`SARVAM_LOGO_URL`**, **`AI21_LOGO_URL`**, **`GROQ_LOGO_URL`** (e.g. **`/integrations/cartesia.jpg`**). **Why**: bundle the rasters with the app so the marquee does **not** depend on third-party CDNs (PR Newswire, GitHub avatars, Play image hosts, image-search thumbs, mirrors) at runtime. To add or refresh an asset, drop the file under **`public/integrations/`** and point the constant at the path; use a **filename extension that matches the real decode** (some downloads are PNG even if the workflow started as “jpg”). A new **`slug: null`** row **without** **`logoUrl`** still uses **initials**. Slug rows load **Simple Icons** over the network. **`BrandChip`** mapping must **always pass `logoUrl={b.logoUrl}`** (reduced motion + **both** marquee duplicates) or custom paths are ignored.
- **Logo resolution** (`brandImageSrc`): **`logoUrl` first** (today: same-origin **`/integrations/...`**), else **`slug`** → Simple Icons `https://cdn.jsdelivr.net/npm/simple-icons/icons/{slug}.svg`, else **initials** (`brandInitials`). **`onError`** still falls back to initials if a file is renamed or missing. **Contrast gotcha** unchanged: dark plates on **`bg-gray-50`** chips may need a different master file. **Legal / brand**: mirrored files are **vendor marks**—keep usage within each company’s guidelines when replacing sources.
- **Assets & tooling**: Plain **`<img>`** with **`@next/next/no-img-element`** disabled for both **remote Simple Icons SVGs** and **local integration rasters**. **`next/image`** is still not required for these chip icons. **Runtime deps**: **jsDelivr Simple Icons** for slug rows only; **custom chips** resolve from **`public/`** (no extra remote hop). **Stale mirror**: promotional artwork can age out—re-copy from official press kits when marketing asks rather than trusting old scrapes indefinitely.
- **A11y**: Animated marquee wrapper is **`aria-hidden`** with a **`sr-only`** paragraph listing **`INTEGRATION_NAMES_LIST`** sentence. **`prefers-reduced-motion: reduce`**: **`usePrefersReducedMotion`** swaps to `<section aria-label="Supported integrations">` and **`flex-wrap`** chips (same props as marquee—still pass **`logoUrl`**).
- **Animation**: Seamless loop by rendering **`INTEGRATION_BRANDS` twice** in one `.integration-marquee-track` (`w-max`); duplicate row uses React keys like `` `${b.name}-dup` ``. CSS **`@keyframes integration-marquee`** in **`globals.css`** translates **0 → -50%** (~48s); edge fade via **`mask-image` / `-webkit-mask-image`** on the overflow wrapper.
- **Chips styling**: `rounded-xl border border-gray-200 bg-gray-50`, `32×32` **`object-contain`** + label `text-sm font-medium whitespace-nowrap`; track gap `gap-10 pr-10 md:gap-14 md:pr-14`.


**Open source — procurement & trust** (`src/app/page.tsx`, comment `{/* Open source — procurement & trust */}`):

- **Why**: One **public** section carries both **product integrity** (“what we ship is what you can inspect—no paywalled ‘real’ version”) and **organizational reassurance** (tiles for infrastructure, seats, auditability, lock-in) before the integrations marquee. Section order stays **trust → provider breadth**.
- **Placement**: **Immediately after** Feature Tabs, **immediately before** Integrations.
- **Shell**: `bg-gray-50`, `border-y border-gray-100`, `py-16 md:py-24 px-4 md:px-8 lg:px-12`. Banding downstream (from **`src/app/page.tsx`**) stays **alternating** from integrations onward: **Integrations** `bg-white`, **Community** `bg-gray-50`, **Team** (`#about-calibrate`) `bg-white`, **Get Started** `bg-gray-50`, then **`bg-gray-900`** **Final CTA**, then **`LandingFooter`** **`bg-gray-50`**. **Gotcha**: Tweaking one section’s **`bg-*`** often means flipping an **adjacent** section so **integrations through get-started** never show **two consecutive** identical light shells (e.g. back-to-back **`bg-white`** without a gray stripe between).
- **Intro** (`max-w-5xl mx-auto text-center`, `mb-10 md:mb-14`): **`<h2>`** — *“Proudly open source”* — `text-3xl md:text-4xl lg:text-[2.5rem] font-medium text-gray-900 mb-3 md:mb-4 leading-[1.15] tracking-[-0.02em] text-balance`. **Lead `<p>`** immediately below: *“What we open-source is what we use ourselves. Nothing hidden behind a paywall.”* — `text-base md:text-lg text-gray-500 max-w-2xl mx-auto text-pretty leading-relaxed`. **Relationship**: **CC BY-SA** and self-host detail are **not** duplicated as extra links here; users get **README / LICENSE** on **GitHub** via the button. The root **`README.md`** in **this** repo still states the frontend’s license for developers cloning the codebase.
- **Tile grid**: `max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6`. Four **cards**: `rounded-2xl border border-gray-200 bg-white p-5 md:p-7 text-left shadow-sm`. Each card: **icon** (`h-10 w-10` rounded-xl `bg-gray-100`, Heroicons-style **stroke** SVGs inlined — **not** a shared component), **`<h3>`** (`text-lg font-semibold`), body (`text-sm md:text-[15px] text-gray-500 leading-relaxed`). **Copy convention**: Tile **bodies** are **short and parallel** — typically **two beats** (no long role lists or multi-clause paragraphs); tuned for CFO/IT **scanning** next to the **Self-hosting** card’s brevity. **Tile themes (headlines + gist)** — verify exact wording in **`page.tsx`**: (1) **Self-hosting** — we help run Calibrate on **your** infra so sensitive data stays in **environments you control**; (2) **No per-seat pricing. Ever.** — no per-user fees as programs grow; no shoving features behind a **higher tier** when headcount rises; (3) **Auditable, end to end** — full **codebase on GitHub** for pre-deploy review and **real** diligence; **IT, funders, boards** get **traceable** answers, not a **black box**; (4) **No vendor lock-in** — **fork, adapt, keep running** if maintenance stops; **evaluations and data** stay **portable** under the **same open license**. **Gotcha**: Headlines and bodies change in marketing passes often; **`page.tsx`** is canonical — this list is a **semantic** map, not a verbatim dump.
- **GitHub CTA** (below tiles): Centered wrapper `max-w-5xl mx-auto mt-10 md:mt-12 flex justify-center`. Single **`<a>`** — **`inline-flex items-center gap-2 md:gap-3`**, **`px-4 md:px-6 py-3 md:py-4`**, **`bg-gray-900 border border-gray-900 rounded-xl`**, **`hover:bg-gray-800`**, **`cursor-pointer`**, `target="_blank"` `rel="noopener noreferrer"`, **`href={GITHUB_REPO_URL}`**. Contents: GitHub **fill** SVG (`w-6 h-6 md:w-8 md:h-8 text-white shrink-0`, `aria-hidden`), **`<span className="text-white text-sm md:text-base font-medium">`** `artpark-sahai-org/calibrate` **`</span>`**, decorative **★** in **`text-gray-400`** with **`aria-hidden`**. **Why**: Restores the **pre–text-link** treatment (one strong repo affordance instead of three underlined middot links). **Pattern**: Same **dark pill** vocabulary as other primary outbound actions on the page (e.g. integrations **See all integrations** uses `bg-gray-900` / `rounded-lg` — open source uses **`rounded-xl`** and icon + repo slug label for GitHub affordance).
- **Gotchas**: Re-adding **self-host** or **license** links requires new constants or `links.ts` entries again — they are **intentionally** not on the landing section today. Header GitHub icon URL remains **separate** from **`GITHUB_REPO_URL`** (see **Constants**).

**Community Section:**

- **ID**: `id="join-community"` with `scroll-mt-20` for nav offset when scrolling
- **Background**: Light gray (`bg-gray-50`) with responsive padding (`py-16 md:py-24 px-4 md:px-8 lg:px-12`) — **alternate** stripe after integrations (`bg-white`) so borders between sections remain visible without extra rules
- **Headline**: `text-3xl md:text-4xl lg:text-5xl`
- **Subtitle**: `text-base md:text-xl`
- **CTA row**: Both actions are sibling `<a>` elements in one flex container (not nested in separate column wrappers). **`flex-row` + `flex-wrap`** keeps them side-by-side at typical breakpoints while allowing wrap on constrained widths (`gap-3 md:gap-4`).
- **WhatsApp**: Bordered/light style (`border border-gray-300 … hover:bg-gray-50`), icon + label, uses `WHATSAPP_INVITE_URL` from `@/constants/links` (green WhatsApp icon), sizing `px-4 md:px-6 py-2.5 md:py-3 text-sm md:text-base`.
- **Book a demo / Let's talk**: Filled black button (`bg-black text-white hover:bg-gray-800`), calendar icon, same responsive padding/type scale as WhatsApp link; opens `https://cal.com/amandalmia/30min` in a new tab (**button label** is whatever marketing sets in **`page.tsx`**)

**Team (`#about-calibrate`, landing only)**

- **Component**: **`AboutMarketingSection`** (`src/components/landing/AboutMarketingSection.tsx`) — **Team** block only (**no** “Our Vision” copy). Wrapper **`text-center`**. **`<h2>`**: `text-3xl md:text-4xl lg:text-5xl font-medium text-gray-900 mb-4 md:mb-6 leading-[1.1] tracking-[-0.02em]` (matches integrations / get-started bands). **Subtitle** (marketing copy in source): *“The people building Calibrate at ARTPARK”* — `text-base md:text-xl text-gray-500 max-w-2xl mx-auto mb-10 md:mb-14`. **Grid**: `grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 max-w-3xl mx-auto text-left` (constrains the two cards under the wide **`max-w-5xl`** page shell). Each member: whole-card **`<a>`** to LinkedIn with **`aria-label`** *“{Name} on LinkedIn”*, **`rounded-2xl border border-gray-200 bg-white p-5 md:p-7 shadow-sm hover:border-gray-300 hover:shadow-md transition-all cursor-pointer`**, **`flex flex-col sm:flex-row sm:items-center gap-4 md:gap-5`**, **`group`**. **`img`**: `/team/aman.jpeg` \| `/team/jigar.jpeg`, **`width`/`height={112}`**, tailwind **`w-24 h-24 sm:w-28 sm:h-28`**, **`rounded-full object-cover bg-gray-200`**, **`mx-auto sm:mx-0`**. **`<h3>`**: `text-lg font-semibold text-gray-900` + **`group-hover:text-gray-700`**. Role line: `text-sm md:text-[15px] text-gray-500 leading-relaxed mt-1`. **Visible** *LinkedIn →* row: **`text-sm font-medium`**, underline-on-hover on the **group** — the **`<p>`** wrapping that row is **`aria-hidden`** so SR users are not announced duplicate link text (the **`aria-label`** on **`<a>`** is sufficient). Plain **`<img>`** (same `@next/next/no-img-element` trade-offs as other landing rasters). Stateless — **no** **`"use client"`** in this file.
- **Landing** (`src/app/page.tsx`): Full-width **`bg-white`** shell with **`id="about-calibrate"`**, **`scroll-mt-20`**, `py-16 md:py-24 px-4 md:px-8 lg:px-12`, inner **`max-w-5xl mx-auto`**.

**Get Started Section:**

- **Background**: Light gray (`bg-gray-50`) with responsive padding (`py-16 md:py-20 px-4 md:px-8 lg:px-12`) — **after** Team (**`bg-white`**) so bands **alternate** before the dark **Final CTA**. **Contrast gotcha**: Outer shell and **column** wrappers both use **`bg-gray-50`**; separation comes from **`border border-gray-200`**, **`rounded-2xl`**, and **`bg-white`** link cards inside each column.

- **Headline**: `text-3xl md:text-4xl lg:text-5xl` with `tracking-[-0.02em]` for tight letter spacing
- **State management**: Uses `getStartedTab` state (`"evaluate" | "learn"`) to control which column is visible on mobile
- **Mobile behavior** (below `md`):
  - Segmented tab switcher (`md:hidden`) with "Evaluate your agent" / "Learn more" pills (same styling as Feature section tabs)
  - Only one column visible at a time, controlled by `getStartedTab` state
  - Hidden column uses `hidden md:block` to show on desktop
- **Desktop behavior** (`md+`): Both columns shown side-by-side, tabs hidden
- **Two-column grid**: `grid-cols-1 md:grid-cols-2 gap-6 md:gap-8` - "Evaluate your agent" (left) and "Learn more" (right)
- **Card containers**: `bg-gray-50 rounded-2xl p-4 md:p-8 border border-gray-200`
- **Section headings**: `text-lg md:text-xl font-semibold mb-4 md:mb-6`
- **Link cards**:
  - White background with subtle border, hover state adds shadow (`hover:border-gray-300 hover:shadow-sm`)
  - Compact spacing on mobile: `gap-3 md:gap-4 p-3 md:p-4`
  - Card spacing: `space-y-3 md:space-y-4` between cards
- **Icons**: SVG icons (speaker, broadcast, checkmark for evaluation; play, book, calendar for learning)
- **Links** (4 per column, sentence case, open in new tab):
  - Evaluate (links to quickstart docs via `NEXT_PUBLIC_DOCS_URL`):
    - Benchmark STT providers → `${NEXT_PUBLIC_DOCS_URL}/quickstart/speech-to-text`
    - Benchmark TTS providers → `${NEXT_PUBLIC_DOCS_URL}/quickstart/text-to-speech`
    - Run LLM tests → `${NEXT_PUBLIC_DOCS_URL}/quickstart/text-to-text`
    - Run simulations → `${NEXT_PUBLIC_DOCS_URL}/quickstart/simulations`
  - Learn more: Watch the demo, Read documentation, Book a demo (`https://cal.com/amandalmia/30min`), Guide to voice agents (`https://voiceaiandvoiceagents.com`)

**Final CTA Section:**

- **Background**: Dark (`bg-gray-900`) with responsive padding (`py-16 md:py-24 px-4 md:px-8 lg:px-12`)
- **Headline**: `text-3xl md:text-4xl lg:text-5xl` white text
- **Subtitle**: `text-base md:text-xl` gray-400 text
- **CTA button**: "Get started free" - `px-6 md:px-8 py-3 md:py-4 text-sm md:text-base` white background, links to `/login`

**Footer:**

Uses `<LandingFooter />` component. See "Shared Landing Components" section above for details.

**Styling Patterns:**

- **Consistent light theme** throughout — alternating **`bg-white`** / **`bg-gray-50`** on full-width **`page.tsx`** section shells from **integrations** onward: **integrations** white → **community** gray-50 → **vision & team** white → **get started** gray-50 → **final CTA** dark → **footer** gray-50. **Get Started** uses **gray-on-gray** column chrome with **white** link cards inside (see **Get Started Section**).
- **DM Sans font** applied via inline style: `style={{ fontFamily: 'var(--font-dm-sans), system-ui, -apple-system, sans-serif' }}`
- **All headlines**: `font-medium text-gray-900 leading-[1.1] tracking-[-0.02em]` for consistent typography
- **Headline casing**: Sentence case across most marketing blocks—**exception**: the hero **eyebrow** mixes **ALL CAPS** lead-in (**BUILT BY** / institution line), link text **ARTPARK**, and a literal **@ IISc** segment that must preserve **IISc** casing (never apply `uppercase` to that slice of the eyebrow — see **Hero eyebrow**).
- **Subtitles**: `text-base md:text-xl text-gray-500`
- **Tabs container**: `inline-flex bg-gray-100 rounded-xl p-1` with active tab having white background and shadow; horizontally scrollable on small screens via `overflow-x-auto`
- **Image containers**: `rounded-xl overflow-hidden shadow-xl` - simple container without fixed aspect ratio
- **Image display**: `w-full h-auto` - images show at full width with natural height (no cropping)
- **Grid borders**: `border-gray-200` for light theme consistency

**Responsive Design (Landing Page):**

The entire landing page is fully responsive. Every section uses a mobile-first approach with Tailwind breakpoints (`md:` at 768px, `lg:` at 1024px). The patterns below apply to all landing page sections and **must be followed for any future landing page changes**:

- **Section padding**: Horizontal padding is context-dependent:
  - Most sections: `px-4 md:px-8 lg:px-12`
  - Feature sections (with images): `px-6 md:px-8 lg:px-12` for better margin from screen edges
  - Vertical padding scales e.g. `py-16 md:py-24`
- **Headlines**: Three-step responsive sizing `text-3xl md:text-4xl lg:text-5xl` (hero uses `text-4xl md:text-6xl`)
- **Subtitles / body text**: `text-base md:text-xl`
- **Buttons**: Smaller padding and font on mobile (`px-4 py-2 text-sm`) scaling to desktop (`md:px-6 md:py-3 md:text-base`)
- **Margins / gaps**: Responsive e.g. `mb-4 md:mb-6`, `gap-3 md:gap-4`, `gap-6 md:gap-8`
- **Line breaks (`<br>`)**: Use `<br className="hidden md:block" />` so text reflows naturally on mobile instead of forcing desktop-specific breaks
- **Tab pills**: Smaller padding on mobile (`px-3 py-2 text-xs`) with `whitespace-nowrap`, container uses `overflow-x-auto` so tabs scroll horizontally on narrow screens
- **Two-column grids**: Use `grid-cols-1 lg:grid-cols-[...]` so columns stack on mobile/tablet and go side-by-side on desktop
- **Card padding**: `p-5 md:p-8` for content cards
- **Footer**: `py-10 md:py-16 px-4 md:px-8 lg:px-12`, column left-padding `pl-6 md:pl-8`
- **Icons**: Scale with breakpoints when needed e.g. `w-6 h-6 md:w-8 md:h-8`

**Key rule**: Never use fixed large values (`px-12`, `py-24`, `text-5xl`) without a smaller mobile default. Always provide the mobile value first, then scale up with `md:` / `lg:`.

### Login Page (`/login`)

Dedicated authentication page for existing users.

**Layout:**

- **Header**: Logo linking to `/`, "Don't have an account? Sign up" link to `/signup`
- **Card**: Centered white card with shadow on gradient background (`from-slate-50 via-white to-emerald-50`)
- **Google OAuth**: "Continue with Google" button at top
- **Divider**: "or continue with email" separator
- **Form fields**: Username, Password
- **Submit button**: "Sign in" (disabled during loading, shows spinner)
- **Terms**: Links to Terms of Service (`/terms`) and Privacy Policy (`/privacy`)
- **Footer link**: "Don't have an account? Create one for free" → `/signup`

**Styling:**

- Gradient background: `bg-gradient-to-br from-slate-50 via-white to-emerald-50`
- Card: `bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 p-8 md:p-10`
- Input focus: `focus:ring-2 focus:ring-emerald-500 focus:border-transparent`
- Accent color: Emerald (`text-emerald-600`, `hover:text-emerald-700`)
- Font: DM Sans via inline style

**API Integration:**

- Calls `POST /auth/login` with `{ email, password }`
- On success: stores `access_token` in localStorage and cookie, redirects to `/agents`
- On error: displays error message in red alert box

### Signup Page (`/signup`)

Registration page for new users.

**Layout:**

- **Header**: Logo linking to `/`, "Already have an account? Sign in" link to `/login`
- **Card**: Same styling as login page
- **Google OAuth**: "Continue with Google" button at top
- **Divider**: "or sign up with email" separator
- **Form fields**: First name + Last name (side by side), Email, Password (with optional strength indicator), Confirm password
- **Submit button**: "Create account" (disabled until all fields are filled and passwords match)
- **Terms**: Links to Terms of Service (`/terms`) and Privacy Policy (`/privacy`)
- **Footer link**: "Already have an account? Sign in instead" → `/login`

**Password Strength Indicator (informational only):**

- Real-time strength indicator with progress bar and label (Weak/Fair/Good/Strong)
- Color coding: red (weak), orange (fair), yellow (good), emerald (strong)
- Requirements checked for scoring:
  - Length: 8+ characters (+1 point), 12+ characters (+1 point)
  - Lowercase letter (+1 point)
  - Uppercase letter (+1 point)
  - Number (+1 point)
  - Special character (+1 point)
- Shows "Missing: ..." feedback when password field is focused
- **Does not block form submission** - users can create accounts with any password strength
- Confirm password field shows red border and error message if passwords don't match

**API Integration:**

- Calls `POST /auth/signup` with `{ first_name, last_name, email, password }`
- On success: stores `access_token` in localStorage and cookie, redirects to `/agents`
- On error: displays error message in red alert box

**CTA Buttons:**

- "Login" - Primary action in header (filled/black style), links to `/login`
- "Get started free" - Primary action in final CTA section (white style on dark background), links to `/login`
- "Documentation" - Header text link (tertiary style, gray text), opens `process.env.NEXT_PUBLIC_DOCS_URL` in new tab; **hidden on very small screens** (`hidden sm:inline-block`)
- "Talk to us" - Header button (outlined/secondary style), scrolls to `#join-community` section

### Authentication Flow

The app supports two authentication methods:
1. **Email/password authentication** via backend API (`POST /auth/login` and `POST /auth/signup`)
2. **Google OAuth** via NextAuth.js v5

**Route Structure:**

- `/` - Landing page (public, marketing page)
- `/login` - Login page with email/password form and Google OAuth
- `/signup` - Registration page with name, email, password
- `/agents` - Main app (requires authentication)

**Middleware** (`src/middleware.ts`) protects routes:

- **Public pages** (no auth check, always accessible): `/` (landing), `/terms`, `/privacy`, `/api/auth/*`, `/debug*`, `/docs*` — plus **`/login`** and **`/signup`** as handled below. **`/about`** is **not** a page: middleware **redirects** it to **`/#about-calibrate`** on the landing page.
- **Auth pages** (`/login`, `/signup`): Accessible to unauthenticated users; authenticated users are redirected to `/agents`
- **Protected pages** (everything else): Unauthenticated users are redirected to `/login`
- **Maintenance mode**: When `MAINTENANCE_MODE=true`, all non-API routes redirect to `/`

**Middleware implementation details:**

- **`/about` legacy URL**: After the **maintenance-mode** early-outs, **`pathname === "/about"`** returns **`NextResponse.redirect(new URL("/#about-calibrate", req.url))`** — handled **outside** the long public-route **`if`** that starts with **`isHomePage`** (so **`/about`** is never a “normal” public document route). Ensures bookmarks and external links hit the **Team** section on **`/`**.
- **Dual auth check**: `isLoggedIn = hasNextAuthSession || hasJwtCookie` - supports both Google OAuth (NextAuth session) and email/password (JWT cookie)
- `hasNextAuthSession` checks `!!req.auth` (NextAuth session)
- `hasJwtCookie` checks `!!req.cookies.get("access_token")?.value` (JWT from email/password login)
- `isHomePage` checks for `/` and is included in the public routes check (not just used for maintenance mode)
- `isAuthPage` combines `isLoginPage` and `isSignupPage` to handle both auth pages uniformly
- Public routes return `NextResponse.next()` early, before any auth checks
- Order matters: **maintenance** → **`/about` redirect** → public routes → auth page redirect for logged-in users → protected route redirect for logged-out users

**Email/Password Auth:**

1. **Login** (`/login`): User enters email and password, form submits to `POST /auth/login`
2. **Signup** (`/signup`): User enters first name, last name, email, password, form submits to `POST /auth/signup`
3. **Password strength indicator**: Shows real-time feedback (weak/fair/good/strong) but does not block submission - purely informational to help users choose better passwords.
4. **Token storage**: On successful auth:
   - JWT token stored in `localStorage` as `access_token`
   - JWT token stored in cookie `access_token` (for middleware to read)
   - User object stored in `localStorage` as `user`
5. **Redirect**: Uses `window.location.href = "/agents"` (hard redirect, not `router.push`) to ensure middleware re-evaluates auth state

**Google OAuth Flow:**

1. **SessionProvider** wraps the app in `layout.tsx` for client-side session access. **FloatingButtonProvider** also wraps the app (inside SessionProvider) to enable the FAB hide/show functionality across all pages

2. **Login/Signup pages** have "Continue with Google" button that triggers `signIn("google")` from next-auth

3. **Backend sync**: On successful Google login, the `jwt` callback sends the Google ID token to `POST /auth/google` on the backend to create/retrieve the user

4. **Session persistence**: NextAuth uses HTTP-only cookies, sessions persist across reloads

**Backend Auth Endpoints:**

- `POST /auth/signup` - Register with first_name, last_name, email, password → returns `{ access_token, token_type, user, message }`
  - Validation: email >= 3 chars, password >= 6 chars
  - Returns 409 Conflict if email already exists
  - Returns 422 for validation errors
- `POST /auth/login` - Login with email, password → returns `{ access_token, token_type, user, message }`
  - Returns 401 Unauthorized for invalid credentials
  - Returns 422 for validation errors
- `POST /auth/google` - Exchange Google ID token for backend JWT (used by NextAuth callback)

**Frontend Validation (matches backend):**

- Email: minimum 3 characters (validated client-side before API call)
- Password: minimum 6 characters (validated client-side before API call)
- Network errors: Shows "Unable to connect to server" message
- 409 on signup: Shows "An account with this email already exists" with suggestion to sign in
- 401 on login: Shows "Invalid email or password"
- 422 errors: Parses and displays validation messages from backend

**Session properties available:**

- `session.user` - Google user info (name, email, image)
- `session.idToken` - Google ID token
- `session.accessToken` - Google access token
- `session.backendUser` - Full response from backend `/auth/google` endpoint
- `session.backendAccessToken` - JWT access token from backend (used for API authentication)

**Backend `/auth/google` response structure:**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "uuid": "550e8400-e29b-41d4-a716-446655440000",
    "first_name": "John",
    "last_name": "Doe",
    "email": "john@example.com",
    "created_at": "2025-01-15T10:30:00",
    "updated_at": "2025-01-15T10:30:00"
  },
  "message": "Login successful"
}
```

**Accessing user data:**

For **Google OAuth** users (via NextAuth session):
- **User UUID:** `(session as any)?.backendUser?.user?.uuid`
- **JWT Token:** `(session as any)?.backendAccessToken`

For **Email/Password** users (via localStorage):
- **User object:** `JSON.parse(localStorage.getItem("user") || "{}")` - contains `{ uuid, first_name, last_name, email, created_at, updated_at }`
- **JWT Token:** `localStorage.getItem("access_token")`

**Unified Access Token Hook (Recommended):**

Use the `useAccessToken` hook from `@/hooks` to get the JWT token regardless of auth method:

```tsx
import { useAccessToken } from "@/hooks";

// Gets token from NextAuth session OR localStorage automatically
// Returns null while NextAuth session is loading (prevents stale localStorage tokens from racing ahead)
// Returns string | null
const accessToken = useAccessToken();

// Use in API calls
useEffect(() => {
  if (!accessToken) return;
  // Make API calls with accessToken
}, [accessToken]);
```

**Alternative: useAuth hook** for more control:

```tsx
import { useAuth } from "@/hooks";

const { isAuthenticated, isLoading, accessToken } = useAuth();
// isLoading: true while checking both NextAuth session and localStorage
// isAuthenticated: true if either auth method has a token
// accessToken: the JWT token string or null
```

**Legacy pattern (DO NOT USE for new code):**

```tsx
// DEPRECATED - only works for Google OAuth, not email/password login
import { useSession, signOut } from "next-auth/react";

const { data: session, status } = useSession();
const backendAccessToken = (session as any)?.backendAccessToken;
// Use useAccessToken() hook instead!
```

**Sign out / Logout (clears all auth state):**

```tsx
// Must clear localStorage, cookie, AND call signOut
localStorage.removeItem("access_token");
localStorage.removeItem("user");
document.cookie = "access_token=; path=/; max-age=0; SameSite=Lax";
await signOut({ callbackUrl: "/login" });
```

**Server-side auth check:**

```tsx
import { auth } from "@/auth";
const session = await auth();
```

### Page Structure

All pages follow a consistent structure:

- Use `"use client"` directive (client components)
- Wrap content in `AppLayout` for sidebar navigation
- Use `useSidebarState()` hook from `@/lib/sidebar` for sidebar state management
- Use `useRouter` for navigation

```tsx
import { useSidebarState } from "@/lib/sidebar";

export default function ExamplePage() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useSidebarState();

  return (
    <AppLayout
      activeItem="page-name"
      onItemChange={(itemId) => router.push(`/${itemId}`)}
      sidebarOpen={sidebarOpen}
      onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
    >
      {/* Page content */}
    </AppLayout>
  );
}
```

**AppLayout Props:**

- `activeItem`: Current nav item ID for highlighting
- `onItemChange`: Callback when nav item clicked
- `sidebarOpen` / `onSidebarToggle`: Sidebar collapse state
- `customHeader`: Optional React node for custom header content (left side of header bar)
- `headerActions`: Optional React node for action buttons beside user profile dropdown (right side of header bar)

**Sidebar State Hook (`src/lib/sidebar.ts`):**

The `useSidebarState()` hook manages sidebar open/closed state with proper SSR hydration:

```tsx
export const useSidebarState = (): [
  boolean,
  React.Dispatch<React.SetStateAction<boolean>>
] => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!initialized) {
      const isDesktop = window.innerWidth >= 768;
      setSidebarOpen(isDesktop);
      setInitialized(true);
    }
  }, [initialized]);

  return [sidebarOpen, setSidebarOpen];
};
```

**Why this pattern:**

1. **Hydration safety**: Initializes as `false` on both server and client to prevent React hydration mismatch errors
2. **Responsive default**: After mount, sets sidebar open on desktop (≥768px), closed on mobile
3. **No animation flash**: AppLayout has no transition animations on the sidebar, so state changes are instant
4. **Centralized logic**: Single source of truth in `@/lib/sidebar.ts` - no duplicate code across pages
5. **Persistence during navigation**: Sidebar state is managed per-page, but the hook ensures consistent behavior

**Important**: Never use `typeof window !== 'undefined'` checks in `useState` initializers - this causes hydration mismatches because server renders with one value while client renders with another.

**Responsive behavior (AppLayout):**

The entire application is fully responsive and works on mobile, tablet, and desktop devices. AppLayout implements responsive behavior as follows:

**Sidebar:**

- **Mobile** (below 768px): Hidden by default, appears as full-screen overlay when toggled
  - Uses `fixed md:relative z-40 h-full` for overlay positioning
  - Semi-transparent backdrop (`bg-black/50 z-30 md:hidden`) appears when sidebar is open
  - Clicking backdrop closes the sidebar
  - **Auto-close on navigation**: Clicking any sidebar navigation item automatically closes the sidebar (checked via `window.innerWidth < 768`)
  - Solid background (`bg-background`) ensures content behind overlay is not visible
- **Desktop** (768px+): Visible by default, toggleable between expanded (260px) and collapsed (56px) states
  - Navigation clicks do NOT close the sidebar (desktop expected behavior)
- **Styling**: Uses `bg-background` for solid, theme-aware background color
  - Border: `border-r border-border` for right edge separation
  - **No transitions**: Sidebar width changes are instant (no `transition-all duration-200`) to prevent animation flicker during page navigation
- **Navigation behavior**: All navigation items (`Link` components and external Documentation link) have `onClick` handlers that check viewport width and close sidebar on mobile

**Header:**

- **Mobile**: Shows hamburger menu button (left side) to toggle sidebar, hides `customHeader` content
  - Hamburger button: `md:hidden` with menu icon
- **Desktop**: Hides hamburger button, shows `customHeader` content normally
  - Hamburger button: `hidden`
- **Padding**: Responsive `px-4 md:px-6` for comfortable mobile spacing

**Content Area:**

- Responsive horizontal padding: `px-4 md:px-6 lg:px-8` for progressive spacing
- Content is fully accessible and functional on all screen sizes
- No viewport blocking or "use a laptop" messages - all features work on mobile

**"Talk to Us" Floating Action Button (FAB):**

- Rendered inside `AppLayout`, so it appears on all authenticated pages (not on public pages like landing, login, or signup)
- **Position**: Fixed bottom-right corner (`fixed bottom-6 right-6 z-50`)
- **Button**: 48×48px circle (`w-12 h-12 rounded-full`), uses `bg-foreground text-background` (theme-aware), shows a chat bubble icon (three dots in a circle)
- **Open state**: Icon changes to an X (close icon), button color changes to `bg-muted-foreground`
- **Popup**: Appears above the FAB (`absolute bottom-14 right-0`), 224px wide (`w-56`), rounded card with border and shadow
  - "Join WhatsApp" — green WhatsApp icon, uses `WHATSAPP_INVITE_URL` from `@/constants/links` (same URL as landing Community section); opens in a new tab (`target="_blank"` `rel="noopener noreferrer"`)
- **State**: `talkToUsOpen` boolean state, toggled by clicking the FAB
- **Click-outside**: Uses a `talkToUsRef` ref with the same `mousedown` click-outside handler that manages the profile dropdown
- **Hidden when dialogs open**: The FAB automatically hides when any dialog, sidebar, or modal is open. This uses a global context provider (`FloatingButtonProvider`) that tracks a hide count. Any component can call the `useHideFloatingButton(isOpen)` hook to participate in this behavior:
  
  ```tsx
  import { useHideFloatingButton } from "@/components/AppLayout";
  
  function MyDialog({ isOpen }: { isOpen: boolean }) {
    useHideFloatingButton(isOpen); // FAB hides when isOpen is true
    // ... rest of component
  }
  ```
  
  - **Provider location**: `FloatingButtonProvider` is in the root layout (`src/app/layout.tsx`), wrapping the entire app
  - **Hook export**: `useHideFloatingButton` is exported from `@/components/AppLayout` for convenience (re-exported from the provider)
  - **Components using this**: All dialog components (`AddToolDialog`, `AddTestDialog`, `DeleteConfirmationDialog`, etc.), slide panels (`SlidePanel`), and page-level sidebars (personas, scenarios, metrics add/edit sidebars, simulation transcript dialogs)
  - **How it works**: Uses a counter-based system — multiple dialogs can be open, and the FAB only shows when the count is 0

**Key difference from public pages**: The landing page (`/`), login page (`/login`), and signup page (`/signup`) do not use `AppLayout`, so they have their own responsive behavior defined separately (see Landing Page, Login Page, and Signup Page sections).

### List Page Content Structure

List pages (Agents, Simulations, Personas, Scenarios, Tools, Tests, Metrics, STT, TTS) follow a consistent responsive structure inside `AppLayout`:

```tsx
<div className="space-y-4 md:space-y-6 py-4 md:py-6">
  {/* Header - responsive flex layout */}
  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
    <div>
      <h1 className="text-xl md:text-2xl font-semibold">Page Title</h1>
      <p className="text-muted-foreground text-sm md:text-base leading-relaxed mt-1">
        Description of what this page shows
      </p>
    </div>
    <button
      onClick={handleAdd}
      className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer flex-shrink-0"
    >
      Add item
    </button>
  </div>

  {/* Search input - responsive sizing */}
  <div className="relative max-w-md">
    <input className="w-full h-9 md:h-10 pl-10 pr-4 rounded-md text-sm md:text-base..." />
  </div>

  {/* Total item count - shown above table when items exist */}
  {items.length > 0 && (
    <p className="text-sm text-muted-foreground">
      {items.length} {items.length === 1 ? "item" : "items"}
    </p>
  )}

  {/* Content: Loading / Error / Empty / Desktop Table / Mobile Cards */}
  {isLoading ? (
    <LoadingState />
  ) : error ? (
    <ErrorState /> {/* Responsive padding: p-8 md:p-12 */}
  ) : items.length === 0 ? (
    <EmptyState /> {/* Responsive padding: p-8 md:p-12 */}
  ) : (
    <>
      {/* Desktop Table View */}
      <div className="hidden md:block border border-border rounded-xl overflow-hidden">
        {/* Table with header and rows */}
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {items.map((item) => (
          <div key={item.id} className="border border-border rounded-lg overflow-hidden bg-background">
            <div className="p-4 cursor-pointer">{/* Item content */}</div>
            <div className="flex items-center gap-2 px-4 pb-3 pt-0">{/* Action buttons */}</div>
          </div>
        ))}
      </div>
    </>
  )}
</div>
```

**Key responsive layout rules:**

- **Container**: `space-y-4 md:space-y-6` for progressive vertical spacing, `py-4 md:py-6` for top/bottom padding
- **Header layout**:
  - Mobile: Stacks vertically (`flex-col`)
  - Desktop: Horizontal with space-between (`sm:flex-row sm:justify-between`)
  - Action button uses `flex-shrink-0` to prevent squishing
- **Typography scaling**:
  - Page title: `text-xl md:text-2xl`
  - Description: `text-sm md:text-base`
- **Component sizing**:
  - Buttons: `h-9 md:h-10`, `text-sm md:text-base`
  - Input fields: `h-9 md:h-10`, `text-sm md:text-base`
- **Table vs Cards**:
  - Desktop (768px+): Traditional table layout with `hidden md:block`
  - Mobile (below 768px): Card-based layout with `md:hidden`, cards in `space-y-3`
  - For pages with simpler lists (e.g., Agents), mobile sort button appears separately above cards
- **Item count above table**: Every list page and agent tab with a table shows the total item count as plain muted text (`text-sm text-muted-foreground`) right above the table. Uses the unfiltered total (e.g., `items.length`, not `filteredItems.length`) with proper singular/plural (e.g., "1 agent", "12 agents", "1 criterion", "3 criteria"). Applied to: Agents, Simulations, Personas, Scenarios, Tools, Tests, Metrics, STT evaluations, STT datasets, TTS evaluations, TTS datasets, and agent detail tabs (Tests, Tools, Evaluation criteria, Data extraction fields).
- **Empty/Error states**: Responsive padding `p-8 md:p-12`, icon sizing `w-12 h-12 md:w-14 md:h-14`

This responsive pattern applies to: Agents, Simulations, Personas, Scenarios, Tools, Tests (LLM Evaluation), Metrics, STT, and TTS list pages.

**Mobile-specific patterns:**

- Mobile cards include both content and action buttons in a single card
- Action buttons in mobile cards use `flex-1` for equal width distribution
- Sort controls (when needed) appear as a separate mobile-only button above the card list

**Enhanced Mobile Card Design Pattern** (implemented in STT and TTS evaluations, can be adopted for other list pages):

For pages where visual hierarchy and engagement are important, use this enhanced card pattern:

```tsx
<Link
  href={`/path/${item.id}`}
  className="block border border-border rounded-xl overflow-hidden bg-background hover:shadow-lg hover:border-foreground/20 transition-all duration-200"
>
  <div className="p-5">
    {/* Header section with prominent badges */}
    <div className="flex flex-wrap gap-2 mb-4">
      <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-semibold bg-foreground/5 text-foreground border border-foreground/10">
        Badge Label
      </span>
    </div>

    {/* Status or key indicator */}
    <div className="mb-4">
      <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-semibold ...">
        Status
      </span>
    </div>

    {/* Icon-based detail rows */}
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center">
          {/* Icon SVG */}
        </div>
        <div className="flex-1">
          <p className="text-xs text-muted-foreground mb-0.5">Label</p>
          <p className="text-sm font-medium text-foreground">Value</p>
        </div>
      </div>
      {/* Repeat for other details */}

      {/* Optional: Last detail with visual separator */}
      <div className="flex items-center gap-3 pt-2 border-t border-border/50">
        {/* Same structure as above */}
      </div>
    </div>
  </div>
</Link>
```

**Enhanced card styling features:**

- `rounded-xl` corners (more modern than `rounded-lg`)
- `p-5` padding (more spacious than `p-4`)
- Hover effects: `hover:shadow-lg` + `hover:border-foreground/20` for depth
- `transition-all duration-200` for smooth interactions
- Prominent badges with `px-3 py-1.5`, `font-semibold`, subtle borders and backgrounds
- Icon containers: `w-8 h-8 rounded-lg bg-muted/50` with centered icons
- Clear label/value hierarchy: labels are `text-xs text-muted-foreground`, values are `text-sm font-medium`
- Optional visual separation with `pt-2 border-t border-border/50` for last item
- `space-y-3` between detail rows for comfortable spacing

### Detail Page Header Pattern

Detail pages place navigation and actions in the header bar using `customHeader` and `headerActions`:

**Preferred: Use `BackHeader` component** for simple back navigation:

```tsx
import { BackHeader } from "@/components/ui";

const customHeader = (
  <BackHeader
    label="TTS Evaluations"
    onBack={() => router.push("/tts")}
    title="Back to TTS Evaluations"
  />
);

<AppLayout customHeader={customHeader}>
```

**For complex headers** (AgentDetail, SimulationDetail) with custom elements:

```tsx
const customHeader = (
  <div className="flex items-center gap-3">
    <button className="w-8 h-8 rounded-md hover:bg-muted ...">
      {/* Back arrow icon w-5 h-5 */}
    </button>
    <span className="text-sm md:text-base font-semibold truncate">
      {item.name}
    </span>
  </div>
);

const headerActions = (
  <div className="mr-1 md:mr-2">  {/* Responsive margin */}
    <button className="h-8 px-3 md:px-4 rounded-md text-xs md:text-sm font-medium bg-foreground text-background ...">
      Save / Launch
    </button>
  </div>
);

<AppLayout customHeader={customHeader} headerActions={headerActions}>
```

**Responsive header patterns:**

- Agent name: `text-sm md:text-base` with `truncate` for long names
- Action button: `px-3 md:px-4`, `text-xs md:text-sm`
- Margin: `mr-1 md:mr-2` for tighter mobile spacing

**Callback Pattern for Component-based Detail Pages:**

When the detail content is a separate component (like `AgentDetail`), use a callback to lift header state to the page:

```tsx
// In component (AgentDetail.tsx)
export type AgentDetailHeaderState = {
  agentName: string;
  isLoading: boolean;
  isSaving: boolean;
  onSave: () => void;
  onEditName: () => void;
};

// Component accepts callback and hides internal header when provided
type Props = {
  agentUuid: string;
  onHeaderStateChange?: (state: AgentDetailHeaderState) => void;
};

// useEffect notifies parent when state changes
useEffect(() => {
  if (onHeaderStateChange) {
    onHeaderStateChange({ agentName, isLoading, isSaving, onSave, onEditName });
  }
}, [agentName, isLoading, isSaving, onHeaderStateChange]);

// In page - use callback to build header
const [headerState, setHeaderState] = useState<AgentDetailHeaderState | null>(null);
const handleHeaderStateChange = useCallback((state) => setHeaderState(state), []);

<AppLayout customHeader={...} headerActions={...}>
  <AgentDetail agentUuid={uuid} onHeaderStateChange={handleHeaderStateChange} />
</AppLayout>
```

### Detail Page Responsive Patterns

Detail pages (AgentDetail, SimulationDetail, STT/TTS Evaluation, Simulation Runs) follow responsive patterns similar to list pages:

**Container spacing:**

```tsx
<div className="space-y-4 md:space-y-6 py-4 md:py-0">
  {/* py-4 on mobile for breathing room, py-0 on desktop where header provides space */}
</div>
```

**Critical spacing rule:** All detail pages use `space-y-4 md:space-y-6` for consistent vertical spacing that adapts to mobile. Never use fixed `space-y-6` without the mobile variant.

**Internal header (when not using AppLayout customHeader):**

```tsx
<div className="flex items-center justify-between gap-3 -mt-2 md:-mt-4">
  <div className="flex items-center gap-2 md:gap-3 min-w-0">
    <Link
      href="/agents"
      className="w-8 h-8 rounded-md hover:bg-muted flex-shrink-0"
    >
      {/* Back arrow */}
    </Link>
    <h1 className="text-lg md:text-xl font-semibold cursor-pointer truncate">
      {agentName}
    </h1>
  </div>
  <button className="h-8 md:h-9 px-4 md:px-6 rounded-md text-xs md:text-sm flex-shrink-0">
    Save
  </button>
</div>
```

**Tab navigation:**

```tsx
<div className="flex items-center gap-4 md:gap-6 border-b border-border overflow-x-auto">
  <button className="pb-2 text-sm md:text-base font-medium whitespace-nowrap">
    Tab Label
  </button>
</div>
```

- **Horizontal scrolling on mobile** with hidden scrollbar (`overflow-x-auto` + hide scrollbar styles)
- **Edge-to-edge on mobile**: `-mx-4 md:mx-0 px-4 md:px-0` extends tabs to screen edges for better touch access
- **Responsive gaps**: `gap-3 md:gap-4 lg:gap-6` for comfortable spacing across breakpoints
- **Better touch targets**: `pb-3 px-1` padding on each tab button
- **Prevent wrapping/squishing**: `whitespace-nowrap flex-shrink-0` on tab buttons
- **Hide scrollbar**: Use `.hide-scrollbar` class (webkit), `scrollbarWidth: 'none'` (Firefox), `msOverflowStyle: 'none'` (IE)
- **Responsive text**: `text-sm md:text-base` for tab labels

**Dialogs (Edit Name, etc.):**

```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
  <div className="bg-background border border-border rounded-xl p-5 md:p-6 max-w-md w-full shadow-lg">
    <h2 className="text-base md:text-lg font-semibold mb-3 md:mb-4">Title</h2>
    <input className="w-full h-9 md:h-10 px-3 rounded-md text-sm..." />
    <div className="flex items-center justify-end gap-2 md:gap-3">
      <button className="h-9 md:h-10 px-4 rounded-md text-xs md:text-sm">
        Cancel
      </button>
      <button className="h-9 md:h-10 px-4 rounded-md text-xs md:text-sm">
        Save
      </button>
    </div>
  </div>
</div>
```

- Outer container has `p-4` for mobile margin
- Dialog content uses responsive padding and gaps
- Button and input sizing scales with screen size

Key styling:

- Back button: `w-8 h-8`, icon `w-5 h-5`
- Title: `text-base font-semibold`
- Action button: `h-8 px-4 text-sm`
- Action wrapper: `mr-2` for spacing from profile dropdown

### Comprehensive Dialog & Sidebar Responsive Patterns

**All dialogs and sidebars are fully responsive.** This section documents the complete patterns.

**Centered Modal Dialogs** (DeleteConfirmationDialog, NewSimulationDialog, RunTestDialog):

```tsx
// Outer container - adds mobile margin
<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
  {/* Dialog */}
  <div className="bg-background border border-border rounded-xl p-5 md:p-6 max-w-md w-full mx-4 shadow-lg">
    {/* Header */}
    <h2 className="text-base md:text-lg font-semibold mb-2">{title}</h2>

    {/* Content */}
    <p className="text-sm md:text-base text-muted-foreground mb-5 md:mb-6">
      {message}
    </p>

    {/* Inputs (if any) */}
    <input className="h-9 md:h-10 px-3 md:px-4 text-sm md:text-base" />

    {/* Actions */}
    <div className="flex items-center justify-end gap-2 md:gap-3">
      <button className="h-9 md:h-10 px-4 text-xs md:text-sm">Cancel</button>
      <button className="h-9 md:h-10 px-4 text-xs md:text-sm">Confirm</button>
    </div>
  </div>
</div>
```

**Key patterns:**

- Outer `p-4` for mobile breathing room
- Dialog padding: `p-5 md:p-6`
- Title: `text-base md:text-lg` (never fixed `text-lg`)
- Body text: `text-sm md:text-base`
- Buttons: `h-9 md:h-10`, `text-xs md:text-sm`
- Gaps: `gap-2 md:gap-3`
- Margins: `mb-5 md:mb-6` for sections

**Full-Page Slide-In Sidebars** (Personas, Scenarios, Metrics, Tools sidebars):

```tsx
<div className="fixed inset-0 z-50 flex justify-end">
  {/* Backdrop */}
  <div className="absolute inset-0 bg-black/50" onClick={onClose} />

  {/* Sidebar */}
  <div className="relative w-full md:w-[40%] md:min-w-[500px] bg-background md:border-l border-border flex flex-col h-full shadow-2xl">
    {/* Header */}
    <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-b border-border">
      <h2 className="text-base md:text-lg font-semibold">{title}</h2>
      <button className="w-8 h-8">✕</button>
    </div>

    {/* Content - scrollable */}
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3 md:space-y-4">
      {/* Form fields */}
      <div>
        <label className="text-xs md:text-sm font-medium mb-2">Label</label>
        <input className="h-9 md:h-10 px-3 md:px-4 text-sm md:text-base" />
      </div>
    </div>

    {/* Footer */}
    <div className="px-4 md:px-6 py-3 md:py-4 border-t border-border">
      <div className="flex items-center justify-end gap-2 md:gap-3">
        <button className="h-9 md:h-10 px-3 md:px-4 text-xs md:text-base">
          Cancel
        </button>
        <button className="h-9 md:h-10 px-3 md:px-4 text-xs md:text-base">
          Save
        </button>
      </div>
    </div>
  </div>
</div>
```

**Key patterns:**

- **Mobile**: Full-width (`w-full`), no left border, occupies entire screen
- **Desktop**: Percentage width (`w-[40%]`), minimum width (`min-w-[500px]`), left border (`md:border-l`)
- Header padding: `px-4 md:px-6`, `py-3 md:py-4`
- Content padding: `p-4 md:p-6`
- Content spacing: `space-y-3 md:space-y-4`
- Labels: `text-xs md:text-sm`
- Inputs: `h-9 md:h-10`, `px-3 md:px-4`, `text-sm md:text-base`
- Buttons: `h-9 md:h-10`, `px-3 md:px-4`, `text-xs md:text-base`
- Footer gaps: `gap-2 md:gap-3`

**Large Form Dialogs** (AddTestDialog, TestRunnerDialog):

```tsx
// AddTestDialog - Two-column layout (form + preview)
<div className="fixed inset-0 z-50 flex items-center justify-center">
  <div className="relative w-full max-w-7xl h-[95vh] md:h-[85vh] mx-2 md:mx-4 bg-background rounded-xl md:rounded-2xl flex flex-col md:flex-row">
    {/* Left panel - full width on mobile, 2/5 on desktop */}
    <div className="w-full md:w-2/5 flex flex-col">
      {/* Tabs */}
      <div className="flex border-b">
        <button className="flex-1 py-3 md:py-4 text-sm md:text-base">Tab 1</button>
      </div>
      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6"></div>
      {/* Footer */}
      <div className="px-4 md:px-6 py-3 md:py-4">
        <button className="h-9 md:h-10 px-4 md:px-5 text-sm md:text-base">Save</button>
      </div>
    </div>
    {/* Right panel - full width on mobile, 3/5 on desktop */}
    <div className="w-full md:w-3/5 p-4 md:p-6"></div>
  </div>
</div>

// TestRunnerDialog / BenchmarkResultsDialog - Three-panel with mobile navigation
<div className="fixed inset-0 z-50 flex items-center p-0 md:p-4">
  <div className="w-full max-w-[92rem] h-full md:h-[92vh] rounded-none md:rounded-xl flex flex-col">
    {/* Header with stats (desktop only) */}
    <div className="px-4 md:px-6 py-3 md:py-4 border-b">
      <h2>Test Status</h2>
      {/* Stats - desktop only in header */}
      <div className="hidden md:block">
        <TestStats passedCount={5} failedCount={2} />
      </div>
    </div>

    <div className="flex-1 flex overflow-hidden">
      {/* Left panel - test list (w-80), hidden when test selected on mobile */}
      <div className={`w-full md:w-80 ${selectedTest ? 'hidden md:flex' : 'flex'} flex-col`}>
        {/* Test list (no mobile stats - cleaner UI) */}
        {/* Uses button elements for list items with onTouchEnd for mobile support */}
      </div>

      {/* Middle panel - conversation history, hidden when no test selected on mobile */}
      <div className={`flex-1 ${selectedTest ? 'flex' : 'hidden md:flex'} flex-col overflow-hidden`}>
        {/* Mobile back button - flex-shrink-0 to prevent squishing */}
        <div className="md:hidden px-4 py-3 border-b flex-shrink-0">
          <button onClick={() => setSelectedTest(null)}>Back to tests</button>
        </div>
        {/* Test details - flex-1 for remaining space */}
        <div className="flex-1 overflow-y-auto">
          <TestDetailView />
        </div>
      </div>

      {/* Right panel - evaluators / expected tool calls (w-[32rem]), desktop only,
          shown only after test completes. On mobile this content is rendered
          inline at the bottom of the middle panel by `TestDetailView`
          (md:hidden) so small screens don't lose per-evaluator detail. */}
      {selectedResult && (selectedResult.status === "passed" || selectedResult.status === "failed") && (
        <div className="hidden md:flex w-[32rem] border-l border-border flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            <EvaluationCriteriaPanel
              evaluation={testCase?.evaluation}
              testCaseEvaluators={testCase?.evaluators}
              judgeResults={result.judge_results}
              reasoning={result.reasoning}
              scaleByEvaluatorUuid={scaleByEvaluatorUuid}
              legacyDefaultEvaluator={defaultNextReplyEvaluator}
              enableEvaluatorLinks={!isPublicSharePage}
            />
          </div>
        </div>
      )}
    </div>
  </div>
</div>
```

**Key patterns:**

- **Dialog height**: `h-[95vh]` on mobile (more space), `h-[85vh]` on desktop for create/edit form dialogs; runner dialogs use full mobile height and `md:h-[92vh]`
- **Dialog margin**: `mx-2` on mobile (tight), `mx-4` on desktop
- **Border radius**: `rounded-xl` on mobile, `rounded-2xl` on desktop
- **Layout direction**: `flex-col` on mobile (vertical), `flex-row` on desktop (horizontal)
- **Panel widths**: `w-full` on mobile, fractional widths on desktop for form dialogs (`w-2/5`, `w-3/5`); runner dialogs use fixed `md:w-80` left column, flexible middle column, and fixed `w-[32rem]` evaluator column
- **Padding**: `p-4 md:p-6` throughout
- **Button sizing**: `h-9 md:h-10`, `px-4 md:px-5`
- **Text sizing**: `text-sm md:text-base`
- **Mobile navigation**: Hide/show panels with conditional classes and back buttons
- **Stats display**: Show in header on desktop (`hidden md:block`), at top of list on mobile (`md:hidden`)
- **Right panel structure**: Use `flex-col overflow-hidden` parent with `flex-shrink-0` back button and `flex-1 overflow-y-auto` content

**Components using these patterns:**

- **DeleteConfirmationDialog**: Used across all list pages for delete confirmation
- **NewSimulationDialog**: Create simulation modal on simulations list page
- **RunTestDialog**: Run test modal on tests list page (already responsive). The "Attach test to agent" checkbox is visible and respected for all agent types including connection agents — shown whenever an agent is selected (`selectedAgent &&`), no type-based hiding.
- **Personas sidebar**: Full-page slide-in for add/edit personas
- **Scenarios sidebar**: Full-page slide-in for add/edit scenarios
- **Metrics sidebar**: Full-page slide-in for add/edit metrics
- **AddToolDialog**: Full-page slide-in for add/edit tools
- **AddTestDialog**: Large centered modal for add/edit tests (fully responsive)
- **BulkUploadTestsModal**: Centered modal for bulk CSV upload of tests (type selection, file upload with drag-and-drop, parsed-tests preview with per-row table, optional agent assignment with multi-select). The dialog grows from `max-w-xl` → `max-w-5xl` with a `transition-[max-width]` animation once the CSV parses successfully so the rich preview table has room to breathe — see "Bulk upload tests via CSV" in section 5 for the full contract.
- **TestRunnerDialog**: Test results viewer with three-panel layout on desktop (test list | conversation | evaluation criteria), two-panel mobile navigation
- **Simulation Run Page**: `/simulations/[uuid]/runs/[runId]` - Responsive tabs (3 tabs on mobile: Results/Performance/Latency, 2 tabs on desktop: Performance/Latency), conditional content display, reduced font sizes on mobile
- **BenchmarkResultsDialog**: Benchmark results viewer with three-panel layout on desktop (providers/tests | conversation | evaluation criteria), two-panel mobile navigation (same patterns as TestRunnerDialog)

**Gotchas:**

- Never use fixed padding (`p-6`) without mobile variant (`p-4 md:p-6`)
- Never use fixed text sizes (`text-lg`) without mobile variant (`text-base md:text-lg`)
- Sidebars must be `w-full` on mobile to prevent awkward half-screen display
- Left border should only show on desktop (`md:border-l`) for sidebars
- **Tab-based content visibility**: When showing different content based on active tab + screen size (e.g., simulation run results), use `window.innerWidth` checks combined with state to conditionally render. Pattern: Check if mobile (`window.innerWidth < 768`) AND wrong tab before returning null. Example: Simulation run results only show in "Results" tab on mobile but always show on desktop
- **Redundant section headers in tabs**: Hide section headers on mobile when they duplicate or are implied by tab names. Use `hidden md:block` on the header. Pattern: If content appears under tabs like "Results", "Performance", or "Latency", hide the corresponding section headers ("Overall Metrics", "Simulation Results") on mobile. Desktop keeps headers visible for context since content appears without tab switching. Example: Both "Overall Metrics" and "Simulation Results" headers hidden on mobile in simulation run page
- Always include `mx-2 md:mx-4` on centered dialogs for mobile edge spacing
- Input/button heights must be `h-9` on mobile for proper touch targets (not `h-8`)
- Two-column layouts must stack vertically on mobile (`flex-col md:flex-row`)
- Dialog heights need more space on mobile (`h-[95vh] md:h-[85vh]`)
- For multi-panel views, implement mobile navigation with hide/show panels and back buttons
- Stats/summary info should show in header on desktop only (mobile stats removed for cleaner UI in TestRunnerDialog)
- Middle panel in three-panel layouts needs proper flex structure: `flex-col overflow-hidden` parent, `flex-shrink-0` for fixed sections, `flex-1 overflow-y-auto` for scrollable content
- Third column (evaluators / expected tool calls) is desktop-only (`hidden md:flex`), fixed width `w-[32rem]`, with `border-l border-border`; only rendered when a test is selected. The left list stays `md:w-80`, and when the runner shell grows wider the extra width should go to the third column, not the first two. On mobile the same content is inlined at the bottom of the middle panel by `TestDetailView` via a `md:hidden` `JudgeResultsList` block, so per-evaluator detail isn't lost on small screens
- Use `useSidebarState()` hook from `@/lib/sidebar` for sidebar state - handles hydration-safe initialization (prevents SSR mismatch and mobile flash)
- **Mobile touch handling for interactive lists**: Use `<button>` elements instead of `<div>` with `onClick` for list items to ensure reliable touch events on mobile. Add both `onClick` and `onTouchEnd` handlers for maximum compatibility. Include `type="button"` to prevent form submission and `w-full` to make entire area tappable. Example: TestRunnerDialog's TestListItem component

**Evaluation & Simulation Pages Responsive Spacing:**

STT/TTS evaluation detail pages and simulation run detail pages use these responsive patterns:

```tsx
// Main container - always responsive spacing
<div className="space-y-4 md:space-y-6">
  {/* All tab content */}
</div>

// Nested sections within tabs
<div className="space-y-4 md:space-y-6">
  {/* Section content */}
</div>

// Chart grids (leaderboard charts)
<div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
  {/* Charts stack on mobile, side-by-side on desktop */}
</div>

// Full-width sections (for leaderboard tables/charts)
<div className="space-y-4 md:space-y-6 -mx-4 md:-mx-8 px-4 md:px-8 w-[calc(100vw-32px)] md:w-[calc(100vw-260px)] ml-[calc((32px-100vw)/2+50%)] md:ml-[calc((260px-100vw)/2+50%)] relative">
  {/* Extends to viewport edges on mobile, respects sidebar on desktop */}
</div>

// Section headings
<h2 className="text-base md:text-lg font-semibold mb-3 md:mb-4">
  Section Title
</h2>

// Page titles (in custom headers)
<h1 className="text-xl md:text-2xl font-semibold">
  Page Title
</h1>
```

**Key patterns:**

- All vertical spacing uses `space-y-4 md:space-y-6` (mobile has less breathing room)
- Chart grids stack on mobile: `grid-cols-1 md:grid-cols-2`
- Full-width sections account for mobile margins (32px) vs desktop sidebar (260px)
- Text sizes scale: `text-base md:text-lg` for headings, `text-xl md:text-2xl` for titles
- Margins scale: `mb-3 md:mb-4` for consistent spacing

### Dataset detail page (`/datasets/[id]`)

**Implementation**: `src/app/datasets/[id]/page.tsx`. Loads the dataset with `getDataset`; renders **`STTDatasetEditor`** or **`TTSDatasetEditor`** depending on `dataset_type`, with sorted `savedItems`, `onDeleteSavedItem` (API delete + parent `item_count` / `items` update), **`onHasPendingChangesChange`** → `hasPendingChanges`, and **`maxRowsPerEval`** from **`useMaxRowsPerEval`**. **`AppLayout`** uses **`activeItem={dataset.dataset_type}`** (`"stt"` or `"tts"`) so the sidebar highlights the STT or TTS area.

**Header actions** (same row as the title, right-aligned):

- **Save** — Rendered only when **`hasPendingChanges`**. It is the **primary** action (`bg-foreground text-background`, **`font-semibold`**, **`shadow-sm`**) so unsaved edits draw attention before starting an evaluation.
- **New evaluation** — Navigates to **`/{stt|tts}/new?dataset={uuid}`**. **Disabled** when **`item_count === 0`** (nothing persisted to run against) **or** **`hasPendingChanges`** (the create flow uses saved dataset rows; draft edits must be saved first). When enabled, it uses the same **primary** solid styling; when disabled, **outline / muted** styling. **Tooltip on disabled state**: use shared **`@/components/Tooltip`** with **`position="top"`** (not the native `title` attribute), following the same **disabled-button + `pointer-events-none`** wrapper pattern documented under the Tooltip component — otherwise hover never reaches the trigger. Tooltip copy: if there are pending changes, explain **save first**; else explain **add at least one row**.

**Order**: **Save** (when visible), then **New evaluation**.

### Evaluation Page Pattern (TTS/STT)

Both TTS and STT evaluation pages follow the same list → new → detail pattern:

```
/tts                    # List all TTS evaluation jobs
/tts/new                # Create new TTS evaluation (form + submit)
/tts/[uuid]             # View TTS evaluation results (polling + tabs)

/stt                    # List all STT evaluation jobs
/stt/new                # Create new STT evaluation (form + submit)
/stt/[uuid]             # View STT evaluation results (polling + tabs)
```

**List Page:**

- Fetches jobs from `GET /jobs?job_type=tts` or `GET /jobs?job_type=stt`
- Displays in sortable table with columns: Providers (as pills), Dataset (link), Language, Status, Samples count, Created At
- After fetching, all `dataset_id` values are validated via `getDataset()` — deleted datasets are nulled out to prevent broken links
- Table rows use `<div>` with `onClick`/`router.push` (not `<Link>`) to allow `e.stopPropagation()` on the dataset link
- "New [TTS/STT] Evaluation" button below header navigates to `/[tts|stt]/new`
- Clicking a row navigates to `/[tts|stt]/{uuid}`

**New Page:**

- Contains the evaluation form component (`TextToSpeechEvaluation` or `SpeechToTextEvaluation`)
- **Header**: Description text + Evaluate button. Uses `flex flex-col sm:flex-row sm:items-center justify-between gap-3` — stacks vertically on mobile, side-by-side on desktop
- **Tabs**: Settings and Dataset tabs use `text-sm md:text-base` with `gap-4 md:gap-6`
- **Tab state preservation**: Both tab panels stay mounted in the DOM using `className="hidden"` to toggle visibility (not conditional rendering). This prevents uploaded files and entered data from being lost when switching between Dataset and Settings tabs
- Both components use the same tab layout:
  - **Settings tab**: Language selection dropdown + provider selection (responsive: table on desktop, cards on mobile) + evaluator selection (`MultiSelectPicker`)
  - **Dataset tab**: Sample rows + add sample button (TTS also has CSV upload with OR divider and sample download)
  - **Choosing a saved dataset** (`DatasetPicker`, `src/components/evaluations/DatasetPicker.tsx`): Shared by **`SpeechToTextEvaluation`** and **`TextToSpeechEvaluation`** when picking an existing dataset. Datasets with **`item_count === 0`** are not selectable (disabled row styling). The reason is shown with **`@/components/Tooltip`** (`position="top"`), not secondary text under the name — same tooltip shell as elsewhere. **`SpeechToTextEvaluation`** and **`TextToSpeechEvaluation`** both clear **`selectedDatasetId`** when a refetch of **`listDatasets`** shows the current selection has **`item_count === 0`** (covers deleting all rows or stale URL state).
- **Provider selection UI** (responsive):
  - **Desktop** (`hidden md:block`): Table with border, rounded corners (`border border-border rounded-lg`)
    - Header row with select-all checkbox and column titles (`bg-muted/50 border-b`)
    - **STT columns**: Checkbox | Label | Model | Website
    - **TTS columns**: Checkbox | Label | Model | Voice ID | Website
    - Website column has external link icon that opens provider's website in new tab (uses `stopPropagation()` to prevent row selection toggle)
    - Clickable rows (`hover:bg-muted/30 cursor-pointer`) - clicking anywhere on row toggles selection
    - Select-all checkbox in header with tri-state: empty (none), minus icon (some), checkmark (all)
    - Model and Voice ID columns use `font-mono` for technical values
  - **Mobile** (`md:hidden`): Card layout with select-all card at top, then individual provider cards
    - Each card shows checkbox + provider label + website link icon in a row, with model name (`font-mono truncate`) below
    - Selected state uses `border-foreground/30 bg-muted/30`, unselected uses `border-border hover:bg-muted/20`
  - Shows "(X selected)" count next to the header title
- **Evaluator selection** (sits below provider selection in the Settings tab):
  - Both `SpeechToTextEvaluation` and `TextToSpeechEvaluation` fetch `GET /evaluators?include_defaults=true` on mount and **filter client-side to `evaluator_type === "stt"`** (or `"tts"` for TTS) before mapping to `PickerItem`s. Same pattern as the simulation Config tab metrics picker, except the filter type is per-page. Other evaluator types (LLM, simulation, and the opposite of stt/tts) are excluded.
  - Rendered using the shared `MultiSelectPicker` component (the same one used for personas/scenarios/metrics on the simulation Config tab) with `placeholder="Choose one or more evaluators"` and `searchPlaceholder="Search evaluators"`. Header reads "Select evaluators" with an inline "(X selected)" count, matching the providers section pattern. **Trigger / dropdown styling** follows the shared **`MultiSelectPicker`** rules under **Component Patterns** (`bg-background` trigger, **`bg-popover`** panel, **`accent` / `accent-foreground`** selected rows) so text stays readable on tinted sections and in dark mode.
  - **Defaults pre-selected on first load**: after the fetch resolves, `selectedEvaluators` is initialized to all evaluators with `!owner_user_id` (the same "is default" check used by the `/evaluators` page tab partition). User-owned ("My") evaluators of the matching type are listed but unselected.
  - **At least one evaluator required**: clicking Evaluate with zero selected sets `evaluatorsInvalid`, switches to the Settings tab, and renders a red border around the section (`bg-red-500/10 border border-red-500`) — same visual treatment used for the providers section. The `MultiSelectPicker`'s `onSelectionChange` is wrapped (`handleEvaluatorsChange`) to clear the invalid state as soon as the user adds one back. The validation runs *after* the providers check, so the red border appears one-at-a-time.
  - **Sent to the backend** as `evaluator_uuids: string[]` on `POST /[stt|tts]/evaluate` in both inline and dataset input modes.
- **STT Dataset rows** (responsive, DRY pattern):
  - **Desktop** (`hidden md:flex`): Single horizontal row with row number, audio player/upload, text input, delete button
  - **Mobile** (`md:hidden`): Stacked layout — row number + delete button on top, full-width audio upload/player, full-width text input
  - Audio player uses `w-full h-8` on mobile (no min-width), `w-96 min-width: 250px` on desktop
  - Upload button is `w-full justify-center` on mobile for full-width tap target
  - **Shared elements pattern**: To avoid duplicating logic between desktop/mobile layouts, shared pieces are extracted as JSX variables inside the `.map()` callback (`rowBadge`, `deleteButton`, `uploadButtonContent`, `replaceButton`, `textInput`, `handleDelete`, `triggerFileInput`). Both layouts reference these variables. Only layout-specific wrappers (flex direction, audio sizing, upload button width) remain separate.
  - **Single hidden file input per row**: One `<input type="file" className="hidden">` is rendered at the top of each row container (before both layout divs), with a direct ref assignment. Both desktop and mobile upload/replace buttons call `triggerFileInput()` which clicks this single element. No conditional ref guard needed.
- **STT ZIP upload section**: `w-full md:w-2/3 md:mx-auto` — full width on mobile, 2/3 centered on desktop. Buttons stack vertically on small screens (`flex-col sm:flex-row`)
- **TTS CSV upload section**: Buttons stack vertically on small screens (`flex-col sm:flex-row`)
- **Providers start unselected by default** - user must select at least 1 provider before evaluating
- **Evaluators start with the type-matching defaults pre-selected** (see "Evaluator selection" above) — at least 1 is required to evaluate
- Evaluate button always enabled; clicking without providers (or without evaluators) shows a red border around the offending section and switches to the Settings tab. Providers are checked first, so the red border appears on one section at a time.
- On submit: calls `POST /[tts|stt]/evaluate` with `providers`, `language`, `evaluator_uuids`, and either `dataset_id` or (`audio_paths`/`texts` + optional `dataset_name`); then redirects to `/[tts|stt]/{uuid}` using the returned `task_id`
- Uses `BackHeader` component for back navigation to list page

**Detail Page:**

- Fetches result from `GET /[tts|stt]/evaluate/{uuid}` (NOT from `/jobs`)
- Polls at `POLLING_INTERVAL_MS` (3 seconds) while status is `queued` or `in_progress`
- Shows loading/in-progress states during polling
- Uses `BackHeader` component for back navigation
- Uses `StatusBadge` component with `showSpinner` for status display
- Results are at **top level** (`provider_results`, `leaderboard_summary`) - different from `/jobs` API!
- Displays results in tabs once provider results exist. `Outputs` is always available; `Leaderboard` and `About` are only shown once leaderboard data is available (`status === "done"` with `leaderboard_summary`). If the URL contains `?tab=leaderboard` or `?tab=about` before those tabs are available, derive a displayed tab that falls back to `outputs` so the page doesn't render an empty tab state.
- **Shared result rendering**: Authenticated (`/stt/[uuid]`, `/tts/[uuid]`) and public share (`/public/stt/[token]`, `/public/tts/[token]`) pages now reuse the same render components from `src/components/eval-details/EvaluationRunDetails.tsx`. Use `STTEvaluationLeaderboard` / `TTSEvaluationLeaderboard`, `STTEvaluationOutputs` / `TTSEvaluationOutputs`, and `STTEvaluationAbout` / `TTSEvaluationAbout` for result UI instead of duplicating page-local Leaderboard / Outputs / About JSX. The pages should only own shell concerns (auth vs public layout, data fetching, title/pills, tab state) and small page-specific row shaping such as making evaluator names clickable on private pages but plain text on public pages.
- **Dynamic per-evaluator columns** — every section that previously rendered a single generic judge column / chart / metric is now driven by an `evaluatorColumns: { key, label, outputType, scoreField, reasoningField }[]` array, exported from `@/components/eval-details` as `STTEvaluatorColumn` / `TTSEvaluatorColumn`. Each column carries the live `label` (the evaluator's `name` from the API), the cell-renderer `outputType` (`"binary"` | `"rating"`), and explicit `scoreField` / `reasoningField` row-data column names so the shared output tables don't need to know which API format produced the row. Resolution rules (in priority order):
  1. **`evaluator_runs` (new format, preferred)**: take the first provider's non-empty `evaluator_runs` array. One column per entry — `key = run.metric_key`, `label = run.name ?? run.metric_key`, `outputType` from `run.aggregate?.type`, `scoreField = run.metric_key` (the new CSV column has **no** `_score` suffix), `reasoningField = `${run.metric_key}_reasoning``. No fetch is required: the live name, snapshotted description, stable UUID, type and `aggregate.scale_min` / `scale_max` all come straight from the response.
  2. **Legacy `_info` format**: scan the first provider's `metrics` for `${prefix}_info` keys (skipping the well-known scalar/latency fields — `wer` / `string_similarity` / `llm_judge_score` for STT; `llm_judge_score` / `ttfb` / `processing_time` for TTS). Each match becomes one column with `key = prefix`, `outputType` from `info.type`, `label` resolved by name from `aboutEvaluators` (raw `prefix` while the about-fetch is still in flight, then upgraded once it lands), and `scoreField = `${prefix}_score`` / `reasoningField = `${prefix}_reasoning``.
  3. **Legacy single-evaluator fallback** (no `evaluator_runs`, no `*_info` keys): emit one synthetic column with `key: "llm_judge"` and `scoreField: "llm_judge_score"` / `reasoningField: "llm_judge_reasoning"`. Authenticated pages label this with the default evaluator's `name` from `GET /evaluators?include_defaults=true`; public pages fetch public-safe default evaluator metadata via `getPublicDefaultEvaluator(backendUrl, shareToken, "stt" | "tts")`. Use API-provided `name`, `description`, `output_type`, and rating scale config for this fallback. Do not hardcode default evaluator names or descriptions in STT/TTS pages; if neither the job payload nor the default-evaluator endpoint provides a description, render the description as empty.

  These columns drive:
  - the shared **Leaderboard** components (`STTEvaluationLeaderboard` / `TTSEvaluationLeaderboard`) — one column/chart per evaluator; STT puts `WER` first, TTS puts `TTFB (s)` last,
  - the shared **Leaderboard charts** — one bar chart per evaluator with `dataKey: col.scoreField ?? `${col.key}_score`` (which equals `metric_key` in the new format, `${prefix}_score` in legacy `_info`, `llm_judge_score` in legacy single-evaluator), `yDomain: [0, 1]` for binary evaluators and auto-fit for rating evaluators, plus the latency charts (paired into rows of 2 via a small `for (let i = 0; i < charts.length; i += 2)` packing),
  - the per-provider `ProviderMetricsCard` rows rendered by `STTEvaluationOutputs` / `TTSEvaluationOutputs` — one row per evaluator (alongside the latency rows). The mean is resolved by `readProviderEvaluatorMean(col, providerResult)` from `src/lib/evaluatorMetrics.ts`, which walks three sources in order: `provider_results[i].evaluator_runs[*].aggregate.mean` where `metric_key === col.key`, then `metrics[col.scoreField]` as a flat number, then `metrics[col.key].mean` for the new-format nested object,
  - the **Outputs** per-provider results-table columns inside `STTResultsTable` / `TTSResultsTable` (see the `evaluatorColumns?: STTEvaluatorColumn[]` / `TTSEvaluatorColumn[]` props below).

  `STTResultsTable` / `TTSResultsTable` accept the same shape — `{ key, label, outputType, scoreField?, reasoningField? }[]`. When passed, each evaluator gets its own `<th>` and `<td>` (plus a per-evaluator section in the mobile card), routed through a shared `EvaluatorScoreCell`: a Pass/Fail badge for binary evaluators and a 4-dp numeric value for rating evaluators. The cell reads `result[col.scoreField ?? `${col.key}_score`]` and `result[col.reasoningField ?? `${col.key}_reasoning`]`, so callers pick the column convention (new format passes `metric_key` directly; legacy `_info` and the synthetic `llm_judge` fallback rely on the templated default). Both tables still expose the legacy `judgeLabel?: string` prop (defaulting to a generic `"Evaluator"`) which is **only** used when `evaluatorColumns` is omitted entirely; pages should pass the default evaluator's API-derived name whenever they are in the legacy single-evaluator path. The chip row above the tabs (language / dataset / status / share) intentionally **does not** render any evaluator pill — evaluators are surfaced via these columns and via the About-tab rows (below).

- **`showMetrics` gating** — the metrics columns / per-row Pass/Fail rendering only kicks in once every dynamic evaluator column has produced a non-empty score in the row (read at `r[col.scoreField ?? `${col.key}_score`]`, so it covers `metric_key` in the new format, `${prefix}_score` in legacy `_info`, and `llm_judge_score` in legacy single-evaluator). STT additionally requires `wer` to be populated; TTS doesn't require any non-evaluator field. Status `"done"` short-circuits this check. While polling, partially completed rows therefore defer their evaluator columns until the whole batch lands.

- **About-tab evaluators (one row per attached evaluator)** — the About tab no longer hardcodes a single generic judge row. After the eval result has loaded, an effect computes the rendered evaluator list from the most authoritative source available, in priority order:
  1. **`evaluator_runs` (new format, preferred)**: derive `aboutEvaluators` directly from the first provider's non-empty `evaluator_runs`. Each entry becomes one `EvaluatorAbout` with `uuid = run.evaluator_uuid`, `name = run.name ?? run.metric_key`, `description = run.description ?? ""`, `outputType` from `aggregate.type`, and `scaleValues` synthesized from `aggregate.scale_min` / `aggregate.scale_max` (a 2-element array, or 1-element when min === max). No `/evaluators/{uuid}` fetch is required — the response already carries the live name, stable UUID, one-line description and rating bounds.
  2. **Legacy `_info` / `evaluator_uuids` paths**: take the **union** of UUIDs from `evaluationResult.evaluator_uuids` (filtered against the already-fetched `EvaluatorSummary[]` to drop deleted-or-not-fetched evaluators) and UUIDs resolved by **name** from each `${prefix}_info` key in the first provider's `metrics` (using the same key skip-list as `evaluatorColumns`). This is the only path that needs to hit `GET /evaluators/{uuid}` in parallel via `Promise.all` — to read `description`, `output_type` and `live_version.output_config.scale`, which the list endpoint isn't guaranteed to include.
  3. **Truly legacy fallback** (no `evaluator_runs`, no `evaluator_uuids`, no `*_info` keys): the default STT/TTS evaluators (`sttEvaluators.filter(e => e.isDefault)` / `ttsEvaluators.filter(e => e.isDefault)`) so the tab still has at least one row.

  The reduced shape stored in `aboutEvaluators: EvaluatorAbout[]` is `{ uuid, name, description, outputType, scaleValues: number[] }`. For the legacy fetch path, `scaleValues` is `scale[].value` mapped through `Number()` and filtered to drop non-numeric entries (string-valued rating scales fall through to the `"-"` fallback below). Each evaluator becomes one row in `AboutMetricsTable` with:
    - **metric**: on authenticated pages, the evaluator name rendered as `<Link href="/evaluators/[uuid]">`; on public share pages, plain evaluator text only (anonymous users should not be sent to authenticated evaluator routes),
    - **description**: the evaluator's one-line `description` from the job snapshot when present, then default-evaluator API metadata for legacy default fallback rows, otherwise `""`. Do not introduce hardcoded fallback sentences such as semantic-match / TTS correctness copy.
    - **preference**: `"Pass is better"` for binary, `"Higher is better"` for rating,
    - **range**: `"Pass / Fail"` for binary, otherwise the result of `ratingRange(scaleValues)` — which returns `"min - max"` (or just `"5"` when min === max, or `"-"` when no numeric scale entries exist).

  The non-evaluator rows around these dynamic rows are owned by the shared About components: `STTEvaluationAbout` always prepends the **WER** row, and `TTSEvaluationAbout` always appends the **TTFB** row. Public STT/TTS pages should not reintroduce their old legacy About rows (`String Similarity`, STT `TTFB`, STT/TTS `Processing Time`) because that would diverge from the private result view. `MetricDescription.metric` and `MetricDescription.description` in `src/components/eval-details/AboutMetricsTable.tsx` are both typed as `React.ReactNode`; pass `key` when `metric` is JSX so desktop rows and mobile cards have a stable React key.

- **Note:** `evaluatorColumns` (drives the per-row / per-provider / leaderboard rendering) and `aboutEvaluators` (drives the About-tab rows) describe the same set of evaluators. In the new format both are derived from the same `evaluator_runs` source so they stay in sync automatically; in the legacy paths they're computed independently and rely on the column derivation seeing the same `*_info` keys that the About-tab UUID union sees. The legacy `defaultEvaluator` / `judgeLabel` derived from default evaluator APIs is only used as the **fallback** label/description source for legacy single-evaluator jobs (no `evaluator_runs`, no `*_info` keys).
- **Responsive design**: Uses `space-y-4 md:space-y-6` throughout, chart grids are `grid-cols-1 md:grid-cols-2`, leaderboard sections use full-width responsive containers (see "Evaluation & Simulation Pages Responsive Spacing" section above). Outputs tab uses `flex-col md:flex-row` for stacked-on-mobile / side-by-side-on-desktop. About tab uses `hidden md:block` table + `md:hidden` card layout. Results use desktop table (`hidden md:block`) + mobile cards (`md:hidden`) pattern

**Key differences between TTS and STT:**

- **STT Input tab**: Audio file upload (.wav) + reference transcription text field
- **TTS Input tab**: Text input field + CSV upload option with "OR" divider and sample CSV download
- **STT metrics**: WER + one column per attached evaluator (NO latency metrics). Both authenticated and public STT result pages now go through `STTEvaluationOutputs`, which passes `showSimilarity={false}` to `STTResultsTable`; don't add `String Similarity` back to the public page as a one-off.
- **TTS metrics**: One column per attached evaluator + TTFB (TTFB / Processing Time are `LatencyMetric` objects with `mean`, `std`, `values`; Processing Time is excluded from the UI)
- **Null-safe metric rendering**: Numeric metrics (`wer`, `${name}_score` per evaluator, `ttfb.mean`) can be null. Always check before formatting: `value != null ? parseFloat(value.toFixed(4)) : "-"`. Use `parseFloat()` wrapper to remove trailing zeros. Max 4 decimal places for all metrics to prevent column overflow. Shared formatting helpers live in `src/lib/evaluatorMetrics.ts` (`formatMetricValue`, `readProviderEvaluatorMean`) and are consumed by `EvaluationRunDetails.tsx`; don't add page-local copies.
- **STT Outputs tab**: Shows Ground Truth vs Prediction text; metrics columns (WER + one column per attached evaluator) shown when status is "done" OR when all rows have metrics available (see "`showMetrics` gating" above). Rows with empty predictions are highlighted with `bg-red-500/10` and show "No transcript generated" in muted text
  - **Desktop table layout**: Uses `table-fixed` + `w-full` with **fixed pixel widths** for every column (set via inline `style={{ width }}` from a single `STT_COL_WIDTHS` constant inside `STTResultsTable`): `id: 40`, `audio: 180` (when present), `text: 280` (Ground Truth and Prediction each — no longer percentage-based), `wer: 80`, `similarity: 110` (when shown), `evaluator: 130` (per attached evaluator), `llmJudge: 110` (legacy single-evaluator fallback). Text columns use `break-words` for wrapping. The table also carries `style={{ minWidth: tableMinWidth }}` computed as the sum of the visible column widths, so the table grows past the container when there are many evaluators and the wrapping `<div className="overflow-x-auto">` (parent `<div className="border rounded-xl overflow-hidden">`) scrolls header + body together horizontally. When the container is wider than `tableMinWidth`, `w-full` makes the table fill the container and column widths stretch proportionally. Wrapped in `hidden md:block`.
  - **Mobile card layout**: `md:hidden` card list — each result is a bordered `rounded-xl` card showing: row number + (legacy-mode only) Pass/Fail badge header, Ground Truth, Prediction, then WER/Similarity metrics and one labeled per-evaluator section per `evaluatorColumns` entry below a border separator (rendered via `EvaluatorScoreCell` with `hideTooltipButton`, plus the reasoning text inline). The legacy single-evaluator reasoning block only renders when `evaluatorColumns` is omitted and uses the API-derived `judgeLabel`.
  - **Empty prediction detection**: Shared helper functions `hasSTTEmptyPredictions()` and `getFirstSTTEmptyPredictionIndex()` check for rows without transcripts. Provider status shows red X if any empty. The private STT page keeps a small `onProviderSelect` wrapper around `STTEvaluationOutputs` to scroll to the first empty row via `data-row-index`; the public page uses the shared selection behavior without the auto-scroll wrapper.
- **TTS Outputs tab**: Shows text input with audio playback; per-evaluator score column(s) shown when status is "done" OR when all rows have metrics available (see "`showMetrics` gating" above)
  - **Desktop table layout**: Uses `table-fixed` + `w-full` with **fixed pixel widths** for every column (set via inline `style={{ width }}` from a single `TTS_COL_WIDTHS` constant inside `TTSResultsTable`): `id: 48`, `text: 240`, `audio: 300` (down from the old 50% to leave room for evaluator columns; the `<audio>` element uses just `w-full` and stretches to fill this cell — the old `min-w-[280px]` was dropped because it would force horizontal overflow inside a 300px cell), `evaluator: 140` (per attached evaluator, also used for the legacy single-evaluator fallback). The table carries `style={{ minWidth: tableMinWidth }}` computed as `id + text + audio + N * evaluator`, so the table grows past the container when there are many evaluators and the wrapping `<div className="overflow-x-auto">` (parent `<div className="border rounded-xl overflow-hidden">`) scrolls header + body together horizontally. When the container is wider than `tableMinWidth`, `w-full` makes the table fill the container and column widths stretch proportionally. Wrapped in `hidden md:block`.
  - **Mobile card layout**: `md:hidden` card list — each result card shows: row number + (legacy-mode only) Pass/Fail badge header, Text section, Audio player (full-width, no min-width constraint), and one labeled per-evaluator section per `evaluatorColumns` entry below a border separator. The legacy single-evaluator reasoning block only renders when `evaluatorColumns` is omitted and uses the API-derived `judgeLabel`.
- **Per-evaluator score display**:
  - **Desktop**: Each evaluator column renders an `EvaluatorScoreCell`. Binary evaluators show a Pass/Fail badge (green/red) with the same info icon button (ⓘ) and `Tooltip`-on-hover for reasoning (falls back to `"Score: X"` if no reasoning); rating evaluators show the numeric score formatted via `parseFloat(numeric.toFixed(4))` plus the same info button. The legacy single-evaluator badge component is still present in both result tables and is used only when `evaluatorColumns` is omitted.
  - **Mobile**: Each evaluator surfaces its own labeled section inline below the metrics block (since hover tooltips don't work on touch devices). The legacy single-evaluator reasoning sub-label only renders for the legacy-mode card (i.e. `evaluatorColumns` omitted). When `evaluatorColumns` is provided, the header pill (top-right) is intentionally suppressed — the per-evaluator pills inside the metrics block are sufficient.
  - **Parsing**: Binary evaluators ship `"True"`/`"False"` strings per row and `1`/`0` integers in aggregate metrics. Convert to lowercase, Pass when value is `"true"` or `"1"`. Rating evaluators ship a numeric string per row and a `mean` number in aggregates — coerce via `Number(score)` then `Number.isFinite` before rendering.

**Metrics Data Structure:**

The `metrics` field in `ProviderResult` is a dict (not an array). The shapes are intentionally open-ended via index signatures so dynamic per-evaluator keys typecheck alongside the well-known scalar / latency fields. Three on-the-wire formats exist:

- **New format (preferred)** — `metrics[name]` is a nested object (`{ type, mean, scale_min?, scale_max? }`); per-row score column is just the evaluator name (no `_score` suffix); the response also carries `provider_results[i].evaluator_runs` with the live `name` / `evaluator_uuid` / `metric_key` / `aggregate`.
- **Legacy `_info` format** — flat `metrics["{name}_score"]` (number) plus `metrics["{name}_info"]` (`{ type, mean }`); per-row column is `${name}_score`.
- **Legacy single-evaluator format** — only `metrics.llm_judge_score`; per-row `result.llm_judge_score` / `result.llm_judge_reasoning`.

```tsx
// One entry per attached evaluator on the provider. Only present in the
// new format — older jobs omit `evaluator_runs` entirely.
type EvaluatorRunAggregate = {
  type?: "binary" | "rating" | string;
  mean?: number;
  scale_min?: number;            // rating evaluators only
  scale_max?: number;            // rating evaluators only
  [k: string]: unknown;
};

type EvaluatorRun = {
  evaluator_uuid: string;        // stable ID — links to /evaluators/{uuid}
  metric_key: string;            // artefact column name (== per-row CSV col, leaderboard col, metrics-dict key in the new format)
  aggregate?: EvaluatorRunAggregate | null;
  name?: string;                 // current human-readable name; reflects renames after the run
};

// STT ProviderMetrics — wer is a fixed scalar; every attached evaluator
// adds either a nested `metrics[name]` object (new format) or a flat
// `metrics["${name}_score"]` + sibling `metrics["${name}_info"]` pair
// (legacy `_info` format). `string_similarity` / `llm_judge_score` are
// kept typed so the public STT and legacy single-evaluator paths still
// typecheck without `unknown` casts.
type ProviderMetrics = {
  wer?: number;
  string_similarity?: number;
  llm_judge_score?: number;
  [k: string]:
    | number
    | { type?: string; mean?: number; scale_min?: number; scale_max?: number }
    | undefined;
};

// TTS ProviderMetrics — ttfb / processing_time are LatencyMetric objects.
// The index signature has to allow `LatencyMetric` alongside the
// per-evaluator scalar (`*_score`) and nested-object (`{ type, mean, ... }`)
// shapes.
type LatencyMetric = { mean: number; std: number; values: number[] };

type ProviderMetrics = {
  llm_judge_score?: number;          // legacy single-evaluator fallback
  ttfb?: LatencyMetric;
  processing_time?: LatencyMetric;
  [k: string]:
    | number
    | LatencyMetric
    | { type?: string; mean?: number; scale_min?: number; scale_max?: number }
    | undefined;
};

// LeaderboardSummary — one entry per provider. The dynamic per-evaluator
// score key matches the per-row CSV column name (no `_score` suffix in the
// new format, `${prefix}_score` in legacy `_info`, `llm_judge_score` in
// legacy single-evaluator). STT has no TTFB/Processing Time fields; TTS
// keeps `ttfb` / `processing_time` as direct numbers (NOT `LatencyMetric`
// here).
type LeaderboardSummary = {
  run: string;
  count: number;
  // STT scalars
  wer?: number;
  string_similarity?: number;
  // legacy single-evaluator fallback (both STT and TTS)
  llm_judge_score?: number;
  // TTS latency scalars
  ttfb?: number;
  processing_time?: number;
  [k: string]: string | number | undefined;
};
```

- **Aggregate reads**: prefer `evaluator_runs[i].aggregate.mean` (new format). The detail pages use `readProviderEvaluatorMean(col, providerResult)` from `src/lib/evaluatorMetrics.ts`, which walks three sources in order: `evaluator_runs` match by `metric_key === col.key`, then `metrics[col.scoreField]` as a flat number, then `metrics[col.key].mean` for the new-format nested object. Pipe the result through `formatMetricValue` from the same module for safe rendering.
- **Per-row reads**: read at `result[col.scoreField ?? `${col.key}_score`]` and `result[col.reasoningField ?? `${col.key}_reasoning`]` — the column carries the right field names for whichever format produced it.
- **Linking artefacts vs. UI copy**: `metric_key` is for linking to CLI/S3 artefacts (it's stable across renames); `name` is for UI copy (updates with renames). In the new format the auth detail page uses `name` for column headers and About-tab rows, and uses `evaluator_uuid` to link the About-tab pill.
- STT leaderboard has no TTFB/Processing Time charts (metrics not available).
- TTS leaderboard renders one bar chart per evaluator + a TTFB chart at the end (Processing Time excluded from UI).

**Language-based Provider Filtering:**

Both TTS and STT evaluations filter available providers based on the selected language:

```tsx
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
  | "gujarati";

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
};

// Filter providers based on selected language
const getFilteredProviders = (language: LanguageOption) => {
  const langName = languageDisplayName[language];
  return providers.filter(
    (provider) =>
      !provider.supportedLanguages ||
      provider.supportedLanguages.includes(langName)
  );
};
```

- Provider arrays (`sttProviders`, `ttsProviders`) have `label`, `value`, `model`, and optional `supportedLanguages` fields
- TTS providers additionally have a `voiceId` field
- **Provider display varies by context**:
  - **New evaluation pages** (provider selection): Table format showing Label, Model, (Voice ID for TTS), and Website columns. Website column has external link icon that opens provider's website in new tab
  - **List pages and detail pages**: Only label shown as pills (e.g., "Deepgram" not "Deepgram (nova-3)"), no website links
  - `getProviderLabel()` helper returns just the label: `provider.label`
- Providers without `supportedLanguages` are shown for all languages
- When language changes, selected providers that don't support the new language are automatically deselected
- Language arrays are defined in `providers.ts` (e.g., `deepgramSTTSupportedLanguages`, `googleTTSSupportedLanguages`)

### Component Patterns

**`MultiSelectPicker`** (`src/components/MultiSelectPicker.tsx`): Shared multi-select dropdown (searchable list, chips for selections). Used on **simulation Config** (resource pickers), **new STT/TTS evaluation** Settings tab, **labelling task Overview** item summary (**`All evaluators`** filter), and anywhere else it is imported. **Why opaque surfaces:** An earlier **`bg-transparent`** trigger let placeholder/chip text wash out on tinted strips (e.g. summary header **`bg-muted/30`**). **Conventions:** Closed control **`bg-background text-foreground`** with **`border-border`** (parity with **`Select`**); empty selection placeholder **`text-foreground/90`**; open panel **`bg-popover text-foreground`** so it separates from page **`bg-background`** (especially dark: **`--popover`** `#1a1a1a` vs **`--background`** `#0f0f0f`). Rows: selected **`bg-accent text-accent-foreground`**, checkmark **`text-accent-foreground`**; unselected **`text-foreground hover:bg-muted`**. Optional **`item.description`**: **`text-muted-foreground`** when unselected, **`text-accent-foreground/75`** when selected so secondary lines don’t disappear on the accent fill. Search input inside the panel **`bg-background`** for a visible inset field. **Gotcha:** Tweaks apply to **every** consumer — keep CSS variables in **`globals.css`** (`--popover`, `--accent`, `--accent-foreground`) aligned.

1. **Tab Navigation**: Used in agent detail and simulation detail pages
   - Tabs sync with URL query param (`?tab=agent`, `?tab=tools`, etc.)
   - Use `useSearchParams` to read initial tab value
   - Use `window.history.replaceState` to update URL without navigation side effects (avoids title reset issues caused by `router.push`)
   - **Responsive tab bar implementation**:
     ```tsx
     <div
       className="hide-scrollbar flex items-center gap-3 md:gap-4 lg:gap-6 border-b border-border overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0"
       style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
     >
       <button className="pb-3 px-1 text-sm md:text-base font-medium whitespace-nowrap flex-shrink-0 ...">
         Tab Label
       </button>
     </div>
     ```
   - Scrollbar hidden via `.hide-scrollbar::-webkit-scrollbar { display: none; }` in globals.css plus inline styles for cross-browser support
   - **Tab content container**: Wrap all tab content in a container with `pt-2 md:pt-4` for tight spacing below the tab bar (avoids excessive whitespace)
   - **Responsive tab content patterns** (all agent detail tabs are responsive):
     - **AgentTabContent**: Two-column layouts use `flex flex-col md:grid md:grid-cols-2` to stack on mobile. System prompt textarea uses `md:flex-1 h-[350px] md:h-auto` - explicit 350px height on mobile for balanced editing space without dominating screen, `flex-1` only on desktop to fill available vertical space
     - **AgentConnectionTabContent**: Two-column layout (`flex flex-col md:grid md:grid-cols-2`). Left column: "Support benchmarking different models" toggle, Agent URL, Headers, and conditionally a benchmark provider **dropdown** (`<select>`) wrapped in a distinct card (`border border-border rounded-xl bg-muted/20 p-3 md:p-4`) to visually separate it from the URL/headers section. The dropdown defaults to `"openrouter"` (no empty placeholder option) and includes 11 providers: OpenRouter (all providers), OpenAI, Anthropic, Google, Meta, Mistral, DeepSeek, xAI, Cohere, Qwen, AI21. Provider values use OpenRouter slug format (e.g., `"meta-llama"`, `"mistralai"`, `"x-ai"`). Right column: Connection check + always-visible expected request/response format (the example `model` value is looked up from the `exampleModelByProvider` object keyed by provider slug — e.g., `"openrouter"` → `"openai/gpt-4.1"`, `"openai"` → `"gpt-4.1"`). The expected response example hides `tool_calls` by default and shows only the `"response"` field; a "Does your agent return tool calls?" toggle switch (`showToolCalls` local state, defaults to `false`) lets users opt in, which adds the `tool_calls` array to the example JSON. Headers use a mobile card / desktop inline row pattern: on mobile (`md:hidden`), each header is a bordered card with the remove button absolutely positioned top-right and key/value inputs stacked; on desktop (`hidden md:flex`), key/value are side-by-side with the remove button inline. Headers initialized with `[{ key: "", value: "" }]` in `AgentDetail.tsx`. Benchmark state (`supports_benchmark`, `benchmark_provider`) stored in `connectionConfig` and persisted via the existing spread-based save (`...connectionConfig`).
     - **ToolsTabContent**: Uses `flex flex-col lg:grid lg:grid-cols-3` to stack on mobile/tablet. In-built tools panel shows first on mobile via `order-1 lg:order-2`. Uses mobile card view alongside desktop table view
     - **DataExtractionTabContent**: Uses mobile card view alongside desktop table view. Add/Edit sidebar is full-width on mobile (`w-full md:w-[40%]`)
     - **TestsTabContent**: Uses `flex flex-col lg:flex-row` to stack tests list above past runs on mobile. Past runs panel is `w-full lg:w-[400px] xl:w-[560px]` (not fixed width). Mobile card view for tests list
     - **SettingsTabContent**: Toggle/input controls stack below labels on mobile via `flex-col-reverse md:flex-row`
   - **Common responsive patterns across all tabs**:
     - Text sizes scale: `text-sm md:text-base` for labels and inputs
     - Input heights scale: `h-9 md:h-10` for selects and buttons
     - Spacing scales: `gap-4 md:gap-6`, `space-y-4 md:space-y-6`, `mt-2 md:mt-3`
     - Padding scales: `p-3 md:p-4`, `px-3 md:px-4`, `py-2 md:py-3`
     - Empty states use: `p-6 md:p-12` padding, `w-12 md:w-14 h-12 md:h-14` icons
     - Tables have desktop view (`hidden md:block`) and mobile card view (`md:hidden`)
2. **Sidebar Panels**: Slide-in panels for create/edit forms
   - **Preferred**: Use `SlidePanel` and `SlidePanelFooter` from `@/components/ui`
   - Width: 40% of viewport, min 500px (customizable via `width` prop)
   - Backdrop click closes panel
   - Used for: Tools, Personas, Scenarios creation/editing
   - **Fully responsive**: Full-width on mobile (`w-full`), percentage width on desktop (`md:w-[40%]`), no left border on mobile (`md:border-l`). See "Comprehensive Dialog & Sidebar Responsive Patterns" section for complete implementation details.
3. **Modal Dialogs**: Centered overlays for confirmations and simple forms
   - Simple dialogs: Backdrop click closes dialog directly
   - Form dialogs with unsaved data: Backdrop click shows confirmation before closing (e.g., AddTestDialog)
   - Used for: New agent, New simulation, Delete confirmations, Add/Edit test
   - **Large form dialogs** (like AddTestDialog): Use a header bar with name input and save button, flex-col layout with main content area below
   - **Fully responsive**: All dialogs scale from mobile to desktop with responsive padding (`p-4 outer, p-5 md:p-6 dialog`), text sizes (`text-base md:text-lg`), and button heights (`h-9 md:h-10`). See "Comprehensive Dialog & Sidebar Responsive Patterns" section for complete patterns.
4. **Delete Confirmation**: Reusable `DeleteConfirmationDialog` component
   - Props: `isOpen`, `onClose`, `onConfirm`, `title`, `message`, `confirmText`, `isDeleting`
   - Shows loading spinner during deletion
   - **Skip confirmation for empty items**: When deleting empty rows (e.g., in TTS/STT evaluation input), call `deleteRow()` directly instead of showing confirmation dialog
   - **Fully responsive**: Uses mobile-first sizing with `p-4` outer margin, `p-5 md:p-6` dialog padding, `h-9 md:h-10` buttons, `text-base md:text-lg` title, `gap-2 md:gap-3` between actions
5. **Toast Notifications**: Top-right success toasts (positioned `top-16 right-6` — just below the `h-14` header, avoiding overlap with both the header and the "Talk to Us" FAB at bottom-right)
   - Auto-dismiss after 3 seconds
   - Manual dismiss button
   - Used after successful save operations
6. **Header Actions (AppLayout)**: Top-right section of header contains:
   - **User Profile Dropdown**: Avatar button showing Google image or placeholder (first letter on purple background)
     - **User info sources**: Reads from NextAuth session (Google OAuth) OR localStorage (email/password login)
       - Google OAuth: `session?.user?.name`, `session?.user?.email`, `session?.user?.image`
       - Email/Password: `localStorage.getItem("user")` → `{ first_name, last_name, email }` → displays as `"first_name last_name"`
     - Dropdown contains: user info (name, email), theme switcher, logout button
     - Logout button clears localStorage (`access_token`, `user`), cookie (`access_token`), then calls `signOut({ callbackUrl: "/login" })`
     - Click outside closes dropdown (uses `useRef` + `mousedown` event)
7. **CSV export and share header actions**:
   - **`DownloadableTable`** (`@/components/DownloadableTable`): A full table component with a built-in "Download CSV" button in the top-right corner. Use when the same data should both render as a visible table and be exportable.
     - Props: `columns` (array of `{key, header, render?}`), `data`, `filename`, `title`
     - Custom cell rendering via optional `render` function in column definition
     - Used in: `LeaderboardTab` (embeds the download control — STT/TTS evaluation flows on `/stt/[uuid]`, `/tts/[uuid]`, and public STT/TTS pages; **benchmark** Leaderboard tab via `BenchmarkCombinedLeaderboard` in `BenchmarkResultsDialog` and `/public/benchmark/[token]`), and other pages that need a visible grid + CSV without the chart strip
   - **`ExportResultsButton`** (`@/components/ExportResultsButton`): A standalone CSV download button (no inline table). Use when the data is too nested/complex to render as a flat table but users still need a flat-file export — e.g. test/benchmark output with chat history and tool calls.
     - Props: `filename`, `getRows: () => { columns, rows }` (callback evaluated at click time so the export always reflects the latest polling state), optional `disabled`, `label`, `className`
     - Quotes/escapes commas, double quotes, and newlines per RFC 4180; `null`/`undefined` becomes empty cell; objects are JSON-stringified before quoting
     - Shared CSV column shapes for LLM test runs and benchmarks live in `@/lib/exportTestResults` (`buildTestRunCsv`, `buildBenchmarkCsv`) so the in-app dialogs and the public share pages export identical schemas. Column order — unit-test runs: `Test name | Status | Conversation history | Agent response | Tool calls | Next reply | Error`; benchmarks: same with `Model` prepended and `Error` dropped. Two columns are populated **mutually exclusively** based on test type (`testCase.evaluation.type`, falling back to "tool_call when `output.tool_calls` is non-empty, else response"): tool-call tests fill **Tool calls** and leave Next reply empty; response tests fill **Next reply** and leave Tool calls empty. The standalone `Reasoning` column is gone — for response tests it's folded into the per-evaluator blocks in Next reply, and tool-call reasoning is intentionally not exported. Cell formats: **Conversation history** stays JSON-stringified (`historyToString`); **Tool calls** is multi-line plain text — one block per call, `Tool: <name>` + `Arguments: <json>`, blocks separated by blank lines (uses `normalizeToolCall` so historical `{name, arguments}` / `{tool, arguments}` / `{function: {…}}` shapes all render identically); **Next reply** is multi-line plain text — one block per `JudgeResult`, with a `<name>: <verdict>` line (`Pass`/`Fail` for binary; `<score> / <scale_max>` or `Score: N` for rating), an indented `Variables:` list when `variable_values` is non-empty (`  <name>: <value>` per line), and a final `Reasoning: <text>` line. Legacy response runs without `judge_results` fall back to a single `Reasoning: <top-level reasoning>` block (the historical default-`default-llm-next-reply` reasoning). Callers must pass `judgeResults` (`r.judgeResults` from `TestResult` / `tr.judge_results` from the API) into `ExportTestRow.judgeResults` / `ExportBenchmarkRow.judgeResults` so the per-evaluator structure renders.
     - Used in: `TestRunnerDialog` and `BenchmarkResultsDialog` headers (next to `ShareButton`, desktop only via `hidden md:block`); public share pages `/public/test-run/[token]` and `/public/benchmark/[token]`.
     - **Default styling** (`ExportResultsButton`): **teal**-tinted border/background/text (download/export — distinct from share/copy hues).
     - Visibility rules: only render once results exist (`testResults.length > 0` / `hasAnyResults`) and the run is done — never during loading/in-progress, since CSV columns key off the final per-test outputs.
   - **Excel (`.xlsx`) — human labelling evaluation run detail only:** Multi-sheet exports use **`exceljs`** with **`import("exceljs").default`** in `src/app/human-labelling/tasks/[uuid]/evaluator-runs/[runUuid]/page.tsx` — **not** `ExportResultsButton` / `DownloadableTable` (those are CSV). Each evaluator’s sheet lists only items where **`agreement < 1`** for that **(item, evaluator)** (**`isBelowFullEvaluatorAgreement`**); **`itemsForRun`** is the walked set. On-screen **Show disagreements** (**`filterDisagreements`**) trims the carousel, evaluator cards, and annotator **`SourcePill`s** — it does **not** affect export, which always emits **every** **`{annotator}/value`** + **`reasoning`** column for disagreement rows (**Human Labelling → Evaluation run detail**). Row schema includes **Human agreement** / **Evaluator agreement** before machine/annotator columns (**`agreementExportCell`**, optional API fields on **`human_agreement.items[].evaluators[]`** — full column order and fallbacks under **Human Labelling → Evaluation run detail**). The **Export results** button appears when **`job.status === "completed"`** and **`itemsForRun.length > 0`**.
   - **`ShareButton`** (`@/components/ShareButton`) — **not CSV**; sits beside export on finished test/benchmark runs. PATCHes public visibility per entity (`stt` | `tts` | `test-run` | `benchmark` | `simulation-run`); when public, shows **Copy link** (copies `/public/{segment}/{share_token}`). **Styling**: private → **violet**; public → **sky**; **Copy link** → **amber**; **Copied** → **rose** (brief success — distinct from **ExportResultsButton** **teal**, **Share** violet/sky, and **Copy link** amber).
8. **Charts with PNG Export**: `LeaderboardBarChart` component includes built-in PNG download
   - Props: `title`, `data`, `height?`, `yDomain?`, `formatTooltip?`, `colorMap?`, `filename?`
   - "PNG" download button in top-right corner of chart card
   - Exports at 2x resolution with white background for quality
   - Used in: `LeaderboardTab` (which maps each chart row to one or two `LeaderboardBarChart` instances). Benchmark UI does **not** import `LeaderboardBarChart` at the page/dialog level — it uses `BenchmarkCombinedLeaderboard` → `LeaderboardTab`. STT/TTS evaluation UIs use `STTEvaluationLeaderboard` / `TTSEvaluationLeaderboard` → `LeaderboardTab` (see `EvaluationRunDetails`). Older/alternate paths may still reference charts from `SpeechToTextEvaluation` / `TextToSpeechEvaluation` where those modules compose bar charts directly.
9. **LLM Selector Modal**: `LLMSelectorModal` from `@/components/agent-tabs/LLMSelectorModal`
   - Props: `isOpen`, `onClose`, `selectedLLM`, `onSelect`, `availableProviders?`, `allowedProviderSlugs?`, `requiredInputModality?`
   - Internally uses `useOpenRouterModels` hook to fetch models from OpenRouter API as the default model list
   - Shows "Loading models..." while fetching; shows error message with "Retry" button on failure. These states show whenever the effective provider list is empty (`providers.length === 0`), so they work correctly both with and without `availableProviders`
   - Optional `availableProviders` prop for filtered models (used in BenchmarkDialog to exclude already-selected models)
   - `allowedProviderSlugs?: string[]` restricts the picker to a fixed list of providers (e.g. evaluator pages pass `JUDGE_PROVIDER_SLUGS` to scope judge selection to OpenAI/Anthropic/Google/Meta/Mistral/xAI/Qwen/Moonshot).
   - `requiredInputModality?: "text" | "audio" | "image" | "video" | "file"` filters models to those whose `inputModalities` include the given modality. The evaluators pages set this to `"audio"` only for `evaluator_type === "tts"` and `"text"` otherwise (including `evaluator_type === "stt"`) — see "Judge model modality" under Evaluators (`/evaluators`) for the full rule, including the legacy fallback used on the detail page.
   - Used in: AgentTabContent (settings), BenchmarkDialog (model comparison), Evaluators create flow (`/evaluators`), Evaluator detail new-version flow (`/evaluators/[uuid]`)
10. **Benchmark Dialog**: `BenchmarkDialog` from `@/components/BenchmarkDialog`
    - Model selection dialog for running benchmarks comparing multiple LLM models
    - Props: `isOpen`, `onClose`, `agentUuid`, `agentName`, `tests`, `onBenchmarkCreated?`, `agentType?`, `benchmarkModelsVerified?`, `benchmarkProvider?`
    - Allows selecting up to 5 models for comparison
    - Uses `LLMSelectorModal` for model selection with filtered available models (prevents selecting same model twice)
    - **Provider-based model filtering**: When `benchmarkProvider` is set and is not `"openrouter"`, the LLM selector only shows models from that provider (filtered by `model.id.startsWith(providerSlug + "/")` matching OpenRouter's `provider/model-name` ID format). When `benchmarkProvider` is `"openrouter"` or empty, all providers are shown. The `benchmarkProvider` prop flows from `connectionConfig.benchmark_provider` in `AgentDetail` → `TestsTabContent` → `BenchmarkDialog`. **Unsaved-changes guard**: Switching tabs with an unsaved benchmark provider triggers a save/discard dialog (see "Unsaved benchmark provider guard on tab switch" in Gotchas), ensuring `TestsTabContent` always receives the persisted provider value.
    - Opens `BenchmarkResultsDialog` when "Run comparison" is clicked
    - **Connection agent verification**: For `agentType === "connection"`, each model shows an inline verification badge (not checked / verifying / verified / failed). On dialog open, `initialBenchmarkModelsVerified` is filtered to only keep previously verified models — any prior failures are discarded so they start fresh as "not checked". Clicking "Run comparison" opens the `VerifyRequestPreviewDialog` first (if any models need verification) so the user can customize sample messages, then triggers verification for all unverified models in parallel — badges update with spinners then results. Failed models show a chevron toggle to expand error details (error message + sample response JSON in a red-tinted container below the row); the expand toggle and error details are only shown for failed models — verified models never display sample response or expand UI. When any models have failed, a red "Retry failed" button (`bg-red-500 text-white`) appears in the dialog footer (between Cancel and Run comparison) that re-opens the message dialog and retries all failed models at once. When all models pass verification (from either "Run comparison" or "Retry failed"), the benchmark results dialog opens automatically — the user does not need to click "Run comparison" again. On successful verification, `expandedModelError` and `modelSampleResponses` are cleared for that model so stale failure data doesn't persist. The "Run comparison" button is disabled while any model is verifying. Only proceeds to results when all selected models are verified. Uses the same `POST /agents/{uuid}/verify-connection` endpoint with `{ "model":, "messages": [...] } "..." }` in the body. Response uses `result.success` (not `result.verified`) consistent with the connection check response schema.
    - **Theme-aware**: Uses `bg-background` for proper light/dark mode support
11. **Tool Picker**: `ToolPicker` from `@/components/ToolPicker`
    - Props: `availableTools`, `isLoading`, `onSelectInbuiltTool`, `onSelectCustomTool`, `selectedToolIds?`
    - Dropdown with search, divided into "In-built tools" and "User defined tools" sections
    - User defined tools show tool type below name (`text-xs text-muted-foreground`): "Webhook" or "Structured Output"
    - Used in: AddTestDialog (tool invocation test type)
12. **Parameter Card**: `ParameterCard` from `@/components/ParameterCard`
    - Recursive component for rendering parameter/property cards with full JSON Schema support
    - Props: `param`, `path`, `onUpdate`, `onRemove`, `onAddProperty`, `onSetItems`, `validationAttempted`, `isProperty?`, `isArrayItem?`, `siblingNames?`, `hideDelete?`, `showRequired?`
    - `hideDelete` prop: When true, hides the delete button (used when only one parameter exists to enforce minimum)
    - `showRequired` prop: When false, hides the required checkbox (default: true). Used for data field properties where required is handled at the parent level
    - Delete button not shown for array items (`isArrayItem`) or when `hideDelete` is true
    - Uses `NestedContainer` for nested object properties and array items
    - Used in: AddToolDialog (structured output parameters, webhook query/body parameters), AddTestDialog, DataExtractionTabContent
    - **Note**: `DataFieldPropertyCard` is deprecated and now wraps `ParameterCard` with `showRequired={false}`
13. **Nested Container**: `NestedContainer` from `@/components/ui/NestedContainer`
    - Theme-aware container for nested properties/items sections
    - Uses `bg-muted` for proper light/dark mode support (replaces hardcoded `bg-[#1b1b1b]`)
    - Props: `children`, `onAddProperty?`, `addButtonText?`, `showAddButton?`, `showValidationError?`
    - Includes optional "Add property" button with validation error styling
    - Used in: ParameterCard, AddToolDialog (body parameters), DataExtractionTabContent
14. **Native Link Navigation**: List items use Next.js `<Link>` components for browser-native right-click support
    - Enables "Open in new tab" via browser's native context menu
    - Supports Cmd/Ctrl+click to open in new tab
    - Applied to: Agents list, Simulations list, Simulation runs list
15. **View Mode Dialogs**: `TestRunnerDialog` and `BenchmarkResultsDialog` support dual modes:
    - **Run mode** (default): Opens dialog and starts a new run/benchmark
    - **View mode**: Pass `taskId` prop to view existing run results without starting a new run
    - **Test run API** (`POST /agent-tests/agent/{uuid}/run`): `test_uuids` is optional. When omitted (empty body `{}`), the backend runs all tests linked to the agent. When provided, only those specific tests are run. `TestRunnerDialog` has a `runAllLinked?: boolean` prop — when true, sends `{}` (used by "Run all tests" on the agent page); when false/undefined, sends `{ test_uuids: [...] }` (used for single test runs and retries). Single-test retry and retry-all-failed always send explicit `test_uuids`.
    - **Benchmark API** (`POST /agent-tests/agent/{uuid}/benchmark`): Body only contains `{ models: [...] }` — `test_uuids` is not sent. Benchmarks always run all tests linked to the agent. Returns 400 if the agent has no linked tests.
    - **TestRunnerDialog behavior based on `initialRunStatus`**:
      - **Completed runs** (`done`/`completed`): Clears test results initially, fetches fresh from API once (no polling), displays actual pass/fail status
      - **In-progress runs** (`pending`/`queued`/`in_progress`): Initializes tests as "running" (yellow), polls API at `POLLING_INTERVAL_MS` until complete
      - **Overall error state** (`isOverallError`): When `runStatus === "failed"` AND all tests have errors (none have real results), replaces the entire split-panel layout with a centered error card ("Something went wrong" / "We're looking into it..."). Header pass/fail stats are also hidden. This prevents showing a confusing split-panel with every test errored individually
    - **BenchmarkResultsDialog intermediate results**:
      - **When in progress**: Shows Outputs view directly (no tabs visible), all providers displayed immediately
      - **When done**: Shows both Leaderboard and Outputs tabs, auto-switches to Leaderboard tab
      - **Leaderboard tab layout**: Matches STT/TTS: one **`LeaderboardTab`** with **`Test pass rate (%)`** plus **one column per evaluator** from `model_results[].evaluator_summary` (first-seen `metric_key` order). Evaluator **`<th>` labels** and per-evaluator **chart titles** are **`name ?? metric_key`** only (no “Pass rate (%)” / “Mean …” suffix — see Shared Components ▸ **`BenchmarkCombinedLeaderboard`**). One chart grid, **two charts per row** (overall pass rate first, then per-evaluator charts; binary y-domain 0–100, rating `[scale_min, scale_max]` when finite, else `[0, 5]`). Implemented by **`BenchmarkCombinedLeaderboard`** + **`buildBenchmarkCombinedLeaderboardPayload`**. **Model** rows are deduped when **`leaderboard_summary`** and **`model_results`** use different strings for the same model (**`benchmarkCanonicalModelId`** — see Shared Components ▸ **`benchmarkEvaluatorSummary`**). Models missing a given evaluator show **—** in that column; charts only plot finite numeric values per metric (empty chart slot shows a short empty-state message when every model lacks that value).
      - **Hooks vs early return**: `BenchmarkResultsDialog` uses `if (!isOpen) return null` after setup. Any **`useMemo` / `useCallback` / other hooks** that depend on benchmark state must run **above** that guard so the hook list is identical when the dialog is closed vs open — otherwise React reports a change in hook order. Gate memo contents with `isOpen && …` inside the hook instead of placing the hook after the return. (There is no longer a separate memo for stacked per-evaluator leaderboard sections — combined payload is derived inside `BenchmarkCombinedLeaderboard` / `buildBenchmarkCombinedLeaderboardPayload`, but the rule still applies to any future benchmark hooks.)
      - **Fully responsive**: Three-panel layout on desktop, mobile navigation (same pattern as TestRunnerDialog)
        - Mobile: Left panel (providers) and middle panel (test details) toggle visibility, back button to return to provider list; evaluation criteria panel hidden
        - Desktop: All three panels visible — providers list (`md:w-80`) | conversation (`flex-1`) | evaluators / expected tool calls (`w-[32rem]`)
        - Uses `w-full md:w-80` for left panel, conditional hiding with `${selectedTest ? 'hidden md:flex' : 'flex'}`
      - Uses expandable provider toggles (not a dropdown) in the left panel
      - Each provider section shows: provider name, processing spinner (if still running), passed/failed counts (when complete)
      - Provider sections are expandable to show individual test results underneath
      - **Immediate provider display**: On dialog open, creates placeholder entries for ALL models from `models` prop (doesn't wait for API results)
      - **Processing state display**: When a provider has `success === null` and no results yet, shows all test names from `testNames` prop with yellow running indicators (similar to TestRunnerDialog)
      - **Intermediate results handling**: When API returns partial results (some tests completed, others pending), the component shows:
        - Completed tests with their actual status (green checkmark for passed, red X for failed) - these are clickable to view details
        - Missing/pending tests as "running" (yellow indicator) - these are not clickable (displayed as `<div>` not `<button>`)
        - Uses `Math.max(totalTests, testNames.length, resultsCount)` to determine expected test count, ensuring tests don't disappear during polling
      - As results arrive from API, running indicators update to green checkmarks or red X marks
      - **Auto-expand behavior**: First provider (from `models` prop) is expanded immediately when dialog opens, not waiting for results
      - **Outputs tab — default selected test**: When polling first returns a `model_results` row with non-empty `test_results`, the dialog auto-selects **`testIndex: 0`** for a qualifying model so the middle/detail panel is populated without an extra click. **Selection order**: walk the **`models` prop** in order and pick the first model id that appears on a `model_results` entry with results; if none match (configured id vs API `model` string mismatch), fall back to the **first** API row that has `test_results`. If **`models` is empty** — e.g. **view past benchmark** from the Tests tab or `/tests` Runs, where parents pass **`models={[]}`** and only **`taskId`** — use that API-order fallback only. A ref (`hasAutoSelectedFirstBenchmarkTestRef`) ensures this runs **once per dialog open**. The chosen model id is also merged into **`expandedProviders`** so that provider section stays open in the left list.
      - **Merged providers**: `getProvidersToDisplay()` function merges `modelResults` from API with placeholders for any models that don't have results yet
      - Types support null values: `success: boolean | null`, `test_results: BenchmarkTestResult[] | null`, `passed: boolean | null`
      - **Header status badge**: Uses `StatusBadge` component (same as STT/TTS evaluation pages) to show task status ("Queued" with gray badge, "Running" with yellow badge) plus spinner while benchmark is in progress
      - **Loading state**: Shows simple "Loading..." spinner until first API response (doesn't try to guess status)
      - **Interactive list items**: Test items use `<button type="button">` with `w-full` for proper mobile touch support
    - **Props for viewing past runs**:
      - `taskId`: The run UUID to fetch results for
      - `tests`: Array converted from `pastRun.results` to show test names while loading (TestRunnerDialog only)
      - `initialRunStatus`: Determines initialization behavior (TestRunnerDialog only)
      - **BenchmarkResultsDialog**: Parents that only have the run id (e.g. Tests tab / `/tests` past benchmark row) may pass **`models={[]}`** and **`testNames={[]}`** — polling supplies `model_results` and test rows; default Outputs selection and placeholders must not depend on those props being non-empty (see **Outputs tab — default selected test** above).
    - **Callback props for coordinated updates**:
      - `onRunCreated` / `onBenchmarkCreated`: Notifies parent when a new run/benchmark is created
      - `onStatusUpdate`: Called during polling (only when `isRunning` is true) to sync status changes back to parent (TestRunnerDialog only)
      - Prevents duplicate polling and keeps table/dialog in sync
    - **Re-initialization prevention** (TestRunnerDialog - prevents flickering while ensuring polling starts on reopen):
      - Uses THREE refs: `wasOpenRef`, `initializedTaskIdRef`, and `pollingIntervalRef`
      - **Skip condition**: Only skips if ALL THREE conditions are true:
        1. `wasOpenRef.current` - dialog was already open (not transitioning from closed→open)
        2. `initializedTaskIdRef.current === taskId` - already initialized for this exact taskId
        3. `pollingIntervalRef.current` - polling is currently active
      - `wasOpenRef` is updated at the end of the effect to track the previous open state
      - This ensures fresh initialization when dialog reopens (even if other refs have stale values)
      - Always clears existing polling interval before starting new one
      - Refs and intervals are cleared when dialog closes or when starting a fresh run
      - `onStatusUpdate` only called for in-progress runs (when `isRunning` is true)
    - **Auth token guard** (TestRunnerDialog): The useEffect must wait for `backendAccessToken` before starting polling:
      - Returns early if `backendAccessToken` is not available
      - Includes `backendAccessToken` in useEffect dependency array
      - This ensures polling re-attempts when session loads (token becomes available)
      - Without this guard, API calls fail silently with `Authorization: Bearer undefined`
    - **Fallback UUID generation** (TestRunnerDialog): When viewing past runs, the API response may not include `test_uuid` for each test result
      - Without proper UUIDs, React's key prop receives empty strings, causing "duplicate key" console errors
      - Solution: Generate a unique fallback key using the array index and test name: `apiResult.test_uuid || \`generated-${index}-${testName}\``
      - This ensures unique keys even when the backend doesn't provide UUIDs, while preserving real UUIDs when available
    - **Per-evaluator verdicts** (response tests): both dialogs thread the `judge_results: JudgeResult[] | null` field straight through from the API to `TestRunOutputsPanel` / `BenchmarkOutputsPanel`, which in turn pass it (along with the top-level `reasoning`, the `test_case.evaluators` echo, and an optional `scaleByEvaluatorUuid` fallback map) to **both** `EvaluationCriteriaPanel` (the third / right column on desktop) **and** `TestDetailView` (which renders a mobile-only `JudgeResultsList` via `md:hidden` so small screens don't lose the data). Field naming: `TestRunResult.judgeResults` (camel) and `BenchmarkTestResult.judge_results` (snake to match the API). Tool-call tests have `judge_results: null` — the right column renders the expected tool calls + the top-level `reasoning` (success/failure summary; **`CollapsibleReasoningStrip`** expands it — hidden by default), and the middle panel's tool-call output renders without an inline reasoning block (the right column already covers it). The right column dropped the visible "Type" badge — section structure (`Evaluators` heading vs `Expected Tool Calls` heading) makes the test type self-evident. Each per-evaluator card links the evaluator name to `/evaluators/{evaluator_uuid}` when the UUID is present (`EvaluatorNameLink` in `shared.tsx`; legacy `evaluator_uuid: null` → plain text). A snapshotted one-line **description** may appear under the name on both the desktop panel cards and the mobile `JudgeResultCard` list when the API provides it. Per-test variable values and the rating scale are read inline from each `JudgeResult` (`result.variable_values`, `result.scale_max`); the panel keeps a single fallback to `test_case.evaluators[i].variable_values` and the caller-supplied `scaleByEvaluatorUuid` map for older snapshots that pre-date the inline-fields backend rollout. Neither dialog currently populates `scaleByEvaluatorUuid`, so rating chips for legacy snapshots fall through to amber `Score: N`; new snapshots colour green / red because `scale_max` is on the entry itself. See **Reasoning disclosure** under Test Results Components for the collapsible UI pattern.
    - Used for: clicking past run rows in Tests tab to view historical results

### Data Fetching Pattern

- Fetch data in `useEffect` with loading/error states
- Backend URL from `process.env.NEXT_PUBLIC_BACKEND_URL`
- **All API calls require JWT authentication** via `Authorization` header
- Handle loading spinners and error states consistently
- **Handle 401 errors** by logging out and redirecting to login

**Preferred: Use `@/lib/api` utilities** (handles headers, 401 errors, and JSON parsing automatically):

```tsx
import { useSession } from "next-auth/react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";

const { data: session } = useSession();
const accessToken = (session as any)?.backendAccessToken;

// In useEffect or handlers
useEffect(() => {
  if (!accessToken) return;

  const fetchData = async () => {
    try {
      const data = await apiGet<ItemData[]>("/items", accessToken);
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  };

  fetchData();
}, [accessToken]);

// POST/PUT/DELETE
const newItem = await apiPost<ItemData>("/items", accessToken, { name: "New" });
const updated = await apiPut<ItemData>(`/items/${id}`, accessToken, {
  name: "Updated",
});
await apiDelete(`/items/${id}`, accessToken);
```

**For CRUD list pages, use `useCrudResource` hook:**

```tsx
import { useCrudResource } from "@/hooks";

const { items, isLoading, isCreating, error, create, update, remove, refetch } =
  useCrudResource<ItemType>({
    endpoint: "/items",
    accessToken,
  });
```

**Manual fetch pattern** (used in pages/components that don't use API utilities): use `Authorization` + `accept: "application/json"` (and `Content-Type` when sending JSON bodies)—same minimal headers as `getDefaultHeaders`; nothing tunnel-specific.

```tsx
import { signOut } from "next-auth/react";
import { useAccessToken } from "@/hooks";

const backendAccessToken = useAccessToken();

useEffect(() => {
  if (!backendAccessToken) return;

  const fetchData = async () => {
    const response = await fetch(`${backendUrl}/endpoint`, {
      headers: {
        Authorization: `Bearer ${backendAccessToken}`,
        accept: "application/json",
      },
    });

    if (response.status === 401) {
      // Clear all auth state
      localStorage.removeItem("access_token");
      localStorage.removeItem("user");
      document.cookie = "access_token=; path=/; max-age=0; SameSite=Lax";
      await signOut({ callbackUrl: "/login" });
      return;
    }
    // ... handle response
  };

  fetchData();
}, [backendAccessToken]);
```

---

## Documentation (Mintlify)

The `/docs` folder contains Mintlify-style documentation organized into 9 guides across 2 groups.

### Structure

```
docs/
├── mint.json              # Navigation, theme, and site configuration
├── introduction.mdx       # Overview with workflow and guide links
├── guides/
│   ├── agents.mdx        # Agent creation, configuration, and management
│   ├── tools.mdx         # Tool CRUD with all parameter types
│   ├── personas.mdx      # Persona CRUD for simulations
│   ├── scenarios.mdx     # Scenario CRUD for simulations
│   ├── metrics.mdx       # Metric CRUD for evaluation
│   ├── stt.mdx           # STT evaluation
│   ├── tts.mdx           # TTS evaluation
│   ├── llm-testing.mdx   # LLM testing (agent, tools, tests, benchmarks)
│   └── simulations.mdx   # End-to-end simulations (single page)
└── images/               # Screenshots for guides
```

### Navigation Groups (mint.json)

| Group             | Pages                                       |
| ----------------- | ------------------------------------------- |
| **Get Started**   | introduction                                |
| **Core Concepts** | agents, tools, personas, scenarios, metrics |
| **Guides**        | stt, tts, llm-testing, simulations          |

### Guide Content

| Guide           | Content Covered                                                                                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Agents**      | Create, configure (system prompt, STT/TTS/LLM), update, duplicate, delete agents. Covers all tabs: Agent, Tools, Data Extraction, Tests, Settings                                                |
| **Tools**       | Create tools with all parameter types (string, number, boolean, array, object), nested properties, update, delete. Attach tools to agents                                                        |
| **Personas**    | Create/update/delete personas with label, characteristics, gender, language, interruption sensitivity settings                                                                                   |
| **Scenarios**   | Create/update/delete scenarios with label and description fields                                                                                                                                 |
| **Metrics**     | Create/update/delete/duplicate metrics with evaluation instructions                                                                                                                              |
| **STT**         | Upload audio, select providers, view WER/latency metrics, leaderboard                                                                                                                            |
| **TTS**         | Add text samples, select providers, listen to outputs, view metrics                                                                                                                              |
| **LLM Testing** | Complete workflow: create agent → create tool → attach tool → create Next Reply test → run test → create Tool Invocation test → run test → attach tests to agent → run all tests → run benchmark |
| **Simulations** | Setup (agent, tool, personas, scenarios, metrics) → Text simulation section (per-row metrics, overall metrics, transcripts) → Voice simulation section (latency metrics, audio transcripts)      |

### Mintlify Components Used

- `<Frame>` - Image containers
- `<Card>` / `<CardGroup>` - Navigation cards
- `<Accordion>` / `<AccordionGroup>` - Collapsible best practices
- `<Tip>`, `<Note>`, `<Warning>`, `<Info>` - Callout boxes
- `<Steps>` - Numbered workflow steps
- Tables with Markdown syntax

### Adding Screenshots

Each guide references placeholder images in `/docs/images/`. Image naming convention:

- `{feature}_overview.png` - List/landing page
- `{feature}_new.png` - Create/new page
- `{feature}_config.png` - Configuration view
- `{feature}_results.png` - Results view
- `sim_*.png` - Simulation-specific screenshots
- `persona_*.png`, `scenario_*.png`, `metric_*.png` - Simulation setup screenshots

---

## Styling Guidelines

### CSS Variables (defined in globals.css)

```css
:root {
  --background: #ffffff;
  --foreground: #1a1a1a;
  --muted: #f5f5f5;
  --muted-foreground: #737373;
  --border: #e5e5e5;
  --accent: #f5f5f5;
  --accent-foreground: #171717;
  --popover: #ffffff;
  --sidebar-width: 260px;
}
```

### Theme Switching

The app supports three theme modes (all add a class to `<html>`):

- **Light** - Adds `.light` class
- **Dark** - Adds `.dark` class
- **Device** - Detects system preference and adds `.light` or `.dark` accordingly, listens for system changes

**Implementation:**

- Tailwind's `dark:` variant enabled via `@custom-variant dark (&:where(.dark, .dark *));` in globals.css
- Theme state managed in `AppLayout` component
- Persisted to `localStorage` under key `"theme"`
- System preference changes trigger re-evaluation when in "device" mode

**Preferred approach:** Use CSS variable-based classes (auto-adapt to theme):

```tsx
// ✅ Preferred - uses CSS variables that auto-switch with theme
<div className="bg-background text-foreground border-border">
<div className="bg-muted text-muted-foreground">
<div className="bg-background"> {/* for dropdowns/dialogs - DO NOT use bg-popover, it causes transparent backgrounds */}

// ⚠️ Alternative - explicit dark: variants (use sparingly)
<div className="bg-white dark:bg-gray-900 text-black dark:text-white">
```

**Avoid hardcoded colors** like `bg-black`, `bg-[#1a1a1a]`, `text-white`, `border-[#333]` - these break in light mode.

### Utility Classes (globals.css)

**Hide Scrollbar (for horizontal scroll containers):**

```css
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}
```

Combine with inline styles for cross-browser support:

```tsx
<div
  className="hide-scrollbar overflow-x-auto"
  style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
>
  {/* Scrollable content */}
</div>
```

Used for: Tab navigation, horizontal card lists where scrollbar should be hidden

### Component Sizing

- **Standard heights**: `h-8` (32px), `h-9` (36px), `h-10` (40px), `h-11` (44px)
- **Text sizes**: `text-[12px]`, `text-[13px]`, `text-[14px]`, `text-[15px]`, `text-base`, `text-lg`, `text-2xl`
- **Border radius**: `rounded-md` (buttons/inputs), `rounded-xl` (cards/panels)
- **Spacing**: Use Tailwind spacing (e.g., `gap-2`, `gap-3`, `gap-4`, `p-4`, `p-6`, `p-8`)

### Button Styles

**Preferred: Use `Button` component** from `@/components/ui`:

```tsx
import { Button } from "@/components/ui";

<Button variant="primary" size="md" onClick={handleSave}>Save</Button>
<Button variant="secondary" size="md" onClick={handleCancel}>Cancel</Button>
<Button variant="danger" size="md" onClick={handleDelete}>Delete</Button>
<Button variant="ghost" size="sm" onClick={handleAction}>Action</Button>

// With loading state
<Button isLoading={isSaving} loadingText="Saving...">Save</Button>
```

**Button variants:**

- `primary`: `bg-foreground text-background hover:opacity-90`
- `secondary`: `border border-border bg-background hover:bg-muted/50`
- `danger`: `bg-red-800 text-white hover:bg-red-900`
- `ghost`: `text-muted-foreground hover:text-foreground hover:bg-muted`

**Button sizes:** `sm` (h-8), `md` (h-10), `lg` (h-12)

**Legacy: Inline button classes** (still used in some files):

```tsx
// Primary
className =
  "h-10 px-4 rounded-md text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer";

// Secondary
className =
  "h-10 px-4 rounded-md text-base font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer";

// Danger/Delete icon button
className = "text-muted-foreground hover:text-red-500 hover:bg-red-500/10";
```

### Status/Type Badge (Pill) Styles

Status and type badges use theme-aware colors with more pronounced light mode colors and subtle dark mode colors:

```tsx
// Status badges - pattern: bg-{color}-100 text-{color}-700 dark:bg-{color}-500/20 dark:text-{color}-400
// Success (done, completed)
className =
  "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400";

// Warning (running, in_progress)
className =
  "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400";

// Error (failed, error)
className = "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400";

// Neutral (pending, queued, default)
className = "bg-gray-200 text-gray-700 dark:bg-gray-500/20 dark:text-gray-400";

// Type badges
// Chat type
className =
  "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400";

// Audio/Voice type
className =
  "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400";
```

**Badge base structure:**

```tsx
<span
  className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${badgeClass}`}
>
  {label}
</span>
```

### Input Styles

**For search inputs**: Use `SearchInput` from `@/components/ui`:

```tsx
import { SearchInput } from "@/components/ui";

<SearchInput
  value={searchQuery}
  onChange={setSearchQuery}
  placeholder="Search..."
/>;
```

**Standard input classes:**

Desktop-only (non-responsive):

```tsx
className =
  "w-full h-10 px-4 rounded-md text-base border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent";
```

Responsive (dialogs, sidebars, list pages):

```tsx
className =
  "w-full h-9 md:h-10 px-3 md:px-4 rounded-md text-sm md:text-base border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent";
```

**Form field labels (responsive):**

```tsx
// In dialogs and sidebars
<label className="block text-xs md:text-sm font-medium mb-2">
  Field Label <span className="text-red-500">*</span>
</label>
```

### Custom Checkbox (Button-based)

Desktop-only:

```tsx
// Checkbox using button element with visible borders in both themes
<button
  onClick={() => setChecked(!checked)}
  className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors cursor-pointer ${
    checked
      ? "bg-foreground border-foreground"
      : "bg-background border-muted-foreground hover:border-foreground"
  }`}
>
  {checked && (
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
</button>
```

Responsive (in dialogs):

```tsx
// Checkbox with responsive sizing
<button
  onClick={() => setChecked(!checked)}
  className={`w-5 h-5 md:w-6 md:h-6 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-colors cursor-pointer ${
    checked
      ? "bg-foreground border-foreground"
      : "border-muted-foreground hover:border-foreground"
  }`}
>
  {checked && (
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
```

### Bulk Selection & Delete Pattern

Tables that support bulk delete use a consistent pattern with checkbox selection. Currently applied to: **Tests** (`/tests`), **Agent Tests tab** (`TestsTabContent`), and **Data Extraction Fields** (`DataExtractionTabContent`).

**State:**
- `selectedUuids: Set<string>` — tracks selected items
- `itemsToDeleteBulk: string[]` — populated when bulk delete dialog opens
- Reuses existing single-delete state (`itemToDelete`) alongside bulk state

**UI elements:**
- **Select-all checkbox** in table header (40px column) — toggles all *filtered* items
- **Per-row checkbox** (same 40px column) — uses `e.stopPropagation()` to prevent row click
- **Mobile cards** — checkbox at top-left of card content area with `mt-0.5` alignment
- **"Delete/Remove selected (N)" button** — appears in header only when `selectedUuids.size > 0`, styled `border border-red-500 text-red-500 hover:bg-red-500/10`
- **DeleteConfirmationDialog** — dynamic title/message: "Delete 3 tests?" for bulk vs "Delete 'Test Name'?" for single

**Delete handler:** Loops through selected UUIDs calling the single-delete API endpoint sequentially (no bulk API endpoint). On success, filters local state and clears selection.

**Grid column change:** Adding the checkbox column changes the grid template (e.g., `grid-cols-[1fr_1fr_auto]` → `grid-cols-[40px_1fr_1fr_auto]`).

---

## Domain Concepts

### Agents

Voice agents configured with:

- **System Prompt**: Defines agent persona and behavior
- **STT Provider**: Speech-to-text service (google, openai, deepgram, etc.)
- **TTS Provider**: Text-to-speech service (google, openai, cartesia, etc.)
- **LLM Model**: Language model fetched from OpenRouter API, identified by `provider/model-name` format (e.g., `openai/gpt-5.2-chat`)
- **Tools**: Function calling tools the agent can use
- **Data Extraction Fields**: Fields to extract from conversations
- **Settings**: Agent speaks first, end conversation tool enabled

### Tools

Custom function calling tools with:

- **Name**: Function name for LLM
- **Description**: When/how to use the tool
- **Parameters**: JSON Schema formatted parameters (supports nested objects, arrays)

### Personas

Simulated user characteristics:

- **Label**: Persona name
- **Characteristics**: Detailed description of WHO they are and HOW they behave
- **Gender**: male | female
- **Language**: english | hindi | kannada
- **Interruption Sensitivity**: none | low | medium | high

**Cross-page navigation**: The Add/Edit Persona dialog includes a clickable link to "Scenarios" in the characteristics help text, allowing users to quickly navigate between related concepts.

### Scenarios

Test scenarios defining WHAT the persona should do:

- **Label**: Scenario name
- **Description**: Task or conversation goal

**Cross-page navigation**: The Add/Edit Scenario dialog includes a clickable link to "Personas" in the description help text, allowing users to quickly navigate between related concepts.

### Simulations

End-to-end tests combining:

- Agent configuration
- Selected personas
- Selected scenarios
- Evaluation metrics
- Run types: chat | audio | voice

### Evaluations

Unit test evaluations for:

- **STT**: Upload audio + transcription, compare providers
- **TTS**: Upload text, compare provider outputs
- Metrics: STT (WER + one column per attached evaluator), TTS (one column per attached evaluator + TTFB). Each STT/TTS run can attach one or more evaluators (system-default or user-owned, binary or rating); columns/charts/About-tab rows are derived dynamically per run.

---

## API Endpoints

All endpoints are relative to `NEXT_PUBLIC_BACKEND_URL`:

| Resource        | Endpoints                                                                                                                                                                                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth            | `POST /auth/google` (body: `{ id_token }`)                                                                                                                                                                                                                        |
| Agents          | `GET/POST /agents`, `GET/PUT/DELETE /agents/{uuid}`, `POST /agents/{uuid}/duplicate`                                                                                                                                                                              |
| Agent Tools     | `GET /agent-tools/agent/{uuid}/tools`, `POST/DELETE /agent-tools`                                                                                                                                                                                                 |
| Tools           | `GET/POST /tools`, `GET/PUT/DELETE /tools/{uuid}`                                                                                                                                                                                                                 |
| Personas        | `GET/POST /personas`, `GET/PUT/DELETE /personas/{uuid}`                                                                                                                                                                                                           |
| Scenarios       | `GET/POST /scenarios`, `GET/PUT/DELETE /scenarios/{uuid}`                                                                                                                                                                                                         |
| Evaluators      | `GET /evaluators?include_defaults=true`, `POST /evaluators`, `GET/PUT/DELETE /evaluators/{uuid}`, `POST /evaluators/{uuid}/duplicate`, `GET /evaluators/default-prompt?purpose=<llm\|stt\|tts\|simulation>`, `POST /evaluators/{uuid}/versions` (`make_live?: boolean`), `POST /evaluators/{uuid}/versions/live` |
| Simulations     | `GET/POST /simulations`, `GET/DELETE /simulations/{uuid}`                                                                                                                                                                                                         |
| Simulation Runs | `GET /simulations/run/{runId}`, `POST /simulations/{uuid}/run`, `POST /simulations/run/{runId}/abort`                                                                                                                                                             |
| Tests           | `GET/POST /tests`, `GET/PUT/DELETE /tests/{uuid}`, `POST /tests/bulk`. **`POST` / `PUT` body** for next-reply (`type: "response"`) tests includes a top-level `evaluators: [{ evaluator_uuid, variable_values? }]` array (sibling to `name` / `type` / `config`); `PUT` replaces the whole pivot set when present and leaves it untouched when omitted. Tool-call tests omit `evaluators` entirely. **`GET` response** carries hydrated `evaluators[]` rows joined with the pinned evaluator version (see "Evaluators (next-reply tab only)" under section 5). **`POST /tests/bulk`** also takes the same per-test `evaluators` shape for response uploads (resolved client-side from the CSV's `evaluators` column — see "Bulk upload tests via CSV" in section 5); the legacy per-test `criteria` field is no longer sent. |
| Agent Tests     | `GET /agent-tests/agent/{uuid}/tests`, `GET /agent-tests/agent/{uuid}/runs`, `POST/DELETE /agent-tests`, `POST /agent-tests/agent/{uuid}/run`, `GET /agent-tests/run/{taskId}`, `POST /agent-tests/agent/{uuid}/benchmark`, `GET /agent-tests/benchmark/{taskId}` |
| STT Evaluation  | `POST /stt/evaluate`, `GET /stt/evaluate/{uuid}`                                                                                                                                                                                                                  |
| TTS Evaluation  | `POST /tts/evaluate`, `GET /tts/evaluate/{uuid}`                                                                                                                                                                                                                  |
| Jobs            | `GET /jobs` (optional `job_type` query param: `stt` or `tts`)                                                                                                                                                                                                     |
| Presigned URLs  | `POST /presigned-url`                                                                                                                                                                                                                                             |

### Jobs API Response Structure

The `/jobs` endpoint returns evaluation jobs with the following structure:

```json
{
  "jobs": [
    {
      "uuid": "1d8db518-d209-4365-a77e-45a8ec3abcee",
      "type": "tts-eval",  // or "stt-eval"
      "status": "done",
      "details": {
        "texts": ["sample text 1", "sample text 2"],  // TTS uses texts
        "audio_paths": ["s3://..."],  // STT uses audio_paths
        "providers": ["cartesia", "openai", "google"],
        "language": "english"
      },
      "results": {
        "provider_results": [...],
        "leaderboard_summary": [...],
        "error": null
      },
      "created_at": "2026-01-17 06:18:20",
      "updated_at": "2026-01-17 06:18:53"
    }
  ]
}
```

**Key fields:**

- `uuid`: Job identifier (NOT `task_id`)
- `type`: `"tts-eval"` or `"stt-eval"`
- `details.texts`: Array of input texts (TTS - use `.length` to get sample count)
- `details.audio_paths`: Array of S3 audio paths (STT)
- `details.providers`: Array of provider names
- `details.language`: Language setting
- `results`: Contains `provider_results` and `leaderboard_summary` (nested, not top-level)

### TTS/STT Evaluate API Response Structure (Different from Jobs API!)

The `/tts/evaluate/{uuid}` and `/stt/evaluate/{uuid}` endpoints return a **different structure** than `/jobs`:

```json
{
  "task_id": "1d8db518-d209-4365-a77e-45a8ec3abcee",
  "status": "done",
  "language": "english",
  "dataset_id": "...",
  "dataset_name": "...",
  "evaluator_uuids": ["..."],
  "provider_results": [
    {
      "provider": "openai",
      "metrics": {
        "wer": 0.1,
        "semantic_match": { "type": "binary", "mean": 0.85 }
      },
      "results": [
        { "audio_path": "...", "semantic_match": 1, "semantic_match_reasoning": "..." }
      ],
      "evaluator_runs": [
        {
          "evaluator_uuid": "5c9f...",
          "metric_key": "semantic_match",
          "name": "semantic_match",
          "aggregate": { "type": "binary", "mean": 0.85 }
        }
      ]
    }
  ],
  "leaderboard_summary": [...],
  "error": null
}
```

**Key difference:** Results are at the **top level** (not nested under `results`).

**`evaluator_runs`** (per-provider, optional) is the **preferred source of truth** in the new format: one entry per attached evaluator carrying `evaluator_uuid` (stable ID), `metric_key` (the artefact column name — same key used in `metrics`, the per-row CSV, and the leaderboard summary), `aggregate` (nested `{ type, mean, scale_min?, scale_max? }` from `metrics.json`), and `name` (current human-readable name from the DB at response time — reflects renames after the run while `metric_key` stays pinned to the artefact).

**`evaluator_uuids`** (top-level, optional) is the list of evaluators attached at job creation. Both `evaluator_runs` and `evaluator_uuids` (and the legacy `metrics["{name}_info"]` keys) drive the **dynamic per-evaluator columns** in the Leaderboard, `ProviderMetricsCard`, and Outputs results tables, **and** the **About-tab rows** (see "Dynamic per-evaluator columns" and "About-tab evaluators" under the Detail Page section for the exact priority order). When `evaluator_runs` is present the auth detail page reads names directly from it and skips per-UUID `GET /evaluators/{uuid}` fetches; legacy jobs (no `evaluator_runs`) still fall back to the union of `evaluator_uuids` + `*_info` prefixes plus a final default-evaluator path when both sources are empty.

**Per-row CSV columns** (`provider_results[i].results[j]`):
- New format: `result[name]` for the score (no `_score` suffix), `result[`${name}_reasoning`]` for the reasoning.
- Legacy `_info` format: `result[`${name}_score`]`, `result[`${name}_reasoning`]`.
- Legacy single-evaluator format: `result.llm_judge_score`, `result.llm_judge_reasoning`.

**`metrics` shape per evaluator**:
- New format: `metrics[name] = { type, mean, scale_min?, scale_max? }` (object — identifiable by presence of `"type"`).
- Legacy `_info` format: `metrics[`${name}_score`]` (number) plus `metrics[`${name}_info`] = { type, mean }`.
- Scalar metrics like `wer` stay plain numbers in both formats.

| Endpoint                   | ID Field  | Results Location               |
| -------------------------- | --------- | ------------------------------ |
| `GET /jobs`                | `uuid`    | `results.provider_results`     |
| `GET /tts/evaluate/{uuid}` | `task_id` | `provider_results` (top-level) |
| `GET /stt/evaluate/{uuid}` | `task_id` | `provider_results` (top-level) |

### Agent Test Runs API Response Structure

The `GET /agent-tests/agent/{uuid}/runs` endpoint returns test run history:

```json
{
  "runs": [
    {
      "uuid": "f54adc70-53a1-486e-a4de-ce8078b47598",
      "name": "Run 1",
      "status": "done",
      "type": "llm-unit-test",  // or "llm-benchmark"
      "updated_at": "2026-01-17 06:30:55",
      "total_tests": 2,
      "passed": 1,
      "failed": 1,
      "results": [
        {
          "passed": true,
          "output": { "response": "", "tool_calls": [...] },
          "test_case": {
            "name": "plans next question",  // Test name from original test
            "history": [...],
            "evaluation": { "type": "tool_call", ... }
          }
        }
      ],
      "model_results": null,  // Only for llm-benchmark
      "leaderboard_summary": null,
      "error": null
    }
  ]
}
```

**Key fields:**

- `name`: Run display name (e.g., "Run 1", "Benchmark 1") - not displayed in UI
- `type`: `"llm-unit-test"` (regular test runs) or `"llm-benchmark"` (model comparison)
- `total_tests`: Number of tests in the run (used to display "N tests" for unit tests)
- `passed`/`failed`: Counts for `llm-unit-test` type; `null` for `llm-benchmark` or in-progress runs
- `model_results`: Array of per-model results for benchmarks (`.length` used to display "N models")
- `results[].name`: Test name (present in in-progress responses)
- `results[].passed`: `true`/`false` when complete, `null` when test is still running
- `results[].test_case.name`: Test name from completed test results
- **Note**: For test names, check `results[].name` first (in-progress), then `results[].test_case.name` (completed)

### Benchmark API Response (Intermediate Results)

The `GET /agent-tests/benchmark/{taskId}` endpoint returns intermediate results during `in_progress` status:

```json
{
  "task_id": "0b69d3af-bbc1-4c0c-a842-1682ec4b7649",
  "status": "in_progress",
  "model_results": [
    {
      "model": "openai/gpt-5.1",
      "success": true,
      "message": "Benchmark completed successfully for openai/gpt-5.1",
      "total_tests": 2,
      "passed": 1,
      "failed": 1,
      "test_results": [
        {
          "name": "plans next question",
          "passed": true,
          "output": { "response": "", "tool_calls": [...] },
          "test_case": { "name": "...", "history": [...], "evaluation": {...} }
        }
      ]
    },
    {
      "model": "anthropic/claude-opus-4.5",
      "success": null,
      "message": "Processing...",
      "total_tests": null,
      "passed": null,
      "failed": null,
      "test_results": null
    }
  ],
  "leaderboard_summary": null,
  "error": null
}
```

**Key fields for intermediate results:**

- `model_results[].success`: `true`/`false` when provider complete, `null` when still processing
- `model_results[].test_results`: Array of test results when complete, `null` when processing
- `model_results[].test_results[].passed`: `true`/`false` when test complete, `null` if test still running
- `leaderboard_summary`: Only populated when status is `done`/`completed`. Shape differs from STT/TTS leaderboard summaries:

```tsx
// Benchmark LeaderboardSummary (BenchmarkResultsDialog)
type LeaderboardSummary = {
  model: string; // backend-defined identifier (may be short e.g. "gpt-4.1", OpenRouter-style "openai/gpt-4.1", or legacy "provider__model")
  passed: string; // e.g. "1" (string, not number)
  total: string; // e.g. "2" (string, not number)
  pass_rate: string; // e.g. "50.0" (string, not number)
};
```

Note: **`leaderboard_summary[].model`** and **`model_results[].model`** are not guaranteed to use the same string for the same logical model (e.g. short id vs `provider/model`). The merged leaderboard uses **`benchmarkCanonicalModelId`** (see **`benchmarkEvaluatorSummary`**) to dedupe rows and attach **`leaderboard_summary`** cells to the canonical **`model_results`** id when unambiguous. The Leaderboard **Model** column shows that canonical **`model`** string by default (no automatic **`__` → `/`** transform); other surfaces (e.g. outputs panels) may still format model ids for readability.

- **`model_results[].evaluator_summary`** (optional): when present (finished model + `metrics.json` criteria), each entry is one response evaluator aggregate (`metric_key`, `name`, `description`, `evaluator_uuid`, `type`, plus binary or rating numeric fields per backend contract). Omitted or `null` for in-flight models or older jobs. Does not replace `leaderboard_summary`; the app merges both into one **`BenchmarkCombinedLeaderboard`** table + chart grid (see `benchmarkEvaluatorSummary` in Shared Components).

### JWT Authentication

All API endpoints require JWT authentication. Include the `Authorization: Bearer ${token}` header in every request.

The backend identifies the user from the JWT token - **do not pass `user_id` in request bodies**.

---

## Shared Components & Utilities

### Icons Library (`@/components/icons`)

All SVG icons are centralized in `src/components/icons/index.tsx`. Import icons from this module:

```tsx
import {
  SpinnerIcon,
  CloseIcon,
  SearchIcon,
  TrashIcon,
  CheckIcon,
  CheckCircleIcon, // Circled checkmark (verification status)
  XIcon,
  PlusIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ToolIcon,
  DocumentIcon,
  PlayIcon,
  RefreshIcon,
  AlertIcon, // Circle with exclamation (error/failed status)
  WarningTriangleIcon, // Triangle with exclamation (warnings)
  // ... and more
} from "@/components/icons";

// Usage
<SpinnerIcon className="w-5 h-5 animate-spin" />
<CheckCircleIcon className="w-4 h-4 text-green-500" />
<AlertIcon className="w-4 h-4 text-red-500" />
```

**Important**: Always use shared icons from `@/components/icons` instead of inline SVGs for spinner, checkmark, alert, warning, close, etc. The `ConnectionConfig` type is exported from `AgentConnectionTabContent.tsx` and reused in `AgentDetail.tsx` for type safety.

### Verify Request Preview Dialog (`@/components/VerifyRequestPreviewDialog`)

Modal dialog shown before every agent connection verification attempt (including benchmark per-model verification). Two-column layout (stacked on mobile): left column has editable message rows (role dropdown: user/assistant, content input, remove button, plus "Add message"), right column shows live JSON preview. Validates that all message content fields are non-empty on submit (red border + error text). On failure, the dialog stays open showing error details and sample response inline; the button label changes to "Retry" but still goes through validation, letting the user edit messages before re-submitting. Props: `open`, `onClose`, `onConfirm(messages)`, `isVerifying`, `verifyError?`, `verifySampleResponse?`. Used by `AgentConnectionTabContent`, `AgentDetail`, `simulations/[uuid]/page`, and `BenchmarkDialog`.

### Verify Error Popover (`@/components/VerifyErrorPopover`)

Popover component for displaying connection verification errors as a dropdown beneath the verify button. Still rendered in `AgentDetail.tsx`, `agents/[uuid]/page.tsx`, and `simulations/[uuid]/page.tsx` alongside their verify buttons, but verification errors are now primarily surfaced inside the `VerifyRequestPreviewDialog` (which stays open on failure). The popover serves as a fallback if the dialog has been closed. Renders an absolutely-positioned dropdown with a fixed backdrop for dismiss, a "Verification Failed" header, error text, and optional sample response JSON. Returns `null` when both `error` and `sampleResponse` are falsy.

```tsx
import { VerifyErrorPopover } from "@/components/VerifyErrorPopover";

// Place inside a `relative` container next to the verify button
<div className="relative">
  <button onClick={handleVerify}>Verify</button>
  <VerifyErrorPopover
    error={verify.verifyError}
    sampleResponse={verify.verifySampleResponse}
    onDismiss={verify.dismiss}
  />
</div>
```

### Status Utilities (`@/lib/status`)

Centralized status formatting and styling:

```tsx
import {
  formatStatus,
  getStatusBadgeClass,
  isActiveStatus,
} from "@/lib/status";

// Format status for display
formatStatus("in_progress"); // "Running"
formatStatus("queued"); // "Queued"
formatStatus("done"); // "Done"
formatStatus("failed"); // "Failed"

// Get badge CSS classes (theme-aware)
getStatusBadgeClass("done"); // "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400"
getStatusBadgeClass("in_progress"); // "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400"
getStatusBadgeClass("failed"); // "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400"
getStatusBadgeClass("queued"); // "bg-gray-200 text-gray-700 dark:bg-gray-500/20 dark:text-gray-400"

// Check if status indicates an active task (for showing spinners)
isActiveStatus("queued"); // true
isActiveStatus("in_progress"); // true
isActiveStatus("done"); // false
```

### Evaluator Metrics Utilities (`@/lib/evaluatorMetrics`)

STT/TTS result pages share evaluator aggregate formatting helpers in `src/lib/evaluatorMetrics.ts`:

- `readProviderEvaluatorMean(col, providerResult)` resolves an evaluator column's provider-level mean from the new `evaluator_runs[*].aggregate.mean` format first, then legacy flat `metrics[col.scoreField]`, then nested `metrics[col.key].mean`.
- `formatMetricValue(value)` renders finite numbers rounded to 4 decimals and returns `"-"` for missing or non-numeric values.

Use these helpers through the shared STT/TTS evaluation detail components instead of adding page-local `readProviderMean` / `formatMetricValue` copies. This keeps the new `evaluator_runs`, legacy `_info`, and legacy single-evaluator fallback behavior consistent across `/stt/[uuid]`, `/tts/[uuid]`, `/public/stt/[token]`, and `/public/tts/[token]`.

### Default Evaluator Lookup (`@/lib/defaultEvaluators`)

Authenticated LLM test-result dialogs use `src/lib/defaultEvaluators.ts` when they need seeded default evaluator identity outside the test payload:

- `DEFAULT_LLM_NEXT_REPLY_SLUG` is the stable slug for the default next-reply correctness evaluator. Resolve this evaluator by slug, not by name or UUID.
- `fetchDefaultLLMNextReplyEvaluator(backendUrl, accessToken)` calls `GET /evaluators?include_defaults=true` with the user's bearer token and returns the matching LLM evaluator summary (`uuid`, `name`, `description`, `slug`, `evaluator_type`) or `null`.
- `TestRunnerDialog` and `BenchmarkResultsDialog` fetch this once while open and pass it to the shared result panels as `legacyDefaultEvaluator`. This is only for rendering legacy response runs that have `evaluation.criteria` but no `judge_results`, so the old criteria appears as the default evaluator's `criteria` variable in the same card UI as modern evaluator results.
- `BenchmarkResultsDialog` does **not** use this helper for the benchmark leaderboard label; `pass_rate` keeps the main-branch label `Test pass rate (%)`. The helper is for legacy output detail cards only.
- Keep this helper out of public share pages. Public pages cannot call authenticated evaluator endpoints and should either use data already in the shared payload or public-safe helpers such as `@/lib/publicEvaluators`.

### Benchmark evaluator aggregates (`@/lib/benchmarkEvaluatorSummary`)

- Types **`BenchmarkEvaluatorSummaryBinary`** / **`BenchmarkEvaluatorSummaryRating`** / **`BenchmarkEvaluatorSummaryEntry`** describe optional `model_results[].evaluator_summary[]` entries returned by benchmark status APIs when the backend persists Calibrate `metrics.json` criteria aggregates.
- **`BenchmarkLeaderboardSummaryRow`** types rows from **`leaderboard_summary`** (`model`, `passed`, `total`, `pass_rate` strings as returned by the API).
- **Why merged**: The benchmark Leaderboard tab matches STT/TTS — **one** downloadable table and **one** chart grid (two charts per row) — instead of repeating a full table+chart stack per evaluator metric. Overall pass rate and per-evaluator aggregates share the same model rows and color keys (`nameKey="model"`).
- **`benchmarkMetricKeyOrder(modelResults)`** returns evaluator **`metric_key`** values in first-seen order across models (same ordering as the old per-section builder).
- **`benchmarkEvaluatorColumnKey(metric_key)`** returns stable row/column keys such as `ev_<sanitized_metric>` so headers and chart `dataKey`s stay alphanumeric-safe.
- **`benchmarkCanonicalModelId(raw, modelResults)`** resolves a **`leaderboard_summary.model`** string to the matching **`model_results[].model`** when the backend uses mismatched shapes for the same run (e.g. **`gpt-4.1`** vs **`openai/gpt-4.1`**): exact match on **`model_results`** wins; if **`raw`** contains no **`/`**, a **unique** suffix match (`model === raw` or `model.endsWith('/' + raw)`) returns that **`model_results`** id; otherwise **`raw`** is returned unchanged (ambiguous or no match).
- **`benchmarkRatingEvaluatorCaption(label, scale_min, scale_max)`** formats rating column/chart labels as **`label (min–max)`** when **`scale_min`** and **`scale_max`** are finite; otherwise returns **`label`** unchanged (fallback chart domain **`[0, 5]`** still applies in the payload).
- **`buildBenchmarkCombinedLeaderboardPayload(leaderboardSummary, modelResults, benchmarkScoreLabel)`** returns **`rows`**, **`chartRows`** (arrays of **`ChartConfig`** packed two per row), and a small **`plan`** describing which columns exist. It imports the **`ChartConfig`** type from **`LeaderboardTab`** (type-only; no runtime cycle). Behavior:
  - **Overall block**: When **`leaderboard_summary`** is non-empty, rows include **`passed`**, **`total`**, and numeric **`pass_rate`** (parsed from strings); the first chart uses **`benchmarkScoreLabel`** (typically **`Test pass rate (%)`**) and y-domain **0–100**.
  - **Evaluator block**: One column + one chart per **`metric_key`**. **Binary**: **`ChartConfig.title`** is **`ev.label`** (**`name ?? metric_key`**) — no separate “Pass rate (%)” suffix (the y-axis is 0–100). **Rating**: **`ChartConfig.title`** uses **`benchmarkRatingEvaluatorCaption(label, scale_min, scale_max)`** → **`Name (min–max)`** with an en dash when both bounds are finite; otherwise **`label`** only (same helper drives the table **`header`** in **`BenchmarkCombinedLeaderboard`**). Binary → cells **`toFixed(1)%`**, chart domain **0–100**, tooltip **`v.toFixed(1)%`**; rating → cells **`toFixed(2)`**, chart domain **`[scale_min, scale_max]`** when both finite, else **`[0, 5]`**.
  - **Model rows**: Row **`model`** keys are built by **`orderedCanonicalModels`**: walk **`leaderboard_summary`** in order, map each **`s.model`** through **`benchmarkCanonicalModelId`**, dedupe by canonical id; then append any **`model_results`** **`model`** not yet seen. **`leaderboard_summary`** rows are joined with **`find((s) => benchmarkCanonicalModelId(s.model, modelResults) === model)`** so pass-rate columns align with **`model_results`** rows. This avoids duplicate table rows when the API repeats the same model under two strings.
  - **Empty / missing**: If there is no leaderboard and no evaluator keys, the payload is **`null`**. Missing evaluator cells are **`undefined`** in row data; the UI shows **—** for those cells. Chart rendering details (**LeaderboardTab** finite-value filter + empty-slot placeholder) are documented under **`BenchmarkCombinedLeaderboard`** below.

### `BenchmarkCombinedLeaderboard` (`@/components/eval-details`)

- Client component that memoizes **`buildBenchmarkCombinedLeaderboardPayload`** and feeds **`LeaderboardTab`** with derived **`LeaderboardColumn`** definitions (`%` / fixed-decimal evaluator cells; **Model** column uses **`formatModelName`**).
- **Optional `formatModelName`**: Defaults to the identity **`(m) => m`** so the **Model** column and bar-chart labels show the **canonical `model` string** from the payload (typically the **`model_results`** id after **`benchmarkCanonicalModelId`**). Pass a custom formatter only if a surface needs legacy display rules (e.g. **`__` → `/`**).
- **Evaluator column titles**: **Binary** evaluators use **`ev.label`** only for **`LeaderboardColumn.header`** and chart title — the overall column is already **`Test pass rate (%)`**, so duplicating “Pass rate” on binary headers was redundant. **Rating** evaluators use **`benchmarkRatingEvaluatorCaption`** so **`header`** and chart **`title`** show **`Name (scale_min–scale_max)`** when bounds are finite (en dash), surfacing the rubric range beside the name without repeating “Mean”. **Cells**: binary → **`NN.N%`**; rating → two decimal places, no **`%`**.
- **`getLabel`** forwards **`model`** through **`formatModelName`** for chart axis labels (defaults to raw API/canonical string).
- Used in **`BenchmarkResultsDialog`** (Leaderboard tab, when the run has finished) and **`/public/benchmark/[token]`** (`model_results ?? []` so leaderboard-only jobs still render when the array is absent).
- When the payload is **`null`** or there are no rows, shows the shared **“No leaderboard data available”** empty state (e.g. completed job with neither **`leaderboard_summary`** nor **`evaluator_summary`**).
- CSV **`filename`** props are sanitized in callers (agent name or share token) for safe downloads.
- Chart rows use the same **`LeaderboardTab`** implementation as STT/TTS: each series is filtered to **finite** numeric **`value`**s before **`LeaderboardBarChart`**; if every model is missing that metric, the slot shows a bordered placeholder (title + short empty copy) instead of an empty Recharts series.
- **Gotcha — duplicate titles**: **`LeaderboardTab`** uses **`chart.title`** as the React **`key`** for each chart card. Two evaluators with the same resolved **`name`** (and neither falling back to distinct **`metric_key`** labels) could produce duplicate keys; in practice **`metric_key`** differs per column and is used when **`name`** is missing, which avoids most collisions.
- **`BenchmarkModelResult`** in **`BenchmarkOutputsPanel`** includes optional **`evaluator_summary`** so TypeScript matches the API everywhere **`model_results`** is typed.

### Evaluation Detail Components (`@/components/eval-details`)

STT/TTS result pages share result rendering through `src/components/eval-details/EvaluationRunDetails.tsx`:

- `STTEvaluationLeaderboard` / `TTSEvaluationLeaderboard` render the comparative leaderboard table and charts (single **`LeaderboardTab`**: combined metric columns + chart rows packed two wide; STT/TTS chart **`title`**s still use full metric labels such as **`WER`** or evaluator **`label`** from **`evaluatorColumns`**). **`BenchmarkCombinedLeaderboard`** follows the same layout pattern for benchmark runs; evaluator titles differ slightly (**binary** → short **`ev.label`**; **rating** → **`benchmarkRatingEvaluatorCaption`** with scale — see **`benchmarkEvaluatorSummary`**); data comes from **`leaderboard_summary`** + **`model_results[].evaluator_summary`** instead of provider evaluation summaries.
- `STTEvaluationOutputs` / `TTSEvaluationOutputs` render the provider sidebar, provider metrics card, loading/error states, and result table.
- `STTEvaluationAbout` / `TTSEvaluationAbout` render the normalized About table rows. STT always includes WER plus evaluator rows; TTS always includes evaluator rows plus TTFB.
- `findFirstEvaluatorRuns`, `evaluatorColumnsFromRuns`, and `evaluatorDescriptionMapFromRuns` centralize public-page handling for the new `evaluator_runs` payload so STT/TTS public pages don't each hand-roll the same conversion.
- Public/private pages should pass page-specific evaluator labels into these shared components: private pages pass `<Link href="/evaluators/[uuid]">name</Link>` for About metric names; public pages pass plain strings because `/evaluators/[uuid]` is authenticated.

### Public Evaluator Metadata (`@/lib/publicEvaluators`)

Public share pages use `src/lib/publicEvaluators.ts` to fetch default evaluator metadata for legacy result payloads:

- `getPublicDefaultEvaluator(backendUrl, shareToken, type)` calls `GET /public/evaluators/defaults?share_token=<token>&types=<stt|tts|llm|simulation>`.
- The backend validates that `share_token` belongs to a currently public shared job and returns only seeded default evaluators with public-safe fields: `uuid`, `name`, `description`, `evaluator_type`, `output_type`, and `live_version.output_config`.
- Public STT/TTS pages use this metadata when the result payload lacks enough evaluator metadata and must synthesize the legacy `llm_judge_score` column. Public benchmark share pages do **not** call this helper for leaderboard titles (`Test pass rate (%)` / chart title stay fixed; see benchmark leaderboard label above). Do not hardcode default evaluator names or descriptions in public pages where snapshot/API data should drive copy; use job snapshot fields first, then this helper where applicable, then render empty/generic UI only if both are unavailable.
- For rating defaults, public pages derive the About-tab range from `live_version.output_config.scale` using the shared `ratingRange()` helper.

### Public Page Layout (`@/components/PublicPageLayout`)

Public share pages use `src/components/PublicPageLayout.tsx` for the Calibrate top bar, theme toggle, auth link, centered content area, and footer.

- Default content width is `max-w-7xl`.
- `contentClassName` can override only the content max-width while preserving the same padding / `w-full mx-auto` wrapper. Use this sparingly for result pages whose shared panels need more horizontal room.
- Public LLM test-run and benchmark pages pass `contentClassName="max-w-[92rem]"` so their shared `TestRunOutputsPanel` / `BenchmarkOutputsPanel` match the private runner layout: left list `md:w-80`, flexible conversation column, evaluator column `w-[32rem]`.
- Their panel containers use a taller public-page height (`height: calc(100vh - 220px)`, `minHeight: 620`) because they live inside a page layout instead of a modal shell.

### Evaluator UI Components (`@/components/evaluators`)

Evaluator-specific route UI lives in `src/components/evaluators/`:

- `CreateEvaluatorSidebar` — create-only sidebar used by `/evaluators`; parent page owns API calls and form state.
- `UseCasePickerDialog` — use-case picker modal shown before the sidebar.
- `VersionCard` — per-version display on `/evaluators/[uuid]`, including variables, rating output config, default-evaluator chrome rules, and "Set as current".
- `RatingScaleEditor` — shared rating-scale row editor used by evaluator create and new-version flows.

Keep these components prop-driven. The app route files should orchestrate auth, routing, API calls, and URL state; avoid re-growing large inline JSX blocks for these concerns inside `src/app/evaluators/page.tsx` or `src/app/evaluators/[uuid]/page.tsx`.

### Tooltip Component (`@/components/Tooltip`)

Custom tooltip component with viewport-aware positioning:

```tsx
import { Tooltip } from "@/components/Tooltip";

// Basic usage (default position: top)
<Tooltip content="Tooltip text here">
  <button>Hover me</button>
</Tooltip>

// With position prop
<Tooltip content="Detailed explanation..." position="bottom">
  <span className="cursor-pointer">Info</span>
</Tooltip>
```

**Positions**: `top` (default), `bottom`, `left`, `right`

**Viewport clamping**: The tooltip automatically clamps its position to stay within viewport boundaries (12px padding from edges). This prevents long content (like evaluator reasoning) from going off-screen.

**Styling**: White background, rounded corners, shadow, 256px max width (`w-64`), text wraps within the container. Arrow indicator points to trigger element.

**Disabled controls and hover**: Disabled native **`<button>`** elements often do not receive pointer events, so wrapping only the button breaks hover for the tooltip. Use this pattern when the trigger must stay a real button (e.g. disabled row in **`DatasetPicker`**, disabled **New evaluation** on **`/datasets/[id]`**): **`Tooltip`** → inner wrapper **`div`** → **`button`** with **`disabled`**, **`tabIndex={-1}`**, **`aria-disabled`**, and **`pointer-events-none`** on the button so the tooltip’s outer wrapper receives **`mouseenter` / `mouseleave`**. Do not rely on the **`title`** attribute for these explanations if the product standard is the shared tooltip.

### UI Components (`@/components/ui`)

Reusable UI primitives:

```tsx
import {
  Button,
  SearchInput,
  SlidePanel,
  SlidePanelFooter,
  LoadingState,
  ErrorState,
  EmptyState,
  NotFoundState,  // Supports errorCode prop: 401, 403, 404
  ResourceState,
  BackHeader,
  StatusBadge,
} from "@/components/ui";

// Button variants: primary, secondary, danger, ghost
// Button sizes: sm, md, lg
<Button variant="primary" size="md" onClick={handleClick}>
  Save
</Button>
<Button variant="danger" isLoading={isDeleting} loadingText="Deleting...">
  Delete
</Button>

// SearchInput with built-in search icon
<SearchInput
  value={searchQuery}
  onChange={setSearchQuery}
  placeholder="Search items..."
/>

// SlidePanel for edit forms
<SlidePanel
  isOpen={isPanelOpen}
  onClose={() => setIsPanelOpen(false)}
  title="Edit Item"
  icon={<ToolIcon className="w-5 h-5" />}
  footer={
    <SlidePanelFooter
      onCancel={() => setIsPanelOpen(false)}
      onSubmit={handleSave}
      isSubmitting={isSaving}
      submitText="Save Changes"
    />
  }
>
  {/* Form content */}
</SlidePanel>

// ResourceState handles loading/error/empty states automatically
<ResourceState
  isLoading={isLoading}
  error={error}
  isEmpty={items.length === 0}
  onRetry={refetch}
  emptyState={{
    icon: <ToolIcon className="w-6 h-6" />,
    title: "No items yet",
    description: "Create your first item to get started",
    action: { label: "Create Item", onClick: () => setShowCreate(true) },
  }}
>
  {/* Render items when data is available */}
</ResourceState>

// BackHeader - for detail pages with back navigation
// Used as customHeader prop of AppLayout
<BackHeader
  label="TTS Evaluations"
  onBack={() => router.push("/tts")}
  title="Back to TTS Evaluations"  // optional tooltip
/>

// StatusBadge - status badge with optional spinner for active statuses
<StatusBadge status="in_progress" showSpinner />
<StatusBadge status="done" />
<StatusBadge status="failed" />
<StatusBadge status="queued" showSpinner />
```

### API Client (`@/lib/api`)

Centralized API client with 401 handling:

```tsx
import { apiGet, apiPost, apiPut, apiDelete, getBackendUrl } from "@/lib/api";

// Simple GET request
const data = await apiGet<ItemData[]>("/items", accessToken);

// POST request with body
const newItem = await apiPost<ItemData>("/items", accessToken, {
  name: "New Item",
  description: "Description",
});

// PUT request
const updated = await apiPut<ItemData>(`/items/${id}`, accessToken, {
  name: "Updated Name",
});

// DELETE request
await apiDelete(`/items/${id}`, accessToken);
```

The API client automatically:

- Adds required headers (Authorization, Content-Type, accept)
- Signs out user on 401 responses
- Throws errors on non-2xx responses

**How those headers are assembled:** `getDefaultHeaders(accessToken)` sets `accept: application/json` and, when a token is passed, `Authorization: Bearer …`. `apiClient` merges per-call header overrides, then adds `Content-Type: application/json` for JSON bodies if the caller did not supply `Content-Type`. There is **no** tunnel- or vendor-specific header in this path.

**Raw `fetch` elsewhere:** Most pages and dialogs still call `fetch` directly with the same minimal shape as the manual pattern below: `accept: "application/json"`, `Authorization` when the route is authenticated, and `Content-Type` / multipart only when the endpoint requires it. Public token pages use unauthenticated `fetch` with `headers: { accept: "application/json" }` toward `NEXT_PUBLIC_BACKEND_URL`.

### Custom Hooks (`@/hooks`)

```tsx
import { useCrudResource, useFetchResource } from "@/hooks";

// useCrudResource - full CRUD operations with loading states
const {
  items,
  isLoading,
  isCreating,
  isUpdating,
  isDeleting,
  error,
  createError,
  refetch,
  create,
  update,
  remove,
} = useCrudResource<ItemType>({
  endpoint: "/items",
  accessToken,
});

// Create new item
const newItem = await create({ name: "New Item" });

// Update existing item
await update(itemUuid, { name: "Updated" });

// Delete item
await remove(itemUuid);

// useFetchResource - fetch single resource by ID
const { data, isLoading, error, refetch } = useFetchResource<ItemType>({
  endpoint: "/items",
  accessToken,
  id: itemUuid,
});

// useOpenRouterModels - fetch LLM models from OpenRouter API with 10-min cache
// Uses module-level cache shared across all component instances; deduplicates concurrent requests
// Validates API response shape; skips malformed model entries
// Auto-revalidates in background when cache expires while component stays mounted
const { providers, isLoading, error, retry } = useOpenRouterModels();

// findModelInProviders - utility to look up a model by ID in the providers list
import { findModelInProviders } from "@/hooks";
const model = findModelInProviders(providers, "openai/gpt-5.2-chat");

// useVerifyConnection - shared hook for all agent connection verification
// Used by: AgentDetail, AgentConnectionTabContent, simulations/[uuid]/page
import { useVerifyConnection } from "@/hooks";
const verify = useVerifyConnection();
// Verify a saved agent (POST /agents/{uuid}/verify-connection with { messages } body)
const success = await verify.verifySavedAgent(agentUuid, messages);
// Verify unsaved URL/headers (POST /agents/verify-connection with url+headers+messages body)
const success = await verify.verifyAdHoc(agentUrl, agentHeaders, messages);
// Reactive state for UI binding
verify.isVerifying; // boolean
verify.verifyError; // string | null
verify.verifySampleResponse; // Record<string, unknown> | null
verify.dismiss(); // clears error + sample response
```

### Test Results Components (`@/components/test-results/shared`)

Shared components for displaying test results:

```tsx
import {
  StatusIcon,
  SmallStatusBadge,
  ToolCallCard,
  normalizeToolCall,
  TestDetailView,
  JudgeResultsList,
  EmptyStateView,
  TestStats,
  EvaluationCriteriaPanel,
} from "@/components/test-results/shared";
import type { JudgeResult } from "@/components/test-results/shared";

// Status indicator (passed/failed/running/queued/pending)
<StatusIcon status="passed" />
// Status visuals:
// - passed: green checkmark
// - failed: red X
// - running: yellow spinner (animated)
// - queued/pending: gray dot (no animation)

// Small badge for inline status
<SmallStatusBadge passed={true} />

// Display tool call with arguments as form-style fields
// - Each arg key (body, query) is shown as a labeled field (headers are filtered out)
// - Object/array values are pretty-printed as JSON with 2-space indentation
// - Labels use `text-sm font-medium text-muted-foreground`, values use `text-foreground`
// - Parameter values use `whitespace-pre-wrap break-all` to show full content (no truncation)
// IMPORTANT: ToolCallCard requires `toolName: string` and `args: Record<string, any>`.
// Never pass raw API tool-call entries directly — backend payloads have shipped in several
// shapes over time (`{tool, arguments}`, OpenAI `{name, arguments}`, nested `{tool: {name, arguments}}`,
// or OpenAI history `{function: {name, arguments}}` with `arguments` as a JSON string). Passing
// any of these directly will crash React with "Objects are not valid as a React child" the
// moment `toolName` ends up being an object. Always go through `normalizeToolCall` first.
<ToolCallCard toolName="get_weather" args={{ body: { city: "London" }, query: { units: "metric" } }} />
// Shows "body" field with JSON content, "query" field with JSON content

// Defensive shape adapter for any tool-call-shaped value. Returns `{ toolName, args }`,
// falling back to `{ toolName: "Unknown tool", args: {} }` for malformed/missing entries.
// Use at every iteration site (chat history `message.tool_calls`, `output.tool_calls`,
// `evaluation.tool_calls`) — `TestDetailView` and `EvaluationCriteriaPanel` both already
// route through this internally. JSON-string `arguments` (OpenAI history format) are
// auto-parsed; non-object parsed values are dropped to `{}`.
const { toolName, args } = normalizeToolCall(rawToolCallFromApi);

// Full test conversation view (fully responsive)
// - Padding: `p-4 md:p-6`
// - Message bubbles: `w-[88%] md:w-3/4` (runner/benchmark middle column — ~88% on small screens, 75% from `md` up)
// - User messages aligned right, agent messages aligned left for clear visual distinction
// - Status indicators: responsive padding `pl-2 md:pl-3`
// - `reasoning` (optional): top-level reasoning string. For tool-call tests this is the deterministic
//   diff/match summary — shown in `EvaluationCriteriaPanel` behind **See reasoning** (collapsed by default),
//   same as per-evaluator rows. For RESPONSE tests, the
//   inline reasoning is suppressed when `judgeResults` is populated (the per-evaluator panel below
//   already covers it; the top-level string is just the first failing evaluator's reasoning anyway).
//   Legacy response rows that pre-date judge_results capture still fall back to inline reasoning
//   (also **See reasoning**, italic body when expanded).
// - `judgeResults` (optional, response tests only): array of per-evaluator verdicts. When present
//   and non-empty, renders a `JudgeResultsList` panel below the agent response with one card per
//   evaluator. Tool-call tests always pass `null` here; the legacy single-reasoning UI handles them.
// - `scaleByEvaluatorUuid` (optional): uuid → scale_max map for rating evaluators. When provided,
//   rating cards render `score / max`; when absent, they render `Score: N`. The shared component
//   never fetches scales itself — callers that want `score / max` must supply this map (typically
//   built from `GET /evaluators?include_defaults=true`'s `output_config.scale`).
<TestDetailView
  history={history}
  output={output}
  passed={passed}
  reasoning={reasoning}
  judgeResults={result.judge_results}
  scaleByEvaluatorUuid={scaleByEvaluatorUuid}
/>

// Per-evaluator verdict list (used internally by TestDetailView, exported for re-use).
// Renders nothing when `results` is null/empty — caller falls back to legacy single-reasoning UI.
// Each card: evaluator name (rendered as a link to `/evaluators/{evaluator_uuid}` via
// `EvaluatorNameLink` when uuid is non-null; plain text for legacy snapshots) + verdict
// badge. Binary → Pass/Fail. Rating → `score / max` (or `Score: N` when no scale) coloured
// **green** only when `score === scale_max`, **red** only when `score === scale_min`,
// otherwise **amber** (anything in between, or either bound unknown). Per-evaluator
// **reasoning** is collapsed by default: internal **`ReasoningToggleIconButton`** + **`ReasoningExpandedContent`**
// in `shared.tsx` (**See reasoning** / **Hide reasoning** text, cyan vs fuchsia by state). The right-column
// **`EvaluatorPanelCard`** nests **`{{variable}}` values and reasoning in one collapsible block** (expand
// shows variables first, then reasoning when present; variables-only evaluators still use the same toggle).
// **`JudgeResultCard`** (mobile `JudgeResultsList`) shares the toggle + verdict-tinted card surfaces; clicking
// the card toggles reasoning except on links, verdict chips, the toggle button, or inside the expanded body.
<JudgeResultsList results={judgeResults} scaleByEvaluatorUuid={scaleByEvaluatorUuid} />

// Stats bar - shows passed/failed counts
// In TestRunnerDialog: show in header on desktop, at top of list on mobile
<TestStats passedCount={5} failedCount={2} />

// Evaluation criteria panel - third column in test/benchmark runner dialogs
// Shows expected tool calls (tool-call tests) or per-evaluator cards (response tests). Tool-call
// top-level `reasoning` uses **`CollapsibleReasoningStrip`** in `shared.tsx` (same See/Hide control).
// Desktop only (hidden on mobile), w-72, border-l
// IMPORTANT: Both TestRunnerDialog and BenchmarkResultsDialog import this from shared — no local copies
// IMPORTANT: Only rendered after test completes (status "passed" or "failed"). During running/pending/queued,
// evaluation data isn't available yet, so showing the panel would display misleading defaults.
// IMPORTANT: testType must come from evaluation.type (API data), NOT from test.type (synthesized data).
// The hydration path for completed runs sets all placeholder tests to type:"response", which causes
// tool-call tests to be misrendered as "Next Reply Text". Always prefer testCase.evaluation.type.
// Fallback chain inside the component: testType -> evaluation.type -> infer from evaluation.tool_calls
// Defensive rendering: `criteria` is rendered only when `typeof === "string"` (some legacy/new
// payloads have shipped non-string criteria; guarding prevents the "Objects are not valid as a
// React child" crash). `tool_calls` entries are routed through `normalizeToolCall` so any of
// the historical shapes documented above render correctly.
<EvaluationCriteriaPanel evaluation={testCase?.evaluation} testType={testCase?.evaluation?.type} />
```

**`JudgeResult` shape** (per-evaluator verdict, response tests only):

```ts
type JudgeResult = {
  evaluator_uuid?: string | null;  // stable link target; `null` for legacy pre-snapshot runs
  name: string;                    // CURRENT DB display name (refreshed by backend on every read)
  reasoning?: string;
  match?: boolean | null;          // BINARY evaluators only; null for rating
  score?: number | null;           // RATING evaluators only; null for binary
  // The three fields below were added after the initial judge_results
  // rollout. Optional/null on older snapshots, populated inline going
  // forward — the cards prefer these over the per-panel fallback maps.
  variable_values?: Record<string, string> | null;  // {{var}} substitutions used for THIS evaluator on THIS test case (frozen at submission); empty maps normalised to null
  scale_min?: number | null;        // RATING evaluators only; null for binary or legacy
  scale_max?: number | null;        // RATING evaluators only; null for binary or legacy
};
```

- `match` and `score` are mutually exclusive — exactly one is set on a completed entry.
- `name` is refreshed server-side on every read of the run, so a rename in the evaluator settings UI surfaces on the next poll without a re-run. **Don't cache `name` long-term** — store `evaluator_uuid` as the stable key.
- `evaluator_uuid` may be `null` for legacy runs that pre-date snapshot capture; treat as "no canonical link, just display the name" (no clickable evaluator link). When non-null, the cards render the name as a `next/link` to `/evaluators/{uuid}` via the shared `EvaluatorNameLink` helper in `shared.tsx`.
- A test passes only when **all** judge entries pass: binary entries pass when `match === true`, rating entries pass when `score === scale_max`. The frontend can rely on the top-level `result.passed` for this — no need to recompute. Rating cards resolve `scale_max` inline from `result.scale_max` first (newer snapshots), falling back to the caller's `scaleByEvaluatorUuid` map; without either, they render a neutral amber `Score: N` chip.
- `variable_values` shown on the right-column card resolve in the same priority order: inline `result.variable_values` first, then `test_case.evaluators[i].variable_values` matched by `evaluator_uuid` for older snapshots. Empty objects are normalised to `null` server-side. On **`EvaluatorPanelCard`**, variable rows render **inside the same collapsible region as reasoning** (not above the header); expand when either variables or reasoning exist.

**Reasoning disclosure** (`src/components/test-results/shared.tsx`, not exported): Reasoning is **collapsed by default**. **`ReasoningToggleIconButton`** shows **See reasoning** / **Hide reasoning** plus a chevron; closed state uses **cyan** accents, open state **fuchsia** (not gray-only chrome). **`ReasoningExpandedContent`** renders the paragraph; **`showReasoningLabel`** adds the small uppercase **Reasoning** label (used in the right-column panel when expanded). **`CollapsibleReasoningStrip`** (tool-call / some strips) is a bordered row with a leading label + the same toggle, expanded body below. **Per-evaluator cards** (`JudgeResultCard`, `EvaluatorPanelCard`): local `useState` per card; **`getEvaluatorVerdictTone`** + **`evaluatorVerdictCardSurfaceClass`** apply **green / red / amber / neutral** tinted backgrounds, borders, and a **left accent stripe** from the verdict (not flat `bg-muted` only). **Card click** toggles the collapsible when the card has expandable content (`hasReasoning` on mobile cards; **`hasCollapsibleBody`** = reasoning **or** variables on **`EvaluatorPanelCard`**): ignored targets include **`button`**, **`a[href]`**, **`[data-evaluator-verdict-chips]`** (Pass/Fail/score chips), **`[data-reasoning-body]`** (expanded copy — avoids collapsing while selecting text), and the toggle uses **`stopPropagation`** so it does not double-fire. **Legacy** single `reasoning` under the agent bubble (no `judge_results`): toggle sits on the **Agent** header row (`justify-between`); **`italic`** + muted body on the expanded line. **Tool-call** top-level `reasoning` in **`EvaluationCriteriaPanel`**: **`CollapsibleReasoningStrip`**. Empty **`reasoning`** on **`JudgeResultCard`** (no text) hides the collapsible; **`EvaluatorPanelCard`** can still expand when only **`variable_values`** exist (**`hasCollapsibleBody`**). **`aria-expanded`** is set on the toggle **button**.

---

## Common Patterns

### Loading, Empty, and Error States

**Preferred: Use shared components** from `@/components/ui`:

```tsx
import { LoadingState, EmptyState, ErrorState, NotFoundState, ResourceState } from "@/components/ui";
import { SpinnerIcon, ToolIcon } from "@/components/icons";

// Simple loading spinner
<LoadingState />

// Empty state with icon, title, description, optional action
<EmptyState
  icon={<ToolIcon className="w-6 h-6 text-muted-foreground" />}
  title="No items found"
  description="Create your first item to get started"
  action={{ label: "Create Item", onClick: handleCreate }}
/>

// Error state with optional retry
<ErrorState message="Failed to load data" onRetry={refetch} />

// Not found state (for HTTP errors) - displays error code with appropriate message
<NotFoundState />                    // Default: "404 Not found"
<NotFoundState errorCode={404} />    // "404 Not found"
<NotFoundState errorCode={403} />    // "403 Forbidden"
<NotFoundState errorCode={401} />    // "401 Unauthorized"

// Combined component that handles all three states
<ResourceState
  isLoading={isLoading}
  error={error}
  isEmpty={items.length === 0}
  onRetry={refetch}
  emptyState={{
    icon: <ToolIcon className="w-6 h-6" />,
    title: "No items yet",
    description: "Create your first item",
  }}
>
  {/* Render content when data is available */}
</ResourceState>
```

**Legacy inline patterns** (still used in some files, but prefer shared components for new code):

```tsx
// Loading - inline
{
  isLoading && (
    <div className="flex items-center justify-center gap-3 py-8">
      <SpinnerIcon className="w-5 h-5 animate-spin" />
    </div>
  );
}

// Empty - inline
<div className="border border-border rounded-xl p-12 flex flex-col items-center justify-center bg-muted/20">
  <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center mb-4">
    <ToolIcon className="w-6 h-6 text-muted-foreground" />
  </div>
  <h3 className="text-lg font-semibold text-foreground mb-1">No items found</h3>
  <p className="text-base text-muted-foreground mb-4">Description</p>
  <button>Add item</button>
</div>;
```

### Table Structure

```tsx
<div className="border border-border rounded-xl overflow-hidden">
  {/* Header */}
  <div className="grid grid-cols-[...] gap-4 px-4 py-2 border-b border-border bg-muted/30">
    <div className="text-sm font-medium text-muted-foreground">Column</div>
  </div>
  {/* Rows */}
  {items.map((item) => (
    <div className="grid grid-cols-[...] gap-4 px-4 py-2 border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors cursor-pointer">
      {/* Content */}
    </div>
  ))}
</div>
```

**Standard Grid Column Patterns:**

| Page Type               | Grid Columns                              | Description                                                      |
| ----------------------- | ----------------------------------------- | ---------------------------------------------------------------- |
| **Agents, Simulations** | `[1fr_1fr_auto]` or `[1fr_1fr_auto_auto]` | Equal-width data columns, auto action buttons                    |
| **Tools**               | `[200px_150px_1fr_auto]`                  | Fixed name, fixed type badge, flexible description, auto actions |
| **Scenarios, Metrics**  | `[200px_1fr_auto]`                        | Fixed 200px name column, flexible description, auto actions      |
| **Personas**            | `[200px_1fr_100px_100px_120px_auto]`      | Fixed name, flexible characteristics, fixed attribute columns    |
| **Simulation Runs**     | `[1fr_1fr_1fr_1fr]`                       | Four equal columns (Name, Status, Type, Created At)              |
| **Tests**               | `[1fr_1fr_auto]`                          | Equal-width name and type columns                                |

The pattern is: use fixed widths (e.g., `200px`) for short columns like Name/Label, `1fr` for flexible content columns like Description/Characteristics, and `auto` for action buttons.

**Scrollable Text in Fixed-Width Columns:**

For fixed-width columns (like the 200px name column), use horizontal scrolling instead of truncation to allow users to see the full content:

```tsx
// ✅ Preferred - horizontal scroll for overflow
<div className="overflow-x-auto max-w-full">
  <p className="text-sm font-medium text-foreground whitespace-nowrap">
    {item.name}
  </p>
</div>

// ❌ Avoid - truncates content, user can't see full text
<div className="min-w-0">
  <p className="text-sm font-medium text-foreground truncate">
    {item.name}
  </p>
</div>
```

This pattern is used in: Tools, Personas, Scenarios, Metrics list pages, and Simulation Run results table.

### Polling for Async Tasks

Async operations (simulations, tests, benchmarks, STT/TTS evaluations) follow this status flow:

```
queued → in_progress → done (or failed/completed)
```

**Status Display:**

- `queued`: Gray badge, text "Queued" or "Evaluation queued...", header spinner shown
- `in_progress`/`running`: Yellow spinner or badge, text "Running" or "Evaluating...", header spinner shown
- `done`/`completed`: Green badge, text "Done"
- `failed`: Red badge, text "Failed"

**Note:** For simulation runs, the header spinner is shown for both `queued` and `in_progress` statuses to indicate the task is active.

**Tracking Run Status:**

For batch operations (e.g., running multiple tests), track both:

- `runStatus`: Overall task status from backend (`queued` | `in_progress` | `done` | `failed`)
- Individual item statuses: Updated based on `runStatus` and individual results

```tsx
// When overall status transitions to in_progress, update items from queued to running
if (result.status === "in_progress" && item.status === "queued") {
  return { ...item, status: "running" };
}
```

**Polling Pattern:**

All polling uses the shared `POLLING_INTERVAL_MS` constant from `@/constants/polling`:

```tsx
import { POLLING_INTERVAL_MS } from "@/constants/polling";

useEffect(() => {
  let pollInterval: NodeJS.Timeout | null = null;

  const fetchData = async (isInitial = false) => {
    try {
      // ... fetch
      // Continue polling for queued and in_progress
      if (
        data.status === "done" ||
        data.status === "completed" ||
        data.status === "failed"
      ) {
        if (pollInterval) clearInterval(pollInterval);
      }
    } catch (error) {
      // Set status to failed and stop polling on fetch error
      setData((prev) => (prev ? { ...prev, status: "failed" } : prev));
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    }
  };

  fetchData(true);
  pollInterval = setInterval(() => fetchData(false), POLLING_INTERVAL_MS);

  return () => {
    if (pollInterval) clearInterval(pollInterval);
  };
}, [dependency]);
```

**Polling Error Handling:**

When a fetch error occurs during polling (network failure, server error, etc.), the pattern is to:

1. **Set status to "failed"** using functional setState to show error state in UI
2. **Stop polling** by clearing the interval immediately
3. Console log the error for debugging

This prevents infinite polling when the backend is unreachable and gives users immediate feedback via the "Failed" status badge.

**Files implementing this pattern:**

- `src/app/stt/[uuid]/page.tsx` - STT evaluation detail page
- `src/app/tts/[uuid]/page.tsx` - TTS evaluation detail page
- `src/app/simulations/[uuid]/runs/[runId]/page.tsx` - Simulation run detail page
- `src/components/agent-tabs/TestsTabContent.tsx` - Past runs (`pastRunsPanel`, polling, empty vs split layout, wrapped display names)
- `src/components/TestRunnerDialog.tsx` - Test run polling
- `src/components/BenchmarkResultsDialog.tsx` - Benchmark polling

**Status Types:**

The `EvaluationResult` type for STT/TTS evaluations:

```tsx
type EvaluationResult = {
  task_id: string;
  status: "queued" | "in_progress" | "done" | "failed";
  language?: string; // Displayed as a pill next to status badge
  provider_results?: ProviderResult[];
  leaderboard_summary?: LeaderboardSummary[];
  error?: string | null;
};
```

**Polling stop conditions**: Polling stops when status is `"done"` OR `"failed"` (not just on fetch errors). Initial fetch also skips starting polling if status is already terminal.

**Files using `POLLING_INTERVAL_MS`:** TestRunnerDialog, BenchmarkResultsDialog (with intermediate results support), TestsTabContent, STT/TTS evaluation pages, simulation run page.

### Usage Limits and Toast Notifications

The app enforces usage limits on certain features. There are two categories of limits:

1. **Dynamic (per-user) limits** — fetched from the backend via `GET /user-limits/me/max-rows-per-eval`. Returns `{ max_rows_per_eval: number }` with the user-specific override or server default.
2. **Static limits** — hardcoded in `@/constants/limits.tsx` (audio duration, file size, text length, simulation caps).

When limits are exceeded, use `showLimitToast(message)` from `@/constants/limits`. It renders: `<message> **Click here** to contact us.` — where "Click here" is a bold link to `CONTACT_LINK`.

```tsx
import { showLimitToast } from "@/constants/limits";

showLimitToast(`You can only add up to ${maxRowsPerEval} rows at a time.`);
// Renders: "You can only add up to 20 rows at a time. **Click here** to contact us."
```

**Dynamic row limit — `useMaxRowsPerEval` hook** (`@/hooks/useMaxRowsPerEval.ts`):

```tsx
import { useMaxRowsPerEval } from "@/hooks";

const maxRowsPerEval = useMaxRowsPerEval(); // number (never null)
```

- Initialises with `LIMITS.DEFAULT_MAX_ROWS_PER_EVAL` (20) and updates when the API responds. Falls back to the same default on API failure. Never returns `null`.
- Uses a module-level cached promise so all hook instances share a single API request per access token. Cache is invalidated when the token changes and cleared on fetch errors (so the next mount retries).
- The cached value persists for the lifetime of the browser tab — backend changes are picked up on page refresh.
- Used by: `TTSDatasetEditor` (prop), `STTDatasetEditor` (prop), `TestsTabContent` (direct hook call).
- Parent components (`TextToSpeechEvaluation`, `SpeechToTextEvaluation`, `datasets/[id]/page`) call the hook and pass `maxRowsPerEval` as a prop to the editor components.
- Editor components also default the prop to `LIMITS.DEFAULT_MAX_ROWS_PER_EVAL` if not passed.

**Static limits** (`@/constants/limits.tsx`):

```tsx
import { LIMITS, showLimitToast } from "@/constants/limits";

// Static limits (still hardcoded):
LIMITS.TTS_MAX_TEXT_LENGTH; // 200 - max characters per text input
LIMITS.STT_MAX_AUDIO_DURATION_SECONDS; // 60 - max audio file duration in seconds
LIMITS.STT_MAX_AUDIO_FILE_SIZE_MB; // 5 - max audio file size in MB
LIMITS.SIMULATION_MAX_PERSONAS; // 2 - max personas per simulation
LIMITS.SIMULATION_MAX_SCENARIOS; // 5 - max scenarios per simulation
LIMITS.DEFAULT_MAX_ROWS_PER_EVAL; // 20 - fallback when per-user limit API fails

CONTACT_LINK; // URL for contacting support (used internally by showLimitToast)
```

**Toaster Component**: Added to root layout (`src/app/layout.tsx`) with `richColors`, `position="top-right"`, and `closeButton` (all toasts show an X button for dismissal).

**Features using limits:**

- TTS evaluation: CSV upload and manual row addition (dynamic, via `maxRowsPerEval` prop)
- STT evaluation: ZIP upload, manual row addition (dynamic, via `maxRowsPerEval` prop), and audio file duration/size (static)
- Tests tab: "Run all tests" button (dynamic, via `useMaxRowsPerEval` hook directly)
- Simulations: Persona and scenario selection (static, hardcoded)

**Audio Duration Validation Pattern** (STT evaluation):

```tsx
// Helper function to get audio file duration using Web Audio API
const getAudioDuration = (file: File): Promise<number> => {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    const url = URL.createObjectURL(file);
    audio.src = url;
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(audio.duration);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load audio file"));
    };
  });
};

// Usage: validate before upload
const duration = await getAudioDuration(file);
if (duration > LIMITS.STT_MAX_AUDIO_DURATION_SECONDS) {
  toast.error(
    `Audio file must be less than ${LIMITS.STT_MAX_AUDIO_DURATION_SECONDS} seconds...`
  );
  return;
}
```

### Linkable Table Rows Pattern

For list items that should support browser-native "Open in new tab" (right-click, Cmd/Ctrl+click):

```tsx
import Link from "next/link";

// Use Link components for each clickable cell in the row
<div className="grid grid-cols-[1fr_1fr_auto] gap-4 border-b border-border hover:bg-muted/20 transition-colors">
  <Link href={`/items/${item.id}`} className="px-4 py-2">
    <p className="text-sm font-medium text-foreground">{item.name}</p>
  </Link>
  <Link href={`/items/${item.id}`} className="px-4 py-2">
    <p className="text-sm text-muted-foreground">{item.date}</p>
  </Link>
  {/* Action buttons remain as regular buttons */}
  <button onClick={() => handleDelete(item)} className="...">
    Delete
  </button>
</div>

// If you need to intercept navigation (e.g., for callback-based navigation):
<Link
  href={`/items/${item.id}`}
  onClick={(e) => {
    if (onNavigateToItem) {
      e.preventDefault();
      onNavigateToItem(item.id);
    }
  }}
  className="..."
>
  {item.name}
</Link>
```

This pattern provides:

- Browser-native right-click "Open in new tab"
- Cmd/Ctrl+click support
- Proper accessibility (keyboard navigation, screen readers)
- No custom JavaScript context menu needed

### Large Form Dialog Structure

For complex form dialogs like `AddTestDialog`, use a flex-col layout with header, content area, and footer:

```tsx
<div className="relative w-full max-w-7xl h-[85vh] bg-background rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-border">
  {/* Header - fixed height with name input and action button */}
  <div className="h-14 flex items-center justify-between px-6 border-b border-border flex-shrink-0">
    <input
      type="text"
      value={name}
      onChange={(e) => setName(e.target.value)}
      placeholder="Name"
      className="h-9 px-3 rounded-lg text-base font-medium bg-transparent text-foreground placeholder:text-muted-foreground border-0 focus:outline-none focus:ring-0 hover:bg-muted/50 transition-colors"
      style={{ minWidth: "200px", maxWidth: "400px" }}
    />
    <button className="h-9 px-4 rounded-lg text-sm font-medium bg-foreground text-background">
      Save
    </button>
  </div>

  {/* Main Content Area - flex-1 to fill remaining space */}
  <div className="flex flex-1 overflow-hidden">
    {/* Left/Right columns or main content */}
  </div>
</div>
```

Key patterns:

- Header uses `h-14` height, `flex-shrink-0` to prevent shrinking
- Name input is transparent with hover state, no border to feel inline-editable
- Action button positioned on the right side of header
- Main content uses `flex-1 overflow-hidden` to fill remaining vertical space
- If using multi-column layout, wrap columns in the Main Content Area div

**Auto-resizing textareas** (used in AddTestDialog conversation history):

```tsx
<textarea
  value={content}
  onChange={(e) => {
    updateContent(e.target.value);
    // Auto-resize textarea
    e.target.style.height = "auto";
    e.target.style.height = `${e.target.scrollHeight}px`;
  }}
  onInput={(e) => {
    // Auto-resize on paste
    const target = e.target as HTMLTextAreaElement;
    target.style.height = "auto";
    target.style.height = `${target.scrollHeight}px`;
  }}
  ref={(el) => {
    // Auto-resize on mount (for editing existing content)
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }}
  rows={1}
  className="resize-none overflow-hidden"
/>
```

This pattern ensures textareas grow with content on: typing, pasting, and initial render when editing.

---

## Navigation Structure

### Sidebar Sections

1. **Main**

   - Agents
   - Tools

2. **Unit Tests**

   - LLM Evaluation (route: `/tests`) - formerly "Text to Text"
   - Text-to-Speech (TTS)
   - Speech-to-Text (STT)

3. **End-to-End Tests**

   - Personas
   - Scenarios
   - Metrics
   - Simulations

4. **Resources**
   - Documentation (external link to `process.env.NEXT_PUBLIC_DOCS_URL`, opens in new tab with external link icon indicator)

### External Links in Sidebar

The sidebar navigation handles external links differently from internal routes. In `AppLayout.tsx`, items with `id === "docs"` render as `<a>` tags with `target="_blank"` instead of Next.js `<Link>` components. External links include a small arrow icon (↗) to indicate they open in a new tab.

**Mobile behavior**: Both internal navigation links and external links (like Documentation) include `onClick` handlers that automatically close the sidebar on mobile devices (viewport < 768px). This provides a cleaner mobile UX by immediately showing the content after navigation without requiring a manual sidebar close.

### Cross-Page Links in Forms

Related pages include clickable links in their form dialogs to help users navigate between related concepts:

- **Personas ↔ Scenarios**: The Add/Edit Persona dialog links to "Scenarios" (explains WHAT to do), and the Add/Edit Scenario dialog links to "Personas" (explains HOW to behave)
- **Styling**: Use Mintlify-style underlines with `font-semibold text-foreground underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground/60 transition-colors`
- **Implementation**: Use Next.js `Link` component from `next/link` for client-side navigation

This pattern helps users understand the relationship between features and provides quick navigation when creating related resources.

---

## Environment Variables

```bash
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000  # Backend API URL
NEXT_PUBLIC_APP_URL=https://penseapp.vercel.app  # App base URL (required)
NEXT_PUBLIC_DOCS_URL=https://penseapp.vercel.app/docs  # Documentation base URL (required)
AUTH_SECRET=                                    # NextAuth secret
GOOGLE_CLIENT_ID=                              # Google OAuth client ID
GOOGLE_CLIENT_SECRET=                          # Google OAuth client secret
MAINTENANCE_MODE=true                          # Show maintenance page at / (optional)
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX    # Google Analytics Measurement ID (optional)
NEXT_PUBLIC_SENTRY_DSN=                        # Sentry DSN for error tracking (optional)
NEXT_PUBLIC_SENTRY_ENVIRONMENT=development     # Sentry environment: development, staging, production (optional)
```

### Maintenance Mode

Set `MAINTENANCE_MODE=true` in `.env.local` to show a maintenance page. When enabled:

- All page routes (`/login`, `/agents`, etc.) redirect to `/`
- `/` displays the maintenance page (no auth required)
- API routes (`/api/*`) are excluded to prevent NextAuth errors
- Requires server restart after changing

---

## Coding Standards

1. **Components**: Use functional components with hooks
2. **State**: Use `useState` for local state, avoid global state management
3. **Types**: Define TypeScript types at component top
4. **Naming**:
   - Components: PascalCase
   - Functions: camelCase
   - Types: PascalCase with descriptive suffix (e.g., `AgentData`, `ToolData`)
5. **Files**: One main component per file, helper components at bottom of same file
6. **Icons**: Import from `@/components/icons` - all icons are centralized there (Heroicons outline style, 24x24 viewBox, strokeWidth 1.5 or 2)
7. **Reusable Components**: Use shared components from `@/components/ui` (Button, SearchInput, SlidePanel, etc.)
8. **API Calls**: Use `@/lib/api` utilities (apiGet, apiPost, apiPut, apiDelete) for consistent error handling
9. **CRUD Resources**: Use `useCrudResource` hook from `@/hooks` for standard list pages
10. **Error Handling**: Try-catch with console.error and user-facing error states
11. **Form Validation**: Use `validationAttempted` state to show errors only after submit attempt
12. **Optimistic Updates**: Update local state immediately, then sync with backend

---

## Gotchas & Edge Cases

### API Calls

- **Preferred: Use `@/lib/api` utilities** - `apiGet`, `apiPost`, `apiPut`, `apiDelete` handle headers, 401 errors, and JSON parsing automatically
- **For CRUD pages**: Use `useCrudResource` hook from `@/hooks` for standardized list/create/update/delete patterns
- **JWT authentication required**: All API calls must include `Authorization: Bearer ${backendAccessToken}` header (handled automatically by API utilities)
- **401 error handling**: API utilities automatically clear localStorage, cookie, and call `signOut({ callbackUrl: "/login" })` on 401 responses. For manual fetch calls, check `response.status === 401`
- **HTTP error handling (401, 403, 404)**: Detail pages (STT, TTS, Simulation Run) handle specific HTTP error codes with dedicated UI states:
  - **401 Unauthorized**: Automatically redirects to login via `signOut({ callbackUrl: "/login" })`
  - **403 Forbidden**: Shows `NotFoundState` with "403 Forbidden" message
  - **404 Not Found**: Shows `NotFoundState` with "404 Not found" message
  - Pattern: add `errorCode` state (`useState<401 | 403 | 404 | null>(null)`), check status codes before `!response.ok`, render `<NotFoundState errorCode={errorCode} />`
  - For simulation runs, a special `notFoundHeader` is used that shows empty header and navigates back to `/simulations` (main page) instead of the specific simulation
- **User-facing error messages**: Never expose raw error strings from the API or catch blocks to users. Show generic, friendly messages instead. Pattern: "Something went wrong" as the heading with "We're looking into it. Please reach out to us if this issue persists." as the description. Raw errors should only be logged to `console.error`. Applied in: `TestRunnerDialog` (individual test error detail view AND overall error state when entire run fails), `BenchmarkResultsDialog` (error state panel), STT/TTS evaluation provider error banners ("There was an error running this provider. Please contact us by posting your issue to help us help you.")
- **Wait for token**: In `useEffect` hooks, return early if access token is not yet available; include it in the dependency array
- **Dual auth support**: All components now use `useAccessToken()` hook from `@/hooks` to get token from either NextAuth session (Google OAuth) or localStorage (email/password).
  - **Session loading guard**: `useAccessToken()` returns `null` while `useSession()` status is `"loading"`. This prevents a stale localStorage token (from a previous email/password session) from being used before the Google OAuth session finishes loading, which would cause a 401 → signOut that kills the fresh session.
  - **Type gotcha**: `useAccessToken()` returns `string | null`, but some component props expect `string | undefined`. Use nullish coalescing when passing to child components: `backendAccessToken={accessToken ?? undefined}`
  - **Exception**: `src/app/debug-client/page.tsx` still uses `useSession` directly for debugging purposes
- **Backend URL check**: API utilities will throw an error if `NEXT_PUBLIC_BACKEND_URL` is not set
- **Tunnel / ngrok**: The frontend does **not** send `ngrok-skip-browser-warning` (or similar) on API requests. If the backend URL is exposed through a tunnel that returns an HTML interstitial or warning document instead of JSON, fix that with tunnel or DNS configuration—do not re-add that header across the codebase. Helpers such as `src/lib/defaultEvaluators.ts` and `src/lib/publicEvaluators.ts` use the same minimal fetch headers as everything else.
- **Date formatting**: API returns ISO dates; use `toLocaleString()` for display
- **UTC timestamps**: Backend returns timestamps in UTC without timezone indicator (e.g., `"2026-01-18 10:00:00"`). When parsing for relative time calculations, append `"Z"` to explicitly mark as UTC: `new Date(dateString.replace(" ", "T") + "Z")`. Without this, JavaScript interprets the timestamp as local time, causing incorrect relative times (e.g., "5 hours ago" instead of "just now" for users in IST)
- **Multiple date formats**: When creating optimistic UI updates (e.g., adding a pending run to a table), use `new Date().toISOString()` which produces `"2026-01-18T09:30:00.000Z"`. The `formatRelativeTime` helper in `TestsTabContent.tsx` handles both formats - check if the string already has a timezone indicator before appending "Z" to avoid invalid dates like `"...ZZ"` which produce NaN
- **Optional date fields with fallbacks**: Some API responses may not include all date fields. The `SimulationRunsTab` uses `created_at` for sorting/display but falls back to `updated_at` if `created_at` is undefined. Pattern: `const dateStr = item.created_at || item.updated_at || ""`; `formatDate` functions should handle empty strings gracefully (return `"-"` instead of "Invalid Date")
- **Hooks need accessToken**: `useCrudResource` and `useFetchResource` require `accessToken` to be passed from the component (they don't call `useSession` internally)
- **Binary evaluator score format varies**: Backend returns binary evaluator scores as `"True"`/`"False"` strings in individual result rows, but as `1`/`0` integers in aggregate metrics and leaderboard summaries. The per-row column name itself depends on the API format — `result[name]` (no `_score` suffix) in the new `evaluator_runs` format, `result[`${name}_score`]` in the legacy `_info` format, `result.llm_judge_score` in the legacy single-evaluator format. The page-level `evaluatorColumns` array hides this difference: read `result[col.scoreField ?? `${col.key}_score`]`. When parsing the value for Pass/Fail display, convert to lowercase string and check for both: `const passed = scoreStr === "true" || scoreStr === "1"`. Rating evaluators ship a numeric string per row and a `mean` number in aggregates — coerce via `Number(score)` then `Number.isFinite` before formatting via `parseFloat(numeric.toFixed(4))` (the `EvaluatorScoreCell` in `STTResultsTable` / `TTSResultsTable` already handles both shapes).

### State Management

- **Refs for callbacks**: Use `useRef` to hold mutable callback references (e.g., `saveRef`) when callbacks need latest state but shouldn't trigger re-renders
- **Refs for polling callbacks (stale closure fix)**: When state values are checked inside `setInterval` callbacks, the callback captures stale state from when the interval was created. To get current values inside polling callbacks:
  1. Create refs to mirror the state: `const stateRef = useRef(stateValue)`
  2. Keep refs in sync with dedicated effects: `useEffect(() => { stateRef.current = stateValue }, [stateValue])`
  3. Inside the polling callback, use `stateRef.current` instead of `stateValue`
  - Example: `TestsTabContent` uses `viewingTestResultsRef`, `viewingBenchmarkResultsRef`, `selectedPastRunRef`, and `pastRunsRef` to check current state inside polling callbacks
- **Refs to avoid dependency-triggered re-runs**: If a useEffect sets up polling and updates state that's also in its dependencies, it creates a rapid polling loop (effect runs → polls → updates state → effect re-runs → polls again immediately). Solution:
  1. Use a ref to track the state that gets updated by polling
  2. Remove that state from the dependency array
  3. Access current value via ref inside the polling callback
  - Example: `TestsTabContent` uses `pastRunsRef` instead of having `pastRuns` in the polling useEffect dependencies
- **Functional setState for conditional updates in polling**: When you only need to conditionally set state (not read it for logic), use functional setState: `setState((current) => current || newValue)`. This avoids stale closures because React provides the current state value. Example: `setActiveProviderTab((current) => current || result.provider_results[0].provider)`
- **Polling cleanup pattern**: Clear intervals at THREE points to prevent accumulating multiple intervals:

  1. **At the start of the effect** - before setting up a new interval, clear any existing one
  2. **When the triggering condition becomes false** - e.g., when `isOpen` becomes false, clear in an `else` branch
  3. **In the cleanup function** - return a cleanup that clears the interval

  ```tsx
  useEffect(() => {
    if (isOpen) {
      // 1. Clear existing interval first
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      // ... set up new polling ...
      pollingIntervalRef.current = setInterval(poll, POLLING_INTERVAL_MS);
    } else {
      // 2. Clear when dialog closes
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    }
    // 3. Cleanup on unmount or dependency change
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [isOpen, taskId]);
  ```

  - **Gotcha**: Without clearing at the start of the effect, re-renders or dependency changes can create multiple concurrent intervals, causing excessive API requests

- **Dialog close prevention**: Disable dialog close while async operations (delete, save) are in progress
- **Unsaved changes confirmation**: Form dialogs (like AddTestDialog) should show a confirmation dialog when user clicks backdrop, asking "Discard changes?" with Cancel/Discard buttons
- **Unsaved benchmark provider guard on tab switch**: For connection agents, `AgentDetail.tsx` tracks the last-saved `benchmark_provider` via `savedBenchmarkProvider` state (initialized from fetched agent config, updated on successful save). When the user modifies the benchmark provider dropdown and tries to switch tabs, `handleTabChange` compares `connectionConfig.benchmark_provider` against `savedBenchmarkProvider`. If they differ, a modal dialog ("Unsaved changes") appears with "Discard" (reverts `connectionConfig.benchmark_provider` to saved value and switches) and "Save" (calls `saveRef.current()` then switches). The pending target tab is stored in `pendingTab` state. Clicking the backdrop dismisses the dialog without switching. This prevents the Tests tab from seeing an unsaved provider value when rendering the BenchmarkDialog's model list.
- **Key-based lookup with freeze-on-complete for live-updating dialogs**: When a dialog shows data that can complete (e.g., transcript with audio):
  1. Store a unique identifier (e.g., `selectedSimulationKey = simulation.simulation_name`)
  2. Use a ref to store frozen data: `frozenSimulationRef = useRef<DataType | null>(null)`
  3. Use `useMemo` to decide: if frozen and complete → return frozen; if just completed → freeze it; if in progress → return live data
  4. Clear the frozen ref when dialog closes
  5. This prevents re-renders and media reload for completed items while allowing live updates for in-progress items

### UI Patterns

- **Sortable tables**: Store both raw date (`updatedAtRaw`) for sorting and formatted date (`updatedAt`) for display
- **Search filtering**: Always use `.toLowerCase()` on both search query and target fields
- **Empty state vs no results**: Differentiate between "no items exist" and "no items match search"
- **Status badges**: Use shared utilities from `@/lib/status` and `StatusBadge` component from `@/components/ui`:
  - Import `formatStatus`, `getStatusBadgeClass`, `isActiveStatus` from `@/lib/status`
  - Use `<StatusBadge status="..." showSpinner />` for consistent status display
  - `queued` → "Queued" (gray badge)
  - `in_progress` → "Running" (yellow badge)
  - `done` → "Done" (green badge)
  - `failed` → "Failed" (red badge)
  - Pass `showSpinner` prop to show spinner for active statuses (`queued`/`in_progress`)
  - Badge classes use dark mode variants: `dark:bg-{color}-500/20 dark:text-{color}-400`
- **Theme-aware styling**: ALWAYS use CSS variable classes for colors to support both light and dark modes:
  - ✅ Use: `bg-background`, `bg-muted`, `bg-card`, `bg-foreground`
  - ✅ Use: `text-foreground`, `text-muted-foreground`, `text-background`
  - ✅ Use: `border-border`
  - ❌ NEVER use: `bg-black`, `bg-white`, `bg-gray-900`, `text-black`, `text-white` (hardcoded colors)
  - Exception: Landing page (`/login`) intentionally uses hardcoded light theme (`bg-white`, `bg-gray-50`, `text-gray-900`) as it's marketing-focused
  - **Recent fixes**: BenchmarkDialog (changed `bg-black` → `bg-background`), NestedContainer (changed `bg-[#1b1b1b]` → `bg-muted`)
- **Pill-based attribute display**: For displaying multiple attributes in mobile cards or compact layouts, use pill styling for better visual hierarchy:
  - Standard pill classes: `inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-muted text-foreground`
  - Container: `flex flex-wrap gap-2` for consistent spacing
  - **Localization pattern** (e.g., Personas gender in Hindi): Create helper functions like `getGenderInHindi()` to map English values to localized display text:
    ```tsx
    const getGenderInHindi = (gender: string) => {
      const genderMap: Record<string, string> = {
        male: "पुरुष",
        female: "महिला",
      };
      return genderMap[gender.toLowerCase()] || gender;
    };
    ```
  - Use case: Personas mobile cards display gender in Hindi, language capitalized, and interruption sensitivity as separate pills
- **Stable keys for media elements**: When rendering audio/video in components that re-render during polling, use stable keys (`key={src}`) to prevent React from remounting the element and restarting playback
- **Range slider with filled track and tooltip**: For sliders that show progress from start to current value with a hover tooltip:

  ```tsx
  const [showTooltip, setShowTooltip] = useState(false);
  const percentage = ((value - min) / (max - min)) * 100;

  <div className="relative pt-6">
    {/* Tooltip - positioned above thumb */}
    {showTooltip && (
      <div
        className="absolute -top-1 transform -translate-x-1/2 pointer-events-none"
        style={{
          left: `calc(${percentage}% + ${8 - (percentage / 100) * 16}px)`,
        }}
      >
        <div className="bg-foreground text-background text-xs font-medium px-2 py-1 rounded-md">
          {value} secs
        </div>
        <div className="w-2 h-2 bg-foreground transform rotate-45 absolute left-1/2 -translate-x-1/2 -bottom-1" />
      </div>
    )}
    <input
      type="range"
      min={min}
      max={max}
      value={value}
      onChange={(e) => setValue(parseInt(e.target.value, 10))}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onFocus={() => setShowTooltip(true)}
      onBlur={() => setShowTooltip(false)}
      className="w-full h-2 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-runnable-track]:rounded-lg [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:mt-[-3px] [&::-moz-range-track]:rounded-lg [&::-moz-range-track]:bg-transparent [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-foreground [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
      style={{
        background: `linear-gradient(to right, white 0%, white ${percentage}%, hsl(var(--muted)) ${percentage}%, hsl(var(--muted)) 100%)`,
      }}
    />
  </div>;
  ```

  **Gotchas**: Use `white` directly instead of `hsl(var(--foreground))` for the filled track color - CSS variables in inline styles may not render correctly. Add explicit track styling (`-webkit-slider-runnable-track`, `-moz-range-track`) with `bg-transparent` to let the gradient show through. The tooltip position formula `calc(${percentage}% + ${8 - (percentage / 100) * 16}px)` accounts for thumb width offset at edges

- **Ref-based previous value tracking**: To only trigger effects when values actually change (not just when references change), use a ref to track the previous value:
  ```tsx
  const prevLengthRef = useRef(0);
  useEffect(() => {
    if (currentLength > prevLengthRef.current) {
      // Only runs when length increases
    }
    prevLengthRef.current = currentLength;
  }, [currentLength]);
  ```
- **No nested anchors in Link components**: HTML forbids `<a>` tags nested inside other `<a>` tags. Since Next.js `<Link>` renders as `<a>`, placing an `<a>` inside a `<Link>` causes React hydration errors. Solution: use `<button>` with `window.open()` for nested clickable elements:
  ```tsx
  <Link href="/items/123">
    <span>Item name</span>
    {/* DON'T: <a href="https://external.com">External</a> */}
    {/* DO: */}
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        window.open("https://external.com", "_blank", "noopener,noreferrer");
      }}
    >
      External link icon
    </button>
  </Link>
  ```
- **Interactive list items with mobile touch support**: For list items that trigger actions (not navigation), use `<button>` elements instead of `<div>` with `onClick` to ensure reliable touch event handling on mobile devices:

  ```tsx
  {
    /* DON'T: div with only onClick */
  }
  <div onClick={handleSelect}>List item</div>;

  {
    /* DO: button with onClick and onTouchEnd */
  }
  <button
    type="button"
    onClick={handleSelect}
    onTouchEnd={(e) => {
      e.preventDefault();
      e.stopPropagation();
      handleSelect();
    }}
    className="w-full text-left"
  >
    List item content
  </button>;
  ```

  **Why**: `div` elements with `onClick` can have inconsistent touch event handling on mobile browsers. Using semantic `<button>` elements with both `onClick` and `onTouchEnd` ensures reliable tap recognition across all devices. Add `type="button"` to prevent form submission and `w-full text-left` for full clickable area with left-aligned text.
  **Example**: TestRunnerDialog's TestListItem component and BenchmarkResultsDialog's test items use this pattern for reliable mobile test selection.

- **Simple loading states**: When showing initial loading spinners, use generic "Loading..." text. Don't try to guess or display the status before the API responds. Once data is fetched, show the actual status in the appropriate UI element (e.g., status badge in header).

  ```tsx
  {
    /* DON'T: Try to display status before fetching */
  }
  {
    isInitialLoading && <p>Benchmark queued</p>;
  }

  {
    /* DO: Generic loading message */
  }
  {
    isInitialLoading && <p>Loading...</p>;
  }

  {
    /* Status shows in header after data loads */
  }
  {
    !isInitialLoading && <StatusBadge status={actualStatus} showSpinner />;
  }
  ```

  **Why**: The initial state is unknown until the API responds. Showing "queued" or other status text before fetching is misleading and creates confusion. Let the API response determine what to display.
  **Example**: BenchmarkResultsDialog uses simple "Loading..." message during initial fetch, then displays actual status in header badge once data arrives.

### Styling

- **Never use hardcoded colors** like `bg-black`, `bg-[#1a1a1a]`, `text-white`, `border-[#333]`, `text-gray-300`, `text-gray-400` - these break light mode
- **Always use CSS variable classes**: `bg-background`, `text-foreground`, `border-border`, `bg-muted`, `text-muted-foreground`, `bg-accent`
- **Do NOT use `bg-popover`** - it causes transparent backgrounds due to Tailwind v4 theme mapping issues; use `bg-background` instead for dropdowns and popovers
- **Links in descriptions (Mintlify-style)**: For links within `text-muted-foreground` descriptions, use `font-semibold text-foreground underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground/60 transition-colors`. This creates a subtle underline that becomes more prominent on hover. Example: `<Link href="/scenarios" className="font-semibold text-foreground underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground/60 transition-colors">Scenarios</Link>` in persona form descriptions
- **Checkboxes need visible borders**: Use `border-muted-foreground` (not `border-border`) and `border-2` for custom checkbox buttons to ensure visibility in both light and dark modes
- **Spinners in flex containers**: Always add `flex-shrink-0` to spinner SVGs to prevent them from shrinking. Standard spinner class: `w-5 h-5 flex-shrink-0 animate-spin`
- **Icon action buttons** (play, edit, etc.): Use `bg-foreground/90 text-background hover:bg-foreground` for solid icon buttons that need to be visible in both light and dark modes. Never use `text-white` alone as icons become invisible on light backgrounds. **Avoid `hover:opacity-*`** on buttons with child tooltips - opacity affects all children including tooltips, making them translucent. Use `bg-foreground/90 hover:bg-foreground` instead to only affect the background
- **Chat message bubbles (test results)**: **`TestDetailView`** (`@/components/test-results/shared.tsx`) drives the middle column in **TestRunnerDialog**, **BenchmarkOutputsPanel**, and public test/benchmark pages. User, assistant, history tool-call, and final output bubbles share **`w-[88%] md:w-3/4`** so the transcript uses most of the column without going edge-to-edge. Alignment: user right (`items-end`), agent left. Colors: user `bg-muted border border-border`, agent `bg-background border border-border`, tool output matches tool-call card styling; **`rounded-xl`**. **`AddTestDialog`** preview rows use **`w-1/2`** in the editor — different layout from result view; update docs in both places if you change width conventions.
- **Info banners (colored text on tinted bg)**: When using colored text on a semi-transparent background (e.g., blue info notices, yellow warnings), always provide separate light and dark mode classes. Light mode needs darker shades for readability. Pattern: `text-blue-600 dark:text-blue-300/90` for text, `text-blue-500 dark:text-blue-400` for icons. Never use only a light shade like `text-blue-300` — it's invisible on light backgrounds. **Yellow/cream warning strips** (e.g., `bg-yellow-500/10`): prefer **`text-foreground`** for the banner body so contrast holds on the pale tint; pair with a darker icon in light mode, e.g. **`text-amber-900 dark:text-amber-400`**, instead of mid yellow on yellow (`text-yellow-500` on `bg-yellow-500/10` fails WCAG in light mode)

### Forms

- **Character limits**: Implement maxLength on inputs AND display character count
- **Required fields**: Mark with red asterisk, validate on submit, highlight invalid fields
- **Invalid/error row styling**: Use `bg-red-500/10` for row backgrounds (e.g., STT empty predictions, form validation rows). For invalid inputs use `border-red-500`. This pattern is consistent across forms and data tables
- **Nested parameters**: Tool parameters support arbitrary nesting (object → properties, array → items)

### ZIP and CSV File Parsing (STT/TTS Evaluations)

- **Direct path lookup, not search**: Instead of iterating through all ZIP entries, directly check expected locations. First try root (`data.csv`), then check top-level folders (`folder/data.csv`). This avoids accidentally matching macOS metadata files.
- **macOS metadata files**: macOS creates hidden `__MACOSX` folders and `._` prefixed files (resource forks) in ZIPs. Filter these out when listing top-level folders: `!path.includes("__MACOSX") && !path.startsWith("._")`
- **Nested folder structures in ZIPs**: When users compress a folder on macOS, the ZIP wraps contents in a parent folder (e.g., `my_folder/data.csv` instead of `data.csv`). Store the discovered `basePath` and use it for all subsequent file lookups.
- **CSV BOM (Byte Order Mark)**: Excel-exported CSVs often include an invisible BOM character (`\uFEFF`) at the start. Strip it before parsing: `if (csvContent.charCodeAt(0) === 0xFEFF) csvContent = csvContent.slice(1);`
- **CSV line endings**: Handle all types - `\r\n` (Windows), `\n` (Unix), `\r` (old Mac). Use `.split(/\r\n|\n|\r/)` instead of `.split(/\r?\n/)`.
- **Audio file lookup with base path**: Use the discovered basePath: `zip.file(\`${basePath}audios/${filename}\`) || zip.file(\`${basePath}${filename}\`)`

### Voice Simulation Audio

- **Two backend naming layouts** (frontend picks automatically from `audio_urls`):
  - **Legacy (parallel indices)**: Both `N_user.wav` and `N_bot.wav` can exist for the same `N` (e.g. `1_user` and `1_bot`). Per-message filenames use **separate 1-based counters** per role: user rows map to `` `${userCount + 1}_user.wav` ``, assistant text rows to `` `${assistantCount + 1}_bot.wav` `` (same counting rules as below).
  - **Unified (shared turn index)**: Each turn index `N` appears at most once across the URL list — filenames follow conversation order, e.g. `1_user.wav`, `2_bot.wav`, `3_user.wav`, … (no duplicate `N` across both roles). Per-message pattern is `` `${spokenTurnCount + 1}_user.wav` `` or `` `${spokenTurnCount + 1}_bot.wav` ``, where `spokenTurnCount` counts prior **spoken** rows only (`user` or `assistant` without `tool_calls`) in the filtered transcript.
- **Detection** (`audioUrlsUseLegacyPerRoleTurnIndexing` in `src/lib/simulationVoiceAudio.ts`): Scan all URLs for substrings matching `N_user.wav` / `N_bot.wav`. If **any** `N` appears as **both** user and bot, treat the run as **legacy**; otherwise **unified**. **Why**: New backends use a single incrementing turn number; old runs must keep the previous matching rules.
- **Implementation**: **`getVoiceSimulationAudioLayout(audio_urls)`** returns `"legacy"` | `"unified"` (defaults to `"unified"` when the list is empty). **`getVoiceSimulationAudioUrlForEntry(entry, entryIndex, audio_urls, filteredTranscript, layout)`** applies the pattern for that layout. Callers memoize layout once per simulation — **`src/app/simulations/[uuid]/runs/[runId]/page.tsx`** (`selectedVoiceAudioLayout` from `selectedSimulation?.audio_urls`; thin `getAudioUrlForEntry` still gates on `runData.type === "voice"`) and **`src/components/eval-details/SimulationTranscriptDialog.tsx`** (`voiceAudioLayout` from `simulation.audio_urls`; only resolves when `runType === "voice"`).
- **Filtered transcript** (same list as UI: `end_reason` removed; `tool` kept only for JSON `type === "webhook_response"`): All counting uses `entryIndex` into this list. **Lookup**: `audio_urls.find((url) => url.includes(pattern))` — first substring match wins. **No audio**: `null` for `role === "tool"`, assistant rows with `tool_calls`, or other roles. **Gotcha**: Webhook `tool` rows sit in the filtered array (they shift indices) but do **not** increment user, assistant, or spoken-turn counters — alignment is with **spoken** turns, not raw line count. **Gotcha**: If `audio_urls` is incomplete during polling, layout can flip when both `N_user` and `N_bot` first appear for the same `N`; once stable, behavior matches the backend.
- **Common mistake**: Don't use 0-based indexing for filenames. Don't count assistant **tool-call** rows toward audio indices — only user and assistant **text** turns have clips. For unified layout, don't assume separate user/bot serial numbers.
- **Full conversation audio**: The API returns a `conversation_wav_url` field containing a combined audio file of the entire conversation. This is displayed below the Transcript header (before the messages) with a "Full Conversation" label and speaker icon
- **Presigned URL expiration handling**: S3 presigned URLs for audio files expire after a period. When audio fails to load (e.g., expired URL), the `onError` handler triggers a `refreshRunData` callback that fetches fresh run data from the API with new presigned URLs. The callback also clears any frozen simulation data to ensure the fresh URLs are used

### Navigation

- **`/` and app entry**: **`/` is the public landing page** (`src/app/page.tsx`); middleware does **not** redirect `/` → `/agents`. Logged-in users visiting `/login` or `/signup` are redirected to `/agents`; **`/` remains readable** regardless of auth (unless **`MAINTENANCE_MODE=true`**, when non-API routes redirect to `/`—see middleware).
- **Tab persistence**: Agent detail, simulation detail, and the Evaluators list page (`/evaluators?tab=default|mine`) persist their active tab in the URL (`?tab=...`) so refreshing maintains tab state. Agent/simulation detail use `window.history.replaceState`; the evaluators list uses `router.replace` plus a `useSearchParams`-driven re-sync (see the "Active tab persistence" note in section 8).
- **Back navigation**: Detail pages include back button to list view

### Page Titles

Page titles use a **two-layer approach** for correct display on both reload and client navigation:

1. **Route-specific layouts** (server-side): Provide the correct title immediately on page load/reload
2. **`useEffect` in pages** (client-side): Update titles for dynamic content and client navigation

**Layout files provide base titles:**

Each route has a `layout.tsx` file that exports metadata for server-side rendering:

```tsx
// src/app/tools/layout.tsx
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tools | Calibrate",
};

export default function ToolsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
```

**Route layout hierarchy:**

| Route                      | Layout Title                                                  |
| -------------------------- | ------------------------------------------------------------- |
| `/agents`                  | "Agents \| Calibrate"                                         |
| `/agents/[uuid]`           | "Agent \| Calibrate"                                          |
| `/tools`                   | "Tools \| Calibrate"                                          |
| `/tests`                   | "Tests \| Calibrate"                                          |
| `/personas`                | "Personas \| Calibrate"                                       |
| `/scenarios`               | "Scenarios \| Calibrate"                                      |
| `/evaluators`              | "Evaluators \| Calibrate"                                     |
| `/evaluators/[uuid]`       | "Evaluator \| Calibrate"                                      |
| `/simulations`             | "Simulations \| Calibrate"                                    |
| `/simulations/[uuid]`      | "Simulation \| Calibrate"                                     |
| `/simulations/[uuid]/runs` | "Simulation Run \| Calibrate"                                 |
| `/stt`                     | "Speech to Text \| Calibrate"                                 |
| `/stt/[uuid]`              | "STT Evaluation \| Calibrate"                                 |
| `/stt/new`                 | "New STT Evaluation \| Calibrate"                             |
| `/tts`                     | "Text to Speech \| Calibrate"                                 |
| `/tts/[uuid]`              | "TTS Evaluation \| Calibrate"                                 |
| `/tts/new`                 | "New TTS Evaluation \| Calibrate"                             |
| `/login`                   | "Calibrate \| Scale conversational AI agents with confidence" |

**useEffect for dynamic titles:**

Detail pages use `useEffect` to update titles with actual data names after loading:

```tsx
useEffect(() => {
  if (data?.name) {
    document.title = `${data.name} | Calibrate`;
  }
}, [data?.name]);
```

**Tab-aware titles for detail pages with tabs:**

Pages with tabs (agent detail, simulation detail) include the active tab name in the title:

| Page                               | Title Format                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| `/agents/[uuid]`                   | `<Agent Name> - <Tab Name> \| Calibrate` (e.g., "My Agent - Tests \| Calibrate")     |
| `/simulations/[uuid]`              | `<Simulation Name> - <Tab Name> \| Calibrate` (e.g., "My Sim - Config \| Calibrate") |
| `/simulations/[uuid]/runs/[runId]` | `<Run Name> \| <Simulation Name> \| Calibrate`                                       |

**Simulation run page fetches parent simulation name:**

The simulation run page fetches the parent simulation's name via a separate API call to display the full hierarchical title:

```tsx
// Fetch simulation name for page title
useEffect(() => {
  const fetchSimulationName = async () => {
    const response = await fetch(`${backendUrl}/simulations/${uuid}`, ...);
    if (response.ok) {
      const data = await response.json();
      setSimulationName(data.name);
    }
  };
  fetchSimulationName();
}, [uuid, backendAccessToken]);
```

**Why both layout metadata and useEffect?**

- **Layout metadata**: Ensures correct title on server render (page reload shows correct title immediately)
- **useEffect**: Updates title with dynamic content (agent name, simulation name, active tab) after data loads

**Tab switching uses replaceState:**

For tab changes in `/agents/[uuid]` and `/simulations/[uuid]`, `window.history.replaceState` is used instead of `router.push` to update the URL without triggering navigation side effects that could reset the title. In `AgentDetail.tsx`, the actual switch + URL update is extracted into `performTabSwitch(tab)`, and `handleTabChange` calls it after optionally intercepting for unsaved benchmark provider changes (connection agents only).

```tsx
// In tab click handlers
window.history.replaceState(null, "", `?tab=${tabName}`);
```

### Authentication

- **Middleware matcher**: Excludes static assets (`_next/static`, `_next/image`, `favicon.ico`, `*.svg`, `*.png`, `*.jpg`, `*.jpeg`, `*.gif`, `*.webp`, `*.ico`)
- **Protected routes**: All routes except public routes require authentication
- **Public routes** (no auth required): `/`, `/login`, `/signup`, `/terms`, `/privacy`, `/api/auth/*`, `/debug*`, `/docs*` (proxied to Mintlify via Vercel rewrite). **`/about`** redirects to **`/#about-calibrate`** (see **`middleware.ts`**).
- **Session access**: Use `useSession()` in client components, `auth()` in server components
- **Token expiration**: Backend returns 401 when JWT expires; always handle this by clearing localStorage, cookie, and calling `signOut({ callbackUrl: "/login" })`
- **Import pattern**: Always import both `useSession` and `signOut` from `next-auth/react` when making API calls
- **Logout handling**: Always clear all three auth stores when logging out: `localStorage.removeItem("access_token")`, `localStorage.removeItem("user")`, `document.cookie = "access_token=; path=/; max-age=0; SameSite=Lax"`, then `signOut({ callbackUrl: "/login" })`
- **Backend token obtained at login**: The `backendAccessToken` is fetched from the backend during the JWT callback (at login time). If the backend URL was misconfigured when a user logged in, their session won't have the token. **Solution**: User must log out and log back in after fixing the backend URL.
- **Google OAuth forces account selection**: The Google provider is configured with `prompt: "select_account"` to always show the account picker, preventing auto-login with cached credentials. This ensures users consciously choose their account each login.

### Vercel Deployment

- **`NEXT_PUBLIC_*` vars are build-time**: These environment variables are embedded into client-side JavaScript at build time, not runtime. Server-side code (API routes) reads them at runtime.
- **Changing env vars requires rebuild**: After adding/changing `NEXT_PUBLIC_*` vars in Vercel, you must redeploy **without build cache** to rebuild client JS with new values.
- **Environment selection**: Vercel has Production, Preview, and Development environments. Set env vars for the correct environment (or "All").

### Analytics

- **Vercel Analytics**: Enabled via `@vercel/analytics/next` - automatically tracks page views on Vercel deployments
- **Google Analytics**: Enabled via `@next/third-parties/google` - only loads when `NEXT_PUBLIC_GA_MEASUREMENT_ID` is set
  - Both are added in the root layout (`src/app/layout.tsx`)
  - Google Analytics component conditionally renders based on the environment variable

### Error Tracking (Sentry)

- **Sentry** is configured for error tracking across client, server, and edge runtimes
- Configuration files:
  - `src/instrumentation-client.ts` - Client-side Sentry initialization (includes Replay integration)
  - `sentry.server.config.ts` - Server-side Sentry initialization
  - `sentry.edge.config.ts` - Edge runtime Sentry initialization (middleware, edge routes)
  - `src/instrumentation.ts` - Imports server config for Next.js instrumentation
  - `src/app/global-error.tsx` - Global error boundary that reports to Sentry
- Environment variables (both use `NEXT_PUBLIC_` prefix for client/server availability):
  - `NEXT_PUBLIC_SENTRY_DSN` - Sentry project DSN
  - `NEXT_PUBLIC_SENTRY_ENVIRONMENT` - Environment name (development, staging, production)
- Features enabled: Session Replay (10% session sample, 100% on error, masking disabled), PII sending, logs
