---
description: "Description of the project"
alwaysApply: true
---

# Calibrate Frontend

**Voice Agent Simulation and Evaluation Platform**

---

## What is Calibrate?

Calibrate is a comprehensive platform for building, configuring, testing, and evaluating **voice-based AI agents**. It enables teams to create conversational agents that can handle voice interactions (phone calls, voice assistants) and rigorously test them before deployment.

The platform addresses the challenge of quality assurance for voice agents by providing:

- **Component-level testing** (unit tests for STT/TTS providers)
- **End-to-end simulation testing** (full conversations with simulated users)
- **Benchmarking** across different AI providers to find the best configuration

> **Note on naming**: The app is branded as "Calibrate" in all user-facing UI, page titles, and documentation. However, external URLs and infrastructure still reference "pense" (e.g., Discord: `https://discord.gg/9dQB4AngK2`). Documentation links use `process.env.NEXT_PUBLIC_DOCS_URL` directly. The npm package name is `calibrate-frontend`.
>
> **Community links**: WhatsApp and Discord invite URLs are defined once in `src/constants/links.ts` (`WHATSAPP_INVITE_URL`, `DISCORD_INVITE_URL`) and imported wherever needed: `AppLayout.tsx` (Talk to Us FAB), `page.tsx` (landing page Community section), and `LandingFooter.tsx`. Always import from `@/constants/links` — never hardcode these URLs.

---

## Overall Context & Use Cases

### Primary Use Case

Organizations building voice agents (customer support bots, IVR systems, voice assistants) use Calibrate to:

1. Configure their agent's voice pipeline (which STT, TTS, and LLM to use)
2. Test individual components to select the best providers
3. Run simulated conversations to validate agent behavior
4. Evaluate agent performance with metrics before going live

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
│      ├── Execute Run: System simulates conversations                    │
│      └── Review Results: Transcripts, metrics, pass/fail status         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Complete Feature List

### 1. Agent Management (`/agents`)

**What you can do:**

- **Create agents** with a name and default configuration
- **View all agents** in a searchable, sortable list (sorted by last updated)
- **Duplicate agents** - clone existing agent configurations
- **Delete agents**
- **Right-click or Cmd/Ctrl+click** any agent row to open in a new browser tab (native browser support)

**Agent Detail Page** (`/agents/[uuid]`) has 5 tabs:

| Tab                 | Purpose                                                                          |
| ------------------- | -------------------------------------------------------------------------------- |
| **Agent**           | Configure system prompt, STT/TTS providers, and LLM model                        |
| **Tools**           | Attach/detach function calling tools + toggle built-in "End conversation" tool   |
| **Data Extraction** | Define fields to extract from conversations (name, type, description, required)  |
| **Tests**           | Link test cases to agent, run tests, view past runs with results, compare models |
| **Settings**        | Toggle "Agent speaks first" behavior, set max assistant turns before call ends   |

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

- **Two-column layout**: Tests table on left, Past runs panel (560px) on right
- **Tests table**: Shows attached tests with name, type (Tool Call/Next Reply), run button, delete button
  - **Individual run button**: Play button on each test row runs only that specific test (not all tests)
- **Past runs panel**: Has "Past runs" heading with `bg-muted/30` background, showing history of test runs (no column headers):
  - **Row content**: Name/count, Run Type pill, Time, Result badges
  - **Name display logic** (via `getTestRunDisplayName` helper):
    - Single-test runs: Shows `results[0].name` (in-progress) or `results[0].test_case.name` (completed)
    - Multi-test runs: Shows "N tests" (e.g., "2 tests")
    - Benchmarks: Shows "N models" (e.g., "3 models")
  - **Run Type**: "Test" (blue pill) or "Benchmark" (purple pill) based on `type` field
  - **Time**: Short relative time format (e.g., "now", "5 min ago", "7h ago", "2d ago", "3w ago", "2m ago", "1y ago")
  - **Result**: "Running" (yellow, with spinner) for pending/queued/in_progress; "Failed" (red) for `status === "failed"` (entire run errored); "N Success" and/or "M Fail" badges for completed `llm-unit-test`; "Complete" for completed `llm-benchmark`
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
- **Actions**: Add test (button in tests table header), Run all tests (header action button, max 20 tests), Run single test (row button), Compare models (benchmark)
- **Run all tests limit**: Maximum 20 tests at a time. Shows toast error with "Contact Us" link if exceeded
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
- **Add multiple test samples** for batch evaluation (max 20 rows per evaluation)
- **ZIP upload option**: Upload a ZIP file containing an `audios/` folder with .wav files and a `data.csv` mapping audio files to transcriptions
- **Download sample ZIP**: Button to download a template ZIP with correct structure
- **Select providers to evaluate** (compare multiple simultaneously)
- **Choose language** (11 Indic languages: English, Hindi, Kannada, Bengali, Malayalam, Marathi, Odia, Punjabi, Tamil, Telugu, Gujarati) - provider list filters based on language support
- **Run evaluation** - creates evaluation and redirects to detail page
- **Row limit**: Maximum 20 rows per evaluation. Shows toast error with "Contact Us" link if exceeded
- **Audio duration limit**: Each audio file must be under 60 seconds. Validated client-side using Web Audio API before upload. Shows toast error with "Contact Us" link if exceeded
- **Audio file size limit**: Each audio file must be under 5 MB. Validated client-side before upload. Shows toast error with "Contact Us" link if exceeded

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
    - **Results**: Card layout instead of table — each row is a bordered card showing Ground Truth, Prediction, WER, Similarity, and LLM Judge reasoning inline
  - **Provider status icons** (both layouts):
    - Yellow pulsing dot when `success === null` (in progress)
    - Green checkmark when `success === true` AND no empty predictions
    - Red X when `success === false` OR any row has empty prediction
  - First provider is selected by default
  - **Auto-scroll**: Clicking a provider with empty predictions scrolls to the first empty row
- **About tab responsive**: Desktop shows 4-column table (Metric, Description, Preference, Range). Mobile shows stacked cards with metric name, description, and Preference/Range side by side
- **Metrics**: WER, String Similarity, LLM Judge (Pass/Fail)

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

- **Add text samples** to convert to speech (manual input OR CSV upload, max 20 rows)
- **CSV upload option**: Upload a CSV file with a `text` column to bulk import samples
- **Download sample CSV**: Button to download a template CSV with correct format
- **Select language** (11 Indic languages: English, Hindi, Kannada, Bengali, Malayalam, Marathi, Odia, Punjabi, Tamil, Telugu, Gujarati) - provider list filters based on language support
- **Select providers to compare**
- **Run evaluation** - creates evaluation and redirects to detail page
- **Row limit**: Maximum 20 rows per evaluation. Shows toast error with "Contact Us" link if exceeded
- **Text length limit**: Each text input must be 200 characters or less. Validated on CSV upload and before evaluation. Shows toast error with "Contact Us" link if exceeded

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
  - **Mobile** (below `md`): Stacked — horizontal scrollable provider row on top, then card-based results below. Each card shows Text, Audio player (full-width), and LLM Judge reasoning inline
  - **Provider status icons**: Yellow dot (in progress), green checkmark (success), red X (failed)
  - First provider is selected by default
  - Clicking a provider shows its details
- **Metrics**: LLM Judge (Pass/Fail), TTFB
- **Intermediate results structure**: `results` array contains `id`, `text`, `audio_path`; `llm_judge_score` and `llm_judge_reasoning` are only present when complete

### 5. LLM Tests (`/tests`)

**Page heading:** "LLM tests"

**What you can do:**

- **Create test cases** with:
  - Name and description
  - Test type: "response" (check agent response) or "tool_call" (check tool invocation)
  - Test configuration
  - **Tool invocation defaults**: When selecting a webhook tool, "Accept any parameter values" is enabled by default (since webhook responses are unpredictable). Structured output tools default to requiring specific parameter values
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
  - **Loading saved tests** (when `initialConfig` is provided):
    - Parses `history` array and converts to chatMessages format
    - **Waits for tools fetch to complete**: Uses a `toolsFetched` state flag that's set to `true` in the `finally` block of the tools API call. The useEffect depends on `initialConfig`, `toolsFetched`, and `availableTools` - it only processes when `toolsFetched` is true. This ensures the form populates even if no tools exist or the tools API fails
    - **Webhook tool call detection**: Looks up the tool by name in `availableTools` and checks `tool?.config?.type === "webhook"`. This is more reliable than checking for body/query argument keys (which could misclassify structured-output tools with params named "body" or "query")
    - **Webhook param extraction**: For webhook tools, extracts nested properties from body/query and assigns `group` property to each param so they display in the correct container (e.g., `{body: {task_type: "x"}}` → `{name: "task_type", value: "x", group: "body"}`). Headers are intentionally excluded from the UI
    - **Tool response parsing**: `role: "tool"` messages are included as `tool_response` type, linked to their corresponding tool call via `tool_call_id`
    - Non-webhook tools show params as flat list without group containers
    - **Param update matching**: `updateToolCallParam` matches by both `name` AND `group` to avoid updating params with the same name across different groups (e.g., "id" in both body and query)
- **View all tests**
- **Edit/delete tests**
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

### 8. Metrics Management (`/metrics`)

**What you can do:**

- **Define evaluation criteria** for simulations
- **Configure pass/fail thresholds**
- **Set up custom metrics**
- **Duplicate existing metrics** with a new name

**UI Patterns:**

- **List view**: Desktop table with mobile card view showing duplicate and delete actions (see "List Page Structure" section)
- **Add/Edit sidebar**: Full-page responsive slide-in panel with form fields (full-width on mobile, max-width on desktop). See "Comprehensive Dialog & Sidebar Responsive Patterns" section.
- **Duplicate dialog**: Centered modal dialog for entering new metric name (fully responsive). See "Comprehensive Dialog & Sidebar Responsive Patterns" section.

### 9. Simulations (`/simulations`)

**What you can do:**

- **Create simulations** with a name
- **View all simulations** in a searchable, sortable list
- **Delete simulations**
- **Right-click or Cmd/Ctrl+click** any simulation row to open in a new browser tab (native browser support)

**Simulation Detail Page** (`/simulations/[uuid]`) has 2 tabs:

| Tab        | Purpose                                                                                                                                                                                                               |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Config** | Select agent, personas (max 2), scenarios (max 5) for the simulation                                                                                                                                                  |
| **Runs**   | View history of simulation runs (right-click or Cmd/Ctrl+click to open run in new tab). **Responsive**: Desktop table view (`hidden md:block`) with sortable columns, mobile card view with pills for status and type |

**Selection Limits:**

- **Personas**: Maximum 2 personas per simulation. Shows toast error with "Contact Us" link if exceeded
- **Scenarios**: Maximum 5 scenarios per simulation. Shows toast error with "Contact Us" link if exceeded

**Running Simulations:**

- **Run types**: chat (text-based), audio, voice (full pipeline)
- Runs are executed asynchronously with polling for status updates
- Status flow: queued → in_progress → done (or failed). When a run is aborted, the API returns `status: "done"` with individual `simulation_results` entries having `aborted: true`

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
  - **Metrics shown**:
    - Performance: Tool calls accuracy, answer completeness, assistant behavior, question_completeness, stt_llm_judge (percentage display)
    - Latency: STT/LLM/TTS TTFB and processing time (millisecond/second display)
  - Calculated from `runData.metrics` or derived from individual simulation `evaluation_results`

- **Per-Simulation Results Table** (shows intermediate results as each simulation completes):

  - **Desktop** (`hidden md:block`): Table with columns for play button, persona, scenario, and metric columns

    - Persona + Scenario combination
    - Individual metric scores (Pass/Fail with tooltips showing reasoning)
    - Metric columns derived from `runData.metrics` keys, or from `simulation_results[].evaluation_results` when metrics is null
    - Latency metrics (stt/ttft, llm/ttft, etc.) are excluded from the table (shown in latency tab instead)
    - `stt_llm_judge_score` displayed as percentage, other metrics as Pass/Fail
    - View transcript button (only shown for rows with transcript history; available even while evaluation is pending)
    - Audio playback (for voice simulations)
    - **Processing state**: Rows with `evaluation_results: null` (and not aborted) show spinners in metric cells (yellow if has transcript/processing, gray if waiting) and a spinner beside the play button. Aborted rows show "N/A" in metric cells instead

  - **Mobile** (`md:hidden`): Card-based layout with clear label/value structure:

    - **Persona section**: "Persona" label (text-xs muted) with value below (text-sm font-medium)
    - **Scenario section**: "Scenario" label (text-xs muted) with value below (text-sm font-medium)
    - Visual separator (border-bottom) between info sections and metrics
    - **Metrics section**: "Metrics" heading (text-xs font-semibold) followed by metric list
    - Each metric shows: spinner (if processing), "N/A" (if aborted), percentage (for stt_llm_judge), or Pass/Fail badge with info icon
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
    - **Note**: Simulation transcript bubbles use full width on mobile, unlike test runner messages which use 70% width for visual differentiation

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
  - **End reason handling**: When the last entry in the full transcript has `role: "end_reason"` and `content: "max_turns"`, a yellow informational banner is shown at the bottom: "Maximum number of assistant turns reached"
  - **Aborted simulation banner**: When `selectedSimulation.aborted` is true, a red informational banner is shown at the bottom of the transcript: "Simulation aborted by user" (styled with `bg-red-500/10 border-red-500/30 text-red-500`, same layout pattern as the max_turns banner)
  - **Stable audio keys**: All audio elements use `key={audioUrl}` to prevent React from remounting them during polling re-renders (avoids audio restart/reload)
  - **Presigned URL refresh on error**: Audio elements include `onError={refreshRunData}` handler to automatically fetch fresh presigned URLs when they expire. The `refreshRunData` callback clears `frozenSimulationRef` before updating state so new URLs are used instead of stale frozen data
  - Full conversation audio player below header (from `conversation_wav_url`) for voice simulations
  - Full conversation history (user, assistant, tool calls, tool responses)
  - Role-based message styling
  - **Tool call details as form fields**: Arguments are displayed as labeled form fields (matching AddTestDialog style). Each arg key (body, query) is shown as a field label, with its value displayed as pretty-printed JSON. Headers are filtered out and not shown
  - **Tool response display** (for webhook calls): Only shows `role: "tool"` messages where content is valid JSON with `type: "webhook_response"`. Displays the `response` object as **pretty-printed JSON** in a monospace `<pre>` block with "Agent Tool Response" header (intentionally different from tool call form fields to distinguish input vs output). **Error handling**: If `response.status === "error"`, displays with red styling: warning icon, "Tool Response Error" label in red, `border-red-500` border, and `text-red-400` for the JSON content
  - Per-message audio players for voice simulations (matching `audio_urls`). Audio is only shown for user messages and assistant text messages — tool calls (`tool_calls` present) and tool responses (`role: "tool"`) are skipped

- **Simulation Results Conditional Display**:
  - **Mobile with metrics (voice type)**: Only shows in "Results" tab (`activeMetricsTab === "results"`)
  - **Desktop**: Always shows below Overall Metrics section (no tab switching)
  - **Text simulations**: Always shows (no tabs, no conditional display)
  - Implementation uses `window.innerWidth < 768` check combined with `activeMetricsTab` state to conditionally render
  - Prevents duplicate display on mobile when switching between Performance/Latency tabs

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
│   │   ├── page.tsx           # Landing page (marketing page with features, integrations, community)
│   │   ├── login/             # Login page with email/password and Google OAuth (has layout.tsx)
│   │   ├── signup/            # Signup page with registration form and password validation (has layout.tsx)
│   │   └── api/auth/          # NextAuth.js route handlers
│   ├── components/
│   │   ├── agent-tabs/        # Agent detail tab components
│   │   ├── evaluations/       # Evaluation UI components
│   │   ├── charts/            # Recharts visualization components
│   │   ├── icons/             # Shared SVG icon components
│   │   ├── providers/         # React context providers (SessionProvider, FloatingButtonProvider)
│   │   ├── simulation-tabs/   # Simulation detail components
│   │   ├── test-results/      # Shared test result components
│   │   └── ui/                # Reusable UI components (Button, SearchInput, etc.)
│   ├── constants/             # Static configuration data
│   │   ├── inbuilt-tools.ts   # Built-in tool definitions
│   │   ├── limits.ts          # Usage limits and contact link for upgrade requests
│   │   ├── links.ts           # WHATSAPP_INVITE_URL, DISCORD_INVITE_URL - community invite links
│   │   └── polling.ts         # POLLING_INTERVAL_MS (3000ms) - shared polling interval
│   ├── hooks/                 # Custom React hooks
│   │   ├── index.ts           # Re-exports all hooks
│   │   ├── useCrudResource.ts # CRUD operations hook for resource pages
│   │   ├── useAccessToken.ts  # Unified auth token hook (useAccessToken, useAuth)
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
- **Dialog components updated**: `DeleteConfirmationDialog`, `NewSimulationDialog`, `RunTestDialog`, `AddToolDialog`, `AddTestDialog`, and all inline sidebars (personas, scenarios, metrics)

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

The landing page (`/`), about page, login page, and signup page use shared header/footer components to avoid duplication:

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

- No props - self-contained with all links and constants
- Contains: 3-column layout (Company, Resources, Community), copyright
- Imports `WHATSAPP_INVITE_URL` and `DISCORD_INVITE_URL` from `@/constants/links`
- Company column includes "Supported by ARTPARK @IISc" and "Funded by Government of Karnataka (GoK)" attribution text at the bottom

### Landing Page (`/`)

The root page serves as a marketing-style landing page with a consistent light theme throughout:

**Layout (top to bottom):**

1. **Navigation bar**: Uses `<LandingHeader />` component with "Login" button linking to `/login`
2. **Hero section**: Large, responsive headline and subtitle (no CTA button - moved to header); heading scales from `text-4xl` on mobile to `text-6xl` on desktop, with matching responsive padding and margin. Includes an embedded YouTube launch video (`https://www.youtube.com/embed/_VS8KQbBxKs?autoplay=1&mute=1`) below the subtitle with 16:9 aspect ratio, rounded corners, and shadow styling. Video autoplays muted (browsers require `mute=1` for autoplay to work).
3. **Feature Tabs section**: Tab switcher with feature previews
4. **Integrations section**: Provider grid showing supported STT/TTS/LLM providers
5. **Open Source section**: GitHub link and self-hosting info (`bg-gray-50`)
6. **Community section**: WhatsApp/Discord join buttons + social links (X, LinkedIn), has `id="join-community"` for anchor linking
7. **Get Started section**: Two-column card layout with CTAs
8. **Final CTA section**: Dark background (`bg-gray-900`) with "Ready to get started?" headline and "Get started free" button linking to `/login`
9. **Footer**: Three-column links (Company, Resources, Community) in `md:grid-cols-3` + copyright (`bg-gray-50`)

**Feature Tabs:**

- Tabs: "Speech to text", "LLM Evaluation", "Text to speech", "Simulations"
- State managed via `useState` with `activeTab` (default: "stt")
- Tab data defined as array: `{ id, label, headingBold, headingLight, description, images }` where `images` is an array of image paths
- **Desktop behavior** (`md+`): Tab switcher visible (`hidden md:flex`), clicking tabs switches content via state, two-column layout with sticky text
- **Mobile behavior** (below `md`): Tabs completely hidden, all four sections rendered stacked in a single scrollable flow (`md:hidden space-y-12`), no tab state interaction needed

**Constants:**

- `WHATSAPP_INVITE_URL` and `DISCORD_INVITE_URL` - imported from `@/constants/links` (shared across landing page, `LandingFooter`, and `AppLayout`)
- `GITHUB_REPO_URL` - GitHub repo link, defined locally in landing page, used in Open Source section

**Feature Section Layout:**

- **Container**: Full width with responsive padding (`px-6 md:px-8 lg:px-12`) - mobile uses `px-6` for comfortable margin from screen edges
- **Desktop tabs** (`md+`): Centered with `max-w-7xl mx-auto`, pill buttons use `px-5 py-2.5 text-sm`, active tab has `bg-white shadow-sm`
- **Desktop grid** (`md+`): `grid-cols-1 lg:grid-cols-[400px_1fr] gap-6 md:gap-8` - two-column on `lg+`
  - **Left column**: Two-tone headline (`text-2xl md:text-3xl lg:text-4xl`) + description, sticky on scroll (`lg:sticky lg:top-8`)
  - **Right column**: Images stacked vertically (`flex-col gap-4`)
- **Mobile layout** (below `md`): All sections shown sequentially (`space-y-12`), each with heading (`text-2xl`), description (`text-sm`), and images
- Static files in `public/`: `logo.svg` (app logo, uses `currentColor`), `logo-dark.svg` (white stroke for dark backgrounds), `stt_1.png` to `stt_4.png`, `tts_1.png` to `tts_4.png`, `llm-leaderboard.png`, `llm-output.png`, `simulation-all.png`, `simulation-run.png`

**Integrations Section:**

- **Background**: White (`bg-white`) with responsive padding (`py-16 md:py-24 px-4 md:px-8 lg:px-12`)
- **Headline**: `text-3xl md:text-4xl lg:text-5xl`
- **Subtitle**: `text-base md:text-xl`
- **CTA buttons** (`px-5 md:px-6 py-2.5 md:py-3 text-sm md:text-base`, open in new tab):
  - "Integration overview" → Primary filled dark button (`bg-gray-900 text-white hover:bg-gray-800`), links to `${process.env.NEXT_PUBLIC_DOCS_URL}/integrations`
  - "Request new integration" → Secondary outlined button (`border border-gray-300 text-gray-900 hover:bg-gray-50`), links to `https://forms.gle/AoGE6DMs7N4DNAK2A`
- **Provider grid**: 5×4 bordered grid (text-only, no icons) showing 20 providers:
  - Row 1: Deepgram, ElevenLabs, OpenAI, Google
  - Row 2: Cartesia, Anthropic, Groq, DeepSeek
  - Row 3: Smallest AI, Claude, Gemini, Qwen
  - Row 4: Meta, Mistral, Cohere, Sarvam
  - Row 5: AI21, Baidu, NVIDIA, Amazon
- **Grid styling**: `grid-cols-4` (4 columns at all breakpoints), `border border-gray-200 rounded-xl`, cells with responsive padding `p-3 md:p-5`, provider names use `text-xs md:text-sm font-medium text-center` for better fit on mobile

**Open Source Section:**

- **Background**: Light gray (`bg-gray-50`) with responsive padding (`py-16 md:py-24 px-4 md:px-8 lg:px-12`)
- **Headline**: "Proudly open source" - same font as hero (sentence case)
- **Subtitle**: Links to run "locally" or "self-hosted" (underlined, `hover:text-gray-900`)
- **GitHub button**: Dark button (`bg-gray-900`) using `GITHUB_REPO_URL` constant, with GitHub logo and star icon

**Community Section:**

- **ID**: `id="join-community"` with `scroll-mt-20` for nav offset when scrolling
- **Background**: White (`bg-white`) with responsive padding (`py-16 md:py-24 px-4 md:px-8 lg:px-12`)
- **Headline**: `text-3xl md:text-4xl lg:text-5xl`
- **Subtitle**: `text-base md:text-xl`
- **Join buttons** (row 1, bordered style with icons, `px-4 md:px-6 py-2.5 md:py-3 text-sm md:text-base`):
  - "WhatsApp" - uses `WHATSAPP_INVITE_URL` from `@/constants/links` (green WhatsApp icon)
  - "Discord" - uses `DISCORD_INVITE_URL` from `@/constants/links` (indigo Discord icon)
- **Book a demo** (row 2, filled black style with calendar icon, same responsive sizing): Opens `https://cal.com/amandalmia/30min` in new tab
- **Social links** (row 3, text links): "Follow @artikiagents" and "Connect on LinkedIn"

**Get Started Section:**

- **Background**: Light gray (`bg-gray-50`) with responsive padding (`py-16 md:py-20 px-4 md:px-8 lg:px-12`) - alternates with Community section above
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

- **Consistent light theme** throughout - alternating white (`bg-white`) and light gray (`bg-gray-50`) backgrounds
- **DM Sans font** applied via inline style: `style={{ fontFamily: 'var(--font-dm-sans), system-ui, -apple-system, sans-serif' }}`
- **All headlines**: `font-medium text-gray-900 leading-[1.1] tracking-[-0.02em]` for consistent typography
- **Headline casing**: Sentence case - first letter of first word capitalized, rest lowercase except proper nouns (AI, LLM, STT, TTS, Calibrate, etc.)
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

### About Page (`/about`)

Public page (no auth required) with information about Calibrate and the team.

**Structure:**

- Uses `<LandingHeader showLogoLink talkToUsHref="/#join-community" />` - logo links to `/`, "Talk to us" button links to landing page's community section
- Uses `<LandingFooter />` - same footer as landing page

**Content sections:**

- Our Vision: Voice AI challenges and Calibrate's solution
- Team: 2-column grid (`max-w-xl`, left-aligned) with clickable team member cards linking to LinkedIn. Profile images at `/team/aman.jpeg` and `/team/jigar.jpeg` with `bg-gray-200` fallback

**Responsive Design:**

- Container: Responsive padding `px-4 md:px-8 py-16 md:py-24` for comfortable spacing on mobile
- Section margins: `mb-12 md:mb-16` between sections
- Headings: `text-2xl md:text-3xl` for responsive scaling
- Heading margins: `mb-4 md:mb-6` for proper spacing
- Team grid gap: `gap-6 md:gap-8` for responsive card spacing

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

- **Public pages** (no auth check, always accessible): `/` (landing), `/about`, `/terms`, `/privacy`, `/api/auth/*`, `/debug*`, `/docs*`
- **Auth pages** (`/login`, `/signup`): Accessible to unauthenticated users; authenticated users are redirected to `/agents`
- **Protected pages** (everything else): Unauthenticated users are redirected to `/login`
- **Maintenance mode**: When `MAINTENANCE_MODE=true`, all non-API routes redirect to `/`

**Middleware implementation details:**

- **Dual auth check**: `isLoggedIn = hasNextAuthSession || hasJwtCookie` - supports both Google OAuth (NextAuth session) and email/password (JWT cookie)
- `hasNextAuthSession` checks `!!req.auth` (NextAuth session)
- `hasJwtCookie` checks `!!req.cookies.get("access_token")?.value` (JWT from email/password login)
- `isHomePage` checks for `/` and is included in the public routes check (not just used for maintenance mode)
- `isAuthPage` combines `isLoginPage` and `isSignupPage` to handle both auth pages uniformly
- Public routes return `NextResponse.next()` early, before any auth checks
- Order matters: public routes → auth page redirect for logged-in users → protected route redirect for logged-out users

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
  - "Join WhatsApp" — green WhatsApp icon, uses `WHATSAPP_INVITE_URL` from `@/constants/links`
  - "Join Discord" — indigo Discord icon, uses `DISCORD_INVITE_URL` from `@/constants/links`
  - Both links open in new tabs (`target="_blank"`)
- **State**: `talkToUsOpen` boolean state, toggled by clicking the FAB
- **Click-outside**: Uses a `talkToUsRef` ref with the same `mousedown` click-outside handler that manages the profile dropdown
- **Note**: The community invite URLs here differ from those on the landing page (see naming note at the top of this file)
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

// TestRunnerDialog - Two-panel with mobile navigation
<div className="fixed inset-0 z-50 flex items-center p-0 md:p-4">
  <div className="w-full max-w-5xl h-full md:h-[80vh] rounded-none md:rounded-xl flex flex-col">
    {/* Header with stats (desktop only) */}
    <div className="px-4 md:px-6 py-3 md:py-4 border-b">
      <h2>Test Status</h2>
      {/* Stats - desktop only in header */}
      <div className="hidden md:block">
        <TestStats passedCount={5} failedCount={2} />
      </div>
    </div>

    <div className="flex-1 flex overflow-hidden">
      {/* Left panel - test list, hidden when test selected on mobile */}
      <div className={`w-full md:w-80 ${selectedTest ? 'hidden md:flex' : 'flex'} flex-col`}>
        {/* Test list (no mobile stats - cleaner UI) */}
        {/* Uses button elements for list items with onTouchEnd for mobile support */}
      </div>

      {/* Right panel - test details, hidden when no test selected on mobile */}
      <div className={`flex-1 ${selectedTest ? 'flex' : 'hidden md:flex'} flex-col overflow-hidden`}>
        {/* Mobile back button - flex-shrink-0 to prevent squishing */}
        <div className="md:hidden px-4 py-3 border-b flex-shrink-0">
          <button onClick={() => setSelectedTest(null)}>Back to tests</button>
        </div>
        {/* Test details - flex-1 for remaining space */}
        {/* Message bubbles use w-[70%] md:w-1/2 for better visual differentiation on mobile */}
        <div className="flex-1 overflow-y-auto">
          <TestDetailView />
        </div>
      </div>
    </div>
  </div>
</div>
```

**Key patterns:**

- **Dialog height**: `h-[95vh]` on mobile (more space), `h-[85vh]` on desktop
- **Dialog margin**: `mx-2` on mobile (tight), `mx-4` on desktop
- **Border radius**: `rounded-xl` on mobile, `rounded-2xl` on desktop
- **Layout direction**: `flex-col` on mobile (vertical), `flex-row` on desktop (horizontal)
- **Panel widths**: `w-full` on mobile, fractional widths on desktop (`w-2/5`, `w-3/5`)
- **Padding**: `p-4 md:p-6` throughout
- **Button sizing**: `h-9 md:h-10`, `px-4 md:px-5`
- **Text sizing**: `text-sm md:text-base`
- **Mobile navigation**: Hide/show panels with conditional classes and back buttons
- **Stats display**: Show in header on desktop (`hidden md:block`), at top of list on mobile (`md:hidden`)
- **Right panel structure**: Use `flex-col overflow-hidden` parent with `flex-shrink-0` back button and `flex-1 overflow-y-auto` content

**Components using these patterns:**

- **DeleteConfirmationDialog**: Used across all list pages for delete confirmation
- **NewSimulationDialog**: Create simulation modal on simulations list page
- **RunTestDialog**: Run test modal on tests list page (already responsive)
- **Personas sidebar**: Full-page slide-in for add/edit personas
- **Scenarios sidebar**: Full-page slide-in for add/edit scenarios
- **Metrics sidebar**: Full-page slide-in for add/edit metrics
- **AddToolDialog**: Full-page slide-in for add/edit tools
- **AddTestDialog**: Large centered modal for add/edit tests (fully responsive)
- **TestRunnerDialog**: Test results viewer with two-panel layout (fully responsive with mobile navigation)
- **Simulation Run Page**: `/simulations/[uuid]/runs/[runId]` - Responsive tabs (3 tabs on mobile: Results/Performance/Latency, 2 tabs on desktop: Performance/Latency), conditional content display, reduced font sizes on mobile
- **BenchmarkResultsDialog**: Benchmark results viewer with two-panel layout (fully responsive with mobile navigation, same patterns as TestRunnerDialog)

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
- For two-panel views, implement mobile navigation with hide/show panels and back buttons
- Stats/summary info should show in header on desktop only (mobile stats removed for cleaner UI in TestRunnerDialog)
- Right panel in two-panel layouts needs proper flex structure: `flex-col overflow-hidden` parent, `flex-shrink-0` for fixed sections, `flex-1 overflow-y-auto` for scrollable content
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
  - **Settings tab**: Language selection dropdown + provider selection (responsive: table on desktop, cards on mobile)
  - **Dataset tab**: Sample rows + add sample button (TTS also has CSV upload with OR divider and sample download)
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
- Evaluate button always enabled; clicking without providers shows red border around provider selection and switches to Settings tab
- On submit: calls `POST /[tts|stt]/evaluate`, then redirects to `/[tts|stt]/{uuid}` using the returned `task_id`
- Uses `BackHeader` component for back navigation to list page

**Detail Page:**

- Fetches result from `GET /[tts|stt]/evaluate/{uuid}` (NOT from `/jobs`)
- Polls at `POLLING_INTERVAL_MS` (3 seconds) while status is `queued` or `in_progress`
- Shows loading/in-progress states during polling
- Uses `BackHeader` component for back navigation
- Uses `StatusBadge` component with `showSpinner` for status display
- Results are at **top level** (`provider_results`, `leaderboard_summary`) - different from `/jobs` API!
- Displays results in tabs (Leaderboard, Outputs, About) when done
- **Responsive design**: Uses `space-y-4 md:space-y-6` throughout, chart grids are `grid-cols-1 md:grid-cols-2`, leaderboard sections use full-width responsive containers (see "Evaluation & Simulation Pages Responsive Spacing" section above). Outputs tab uses `flex-col md:flex-row` for stacked-on-mobile / side-by-side-on-desktop. About tab uses `hidden md:block` table + `md:hidden` card layout. Results use desktop table (`hidden md:block`) + mobile cards (`md:hidden`) pattern

**Key differences between TTS and STT:**

- **STT Input tab**: Audio file upload (.wav) + reference transcription text field
- **TTS Input tab**: Text input field + CSV upload option with "OR" divider and sample CSV download
- **STT metrics**: WER, String Similarity, LLM Judge (NO latency metrics)
- **TTS metrics**: LLM Judge, TTFB (latency metrics are objects with `mean`, `std`, `values`; Processing Time removed from UI)
- **Null-safe metric rendering**: Numeric metrics (string_similarity, wer, llm_judge_score, ttfb.mean) can be null. Always check before formatting: `value != null ? parseFloat(value.toFixed(4)) : "-"`. Use `parseFloat()` wrapper to remove trailing zeros. Max 4 decimal places for all metrics to prevent column overflow
- **STT Outputs tab**: Shows Ground Truth vs Prediction text; metrics columns (WER, String Similarity, LLM Judge) shown when status is "done" OR when all rows have metrics available. Rows with empty predictions are highlighted with `bg-red-500/10` and show "No transcript generated" in muted text
  - **Desktop table layout**: Uses `table-fixed` with explicit column widths — ID: `w-12`, Ground Truth/Prediction: dynamic widths based on `showMetrics` (`w-[30%]` when metrics visible, `w-[calc(50%-24px)]` when hidden so columns expand to fill space during streaming). Text columns use `break-words` for wrapping. Wrapped in `hidden md:block`
  - **Mobile card layout**: `md:hidden` card list — each result is a bordered `rounded-xl` card showing: row number + Pass/Fail badge header, Ground Truth section, Prediction section, then WER/Similarity metrics and LLM Judge reasoning below a border separator
  - **Empty prediction detection**: Helper functions `hasEmptyPredictions()` and `getFirstEmptyPredictionIndex()` check for rows without transcripts. Provider status shows red X if any empty, and clicking scrolls to first empty row via `data-row-index` attribute
- **TTS Outputs tab**: Shows text input with audio playback; LLM Judge column shown when status is "done" OR when all rows have metrics available
  - **Desktop table layout**: Uses `table-fixed` with explicit column widths — ID: `w-12`, Text: `w-[25%]` when LLM Judge visible, Audio: `w-[50%]` when LLM Judge visible (wider to give audio player more room), both `w-[calc(50%-24px)]` when hidden so columns expand during streaming. Audio uses `min-w-[280px]`. Wrapped in `hidden md:block`
  - **Mobile card layout**: `md:hidden` card list — each result card shows: row number + Pass/Fail badge header, Text section, Audio player (full-width, no min-width constraint), and LLM Judge reasoning inline
- **LLM Judge display**:
  - **Desktop**: Pass/Fail badges (green/red) with info icon button (ⓘ) that shows reasoning via `Tooltip` component on hover (falls back to "Score: X" if no reasoning)
  - **Mobile**: Pass/Fail badge shown in card header (top-right). LLM Judge reasoning is displayed directly as inline text below the metrics/audio in each card (labeled "LLM Judge Reasoning"), since hover tooltips don't work on touch devices. Only shown when `llm_judge_reasoning` exists
  - **Parsing**: Backend returns `"True"`/`"False"` strings (or `"1"`/`"0"`). Convert to lowercase, Pass when value is `"true"` or `"1"`

**Metrics Data Structure:**

The `metrics` field in `ProviderResult` is a dict (not an array):

```tsx
// STT ProviderMetrics - no latency metrics
type ProviderMetrics = {
  wer: number;
  string_similarity: number;
  llm_judge_score: number;
};

// TTS ProviderMetrics - includes latency metrics as nested objects
type LatencyMetric = {
  mean: number;
  std: number;
  values: number[];
};

type ProviderMetrics = {
  llm_judge_score: number;
  ttfb: LatencyMetric;
  processing_time: LatencyMetric;
};

// STT LeaderboardSummary - no latency fields
type LeaderboardSummary = {
  run: string;
  count: number;
  wer: number;
  string_similarity: number;
  llm_judge_score: number;
};

// TTS LeaderboardSummary - includes latency as direct numbers
type LeaderboardSummary = {
  run: string;
  count: number;
  llm_judge_score: number;
  ttfb: number;
  processing_time: number;
};
```

- Access metrics directly: `providerResult.metrics.wer`, `providerResult.metrics.ttfb?.mean`
- STT leaderboard has no TTFB/Processing Time charts (metrics not available)
- TTS leaderboard includes LLM Judge Score and TTFB bar charts (Processing Time removed from UI)

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
5. **Toast Notifications**: Bottom-right success toasts
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
7. **Downloadable Tables**: Reusable `DownloadableTable` component for data tables with CSV export
   - Props: `columns` (array of `{key, header, render?}`), `data`, `filename`, `title`
   - Includes "Download CSV" button in top-right corner
   - Used in: BenchmarkResultsDialog, STT/TTS detail pages (`/stt/[uuid]`, `/tts/[uuid]`)
   - Custom cell rendering via optional `render` function in column definition
8. **Charts with PNG Export**: `LeaderboardBarChart` component includes built-in PNG download
   - Props: `title`, `data`, `height?`, `yDomain?`, `formatTooltip?`, `colorMap?`, `filename?`
   - "PNG" download button in top-right corner of chart card
   - Exports at 2x resolution with white background for quality
   - Used in: BenchmarkResultsDialog, SpeechToTextEvaluation, TextToSpeechEvaluation
9. **LLM Selector Modal**: `LLMSelectorModal` from `@/components/agent-tabs/LLMSelectorModal`
   - Props: `isOpen`, `onClose`, `selectedLLM`, `onSelect`, `availableProviders?`
   - Internally uses `useOpenRouterModels` hook to fetch models from OpenRouter API as the default model list
   - Shows "Loading models..." while fetching; shows error message with "Retry" button on failure. These states show whenever the effective provider list is empty (`providers.length === 0`), so they work correctly both with and without `availableProviders`
   - Optional `availableProviders` prop for filtered models (used in BenchmarkDialog to exclude already-selected models)
   - Used in: AgentTabContent (settings), BenchmarkDialog (model comparison)
10. **Benchmark Dialog**: `BenchmarkDialog` from `@/components/BenchmarkDialog`
    - Model selection dialog for running benchmarks comparing multiple LLM models
    - Props: `isOpen`, `onClose`, `agentUuid`, `agentName`, `tests`, `onBenchmarkCreated?`
    - Allows selecting up to 5 models for comparison
    - Uses `LLMSelectorModal` for model selection with filtered available models (prevents selecting same model twice)
    - Opens `BenchmarkResultsDialog` when "Run comparison" is clicked
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
    - **TestRunnerDialog behavior based on `initialRunStatus`**:
      - **Completed runs** (`done`/`completed`): Clears test results initially, fetches fresh from API once (no polling), displays actual pass/fail status
      - **In-progress runs** (`pending`/`queued`/`in_progress`): Initializes tests as "running" (yellow), polls API at `POLLING_INTERVAL_MS` until complete
      - **Overall error state** (`isOverallError`): When `runStatus === "failed"` AND all tests have errors (none have real results), replaces the entire split-panel layout with a centered error card ("Something went wrong" / "We're looking into it..."). Header pass/fail stats are also hidden. This prevents showing a confusing split-panel with every test errored individually
    - **BenchmarkResultsDialog intermediate results**:
      - **When in progress**: Shows Outputs view directly (no tabs visible), all providers displayed immediately
      - **When done**: Shows both Leaderboard and Outputs tabs, auto-switches to Leaderboard tab
      - **Fully responsive**: Two-panel layout with mobile navigation (same pattern as TestRunnerDialog)
        - Mobile: Left panel (providers) and right panel (test details) toggle visibility, back button to return to provider list
        - Desktop: Both panels always visible side-by-side
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
      - **Merged providers**: `getProvidersToDisplay()` function merges `modelResults` from API with placeholders for any models that don't have results yet
      - Types support null values: `success: boolean | null`, `test_results: BenchmarkTestResult[] | null`, `passed: boolean | null`
      - **Header status badge**: Uses `StatusBadge` component (same as STT/TTS evaluation pages) to show task status ("Queued" with gray badge, "Running" with yellow badge) plus spinner while benchmark is in progress
      - **Loading state**: Shows simple "Loading..." spinner until first API response (doesn't try to guess status)
      - **Interactive list items**: Test items use `<button type="button">` with `w-full` for proper mobile touch support
    - **Props for viewing past runs**:
      - `taskId`: The run UUID to fetch results for
      - `tests`: Array converted from `pastRun.results` to show test names while loading (TestRunnerDialog only)
      - `initialRunStatus`: Determines initialization behavior (TestRunnerDialog only)
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

**Manual fetch pattern** (used in pages/components that don't use API utilities):

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
        "ngrok-skip-browser-warning": "true",
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
- Metrics: STT (WER, String Similarity, LLM Judge), TTS (LLM Judge, TTFB)

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
| Metrics         | `GET/POST /metrics`, `GET/PUT/DELETE /metrics/{uuid}`, `POST /metrics/{uuid}/duplicate`                                                                                                                                                                           |
| Simulations     | `GET/POST /simulations`, `GET/DELETE /simulations/{uuid}`                                                                                                                                                                                                         |
| Simulation Runs | `GET /simulations/run/{runId}`, `POST /simulations/{uuid}/run`, `POST /simulations/run/{runId}/abort`                                                                                                                                                             |
| Tests           | `GET/POST /tests`, `GET/PUT/DELETE /tests/{uuid}`                                                                                                                                                                                                                 |
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
  "provider_results": [...],
  "leaderboard_summary": [...],
  "error": null
}
```

**Key difference:** Results are at the **top level** (not nested under `results`).

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
  model: string; // e.g. "anthropic__claude-opus-4.5" (double underscore, not slash)
  passed: string; // e.g. "1" (string, not number)
  total: string; // e.g. "2" (string, not number)
  pass_rate: string; // e.g. "50.0" (string, not number)
};
```

Note: The `model` field uses double underscores (`__`) as separator; the UI replaces them with `/` for display.

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
  XIcon,
  PlusIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ToolIcon,
  DocumentIcon,
  PlayIcon,
  RefreshIcon,
  // ... and more
} from "@/components/icons";

// Usage
<SpinnerIcon className="w-5 h-5 animate-spin" />
<CloseIcon className="w-5 h-5" />
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

**Viewport clamping**: The tooltip automatically clamps its position to stay within viewport boundaries (12px padding from edges). This prevents long content (like LLM Judge reasoning) from going off-screen.

**Styling**: White background, rounded corners, shadow, 256px max width (`w-64`), text wraps within the container. Arrow indicator points to trigger element.

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

- Adds required headers (Authorization, Content-Type, accept, ngrok-skip-browser-warning)
- Signs out user on 401 responses
- Throws errors on non-2xx responses

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
```

### Test Results Components (`@/components/test-results/shared`)

Shared components for displaying test results:

```tsx
import {
  StatusIcon,
  SmallStatusBadge,
  ToolCallCard,
  TestDetailView,
  EmptyStateView,
  TestStats,
} from "@/components/test-results/shared";

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
<ToolCallCard toolName="get_weather" args={{ body: { city: "London" }, query: { units: "metric" } }} />
// Shows "body" field with JSON content, "query" field with JSON content

// Full test conversation view (fully responsive)
// - Padding: `p-4 md:p-6`
// - Message bubbles: `w-[70%] md:w-1/2` (70% width on mobile for visual differentiation, half on desktop)
// - User messages aligned right, agent messages aligned left for clear visual distinction
// - Status indicators: responsive padding `pl-2 md:pl-3`
<TestDetailView history={history} output={output} passed={passed} />

// Stats bar - shows passed/failed counts
// In TestRunnerDialog: show in header on desktop, at top of list on mobile
<TestStats passedCount={5} failedCount={2} />
```

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
- `src/components/agent-tabs/TestsTabContent.tsx` - Background polling for past runs
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

The app enforces usage limits on certain features. When limits are exceeded, a toast notification is shown with an inline underlined "Contact us" hyperlink.

**Limits Configuration** (`@/constants/limits.ts`):

```tsx
import { LIMITS, CONTACT_LINK } from "@/constants/limits";

// Current limits:
LIMITS.TTS_MAX_ROWS; // 20 - max rows for TTS CSV upload
LIMITS.TTS_MAX_TEXT_LENGTH; // 200 - max characters per text input
LIMITS.STT_MAX_ROWS; // 20 - max rows for STT ZIP upload
LIMITS.STT_MAX_AUDIO_DURATION_SECONDS; // 60 - max audio file duration in seconds
LIMITS.STT_MAX_AUDIO_FILE_SIZE_MB; // 5 - max audio file size in MB
LIMITS.SIMULATION_MAX_PERSONAS; // 2 - max personas per simulation
LIMITS.SIMULATION_MAX_SCENARIOS; // 5 - max scenarios per simulation
LIMITS.TESTS_MAX_RUN_ALL; // 20 - max tests for "Run all tests"

CONTACT_LINK; // URL for contacting support to extend limits
```

**Toast Notifications** (using `sonner` library):

```tsx
import { toast } from "sonner";

// Show error toast with inline hyperlink (NOT action button)
toast.error(
  <span>
    You can only select up to {LIMITS.SIMULATION_MAX_PERSONAS} personas at a
    time.{" "}
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
```

**Toaster Component**: Added to root layout (`src/app/layout.tsx`) with `richColors` and `position="top-right"`.

**Features using limits:**

- TTS evaluation: CSV upload and manual row addition
- STT evaluation: ZIP upload, manual row addition, and audio file duration (60s max)
- Simulations: Persona and scenario selection
- Tests tab: "Run all tests" button

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
- **ngrok header**: `"ngrok-skip-browser-warning": "true"` header is included automatically by API utilities
- **Backend URL check**: API utilities will throw an error if `NEXT_PUBLIC_BACKEND_URL` is not set
- **Date formatting**: API returns ISO dates; use `toLocaleString()` for display
- **UTC timestamps**: Backend returns timestamps in UTC without timezone indicator (e.g., `"2026-01-18 10:00:00"`). When parsing for relative time calculations, append `"Z"` to explicitly mark as UTC: `new Date(dateString.replace(" ", "T") + "Z")`. Without this, JavaScript interprets the timestamp as local time, causing incorrect relative times (e.g., "5 hours ago" instead of "just now" for users in IST)
- **Multiple date formats**: When creating optimistic UI updates (e.g., adding a pending run to a table), use `new Date().toISOString()` which produces `"2026-01-18T09:30:00.000Z"`. The `formatRelativeTime` helper in `TestsTabContent.tsx` handles both formats - check if the string already has a timezone indicator before appending "Z" to avoid invalid dates like `"...ZZ"` which produce NaN
- **Optional date fields with fallbacks**: Some API responses may not include all date fields. The `SimulationRunsTab` uses `created_at` for sorting/display but falls back to `updated_at` if `created_at` is undefined. Pattern: `const dateStr = item.created_at || item.updated_at || ""`; `formatDate` functions should handle empty strings gracefully (return `"-"` instead of "Invalid Date")
- **Hooks need accessToken**: `useCrudResource` and `useFetchResource` require `accessToken` to be passed from the component (they don't call `useSession` internally)
- **LLM Judge score format varies**: Backend returns `llm_judge_score` as `"True"`/`"False"` strings in individual result rows, but as `1`/`0` integers in aggregate metrics and leaderboard summaries. When parsing for Pass/Fail display, convert to lowercase string and check for both: `const passed = scoreStr === "true" || scoreStr === "1"`

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
- **Chat message bubbles**: Consistent styling across AddTestDialog and TestDetailView (test results). User messages use `bg-muted border border-border text-foreground` (gray background, right-aligned). Agent messages use `bg-background border border-border text-foreground` (white/light background, left-aligned). Tool call cards use `bg-muted border border-border`. All use `rounded-xl` corners. **Width pattern**: `w-[70%] md:w-1/2` (70% width on mobile for better visual differentiation between user/agent messages, 50% on desktop). This prevents full-width message bubbles on mobile that look monotonous. See `@/components/test-results/shared.tsx` for the pattern

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

- **Audio file naming convention**: Both user and bot audio files use **1-based indexing**:
  - User files: `1_user.wav`, `2_user.wav`, `3_user.wav`, etc.
  - Bot files: `1_bot.wav`, `2_bot.wav`, `3_bot.wav`, etc.
- **Audio URL matching**: The `getAudioUrlForEntry` function in the simulation run page counts previous messages of the same role and adds 1 to get the correct file index. **Tool calls and tool responses are excluded** — the function returns `null` for entries with `tool_calls` or `role: "tool"`, and only counts assistant messages without `tool_calls` when computing the bot audio index. This keeps the `N_bot.wav` numbering aligned with actual spoken text messages
- **Common mistake**: Don't use 0-based indexing for user audio files - they follow the same 1-indexed pattern as bot files. Don't count tool call assistant messages when computing audio indices — only text messages have corresponding audio files
- **Full conversation audio**: The API returns a `conversation_wav_url` field containing a combined audio file of the entire conversation. This is displayed below the Transcript header (before the messages) with a "Full Conversation" label and speaker icon
- **Presigned URL expiration handling**: S3 presigned URLs for audio files expire after a period. When audio fails to load (e.g., expired URL), the `onError` handler triggers a `refreshRunData` callback that fetches fresh run data from the API with new presigned URLs. The callback also clears any frozen simulation data to ensure the fresh URLs are used

### Navigation

- **Home redirect**: Root page (`/`) redirects to `/agents`
- **Tab persistence**: Agent detail and simulation detail tabs persist in URL (`?tab=...`) so refreshing maintains tab state
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
| `/metrics`                 | "Metrics \| Calibrate"                                        |
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

For tab changes in `/agents/[uuid]` and `/simulations/[uuid]`, `window.history.replaceState` is used instead of `router.push` to update the URL without triggering navigation side effects that could reset the title:

```tsx
// In tab click handlers
window.history.replaceState(null, "", `?tab=${tabName}`);
```

### Authentication

- **Middleware matcher**: Excludes static assets (`_next/static`, `_next/image`, `favicon.ico`, `*.svg`, `*.png`, `*.jpg`, `*.jpeg`, `*.gif`, `*.webp`, `*.ico`)
- **Protected routes**: All routes except public routes require authentication
- **Public routes** (no auth required): `/`, `/login`, `/signup`, `/about`, `/terms`, `/privacy`, `/api/auth/*`, `/debug*`, `/docs*` (proxied to Mintlify via Vercel rewrite)
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
