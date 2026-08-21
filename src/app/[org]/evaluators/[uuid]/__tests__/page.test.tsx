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

const deleteEvaluator = jest.fn();

jest.mock("../../../../../lib/evaluatorApi", () => ({
  ...jest.requireActual("../../../../../lib/evaluatorApi"),
  deleteEvaluator: (...args: unknown[]) => deleteEvaluator(...args),
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

beforeEach(() => {
  process.env.NEXT_PUBLIC_BACKEND_URL = "http://localhost:8000";
  window.sessionStorage.clear();
  mockEvaluator();
});

afterEach(() => {
  global.fetch = originalFetch;
  jest.clearAllMocks();
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
    deleteEvaluator.mockRejectedValue(new Error("Failed to delete evaluator"));
    const user = setupUser();
    render(<EvaluatorDetailPage />);

    await user.click(await screen.findByTitle("Delete evaluator"));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleteEvaluator).toHaveBeenCalled());
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
