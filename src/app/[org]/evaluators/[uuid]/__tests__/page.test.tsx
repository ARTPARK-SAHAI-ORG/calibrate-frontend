/**
 * Header actions on the evaluator page.
 *
 * Covers the three controls next to the evaluator name: the pencil that opens
 * the name/description form, the "Edit" button that opens the judge prompt
 * form, and the bin that deletes the evaluator and returns to the list.
 * The page chrome and the judge model picker are stubbed so only the header
 * and its dialogs run.
 */
import React from "react";
import { render, screen, waitFor, setupUser } from "@/test-utils";

const push = jest.fn();
const back = jest.fn();

jest.mock("next/navigation", () => ({
  __esModule: true,
  useRouter: () => ({ push, replace: jest.fn(), back, prefetch: jest.fn() }),
  usePathname: () => "/evaluators/eval-1",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ uuid: "eval-1" }),
  redirect: jest.fn(),
  notFound: jest.fn(),
}));

jest.mock("../../../../../components/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useHideFloatingButton: () => {},
}));

// Reaches out to OpenRouter for the model list; not part of the header.
jest.mock("../../../../../components/agent-tabs/LLMSelectorModal", () => ({
  LLMSelectorModal: () => null,
}));

jest.mock("../../../../../hooks", () => ({
  ...jest.requireActual("../../../../../hooks"),
  useAccessToken: () => "test-token",
}));

const toastError = jest.fn();

jest.mock("sonner", () => ({
  __esModule: true,
  toast: { error: (...args: unknown[]) => toastError(...args) },
}));

const deleteEvaluator = jest.fn();
const deleteEvaluatorVersion = jest.fn();

jest.mock("../../../../../lib/evaluatorApi", () => ({
  ...jest.requireActual("../../../../../lib/evaluatorApi"),
  deleteEvaluator: (...args: unknown[]) => deleteEvaluator(...args),
  deleteEvaluatorVersion: (...args: unknown[]) =>
    deleteEvaluatorVersion(...args),
}));

import EvaluatorDetailPage from "../page";

const EVALUATOR = {
  uuid: "eval-1",
  name: "Refund policy",
  description: "Checks the reply follows the refund policy",
  data_type: "text",
  kind: "single",
  output_type: "binary",
  owner_user_id: "user-1",
  slug: null,
  live_version_id: "ver-1",
  live_version_index: 0,
  evaluator_type: "llm",
  versions: [
    {
      uuid: "ver-1",
      version_number: 1,
      judge_model: "openai/gpt-4o",
      system_prompt: "Grade the reply",
      output_config: null,
      variables: null,
      created_at: "2026-07-15T10:00:00Z",
    },
    {
      uuid: "ver-2",
      version_number: 2,
      judge_model: "anthropic/claude-sonnet-4",
      system_prompt: "Grade the reply strictly",
      output_config: null,
      variables: null,
      created_at: "2026-07-16T10:00:00Z",
    },
  ],
};

const originalFetch = global.fetch;

function mockEvaluator(overrides: Record<string, unknown> = {}) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => ({ ...EVALUATOR, ...overrides }),
  }) as unknown as typeof fetch;
}

// jsdom reports a single history entry. Most tests stand for a reader who
// arrived from another page in the app, so give them one to go back to.
function setHistoryLength(value: number) {
  Object.defineProperty(window.history, "length", {
    configurable: true,
    value,
  });
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_BACKEND_URL = "http://localhost:8000";
  setHistoryLength(2);
  window.sessionStorage.clear();
  mockEvaluator();
});

afterEach(() => {
  global.fetch = originalFetch;
  jest.clearAllMocks();
});

// Tool call correctness is answered by Calibrate and by people, never by an
// AI judge. Before this, its New version dialog still demanded a judge model,
// which cannot be picked, so the dialog could not be saved at all.
const TOOL_CALL_EVALUATOR = {
  ...EVALUATOR,
  name: "Tool call correctness",
  evaluator_type: "tool-call",
  versions: [
    {
      uuid: "ver-1",
      version_number: 1,
      judge_model: "",
      system_prompt: "",
      output_config: {
        scale: [
          { value: true, name: "Correct", description: "Right tool call." },
          { value: false, name: "Wrong", description: "Wrong tool call." },
        ],
      },
      variables: null,
      created_at: "2026-07-15T10:00:00Z",
    },
  ],
};

describe("a new version of an evaluator no AI judge runs", () => {
  it("asks for the labels only, with no prompt and no model", async () => {
    const user = setupUser();
    mockEvaluator(TOOL_CALL_EVALUATOR);
    render(<EvaluatorDetailPage />);

    await user.click(await screen.findByRole("button", { name: "Edit" }));

    expect(
      screen.getByRole("heading", { name: "New version" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Judge prompt/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Judge model/)).not.toBeInTheDocument();
    // What is left: the labels, the summary of the change, the live tick.
    expect(screen.getByDisplayValue("Correct")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Wrong")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/Briefly describe what changed/),
    ).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });

  it("saves, sending an empty prompt and model rather than leaving them off", async () => {
    const user = setupUser();
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => TOOL_CALL_EVALUATOR,
      })
      .mockResolvedValue({
        ok: true,
        status: 201,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ uuid: "ver-2" }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<EvaluatorDetailPage />);
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.click(
      screen.getByRole("button", {
        name: /Create and mark live|Create version/,
      }),
    );

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(1));
    const post = fetchMock.mock.calls.find(
      ([url, init]) =>
        typeof url === "string" &&
        url.includes("/versions") &&
        (init as RequestInit | undefined)?.method === "POST",
    );
    expect(post).toBeTruthy();
    const body = JSON.parse((post![1] as RequestInit).body as string);
    expect(body.judge_model).toBe("");
    expect(body.system_prompt).toBe("");
    expect(body.output_config.scale).toHaveLength(2);
  });
});

describe("evaluator page header actions", () => {
  it("opens the name and description form from the pencil next to the name", async () => {
    const user = setupUser();
    render(<EvaluatorDetailPage />);

    await user.click(await screen.findByTitle("Edit name and description"));

    expect(
      screen.getByRole("heading", { name: "Edit evaluator" }),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("Refund policy")).toBeInTheDocument();
  });

  it("opens the judge prompt form from the Edit button", async () => {
    const user = setupUser();
    render(<EvaluatorDetailPage />);

    await user.click(await screen.findByRole("button", { name: "Edit" }));

    expect(screen.getByText("Judge prompt")).toBeInTheDocument();
    // Seeded from the live version rather than starting blank.
    expect(screen.getByDisplayValue("Grade the reply")).toBeInTheDocument();
  });

  it("deletes the evaluator and returns to the page it was opened from", async () => {
    deleteEvaluator.mockResolvedValue(undefined);
    const user = setupUser();
    render(<EvaluatorDetailPage />);

    await user.click(await screen.findByTitle("Delete evaluator"));
    expect(
      screen.getByRole("heading", { name: "Delete evaluator" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Are you sure you want to delete "Refund policy"/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(deleteEvaluator).toHaveBeenCalledWith("eval-1", "test-token"),
    );
    // Not the evaluator list, which has no sidebar entry.
    await waitFor(() => expect(back).toHaveBeenCalled());
    expect(push).not.toHaveBeenCalled();
  });

  it("keeps the page open when the delete fails", async () => {
    deleteEvaluator.mockRejectedValue(
      new Error("Evaluator is used by 2 tests"),
    );
    const user = setupUser();
    render(<EvaluatorDetailPage />);

    await user.click(await screen.findByTitle("Delete evaluator"));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleteEvaluator).toHaveBeenCalled());
    // The reason the backend gave is shown, not swallowed.
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Evaluator is used by 2 tests"),
    );
    expect(back).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    // The confirmation stays up so the reader can try again.
    expect(
      screen.getByRole("heading", { name: "Delete evaluator" }),
    ).toBeInTheDocument();
  });
});

describe("the versions and the one on screen", () => {
  it("opens on the current version and shows only its details", async () => {
    render(<EvaluatorDetailPage />);

    // v1 is the current one, so its prompt is what the reader sees.
    expect(await screen.findByText("Grade the reply")).toBeInTheDocument();
    expect(screen.queryByText("Grade the reply strictly")).toBeNull();
    // Both versions are listed to switch between.
    expect(screen.getByRole("button", { name: /^v1/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^v2/ })).toBeInTheDocument();
  });

  it("shows a version's details when it is picked from the list", async () => {
    const user = setupUser();
    render(<EvaluatorDetailPage />);

    await user.click(await screen.findByRole("button", { name: /^v2/ }));

    expect(screen.getByText("Grade the reply strictly")).toBeInTheDocument();
    expect(screen.queryByText("Grade the reply")).toBeNull();
    // The version that is not current can be made current from its details.
    expect(
      screen.getByRole("button", { name: "Mark as current" }),
    ).toBeInTheDocument();
  });

  it("starts the judge prompt form from the version whose Edit was used", async () => {
    const user = setupUser();
    render(<EvaluatorDetailPage />);

    // v2 is not the current version, so its prompt is not on screen yet.
    await user.click(await screen.findByTitle("Edit, starting from v2"));

    // The form is seeded from v2, not from the current version.
    expect(
      screen.getByDisplayValue("Grade the reply strictly"),
    ).toBeInTheDocument();
  });

  it("makes a version the current one from its own row", async () => {
    const user = setupUser();
    render(<EvaluatorDetailPage />);

    // Only the version that is not current offers this.
    const markButtons = await screen.findAllByTitle("Mark as current");
    expect(markButtons).toHaveLength(1);

    await user.click(markButtons[0]);

    await waitFor(() =>
      expect(
        (global.fetch as jest.Mock).mock.calls.some(
          ([url, init]) =>
            String(url).endsWith("/evaluators/eval-1/versions/live") &&
            JSON.parse(String(init.body)).version_uuid === "ver-2",
        ),
      ).toBe(true),
    );
  });

  it("opens on the newest version when none is marked current", async () => {
    mockEvaluator({ live_version_id: null, live_version_index: null });
    render(<EvaluatorDetailPage />);

    expect(
      await screen.findByText("Grade the reply strictly"),
    ).toBeInTheDocument();
  });
});

describe("deleting a version", () => {
  it("offers the bin only on versions that are not the current one", async () => {
    render(<EvaluatorDetailPage />);

    const bins = await screen.findAllByTitle(/^Delete v/);
    expect(bins).toHaveLength(1);
    expect(bins[0]).toHaveAttribute("title", "Delete v2");
  });

  it("deletes the version and takes it off the list", async () => {
    const user = setupUser();
    deleteEvaluatorVersion.mockResolvedValue(undefined);
    render(<EvaluatorDetailPage />);

    await user.click(await screen.findByTitle("Delete v2"));
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(deleteEvaluatorVersion).toHaveBeenCalledWith(
        "eval-1",
        "ver-2",
        "test-token",
      ),
    );
    await waitFor(() =>
      expect(screen.queryByTitle("Delete v2")).not.toBeInTheDocument(),
    );
    // The details fall back to the current version.
    expect(screen.getByText("Grade the reply")).toBeInTheDocument();
  });

  it("says why when the version cannot be deleted", async () => {
    const user = setupUser();
    deleteEvaluatorVersion.mockRejectedValue(
      new Error(
        "Cannot delete the live version. Set another version live first.",
      ),
    );
    render(<EvaluatorDetailPage />);

    await user.click(await screen.findByTitle("Delete v2"));
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "Cannot delete the live version. Set another version live first.",
      ),
    );
    expect(screen.getByTitle("Delete v2")).toBeInTheDocument();
  });
});

describe("getting back out of the page", () => {
  it("goes back to wherever the reader came from", async () => {
    const user = setupUser();
    render(<EvaluatorDetailPage />);

    await user.click(await screen.findByRole("button", { name: "Back" }));

    expect(back).toHaveBeenCalled();
    // The evaluator list has no sidebar entry, so the page never links to it.
    expect(screen.queryByRole("link", { name: "Evaluators" })).toBeNull();
  });
});

describe("deleting with nowhere to go back to", () => {
  it("leaves the page instead of stranding the reader in the confirmation", async () => {
    // A tab opened straight on this address has no earlier page.
    setHistoryLength(1);
    deleteEvaluator.mockResolvedValue(undefined);
    const user = setupUser();
    render(<EvaluatorDetailPage />);

    await user.click(await screen.findByTitle("Delete evaluator"));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/agents"));
    expect(back).not.toHaveBeenCalled();
  });
});

describe("after creating a version", () => {
  it("shows the version that was just created, even when it is not made current", async () => {
    const user = setupUser();
    const withV3 = {
      ...EVALUATOR,
      // v1 stays the current one: the tick box was unticked.
      versions: [
        ...EVALUATOR.versions,
        {
          uuid: "ver-3",
          version_number: 3,
          judge_model: "openai/gpt-4o",
          system_prompt: "Grade the reply gently",
          output_config: null,
          variables: null,
          created_at: "2026-07-17T10:00:00Z",
        },
      ],
    };
    // First load, then the POST, then the reload that follows it.
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => EVALUATOR,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ uuid: "ver-3" }),
      })
      .mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => withV3,
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<EvaluatorDetailPage />);

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Create version" }));

    // The new v3 is on screen, not the current v1.
    expect(
      await screen.findByText("Grade the reply gently"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Grade the reply strictly")).toBeNull();
  });
});
