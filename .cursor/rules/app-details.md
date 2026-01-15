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

**Agent Detail Page** (`/agents/[uuid]`) has 5 tabs:

| Tab                 | Purpose                                                                         |
| ------------------- | ------------------------------------------------------------------------------- |
| **Agent**           | Configure system prompt, STT/TTS providers, and LLM model                       |
| **Tools**           | Attach/detach function calling tools + toggle built-in "End conversation" tool  |
| **Data Extraction** | Define fields to extract from conversations (name, type, description, required) |
| **Tests**           | Link test cases to agent, run benchmarks, view benchmark results                |
| **Settings**        | Toggle "Agent speaks first" behavior                                            |

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

**What you can do:**

- **Upload audio files** (.wav format) with reference transcriptions
- **Add multiple test samples** for batch evaluation
- **Select providers to evaluate** (compare multiple simultaneously)
- **Choose language** (English or Hindi)
- **Run evaluation** and get results:
  - **Leaderboard view** with comparative charts
  - **Per-provider metrics**: WER, String Similarity, LLM Judge Score, TTFB, Processing Time
  - **Detailed outputs** showing ground truth vs predictions
  - **LLM Judge reasoning** explaining semantic accuracy

### 4. Text-to-Speech Evaluation (`/tts`)

**What you can do:**

- **Upload text samples** to convert to speech
- **Select providers to compare**
- **Run evaluation** and compare:
  - Audio quality
  - Latency metrics
  - Provider performance

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
  - **Interruption Sensitivity**: None, Low, Medium, or High (how likely to interrupt the agent)
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

**Simulation Detail Page** (`/simulations/[uuid]`) has 2 tabs:

| Tab        | Purpose                                              |
| ---------- | ---------------------------------------------------- |
| **Config** | Select agent, personas, scenarios for the simulation |
| **Runs**   | View history of simulation runs and their results    |

**Running Simulations:**

- **Run types**: chat (text-based), audio, voice (full pipeline)
- Runs are executed asynchronously with polling for status updates
- Status: pending → in_progress → done (or failed)

**Simulation Run Results** (`/simulations/[uuid]/runs/[runId]`):

- **Overall Metrics** (aggregated across all simulations):

  - Tool calls accuracy (mean ± std)
  - Answer completeness
  - Assistant behavior
  - Question completeness

- **Per-Simulation Results Table**:

  - Persona + Scenario combination
  - Individual metric scores (Pass/Fail)
  - View transcript button
  - Audio playback (for voice simulations)

- **Transcript Dialog**:

  - Full conversation history (user, assistant, tool calls)
  - Role-based message styling
  - Tool call details with arguments

- **Latency Metrics** (for voice simulations):
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
│   │   ├── agents/            # Agent management (list + [uuid] detail)
│   │   ├── tools/             # Tools management
│   │   ├── stt/               # Speech-to-Text evaluation
│   │   ├── tts/               # Text-to-Speech evaluation
│   │   ├── tests/             # Tests page
│   │   ├── personas/          # User persona definitions
│   │   ├── scenarios/         # Test scenario definitions
│   │   ├── metrics/           # Evaluation metrics
│   │   ├── simulations/       # End-to-end simulation testing
│   │   ├── login/             # Authentication page
│   │   └── api/auth/          # NextAuth.js route handlers
│   ├── components/
│   │   ├── agent-tabs/        # Agent detail tab components
│   │   ├── evaluations/       # Evaluation UI components
│   │   ├── charts/            # Recharts visualization components
│   │   ├── providers/         # React context providers
│   │   └── simulation-tabs/   # Simulation detail components
│   ├── constants/             # Static configuration data
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

Detail pages (AgentDetail, SimulationDetail) place navigation and actions in the header bar using `customHeader` and `headerActions`:

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

### Component Patterns

1. **Tab Navigation**: Used in agent detail and simulation detail pages
   - Tabs sync with URL query param (`?tab=agent`, `?tab=tools`, etc.)
   - Use `useSearchParams` to read and `router.push` to update
2. **Sidebar Panels**: Slide-in panels for create/edit forms
   - Width: 40% of viewport, min 500px
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
5. **Toast Notifications**: Bottom-right success toasts
   - Auto-dismiss after 3 seconds
   - Manual dismiss button
   - Used after successful save operations
6. **User Profile Dropdown**: Top-right avatar button in `AppLayout` header
   - Shows user avatar (Google image or initials with purple background)
   - Dropdown contains: user info, theme switcher, logout button
   - Click outside closes dropdown (uses `useRef` + `mousedown` event)
   - Theme preference persisted to `localStorage`

### Data Fetching Pattern

- Fetch data in `useEffect` with loading/error states
- Backend URL from `process.env.NEXT_PUBLIC_BACKEND_URL`
- **All API calls require JWT authentication** via `Authorization` header
- Handle loading spinners and error states consistently
- **Handle 401 errors** by logging out and redirecting to login

```tsx
import { useSession, signOut } from "next-auth/react";

const { data: session } = useSession();
const backendAccessToken = (session as any)?.backendAccessToken;

// In useEffect - wait for token before making API calls
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
    
    // Handle 401 - logout and redirect
    if (response.status === 401) {
      await signOut({ callbackUrl: "/login" });
      return;
    }
    
    // ... handle response
  };
  
  fetchData();
}, [backendAccessToken]); // Include token in dependencies

// For POST/PUT requests
const response = await fetch(`${backendUrl}/endpoint`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${backendAccessToken}`,
    "Content-Type": "application/json",
    accept: "application/json",
    "ngrok-skip-browser-warning": "true",
  },
  body: JSON.stringify({
    name: itemName,
    // ... other fields (user_id NOT required - JWT handles authentication)
  }),
});

if (response.status === 401) {
  await signOut({ callbackUrl: "/login" });
  return;
}
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
<div className="bg-popover"> {/* for dropdowns/dialogs */}

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

```tsx
// Primary button
className =
  "h-10 px-4 rounded-md text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer";

// Secondary button
className =
  "h-10 px-4 rounded-md text-base font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer";

// Danger/Delete button
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

| Resource        | Endpoints                                                                               |
| --------------- | --------------------------------------------------------------------------------------- |
| Auth            | `POST /auth/google` (body: `{ id_token }`)                                              |
| Agents          | `GET/POST /agents`, `GET/PUT/DELETE /agents/{uuid}`, `POST /agents/{uuid}/duplicate`    |
| Agent Tools     | `GET /agent-tools/agent/{uuid}/tools`, `POST/DELETE /agent-tools`                       |
| Tools           | `GET/POST /tools`, `GET/PUT/DELETE /tools/{uuid}`                                       |
| Personas        | `GET/POST /personas`, `GET/PUT/DELETE /personas/{uuid}`                                 |
| Scenarios       | `GET/POST /scenarios`, `GET/PUT/DELETE /scenarios/{uuid}`                               |
| Metrics         | `GET/POST /metrics`, `GET/PUT/DELETE /metrics/{uuid}`, `POST /metrics/{uuid}/duplicate` |
| Simulations     | `GET/POST /simulations`, `GET/DELETE /simulations/{uuid}`                               |
| Simulation Runs | `GET /simulations/run/{runId}`, `POST /simulations/{uuid}/run`                          |
| Tests           | `GET/POST /tests`, `GET/PUT/DELETE /tests/{uuid}`                                       |
| Agent Tests     | `GET /agent-tests/agent/{uuid}/tests`, `POST/DELETE /agent-tests`                       |
| STT Evaluation  | `POST /stt/evaluate`, `GET /stt/evaluate/{taskId}`                                      |
| TTS Evaluation  | `POST /tts/evaluate`, `GET /tts/evaluate/{taskId}`                                      |
| Presigned URLs  | `POST /presigned-url`                                                                   |

### JWT Authentication

All API endpoints require JWT authentication. Include the `Authorization: Bearer ${token}` header in every request.

The backend identifies the user from the JWT token - **do not pass `user_id` in request bodies**.

---

## Common Patterns

### Loading State

```tsx
{isLoading ? (
  <div className="flex items-center justify-center gap-3 py-8">
    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  </div>
) : /* content */}
```

### Empty State

```tsx
<div className="border border-border rounded-xl p-12 flex flex-col items-center justify-center bg-muted/20">
  <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center mb-4">
    {/* Icon */}
  </div>
  <h3 className="text-lg font-semibold text-foreground mb-1">No items found</h3>
  <p className="text-base text-muted-foreground mb-4">Description</p>
  <button>Add item</button>
</div>
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

### Polling for Async Tasks

```tsx
useEffect(() => {
  let pollInterval: NodeJS.Timeout | null = null;

  const fetchData = async (isInitial = false) => {
    // ... fetch
    if (data.status === "done" && pollInterval) {
      clearInterval(pollInterval);
    }
  };

  fetchData(true);
  pollInterval = setInterval(() => fetchData(false), 3000);

  return () => {
    if (pollInterval) clearInterval(pollInterval);
  };
}, [dependency]);
```

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
6. **Icons**: Use inline SVG from Heroicons (outline style, 24x24 viewBox, strokeWidth 1.5 or 2)
7. **Error Handling**: Try-catch with console.error and user-facing error states
8. **Form Validation**: Use `validationAttempted` state to show errors only after submit attempt
9. **Optimistic Updates**: Update local state immediately, then sync with backend

---

## Gotchas & Edge Cases

### API Calls

- **JWT authentication required**: All API calls must include `Authorization: Bearer ${backendAccessToken}` header
- **401 error handling**: Always check for `response.status === 401` and call `signOut({ callbackUrl: "/login" })` to log out expired sessions
- **Wait for token**: In `useEffect` hooks, return early if `backendAccessToken` is not yet available; include it in the dependency array
- **ngrok header**: Always include `"ngrok-skip-browser-warning": "true"` header - the backend may be behind ngrok during development
- **Backend URL check**: Always check if `NEXT_PUBLIC_BACKEND_URL` is set before making API calls
- **Date formatting**: API returns ISO dates; use `toLocaleString()` for display

### State Management

- **Refs for callbacks**: Use `useRef` to hold mutable callback references (e.g., `saveRef`) when callbacks need latest state but shouldn't trigger re-renders
- **Polling cleanup**: Always clear intervals in useEffect cleanup to prevent memory leaks
- **Dialog close prevention**: Disable dialog close while async operations (delete, save) are in progress
- **Unsaved changes confirmation**: Form dialogs (like AddTestDialog) should show a confirmation dialog when user clicks backdrop, asking "Discard changes?" with Cancel/Discard buttons

### UI Patterns

- **Sortable tables**: Store both raw date (`updatedAtRaw`) for sorting and formatted date (`updatedAt`) for display
- **Search filtering**: Always use `.toLowerCase()` on both search query and target fields
- **Empty state vs no results**: Differentiate between "no items exist" and "no items match search"

### Styling

- **Never use hardcoded colors** like `bg-black`, `bg-[#1a1a1a]`, `text-white`, `border-[#333]`, `text-gray-300`, `text-gray-400`, `bg-white text-gray-900` - these break light mode
- **Always use CSS variable classes**: `bg-background`, `text-foreground`, `border-border`, `bg-muted`, `text-muted-foreground`, `bg-accent`, `bg-popover`
- **Primary buttons**: Use `bg-foreground text-background` (NOT `bg-white text-gray-900`) - inverts properly in both themes
- **Picker/dropdown components**: Components like `ToolPicker`, `AgentPicker`, `MultiSelectPicker` must use CSS variables for all colors (borders, backgrounds, text, hover states)
- **Checkboxes need visible borders**: Use `border-muted-foreground` (not `border-border`) and `border-2` for custom checkbox buttons to ensure visibility in both light and dark modes

### Forms

- **Character limits**: Implement maxLength on inputs AND display character count
- **Required fields**: Mark with red asterisk, validate on submit, highlight invalid fields
- **Nested parameters**: Tool parameters support arbitrary nesting (object → properties, array → items)

### Navigation

- **Home redirect**: Root page (`/`) redirects to `/agents`
- **Tab persistence**: Agent detail tabs persist in URL so refreshing maintains tab state
- **Back navigation**: Detail pages include back button to list view

### Authentication

- **Middleware matcher**: Excludes static assets (`_next/static`, `_next/image`, `favicon.ico`, `*.svg`)
- **Protected routes**: All routes except `/login` and `/api/auth/*` require authentication
- **Session access**: Use `useSession()` in client components, `auth()` in server components
- **Token expiration**: Backend returns 401 when JWT expires; always handle this by calling `signOut({ callbackUrl: "/login" })`
- **Import pattern**: Always import both `useSession` and `signOut` from `next-auth/react` when making API calls
