---
description: "Description of the project"
alwaysApply: true
---

# Pense Frontend

**Voice Agent Simulation and Evaluation Platform**

---

## What is Pense?

Pense is a comprehensive platform for building, configuring, testing, and evaluating **voice-based AI agents**. It enables teams to create conversational agents that can handle voice interactions (phone calls, voice assistants) and rigorously test them before deployment.

The platform addresses the challenge of quality assurance for voice agents by providing:

- **Component-level testing** (unit tests for STT/TTS providers)
- **End-to-end simulation testing** (full conversations with simulated users)
- **Benchmarking** across different AI providers to find the best configuration

---

## Overall Context & Use Cases

### Primary Use Case

Organizations building voice agents (customer support bots, IVR systems, voice assistants) use Pense to:

1. Configure their agent's voice pipeline (which STT, TTS, and LLM to use)
2. Test individual components to select the best providers
3. Run simulated conversations to validate agent behavior
4. Evaluate agent performance with metrics before going live

### Workflow Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           PENSE WORKFLOW                                │
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
| **Settings**        | Toggle "Agent speaks first" behavior                                             |

**Default Agent Configuration** (when creating new agent):

```json
{
  "system_prompt": "You are a helpful assistant.",
  "stt": { "provider": "google" },
  "tts": { "provider": "google" },
  "llm": { "model": "google/gemini-3-flash-preview" },
  "settings": { "agent_speaks_first": false },
  "system_tools": { "end_call": true }
}
```

**Available Providers:**

- **STT**: deepgram, openai, cartesia, elevenlabs, whisper (groq), google, sarvam
- **TTS**: cartesia, openai, orpheus (groq), google, elevenlabs, sarvam
- **LLM**: 20+ providers including OpenAI, Google, Anthropic, DeepSeek, Meta, Mistral, Qwen, xAI, Perplexity, Cohere, Amazon, NVIDIA, Microsoft, and more

**Tests Tab Features:**

- **Two-column layout**: Tests table on left, Past runs panel (480px) on right
- **Tests table**: Shows attached tests with name, type (Tool Call/Next Reply), run button, delete button
- **Past runs panel**: 4-column table layout showing history of test runs:
  | Column | Content |
  | --- | --- |
  | Name | "N tests" for unit tests (from `total_tests`), "N models" for benchmarks (from `model_results.length`) |
  | Run Type | "Test" (blue pill) or "Benchmark" (purple pill) based on `type` field |
  | Time | Relative time (e.g., "yesterday", "6 days ago", "3 months ago") |
  | Result | "Running" (yellow, with spinner) for pending/queued/in_progress; "N Success" and/or "M Fail" badges for completed `llm-unit-test`; "Complete" for completed `llm-benchmark` |
- **Clickable rows**: Clicking a past run row opens the appropriate results dialog:
  - `llm-unit-test` → Opens `TestRunnerDialog` in view mode (with `taskId` prop)
  - `llm-benchmark` → Opens `BenchmarkResultsDialog` in view mode (with `taskId` prop)
- **Real-time updates**: When a new test/benchmark is started:
  1. A new entry is immediately added to the top of the past runs table with "pending" status
  2. The component polls the API to update the entry with results when complete
  3. The "Running" badge with spinner is shown until the run completes
- **Actions**: Add test, Run all tests, Compare models (benchmark)
- **API**: Fetches runs from `GET /agent-tests/agent/{uuid}/runs`
- **Run types**: `llm-unit-test` (has passed/failed counts) and `llm-benchmark` (results in model_results)

### 2. Tools Management (`/tools`)

**What you can do:**

- **Create custom tools** for LLM function calling
- **Define tool parameters** with full JSON Schema support:
  - Primitive types: string, number, boolean, integer
  - Complex types: object (with nested properties), array (with item types)
  - Required/optional flags
  - Descriptions for each parameter
- **Edit existing tools**
- **Delete tools**
- **Search tools** by name or description

### 3. Speech-to-Text Evaluation (`/stt`)

**Page Structure:**

- `/stt` - List page showing all STT evaluation jobs
- `/stt/new` - Create a new STT evaluation
- `/stt/[uuid]` - View evaluation details and results

**List Page (`/stt`):**

- **View all STT evaluations** in a sortable table (sorted by updated date)
- **Columns**: Providers (as pills), Language, Status, Samples count, Updated At
- **Click to view details** - opens the evaluation detail page
- **"New STT Evaluation" button** - navigates to the create page

**Create Page (`/stt/new`):**

- **Upload audio files** (.wav format) with reference transcriptions
- **Add multiple test samples** for batch evaluation
- **Select providers to evaluate** (compare multiple simultaneously)
- **Choose language** (English or Hindi)
- **Run evaluation** - creates evaluation and redirects to detail page

**Detail Page (`/stt/[uuid]`):**

- **Polls for results** while status is `queued` or `in_progress`
- **Three tabs when done**:
  - **Leaderboard**: Comparative table and charts
  - **Outputs**: Per-provider results with ground truth vs predictions
  - **About**: Metric descriptions
- **Metrics**: WER, String Similarity, LLM Judge Score, TTFB, Processing Time

### 4. Text-to-Speech Evaluation (`/tts`)

**Page Structure:**

- `/tts` - List page showing all TTS evaluation jobs
- `/tts/new` - Create a new TTS evaluation
- `/tts/[uuid]` - View evaluation details and results

**List Page (`/tts`):**

- **View all TTS evaluations** in a sortable table (sorted by updated date)
- **Columns**: Task ID (truncated), Status, Providers, Updated At
- **Click to view details** - opens the evaluation detail page
- **"New TTS Evaluation" button** - navigates to the create page

**Create Page (`/tts/new`):**

- **Add text samples** to convert to speech (manual input OR CSV upload)
- **CSV upload option**: Upload a CSV file with a `text` column to bulk import samples
- **Download sample CSV**: Button to download a template CSV with correct format
- **Select language** (English or Hindi)
- **Select providers to compare**
- **Run evaluation** - creates evaluation and redirects to detail page

**Detail Page (`/tts/[uuid]`):**

- **Polls for results** while status is `queued` or `in_progress`
- **Three tabs when done**:
  - **Leaderboard**: Comparative table and charts
  - **Outputs**: Per-provider results with audio playback
  - **About**: Metric descriptions
- **Metrics**: LLM Judge Score, TTFB, Processing Time

### 5. Tests Management (`/tests`)

**What you can do:**

- **Create test cases** with:
  - Name and description
  - Test type: "response" (check agent response) or "tool_call" (check tool invocation)
  - Test configuration
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
| **Config** | Select agent, personas, scenarios for the simulation                                   |
| **Runs**   | View history of simulation runs (right-click or Cmd/Ctrl+click to open run in new tab) |

**Running Simulations:**

- **Run types**: chat (text-based), audio, voice (full pipeline)
- Runs are executed asynchronously with polling for status updates
- Status flow: queued → in_progress → done (or failed)

**Simulation Run Results** (`/simulations/[uuid]/runs/[runId]`):

- **Polling & Intermediate Results**:

  - Page polls API every 3 seconds while status is `in_progress`
  - Simulation results appear incrementally as each simulation completes
  - Overall metrics only shown after run completes (status === "done")

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
  - View transcript button
  - Audio playback (for voice simulations)

- **Transcript Dialog**:

  - Full conversation audio player below header (from `conversation_wav_url`) for voice simulations
  - Full conversation history (user, assistant, tool calls)
  - Role-based message styling
  - Tool call details with arguments
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

Pense allows testing and benchmarking each component:

- **STT (Speech-to-Text)**: Converts user's voice to text
- **LLM (Large Language Model)**: Generates intelligent responses
- **TTS (Text-to-Speech)**: Converts agent's response to voice
- **Tools**: External functions the LLM can call

### Simulation Testing Approach

Instead of manual testing, Pense uses AI-powered simulation:

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
- **Authentication**: NextAuth.js v5 (beta) with Google OAuth
- **Charts**: Recharts 3.6.0
- **TypeScript**: 5.x

---

## Project Structure

```
/                           # Root directory
├── env.example            # Environment variables template
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── layout.tsx         # Root layout with default metadata
│   │   ├── agents/            # Agent management (list + [uuid] detail)
│   │   │   ├── layout.tsx     # Route-specific metadata for page title
│   │   │   └── [uuid]/layout.tsx  # Detail page metadata
│   │   ├── tools/             # Tools management (each route has layout.tsx)
│   │   ├── stt/               # Speech-to-Text evaluation (list + new + [uuid] detail)
│   │   │   ├── layout.tsx     # "Speech to Text | Pense"
│   │   │   ├── page.tsx       # List of STT evaluation jobs
│   │   │   ├── new/           # Create new STT evaluation (has layout.tsx)
│   │   │   └── [uuid]/        # View STT evaluation results (has layout.tsx)
│   │   ├── tts/               # Text-to-Speech evaluation (list + new + [uuid] detail)
│   │   │   ├── layout.tsx     # "Text to Speech | Pense"
│   │   │   ├── page.tsx       # List of TTS evaluation jobs
│   │   │   ├── new/           # Create new TTS evaluation (has layout.tsx)
│   │   │   └── [uuid]/        # View TTS evaluation results (has layout.tsx)
│   │   ├── tests/             # Tests page (has layout.tsx)
│   │   ├── personas/          # User persona definitions (has layout.tsx)
│   │   ├── scenarios/         # Test scenario definitions (has layout.tsx)
│   │   ├── metrics/           # Evaluation metrics (has layout.tsx)
│   │   ├── simulations/       # End-to-end simulation testing (has layout.tsx)
│   │   ├── login/             # Authentication page (has layout.tsx)
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
│   ├── hooks/                 # Custom React hooks (useCrudResource, etc.)
│   ├── lib/                   # Utility libraries (api.ts, status.ts, etc.)
│   ├── auth.ts               # NextAuth.js configuration
│   └── middleware.ts         # Route protection middleware
```

---

## Architecture Patterns

### Authentication Flow

The app uses NextAuth.js v5 with middleware-based route protection and backend sync:

1. **Middleware** (`src/middleware.ts`) protects all routes:

   - Unauthenticated users → redirected to `/login`
   - Authenticated users on `/login` → redirected to `/agents`
   - Auth API routes (`/api/auth/*`) are always accessible

2. **SessionProvider** wraps the app in `layout.tsx` for client-side session access

3. **Login page** (`/login`) shows Google OAuth button

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
- Displays in sortable table with columns: Providers (as pills), Language, Status, Samples count, Updated At
- "New [TTS/STT] Evaluation" button navigates to `/[tts|stt]/new`
- Clicking a row navigates to `/[tts|stt]/{uuid}`

**New Page:**

- Contains the evaluation form component (`TextToSpeechEvaluation` or `SpeechToTextEvaluation`)
- Both components use the same tab layout:
  - **Settings tab**: Language selection dropdown + provider selection with toggle all
  - **Input tab**: Sample rows + add sample button (TTS also has CSV upload with OR divider and sample download)
- Evaluate button in header next to description, disabled when no providers selected
- On submit: calls `POST /[tts|stt]/evaluate`, then redirects to `/[tts|stt]/{uuid}` using the returned `task_id`
- Uses `BackHeader` component for back navigation to list page

**Detail Page:**

- Fetches result from `GET /[tts|stt]/evaluate/{uuid}` (NOT from `/jobs`)
- Polls every 2 seconds while status is `queued` or `in_progress`
- Shows loading/in-progress states during polling
- Uses `BackHeader` component for back navigation
- Uses `StatusBadge` component with `showSpinner` for status display
- Results are at **top level** (`provider_results`, `leaderboard_summary`) - different from `/jobs` API!
- Displays results in tabs (Leaderboard, Outputs, About) when done

**Key differences between TTS and STT:**

- **STT Input tab**: Audio file upload (.wav) + reference transcription text field
- **TTS Input tab**: Text input field + CSV upload option with "OR" divider and sample CSV download
- **STT metrics**: WER, String Similarity, LLM Judge Score, TTFB, Processing Time
- **TTS metrics**: LLM Judge Score, TTFB, Processing Time
- **STT Outputs tab**: Shows Ground Truth vs Prediction text with per-sample metrics
- **TTS Outputs tab**: Shows text input with audio playback

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
6. **User Profile Dropdown**: Top-right avatar button in `AppLayout` header
   - Shows user avatar (Google image) or placeholder (first letter of first name on purple background)
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
10. **Native Link Navigation**: List items use Next.js `<Link>` components for browser-native right-click support
    - Enables "Open in new tab" via browser's native context menu
    - Supports Cmd/Ctrl+click to open in new tab
    - Applied to: Agents list, Simulations list, Simulation runs list
11. **View Mode Dialogs**: `TestRunnerDialog` and `BenchmarkResultsDialog` support dual modes:
    - **Run mode** (default): Opens dialog and starts a new run/benchmark
    - **View mode**: Pass `taskId` prop to view existing run results without starting a new run
    - When `taskId` is provided, the dialog polls the existing task and displays results
    - Callback props (`onRunCreated`, `onBenchmarkCreated`) notify parent when new runs are created
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
- Metrics: WER, String Similarity, LLM Judge Score, TTFB, Processing Time

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
- `passed`/`failed`: Counts for `llm-unit-test` type; `null` for `llm-benchmark`
- `model_results`: Array of per-model results for benchmarks (`.length` used to display "N models")
- `results[].test_case.name`: The test name from the original test definition - used to display test names in `TestRunnerDialog` when viewing past runs

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

// Display tool call with arguments
<ToolCallCard toolName="get_weather" args={{ city: "London" }} />

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
import { LoadingState, EmptyState, ErrorState, ResourceState } from "@/components/ui";
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
| **Tools, Scenarios, Metrics** | `[200px_1fr_auto]`                        | Fixed 200px name column, flexible description, auto actions   |
| **Personas**                  | `[200px_1fr_100px_100px_120px_auto]`      | Fixed name, flexible characteristics, fixed attribute columns |
| **Simulation Runs**           | `[1fr_1fr_1fr_1fr]`                       | Four equal columns (Name, Status, Type, Updated At)           |
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

```tsx
useEffect(() => {
  let pollInterval: NodeJS.Timeout | null = null;

  const fetchData = async (isInitial = false) => {
    // ... fetch
    // Continue polling for queued and in_progress
    if (
      data.status === "done" ||
      data.status === "completed" ||
      data.status === "failed"
    ) {
      if (pollInterval) clearInterval(pollInterval);
    }
  };

  fetchData(true);
  pollInterval = setInterval(() => fetchData(false), 3000);

  return () => {
    if (pollInterval) clearInterval(pollInterval);
  };
}, [dependency]);
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

---

## Navigation Structure

### Sidebar Sections

1. **Main**

   - Agents
   - Tools

2. **Unit Tests**

   - Speech-to-Text (STT)
   - Text-to-Speech (TTS)
   - Tests

3. **End-to-End Tests**
   - Personas
   - Scenarios
   - Metrics
   - Simulations

---

## Environment Variables

```bash
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000  # Backend API URL
AUTH_SECRET=                                    # NextAuth secret
GOOGLE_CLIENT_ID=                              # Google OAuth client ID
GOOGLE_CLIENT_SECRET=                          # Google OAuth client secret
```

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
- **Wait for token**: In `useEffect` hooks, return early if `backendAccessToken` is not yet available; include it in the dependency array
- **ngrok header**: `"ngrok-skip-browser-warning": "true"` header is included automatically by API utilities
- **Backend URL check**: API utilities will throw an error if `NEXT_PUBLIC_BACKEND_URL` is not set
- **Date formatting**: API returns ISO dates; use `toLocaleString()` for display
- **UTC timestamps**: Backend returns timestamps in UTC without timezone indicator (e.g., `"2026-01-18 10:00:00"`). When parsing for relative time calculations, append `"Z"` to explicitly mark as UTC: `new Date(dateString.replace(" ", "T") + "Z")`. Without this, JavaScript interprets the timestamp as local time, causing incorrect relative times (e.g., "5 hours ago" instead of "just now" for users in IST)
- **Multiple date formats**: When creating optimistic UI updates (e.g., adding a pending run to a table), use `new Date().toISOString()` which produces `"2026-01-18T09:30:00.000Z"`. The `formatRelativeTime` helper in `TestsTabContent.tsx` handles both formats - check if the string already has a timezone indicator before appending "Z" to avoid invalid dates like `"...ZZ"` which produce NaN
- **Hooks need accessToken**: `useCrudResource` and `useFetchResource` require `accessToken` to be passed from the component (they don't call `useSession` internally)

### State Management

- **Refs for callbacks**: Use `useRef` to hold mutable callback references (e.g., `saveRef`) when callbacks need latest state but shouldn't trigger re-renders
- **Polling cleanup**: Always clear intervals in useEffect cleanup to prevent memory leaks
- **Dialog close prevention**: Disable dialog close while async operations (delete, save) are in progress
- **Unsaved changes confirmation**: Form dialogs (like AddTestDialog) should show a confirmation dialog when user clicks backdrop, asking "Discard changes?" with Cancel/Discard buttons

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

### Styling

- **Never use hardcoded colors** like `bg-black`, `bg-[#1a1a1a]`, `text-white`, `border-[#333]`, `text-gray-300`, `text-gray-400` - these break light mode
- **Always use CSS variable classes**: `bg-background`, `text-foreground`, `border-border`, `bg-muted`, `text-muted-foreground`, `bg-accent`
- **Do NOT use `bg-popover`** - it causes transparent backgrounds due to Tailwind v4 theme mapping issues; use `bg-background` instead for dropdowns and popovers
- **Checkboxes need visible borders**: Use `border-muted-foreground` (not `border-border`) and `border-2` for custom checkbox buttons to ensure visibility in both light and dark modes

### Forms

- **Character limits**: Implement maxLength on inputs AND display character count
- **Required fields**: Mark with red asterisk, validate on submit, highlight invalid fields
- **Nested parameters**: Tool parameters support arbitrary nesting (object → properties, array → items)

### Voice Simulation Audio

- **Audio file naming convention**: Both user and bot audio files use **1-based indexing**:
  - User files: `1_user.wav`, `2_user.wav`, `3_user.wav`, etc.
  - Bot files: `1_bot.wav`, `2_bot.wav`, `3_bot.wav`, etc.
- **Audio URL matching**: The `getAudioUrlForEntry` function in the simulation run page counts previous messages of the same role and adds 1 to get the correct file index
- **Common mistake**: Don't use 0-based indexing for user audio files - they follow the same 1-indexed pattern as bot files
- **Full conversation audio**: The API returns a `conversation_wav_url` field containing a combined audio file of the entire conversation. This is displayed below the Transcript header (before the messages) with a "Full Conversation" label and speaker icon

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
  title: "Tools | Pense",
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

| Route                      | Layout Title                  |
| -------------------------- | ----------------------------- |
| `/agents`                  | "Agents \| Pense"             |
| `/agents/[uuid]`           | "Agent \| Pense"              |
| `/tools`                   | "Tools \| Pense"              |
| `/tests`                   | "Tests \| Pense"              |
| `/personas`                | "Personas \| Pense"           |
| `/scenarios`               | "Scenarios \| Pense"          |
| `/metrics`                 | "Metrics \| Pense"            |
| `/simulations`             | "Simulations \| Pense"        |
| `/simulations/[uuid]`      | "Simulation \| Pense"         |
| `/simulations/[uuid]/runs` | "Simulation Run \| Pense"     |
| `/stt`                     | "Speech to Text \| Pense"     |
| `/stt/[uuid]`              | "STT Evaluation \| Pense"     |
| `/stt/new`                 | "New STT Evaluation \| Pense" |
| `/tts`                     | "Text to Speech \| Pense"     |
| `/tts/[uuid]`              | "TTS Evaluation \| Pense"     |
| `/tts/new`                 | "New TTS Evaluation \| Pense" |
| `/login`                   | "Login \| Pense"              |

**useEffect for dynamic titles:**

Detail pages use `useEffect` to update titles with actual data names after loading:

```tsx
useEffect(() => {
  if (data?.name) {
    document.title = `${data.name} | Pense`;
  }
}, [data?.name]);
```

**Tab-aware titles for detail pages with tabs:**

Pages with tabs (agent detail, simulation detail) include the active tab name in the title:

| Page                               | Title Format                                                                 |
| ---------------------------------- | ---------------------------------------------------------------------------- |
| `/agents/[uuid]`                   | `<Agent Name> - <Tab Name> \| Pense` (e.g., "My Agent - Tests \| Pense")     |
| `/simulations/[uuid]`              | `<Simulation Name> - <Tab Name> \| Pense` (e.g., "My Sim - Config \| Pense") |
| `/simulations/[uuid]/runs/[runId]` | `<Run Name> \| <Simulation Name> \| Pense`                                   |

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

- **Middleware matcher**: Excludes static assets (`_next/static`, `_next/image`, `favicon.ico`, `*.svg`)
- **Protected routes**: All routes except `/login` and `/api/auth/*` require authentication
- **Session access**: Use `useSession()` in client components, `auth()` in server components
- **Token expiration**: Backend returns 401 when JWT expires; always handle this by calling `signOut({ callbackUrl: "/login" })`
- **Import pattern**: Always import both `useSession` and `signOut` from `next-auth/react` when making API calls
- **Backend token obtained at login**: The `backendAccessToken` is fetched from the backend during the JWT callback (at login time). If the backend URL was misconfigured when a user logged in, their session won't have the token. **Solution**: User must log out and log back in after fixing the backend URL.
- **Google OAuth forces account selection**: The Google provider is configured with `prompt: "select_account"` to always show the account picker, preventing auto-login with cached credentials. This ensures users consciously choose their account each login.

### Vercel Deployment

- **`NEXT_PUBLIC_*` vars are build-time**: These environment variables are embedded into client-side JavaScript at build time, not runtime. Server-side code (API routes) reads them at runtime.
- **Changing env vars requires rebuild**: After adding/changing `NEXT_PUBLIC_*` vars in Vercel, you must redeploy **without build cache** to rebuild client JS with new values.
- **Environment selection**: Vercel has Production, Preview, and Development environments. Set env vars for the correct environment (or "All").
