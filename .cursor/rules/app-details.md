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

> **Note on naming**: The app is branded as "Calibrate" in all user-facing UI, page titles, and documentation. However, external URLs and infrastructure still reference "pense" (e.g., Discord: `https://discord.gg/xCJ55Ban`). Documentation links use `process.env.NEXT_PUBLIC_DOCS_URL` directly. The npm package name is `calibrate-frontend`.

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
- Table columns: Name (1fr), Type (120px), Description (2fr), Delete button (auto)
- Type column shows "Webhook" or "Structured Output" (`text-sm text-muted-foreground`)
- Two-column layout: tools list (left 2/3), inbuilt tools panel (right 1/3)

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
- **LLM**: 20+ providers including OpenAI, Google, Anthropic, DeepSeek, Meta, Mistral, Qwen, xAI, Perplexity, Cohere, Amazon, NVIDIA, Microsoft, and more

**Provider Language Support** (defined in `src/components/agent-tabs/constants/providers.ts`):

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
  <button onClick={() => openAddToolDialog("webhook")} className="h-10 px-4 rounded-xl ...">
    Add webhook tool
  </button>
  <button onClick={() => openAddToolDialog("structured_output")} className="h-10 px-4 rounded-xl ...">
    Add structured output tool
  </button>
</div>
```

These buttons use standard `h-10 px-4` sizing (same height as other action buttons) with `rounded-xl` for border radius.

**AddToolDialog Component** (`src/components/AddToolDialog.tsx`):

A reusable sidebar dialog for creating and editing tools. Contains all form logic internally:

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

- **View all STT evaluations** in a sortable table (sorted by created date)
- **Columns**: Providers (as pills with external link icons), Language, Status, Samples count, Created At
- **Provider pills**: Each provider name has an external link icon that opens the provider's website in a new tab
- **Click to view details** - opens the evaluation detail page
- **"New STT evaluation" button** (below header) - navigates to the create page

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
- **Status badge**: Shows "Running" or "Queued" badge with spinner to the right of language pill when evaluation is not done
- **Tabs only appear when at least one provider result exists**:
  - **Leaderboard**: Only visible when status is `done` (needs all providers to compare)
  - **Outputs**: Two-panel layout similar to TestRunnerDialog
  - **About**: Metric descriptions
- **Outputs tab layout** (two-panel, similar to TestRunnerDialog):
  - **Left panel** (w-64): Provider list with status icons:
    - Yellow pulsing dot when `success === null` (in progress)
    - Green checkmark when `success === true` AND no empty predictions
    - Red X when `success === false` OR any row has empty prediction
  - **Right panel**: Selected provider's overall metrics + results table (ground truth vs predictions)
    - **Loading state**: Shows centered spinner when provider is in progress (`success === null`) and has no results yet
    - **Error state**: Shows centered error banner when `success === false` with "Error running this provider" heading and error message
  - First provider is selected by default
  - **Auto-scroll**: Clicking a provider with empty predictions scrolls to the first empty row
- **Metrics**: WER, String Similarity, LLM Judge (Pass/Fail)

### 4. Text-to-Speech Evaluation (`/tts`)

**Page Structure:**

- `/tts` - List page showing all TTS evaluation jobs
- `/tts/new` - Create a new TTS evaluation
- `/tts/[uuid]` - View evaluation details and results

**List Page (`/tts`):**

- **View all TTS evaluations** in a sortable table (sorted by created date)
- **Columns**: Providers (as pills with external link icons), Language, Status, Samples count, Created At
- **Provider pills**: Each provider name has an external link icon that opens the provider's website in a new tab
- **Click to view details** - opens the evaluation detail page
- **"New TTS evaluation" button** (below header) - navigates to the create page

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
- **Status badge**: Shows "Running" or "Queued" badge with spinner to the right of language pill when evaluation is not done
- **Tabs**:
  - **Leaderboard**: Only visible when status is `done` - comparative table and charts
  - **Outputs**: Two-panel layout similar to STT - provider list on left, details on right
  - **About**: Metric descriptions
- **Outputs tab layout** (two-panel, similar to TestRunnerDialog):
  - **Left panel** (w-64): Provider list with status icons based on `success` field:
    - Yellow pulsing dot when `success === null` (in progress)
    - Green checkmark when `success === true` (completed successfully)
    - Red X when `success === false` (failed)
  - **Right panel**: Selected provider's overall metrics + results table with audio playback
    - **Loading state**: Shows centered spinner when provider is in progress (`success === null`) and has no results yet
    - **Error state**: Shows centered error banner when `success === false` with "Error running this provider" heading and error message
  - First provider is selected by default
  - Clicking a provider shows its details on the right
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
    - **Waits for `availableTools`**: The useEffect depends on both `initialConfig` AND `availableTools` - it only processes when `availableTools.length > 0` to ensure proper tool type detection
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

### 7. Scenarios Management (`/scenarios`)

**What you can do:**

- **Create test scenarios** that define WHAT the simulated user does:
  - **Label**: Scenario identifier
  - **Description**: Task or conversation goal (e.g., "Call to inquire about crop insurance")
- **Edit existing scenarios**
- **Delete scenarios**
- **Search scenarios**

### 8. Metrics Management (`/metrics`)

**What you can do:**

- **Define evaluation criteria** for simulations
- **Configure pass/fail thresholds**
- **Set up custom metrics**

### 9. Simulations (`/simulations`)

**What you can do:**

- **Create simulations** with a name
- **View all simulations** in a searchable, sortable list
- **Delete simulations**
- **Right-click or Cmd/Ctrl+click** any simulation row to open in a new browser tab (native browser support)

**Simulation Detail Page** (`/simulations/[uuid]`) has 2 tabs:

| Tab        | Purpose                                                                                |
| ---------- | -------------------------------------------------------------------------------------- |
| **Config** | Select agent, personas (max 2), scenarios (max 5) for the simulation                   |
| **Runs**   | View history of simulation runs (right-click or Cmd/Ctrl+click to open run in new tab) |

**Selection Limits:**

- **Personas**: Maximum 2 personas per simulation. Shows toast error with "Contact Us" link if exceeded
- **Scenarios**: Maximum 5 scenarios per simulation. Shows toast error with "Contact Us" link if exceeded

**Running Simulations:**

- **Run types**: chat (text-based), audio, voice (full pipeline)
- Runs are executed asynchronously with polling for status updates
- Status flow: queued → in_progress → done (or failed)

**Simulation Run Results** (`/simulations/[uuid]/runs/[runId]`):

- **Polling & Intermediate Results**:
  - Page polls API every 3 seconds while status is `in_progress`
  - Simulation results appear incrementally as each simulation completes
  - Overall metrics only shown after run completes (status === "done")
  - **Failed state error banner**: When `runData.status === "failed"`, a red error banner is displayed below the status pills with a warning triangle icon and "Simulation Failed" text (styled with `border-red-500/30`, `bg-red-500/10`, `text-red-500`)
  - Individual simulation rows can have `evaluation_results: null` while still processing
  - **Row spinner states**:
    - **Play button only**: Row has `evaluation_results` (metrics complete)
    - **Spinner around play button (yellow)**: Row has transcript but no `evaluation_results` (processing)
    - **Spinner only (gray)**: Row has no transcript and no `evaluation_results` (waiting)
    - **First column structure**: Uses `relative` container with spinner positioned `absolute inset-0`, play button centered with `relative z-10`. Spinner wraps around the play button visually.
    - **Metric column spinners**: Each metric cell shows `w-5 h-5 flex-shrink-0` spinner when `evaluation_results` is null; yellow when processing, gray when waiting

- **Overall Metrics** (only shown when status is "done", aggregated across all simulations):
  - Tool calls accuracy (mean ± std)
  - Answer completeness
  - Assistant behavior
  - Question completeness

- **Per-Simulation Results Table** (shows intermediate results as each simulation completes):
  - Persona + Scenario combination
  - Individual metric scores (Pass/Fail with tooltips showing reasoning)
  - Metric columns derived from `runData.metrics` keys, or from `simulation_results[].evaluation_results` when metrics is null
  - Latency metrics (stt/ttft, llm/ttft, etc.) are excluded from the table (shown in latency tab instead)
  - `stt_llm_judge_score` displayed as percentage, other metrics as Pass/Fail
  - View transcript button (only shown for rows with transcript history; available even while evaluation is pending)
  - Audio playback (for voice simulations)
  - **Processing state**: Rows with `evaluation_results: null` show spinners in metric cells (yellow if has transcript/processing, gray if waiting) and a spinner beside the play button
  - **Row sorting** (for intermediate results): Rows are sorted by processing state priority:
    1. Completed rows (have transcript and evaluation_results) - at the top
    2. Processing rows (have transcript but no evaluation_results - yellow spinner) - middle
    3. Waiting rows (no transcript - gray spinner) - at the bottom

- **Transcript Dialog**:
  - **Live updates with freeze-on-complete**: Dialog stays in sync with polling while simulation is in progress, then freezes:
    - Stores `selectedSimulationKey` using `simulation_name` (unique identifier)
    - Uses `frozenSimulationRef` to store a stable copy once simulation has `evaluation_results`
    - `useMemo` logic: if frozen and complete → use frozen data; if just completed → freeze it; if in progress → use live data
    - Prevents audio reload when polling updates other rows while viewing a completed simulation
    - `frozenSimulationRef` is cleared when dialog closes
  - **Auto-scroll**: Transcript container scrolls to bottom only when new messages are added (tracks `prevTranscriptLengthRef` and only scrolls if `currentLength > previous`)
  - **Empty state**: Shows "No transcript available yet" when transcript is empty or undefined
  - **Processing indicator**: Shows a yellow spinner at the bottom of transcript while metrics are being fetched (when `evaluation_results` is null but transcript has content)
  - **Graceful null handling**: All transcript accesses use optional chaining (`transcript?.length ?? 0`, `transcript ?? []`) since transcript can be undefined during intermediate results
  - **Transcript filtering**: Entries are filtered before display - `role: "end_reason"` is always filtered out, and `role: "tool"` messages are only included if they have valid JSON content with `type: "webhook_response"` (other tool messages like "COMPLETED" are hidden)
  - **End reason handling**: When the last entry in the full transcript has `role: "end_reason"` and `content: "max_turns"`, a yellow informational banner is shown at the bottom: "Conversation ended: Maximum number of agent turns reached"
  - **Stable audio keys**: All audio elements use `key={audioUrl}` to prevent React from remounting them during polling re-renders (avoids audio restart/reload)
  - **Presigned URL refresh on error**: Audio elements include `onError={refreshRunData}` handler to automatically fetch fresh presigned URLs when they expire. The `refreshRunData` callback clears `frozenSimulationRef` before updating state so new URLs are used instead of stale frozen data
  - Full conversation audio player below header (from `conversation_wav_url`) for voice simulations
  - Full conversation history (user, assistant, tool calls, tool responses)
  - Role-based message styling
  - **Tool call details as form fields**: Arguments are displayed as labeled form fields (matching AddTestDialog style). Each arg key (body, query) is shown as a field label, with its value displayed as pretty-printed JSON. Headers are filtered out and not shown
  - **Tool response display** (for webhook calls): Only shows `role: "tool"` messages where content is valid JSON with `type: "webhook_response"`. Displays the `response` object as **pretty-printed JSON** in a monospace `<pre>` block with "Agent Tool Response" header (intentionally different from tool call form fields to distinguish input vs output). **Error handling**: If `response.status === "error"`, displays with red styling: warning icon, "Tool Response Error" label in red, `border-red-500` border, and `text-red-400` for the JSON content
  - Per-message audio players for voice simulations (matching `audio_urls`)

- **Latency Metrics** (for voice simulations, in Performance/Latency tabs):
  - STT latency (TTFB, processing time)
  - LLM latency
  - TTS latency

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
│   │   ├── login/             # Landing page with Google OAuth (has layout.tsx)
│   │   └── api/auth/          # NextAuth.js route handlers
│   ├── components/
│   │   ├── agent-tabs/        # Agent detail tab components
│   │   ├── evaluations/       # Evaluation UI components
│   │   ├── charts/            # Recharts visualization components
│   │   ├── icons/             # Shared SVG icon components
│   │   ├── providers/         # React context providers
│   │   ├── simulation-tabs/   # Simulation detail components
│   │   ├── test-results/      # Shared test result components
│   │   └── ui/                # Reusable UI components (Button, SearchInput, etc.)
│   ├── constants/             # Static configuration data
│   │   ├── inbuilt-tools.ts   # Built-in tool definitions
│   │   ├── limits.ts          # Usage limits and contact link for upgrade requests
│   │   └── polling.ts         # POLLING_INTERVAL_MS (3000ms) - shared polling interval
│   ├── hooks/                 # Custom React hooks (useCrudResource, etc.)
│   ├── lib/                   # Utility libraries (api.ts, status.ts, etc.)
│   ├── auth.ts               # NextAuth.js configuration
│   └── middleware.ts         # Route protection middleware
```

---

## Architecture Patterns

### Shared Landing Components

Both the login page and about page use shared header/footer components to avoid duplication:

**`LandingHeader`** (`src/components/LandingHeader.tsx`):
- Props: `showLogoLink` (boolean, whether logo links to /login), `talkToUsHref` (string, defaults to `#join-community`)
- Contains: Logo, "Documentation" text link (tertiary), "Talk to us" button (outlined/secondary), "Get started" button (filled/primary)
- Uses `signIn` from `next-auth/react` for Google authentication

**`LandingFooter`** (`src/components/LandingFooter.tsx`):
- No props - self-contained with all links and constants
- Contains: 3-column layout (Company, Resources, Community), copyright
- `WHATSAPP_INVITE_URL` constant is defined inside the component

### Landing Page (`/login`)

The login page serves as a marketing-style landing page with a consistent light theme throughout:

**Layout (top to bottom):**

1. **Navigation bar**: Uses `<LandingHeader />` component with "Continue with Google" as primary CTA
2. **Hero section**: Large headline and subtitle (no CTA button - moved to header)
3. **Feature Tabs section**: Tab switcher with feature previews
4. **Integrations section**: Provider grid showing supported STT/TTS/LLM providers
5. **Open Source section**: GitHub link and self-hosting info (`bg-gray-50`)
6. **Community section**: WhatsApp/Discord join buttons + social links (X, LinkedIn), has `id="join-community"` for anchor linking
7. **Get Started section**: Two-column card layout with CTAs
8. **Final CTA section**: Dark background (`bg-gray-900`) with "Ready to get started?" headline and "Continue with Google" button
9. **Footer**: Three-column links (Company, Resources, Community) in `md:grid-cols-3` + copyright (`bg-gray-50`)

**Feature Tabs:**

- Tabs: "Speech to text", "LLM Evaluation", "Text to speech", "Simulations"
- State managed via `useState` with `activeTab` (default: "stt")
- Tab data defined as array: `{ id, label, headingBold, headingLight, description, images }` where `images` is an array of image paths

**Constants:**

- `WHATSAPP_INVITE_URL` - WhatsApp community invite link, used in Community section (login page) and `LandingFooter` component
- `GITHUB_REPO_URL` - GitHub repo link, used in Open Source section

**Two-Column Layout** (below tabs):

- **Container**: Full width with `px-12` padding (no max-width constraint to maximize image space)
- **Tabs**: Centered with `max-w-7xl mx-auto`
- **Grid**: `grid-cols-[400px_1fr] gap-8 max-w-7xl` - text column (400px), images in constrained width
- **Left column**: Two-tone headline (bold dark + light gray) + description text, sticky on scroll
- **Right column**: Images stacked vertically (`flex-col gap-4`), one per row, showing full height
- Static files in `public/`: `logo.svg` (app logo, uses `currentColor`), `logo-dark.svg` (white stroke for dark backgrounds), `stt_1.png` to `stt_4.png`, `tts_1.png` to `tts_4.png`, `llm-leaderboard.png`, `llm-output.png`, `simulation-all.png`, `simulation-run.png`

**Integrations Section:**

- **Background**: White (`bg-white`) with padding (`py-24 px-12`)
- **Headline**: "Works with any voice agent stack" - same font as hero (`leading-[1.1] tracking-[-0.02em]`)
- **Subtitle**: About Python SDK, CLI, and provider support
- **Link buttons** (open in new tab with `target="_blank"`):
  - "Integration overview" → `${process.env.NEXT_PUBLIC_DOCS_URL}/integrations`
  - "Request new integration" → `https://forms.gle/AoGE6DMs7N4DNAK2A`
- **Provider grid**: 5×4 bordered grid (text-only, no icons) showing 20 providers:
  - Row 1: Deepgram, ElevenLabs, OpenAI, Google
  - Row 2: Cartesia, Anthropic, Groq, DeepSeek
  - Row 3: Smallest AI, Claude, Gemini, Qwen
  - Row 4: Meta, Mistral, Cohere, Sarvam
  - Row 5: AI21, Baidu, NVIDIA, Amazon
- **Grid styling**: `grid-cols-2 md:grid-cols-4`, `border border-gray-200 rounded-xl`, cells with `bg-gray-50 p-5`, `text-gray-900 text-sm font-medium` labels

**Open Source Section:**

- **Background**: Light gray (`bg-gray-50`) with padding (`py-24 px-12`)
- **Headline**: "Proudly open source" - same font as hero (sentence case)
- **Subtitle**: Links to run "locally" or "self-hosted" (underlined, `hover:text-gray-900`)
- **GitHub button**: Dark button (`bg-gray-900`) using `GITHUB_REPO_URL` constant, with GitHub logo and star icon

**Community Section:**

- **ID**: `id="join-community"` with `scroll-mt-20` for nav offset when scrolling
- **Background**: White (`bg-white`) with padding (`py-24 px-12`)
- **Headline**: "Join the community" - same font as hero
- **Subtitle**: About talking to the team and shaping the roadmap
- **Join buttons** (row 1, bordered style with icons):
  - "WhatsApp" - uses `WHATSAPP_INVITE_URL` constant (green WhatsApp icon)
  - "Discord" - opens `https://discord.gg/xCJ55Ban` (indigo Discord icon)
- **Book a demo** (row 2, filled black style with calendar icon): Opens `https://cal.com/amandalmia/30min` in new tab
- **Social links** (row 3, text links): "Follow @artikiagents" and "Connect on LinkedIn"

**Get Started Section:**

- **Background**: Light gray (`bg-gray-50`) with padding (`py-20 px-12`) - alternates with Community section above
- **Headline**: "Start testing with Calibrate today." with `tracking-[-0.02em]` for tight letter spacing
- **Two-column grid**: "Evaluate your agent" (left) and "Learn more" (right)
- **Card containers**: `bg-gray-50 rounded-2xl p-8 border border-gray-200`
- **Link cards**: White background with subtle border, hover state adds shadow (`hover:border-gray-300 hover:shadow-sm`)
- **Icons**: SVG icons (speaker, broadcast, checkmark for evaluation; play, book, calendar for learning)
- **Links** (4 per column, sentence case, open in new tab):
  - Evaluate (links to quickstart docs via `NEXT_PUBLIC_DOCS_URL`):
    - Benchmark STT providers → `${NEXT_PUBLIC_DOCS_URL}/quickstart/speech-to-text`
    - Benchmark TTS providers → `${NEXT_PUBLIC_DOCS_URL}/quickstart/text-to-speech`
    - Run LLM tests → `${NEXT_PUBLIC_DOCS_URL}/quickstart/text-to-text`
    - Run simulations → `${NEXT_PUBLIC_DOCS_URL}/quickstart/simulations`
  - Learn more: Watch the demo, Read documentation, Book a demo (`https://cal.com/amandalmia/30min`), Guide to voice agents (`https://voiceaiandvoiceagents.com`)

**Final CTA Section:**

- **Background**: Dark (`bg-gray-900`) with padding (`py-24 px-12`)
- **Headline**: "Ready to get started?" - white text, same font style as other headlines
- **Subtitle**: "Join teams building better AI agents with Calibrate" - gray-400 text
- **CTA button**: "Continue with Google" - white background, triggers `handleGoogleSignIn`

**Footer:**

Uses `<LandingFooter />` component. See "Shared Landing Components" section above for details.

**Styling Patterns:**

- **Consistent light theme** throughout - alternating white (`bg-white`) and light gray (`bg-gray-50`) backgrounds
- **DM Sans font** applied via inline style: `style={{ fontFamily: 'var(--font-dm-sans), system-ui, -apple-system, sans-serif' }}`
- **All headlines**: `font-medium text-gray-900 leading-[1.1] tracking-[-0.02em]` for consistent typography
- **Headline casing**: Sentence case - first letter of first word capitalized, rest lowercase except proper nouns (AI, LLM, STT, TTS, Calibrate, etc.)
- **Subtitles**: `text-xl text-gray-500`
- **Tabs container**: `inline-flex bg-gray-100 rounded-xl p-1` with active tab having white background and shadow
- **Image containers**: `rounded-xl overflow-hidden shadow-xl` - simple container without fixed aspect ratio
- **Image display**: `w-full h-auto` - images show at full width with natural height (no cropping)
- **Grid borders**: `border-gray-200` for light theme consistency

**CTA Buttons:**

- "Get started" - Primary action in header (filled/black style), triggers `signIn("google")`
- "Continue with Google" - Primary action in final CTA section (white style on dark background), triggers `signIn("google")`
- "Documentation" - Header text link (tertiary style, gray text), opens `process.env.NEXT_PUBLIC_DOCS_URL` in new tab
- "Talk to us" - Header button (outlined/secondary style), scrolls to `#join-community` section

### About Page (`/about`)

Public page (no auth required) with information about Calibrate and the team.

**Structure:**
- Uses `<LandingHeader showLogoLink talkToUsHref="/login#join-community" />` - logo links to /login, "Talk to us" button links to login page's community section
- Uses `<LandingFooter />` - same footer as landing page

**Content sections:**
- Our Vision: Voice AI challenges and Calibrate's solution
- Team: 2-column grid (`max-w-xl`, left-aligned) with clickable team member cards linking to LinkedIn. Profile images at `/team/aman.jpeg` and `/team/jigar.jpeg` with `bg-gray-200` fallback

### Authentication Flow

The app uses NextAuth.js v5 with middleware-based route protection and backend sync:

1. **Middleware** (`src/middleware.ts`) protects all routes:
   - Unauthenticated users → redirected to `/login`
   - Authenticated users on `/login` → redirected to `/agents`
   - Auth API routes (`/api/auth/*`), debug routes (`/debug*`), and docs routes (`/docs*`) are always accessible

2. **SessionProvider** wraps the app in `layout.tsx` for client-side session access

3. **Login page** (`/login`) shows landing page with Google OAuth CTA

4. **Backend sync**: On successful Google login, the `jwt` callback sends the Google ID token to `POST /auth/google` on the backend to create/retrieve the user

5. **Session persistence**: NextAuth uses HTTP-only cookies, sessions persist across reloads

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

- **User UUID:** `(session as any)?.backendUser?.user?.uuid`
- **JWT Token:** `(session as any)?.backendAccessToken`

```tsx
// Check auth in client components
import { useSession, signOut } from "next-auth/react";

const { data: session, status } = useSession();
// status: "loading" | "authenticated" | "unauthenticated"

// Get JWT token for API authentication
const backendAccessToken = (session as any)?.backendAccessToken;

// Get user UUID (if needed)
const userId = (session as any)?.backendUser?.user?.uuid;

// Sign out (used for manual logout or 401 error handling)
await signOut({ callbackUrl: "/login" });

// Server-side auth check
import { auth } from "@/auth";
const session = await auth();
```

### Page Structure

All pages follow a consistent structure:

- Use `"use client"` directive (client components)
- Wrap content in `AppLayout` for sidebar navigation
- Manage `sidebarOpen` state locally
- Use `useRouter` for navigation

```tsx
export default function ExamplePage() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);

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

### List Page Content Structure

List pages (Agents, Simulations, Personas, Scenarios, Tools, Tests, Metrics, STT, TTS) follow a consistent content structure inside `AppLayout`:

```tsx
<div className="space-y-6">
  {/* Header - title and description only */}
  <div>
    <h1 className="text-2xl font-semibold">Page Title</h1>
    <p className="text-muted-foreground text-base leading-relaxed mt-1">
      Description of what this page shows
    </p>
  </div>

  {/* Primary action button - below header, left-aligned */}
  <button
    onClick={handleAdd}
    className="h-10 px-4 rounded-md text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer"
  >
    Add item
  </button>

  {/* Search input */}
  <div className="relative max-w-md">
    {/* Search icon + input */}
  </div>

  {/* Content: Loading / Error / Empty / Table */}
  {isLoading ? <LoadingState /> : error ? <ErrorState /> : items.length === 0 ? <EmptyState /> : <Table />}
</div>
```

**Key layout rules:**

- Container uses `space-y-6` for consistent vertical spacing between sections
- Header section contains only title (`h1`) and description (`p`) - no action button
- Primary action button ("Add X", "New X") is a separate element below the header, left-aligned
- Search input comes after the action button
- Content area (loading/error/empty/table) comes last

This pattern applies to: Agents, Simulations, Personas, Scenarios, Tools, Tests (LLM Evaluation), Metrics, STT, and TTS list pages.

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
    <span className="text-base font-semibold">{item.name}</span>
  </div>
);

const headerActions = (
  <div className="mr-2">  {/* mr-2 adds spacing from profile dropdown */}
    <button className="h-8 px-4 rounded-md text-sm font-medium bg-foreground text-background ...">
      Save / Launch
    </button>
  </div>
);

<AppLayout customHeader={customHeader} headerActions={headerActions}>
```

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

Key styling:

- Back button: `w-8 h-8`, icon `w-5 h-5`
- Title: `text-base font-semibold`
- Action button: `h-8 px-4 text-sm`
- Action wrapper: `mr-2` for spacing from profile dropdown

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
- Displays in sortable table with columns: Providers (as pills), Language, Status, Samples count, Created At
- "New [TTS/STT] Evaluation" button below header navigates to `/[tts|stt]/new`
- Clicking a row navigates to `/[tts|stt]/{uuid}`

**New Page:**

- Contains the evaluation form component (`TextToSpeechEvaluation` or `SpeechToTextEvaluation`)
- Both components use the same tab layout:
  - **Settings tab**: Language selection dropdown + provider selection table (no limit on providers)
  - **Dataset tab**: Sample rows + add sample button (TTS also has CSV upload with OR divider and sample download)
- **Provider selection UI** (table format):
  - Table with border, rounded corners (`border border-border rounded-lg`)
  - Header row with select-all checkbox and column titles (`bg-muted/50 border-b`)
  - **STT columns**: Checkbox | Label | Model | Website
  - **TTS columns**: Checkbox | Label | Model | Voice ID | Website
  - Website column has external link icon that opens provider's website in new tab (uses `stopPropagation()` to prevent row selection toggle)
  - Clickable rows (`hover:bg-muted/30 cursor-pointer`) - clicking anywhere on row toggles selection
  - Select-all checkbox in header with tri-state: empty (none), minus icon (some), checkmark (all)
  - Model and Voice ID columns use `font-mono` for technical values
  - Shows "(X selected)" count next to the header title
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

**Key differences between TTS and STT:**

- **STT Input tab**: Audio file upload (.wav) + reference transcription text field
- **TTS Input tab**: Text input field + CSV upload option with "OR" divider and sample CSV download
- **STT metrics**: WER, String Similarity, LLM Judge (NO latency metrics)
- **TTS metrics**: LLM Judge, TTFB (latency metrics are objects with `mean`, `std`, `values`; Processing Time removed from UI)
- **Null-safe metric rendering**: Numeric metrics (string_similarity, wer, llm_judge_score, ttfb.mean) can be null. Always check before formatting: `value != null ? parseFloat(value.toFixed(4)) : "-"`. Use `parseFloat()` wrapper to remove trailing zeros. Max 4 decimal places for all metrics to prevent column overflow
- **STT Outputs tab**: Shows Ground Truth vs Prediction text; metrics columns (WER, String Similarity, LLM Judge) shown when status is "done" OR when all rows have metrics available. Rows with empty predictions are highlighted with `bg-red-500/10` and show "_No transcript produced_" in italicized muted text
  - **Table layout**: Uses `table-fixed` with explicit column widths (ID: `w-12`, Ground Truth/Prediction: `w-[30%]` each) to prevent long text from overflowing. Text columns use `break-words` for wrapping. Container uses `overflow-x-auto` for horizontal scroll fallback
  - **Empty prediction detection**: Helper functions `hasEmptyPredictions()` and `getFirstEmptyPredictionIndex()` check for rows without transcripts. Provider status shows red X if any empty, and clicking scrolls to first empty row via `data-row-index` attribute
- **TTS Outputs tab**: Shows text input with audio playback; LLM Judge column shown when status is "done" OR when all rows have metrics available
- **LLM Judge column display**: Shows Pass/Fail badges (green/red) as static indicators. Backend returns `"True"`/`"False"` strings (or `"1"`/`"0"`). Parsing: convert to lowercase string, Pass when value is `"true"` or `"1"`. A small info icon button (ⓘ) next to the badge shows the reasoning tooltip on hover (falls back to "Score: X" if no reasoning). The info icon uses Heroicons-style info-circle SVG with `hover:bg-muted` for interactivity feedback. This makes it intuitive that users can view the reasoning rather than requiring them to guess they should hover over the badge

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
      provider.supportedLanguages.includes(langName),
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
2. **Sidebar Panels**: Slide-in panels for create/edit forms
   - **Preferred**: Use `SlidePanel` and `SlidePanelFooter` from `@/components/ui`
   - Width: 40% of viewport, min 500px (customizable via `width` prop)
   - Backdrop click closes panel
   - Used for: Tools, Personas, Scenarios creation/editing
3. **Modal Dialogs**: Centered overlays for confirmations and simple forms
   - Simple dialogs: Backdrop click closes dialog directly
   - Form dialogs with unsaved data: Backdrop click shows confirmation before closing (e.g., AddTestDialog)
   - Used for: New agent, New simulation, Delete confirmations, Add/Edit test
   - **Large form dialogs** (like AddTestDialog): Use a header bar with name input and save button, flex-col layout with main content area below
4. **Delete Confirmation**: Reusable `DeleteConfirmationDialog` component
   - Props: `isOpen`, `onClose`, `onConfirm`, `title`, `message`, `confirmText`, `isDeleting`
   - Shows loading spinner during deletion
   - **Skip confirmation for empty items**: When deleting empty rows (e.g., in TTS/STT evaluation input), call `deleteRow()` directly instead of showing confirmation dialog
5. **Toast Notifications**: Bottom-right success toasts
   - Auto-dismiss after 3 seconds
   - Manual dismiss button
   - Used after successful save operations
6. **Header Actions (AppLayout)**: Top-right section of header contains:
   - **User Profile Dropdown**: Avatar button showing Google image or placeholder (first letter on purple background)
     - Dropdown contains: user info, theme switcher, logout button
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
   - Optional `availableProviders` prop for filtering available models (used in BenchmarkDialog)
   - Used in: AgentTabContent (settings), BenchmarkDialog (model comparison)
10. **Tool Picker**: `ToolPicker` from `@/components/ToolPicker`
    - Props: `availableTools`, `isLoading`, `onSelectInbuiltTool`, `onSelectCustomTool`, `selectedToolIds?`
    - Dropdown with search, divided into "In-built tools" and "User defined tools" sections
    - User defined tools show tool type below name (`text-xs text-muted-foreground`): "Webhook" or "Structured Output"
    - Used in: AddTestDialog (tool invocation test type)
11. **Parameter Card**: `ParameterCard` from `@/components/ParameterCard`
    - Recursive component for rendering parameter/property cards with full JSON Schema support
    - Props: `param`, `path`, `onUpdate`, `onRemove`, `onAddProperty`, `onSetItems`, `validationAttempted`, `isProperty?`, `isArrayItem?`, `siblingNames?`, `hideDelete?`, `showRequired?`
    - `hideDelete` prop: When true, hides the delete button (used when only one parameter exists to enforce minimum)
    - `showRequired` prop: When false, hides the required checkbox (default: true). Used for data field properties where required is handled at the parent level
    - Delete button not shown for array items (`isArrayItem`) or when `hideDelete` is true
    - Uses `NestedContainer` for nested object properties and array items
    - Used in: AddToolDialog (structured output parameters, webhook query/body parameters), AddTestDialog, DataExtractionTabContent
    - **Note**: `DataFieldPropertyCard` is deprecated and now wraps `ParameterCard` with `showRequired={false}`
12. **Nested Container**: `NestedContainer` from `@/components/ui/NestedContainer`
    - Theme-aware container for nested properties/items sections
    - Uses `bg-muted` for proper light/dark mode support (replaces hardcoded `bg-[#1b1b1b]`)
    - Props: `children`, `onAddProperty?`, `addButtonText?`, `showAddButton?`, `showValidationError?`
    - Includes optional "Add property" button with validation error styling
    - Used in: ParameterCard, AddToolDialog (body parameters), DataExtractionTabContent
13. **Native Link Navigation**: List items use Next.js `<Link>` components for browser-native right-click support
    - Enables "Open in new tab" via browser's native context menu
    - Supports Cmd/Ctrl+click to open in new tab
    - Applied to: Agents list, Simulations list, Simulation runs list
14. **View Mode Dialogs**: `TestRunnerDialog` and `BenchmarkResultsDialog` support dual modes:
    - **Run mode** (default): Opens dialog and starts a new run/benchmark
    - **View mode**: Pass `taskId` prop to view existing run results without starting a new run
    - **TestRunnerDialog behavior based on `initialRunStatus`**:
      - **Completed runs** (`done`/`completed`): Clears test results initially, fetches fresh from API once (no polling), displays actual pass/fail status
      - **In-progress runs** (`pending`/`queued`/`in_progress`): Initializes tests as "running" (yellow), polls API at `POLLING_INTERVAL_MS` until complete
    - **BenchmarkResultsDialog intermediate results**:
      - **When in progress**: Shows Outputs view directly (no tabs visible), all providers displayed immediately
      - **When done**: Shows both Leaderboard and Outputs tabs, auto-switches to Leaderboard tab
      - Uses expandable provider toggles (not a dropdown) in the left panel
      - Each provider section shows: provider name, processing spinner (if still running), passed/failed counts (when complete)
      - Provider sections are expandable to show individual test results underneath
      - **Immediate provider display**: On dialog open, creates placeholder entries for ALL models from `models` prop (doesn't wait for API results)
      - **Processing state display**: When a provider has `success === null` and no results yet, shows all test names from `testNames` prop with yellow running indicators (similar to TestRunnerDialog)
      - As results arrive from API, running indicators update to green checkmarks or red X marks
      - **Auto-expand behavior**: First provider (from `models` prop) is expanded immediately when dialog opens, not waiting for results
      - **Merged providers**: `getProvidersToDisplay()` function merges `modelResults` from API with placeholders for any models that don't have results yet
      - Types support null values: `success: boolean | null`, `test_results: BenchmarkTestResult[] | null`, `passed: boolean | null`
      - **Header status badge**: Uses `StatusBadge` component (same as STT/TTS evaluation pages) to show task status ("Queued" with gray badge, "Running" with yellow badge) plus spinner while benchmark is in progress
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

**Legacy: Manual fetch pattern** (still used in some files):

```tsx
import { useSession, signOut } from "next-auth/react";

const { data: session } = useSession();
const backendAccessToken = (session as any)?.backendAccessToken;

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

```tsx
className =
  "w-full h-10 px-4 rounded-md text-base border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent";
```

### Custom Checkbox (Button-based)

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

---

## Domain Concepts

### Agents

Voice agents configured with:

- **System Prompt**: Defines agent persona and behavior
- **STT Provider**: Speech-to-text service (google, openai, deepgram, etc.)
- **TTS Provider**: Text-to-speech service (google, openai, cartesia, etc.)
- **LLM Model**: Language model (organized by provider: OpenAI, Google, Anthropic, etc.)
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

### Scenarios

Test scenarios defining WHAT the persona should do:

- **Label**: Scenario name
- **Description**: Task or conversation goal

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
| Simulation Runs | `GET /simulations/run/{runId}`, `POST /simulations/{uuid}/run`                                                                                                                                                                                                    |
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
- `leaderboard_summary`: Only populated when status is `done`/`completed`

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

// Full test conversation view
<TestDetailView history={history} output={output} passed={passed} />

// Stats bar
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

| Page Type                     | Grid Columns                              | Description                                                   |
| ----------------------------- | ----------------------------------------- | ------------------------------------------------------------- |
| **Agents, Simulations**       | `[1fr_1fr_auto]` or `[1fr_1fr_auto_auto]` | Equal-width data columns, auto action buttons                 |
| **Tools**                     | `[200px_150px_1fr_auto]`                  | Fixed name, fixed type badge, flexible description, auto actions |
| **Scenarios, Metrics**        | `[200px_1fr_auto]`                        | Fixed 200px name column, flexible description, auto actions   |
| **Personas**                  | `[200px_1fr_100px_100px_120px_auto]`      | Fixed name, flexible characteristics, fixed attribute columns |
| **Simulation Runs**           | `[1fr_1fr_1fr_1fr]`                       | Four equal columns (Name, Status, Type, Created At)           |
| **Tests**                     | `[1fr_1fr_auto]`                          | Equal-width name and type columns                             |

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
  </span>,
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
    `Audio file must be less than ${LIMITS.STT_MAX_AUDIO_DURATION_SECONDS} seconds...`,
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
- **401 error handling**: API utilities automatically call `signOut({ callbackUrl: "/login" })` on 401 responses. For manual fetch calls, check `response.status === 401`
- **HTTP error handling (401, 403, 404)**: Detail pages (STT, TTS, Simulation Run) handle specific HTTP error codes with dedicated UI states:
  - **401 Unauthorized**: Automatically redirects to login via `signOut({ callbackUrl: "/login" })`
  - **403 Forbidden**: Shows `NotFoundState` with "403 Forbidden" message
  - **404 Not Found**: Shows `NotFoundState` with "404 Not found" message
  - Pattern: add `errorCode` state (`useState<401 | 403 | 404 | null>(null)`), check status codes before `!response.ok`, render `<NotFoundState errorCode={errorCode} />`
  - For simulation runs, a special `notFoundHeader` is used that shows empty header and navigates back to `/simulations` (main page) instead of the specific simulation
- **Wait for token**: In `useEffect` hooks, return early if `backendAccessToken` is not yet available; include it in the dependency array
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
        style={{ left: `calc(${percentage}% + ${8 - (percentage / 100) * 16}px)` }}
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
  </div>
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

### Styling

- **Never use hardcoded colors** like `bg-black`, `bg-[#1a1a1a]`, `text-white`, `border-[#333]`, `text-gray-300`, `text-gray-400` - these break light mode
- **Always use CSS variable classes**: `bg-background`, `text-foreground`, `border-border`, `bg-muted`, `text-muted-foreground`, `bg-accent`
- **Do NOT use `bg-popover`** - it causes transparent backgrounds due to Tailwind v4 theme mapping issues; use `bg-background` instead for dropdowns and popovers
- **Checkboxes need visible borders**: Use `border-muted-foreground` (not `border-border`) and `border-2` for custom checkbox buttons to ensure visibility in both light and dark modes
- **Spinners in flex containers**: Always add `flex-shrink-0` to spinner SVGs to prevent them from shrinking. Standard spinner class: `w-5 h-5 flex-shrink-0 animate-spin`
- **Icon action buttons** (play, edit, etc.): Use `bg-foreground/90 text-background hover:bg-foreground` for solid icon buttons that need to be visible in both light and dark modes. Never use `text-white` alone as icons become invisible on light backgrounds. **Avoid `hover:opacity-*`** on buttons with child tooltips - opacity affects all children including tooltips, making them translucent. Use `bg-foreground/90 hover:bg-foreground` instead to only affect the background
- **Chat message bubbles**: Consistent styling across AddTestDialog and TestDetailView (test results). User messages use `bg-muted border border-border text-foreground` (gray background, right-aligned). Agent messages use `bg-background border border-border text-foreground` (white/light background, left-aligned). Tool call cards use `bg-muted border border-border`. All use `rounded-xl` and `w-1/2` width. See `@/components/test-results/shared.tsx` for the pattern

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
- **Audio URL matching**: The `getAudioUrlForEntry` function in the simulation run page counts previous messages of the same role and adds 1 to get the correct file index
- **Common mistake**: Don't use 0-based indexing for user audio files - they follow the same 1-indexed pattern as bot files
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

| Route                      | Layout Title                                              |
| -------------------------- | --------------------------------------------------------- |
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

| Page                               | Title Format                                                                 |
| ---------------------------------- | ---------------------------------------------------------------------------- |
| `/agents/[uuid]`                   | `<Agent Name> - <Tab Name> \| Calibrate` (e.g., "My Agent - Tests \| Calibrate")     |
| `/simulations/[uuid]`              | `<Simulation Name> - <Tab Name> \| Calibrate` (e.g., "My Sim - Config \| Calibrate") |
| `/simulations/[uuid]/runs/[runId]` | `<Run Name> \| <Simulation Name> \| Calibrate`                                   |

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
- **Public routes** (no auth required): `/login`, `/about`, `/api/auth/*`, `/debug*`, `/docs*` (proxied to Mintlify via Vercel rewrite)
- **Session access**: Use `useSession()` in client components, `auth()` in server components
- **Token expiration**: Backend returns 401 when JWT expires; always handle this by calling `signOut({ callbackUrl: "/login" })`
- **Import pattern**: Always import both `useSession` and `signOut` from `next-auth/react` when making API calls
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
