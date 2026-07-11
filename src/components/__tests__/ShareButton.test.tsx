import { render, screen, setupUser, waitFor, fireEvent, act } from "@/test-utils";
import { ShareButton } from "../ShareButton";

jest.mock("../../lib/clipboard", () => ({
  copyToClipboard: jest.fn().mockResolvedValue(undefined),
}));

import { copyToClipboard } from "../../lib/clipboard";

const OLD_ENV = process.env.NEXT_PUBLIC_BACKEND_URL;

function mockFetchOnce(response: unknown, ok = true) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    json: async () => response,
  });
}

describe("ShareButton", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_BACKEND_URL = "https://api.example.com";
    jest.useRealTimers();
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_BACKEND_URL = OLD_ENV;
    // @ts-expect-error cleanup test-only global
    delete global.fetch;
    jest.clearAllMocks();
  });

  it("renders private state with Share label and lock icon tooltip", async () => {
    const user = setupUser();
    render(
      <ShareButton
        entityType="stt"
        entityId="abc"
        accessToken="tok"
        initialIsPublic={false}
        initialShareToken={null}
      />,
    );
    const button = screen.getByRole("button", { name: /Share/ });
    expect(button).toBeInTheDocument();
    expect(screen.queryByText("Copy link")).not.toBeInTheDocument();

    await user.hover(button);
    expect(
      await screen.findByText("Make this publicly shareable"),
    ).toBeInTheDocument();
  });

  it("renders public state with the copy-link button and globe tooltip", async () => {
    const user = setupUser();
    render(
      <ShareButton
        entityType="tts"
        entityId="abc"
        accessToken="tok"
        initialIsPublic={true}
        initialShareToken="share123"
      />,
    );
    expect(screen.getByRole("button", { name: "Public" })).toBeInTheDocument();
    expect(screen.getByText("Copy link")).toBeInTheDocument();

    await user.hover(screen.getByRole("button", { name: "Public" }));
    expect(await screen.findByText("Make this private")).toBeInTheDocument();
  });

  it("toggles from private to public, calling the visibility endpoint and updating state", async () => {
    const user = setupUser();
    mockFetchOnce({ is_public: true, share_token: "newtoken" });

    render(
      <ShareButton
        entityType="test-run"
        entityId="run-1"
        accessToken="tok"
        initialIsPublic={false}
        initialShareToken={null}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Share/ }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Public" })).toBeInTheDocument(),
    );
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.example.com/agent-tests/run/run-1/visibility",
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
        body: JSON.stringify({ is_public: true }),
      }),
    );
    expect(screen.getByText("Copy link")).toBeInTheDocument();
  });

  it("accepts view_token as a fallback for share_token", async () => {
    const user = setupUser();
    mockFetchOnce({ is_public: true, view_token: "viewtok" });

    render(
      <ShareButton
        entityType="annotation-job"
        entityId="task1:job2"
        accessToken="tok"
        initialIsPublic={false}
        initialShareToken={null}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Share/ }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.example.com/annotation-tasks/task1/jobs/job2/visibility",
        expect.anything(),
      ),
    );
    await waitFor(() => expect(screen.getByText("Copy link")).toBeInTheDocument());
  });

  it("routes annotation-evaluator-run composite ids to the evaluator-runs endpoint", async () => {
    const user = setupUser();
    mockFetchOnce({ is_public: true, share_token: "t" });

    render(
      <ShareButton
        entityType="annotation-evaluator-run"
        entityId="task9:job9"
        accessToken="tok"
        initialIsPublic={false}
        initialShareToken={null}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Share/ }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.example.com/annotation-tasks/task9/evaluator-runs/job9/visibility",
        expect.anything(),
      ),
    );
  });

  it("routes benchmark and simulation-run entity types correctly", async () => {
    const user = setupUser();
    mockFetchOnce({ is_public: true, share_token: "t" });
    const { unmount } = render(
      <ShareButton
        entityType="benchmark"
        entityId="b1"
        accessToken="tok"
        initialIsPublic={false}
        initialShareToken={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Share/ }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.example.com/agent-tests/benchmark/b1/visibility",
        expect.anything(),
      ),
    );
    unmount();

    mockFetchOnce({ is_public: true, share_token: "t" });
    render(
      <ShareButton
        entityType="simulation-run"
        entityId="s1"
        accessToken="tok"
        initialIsPublic={false}
        initialShareToken={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Share/ }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.example.com/simulations/run/s1/visibility",
        expect.anything(),
      ),
    );
  });

  it("shows an error message when the PATCH response is not ok", async () => {
    const user = setupUser();
    mockFetchOnce({}, false);

    render(
      <ShareButton
        entityType="stt"
        entityId="abc"
        accessToken="tok"
        initialIsPublic={false}
        initialShareToken={null}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Share/ }));
    expect(await screen.findByText("Failed to update visibility")).toBeInTheDocument();
  });

  it("shows a generic error message when fetch throws a non-Error value", async () => {
    const user = setupUser();
    global.fetch = jest.fn().mockRejectedValue("boom");

    render(
      <ShareButton
        entityType="stt"
        entityId="abc"
        accessToken="tok"
        initialIsPublic={false}
        initialShareToken={null}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Share/ }));
    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
  });

  it("shows a 'Backend URL not configured' error when the env var is missing", async () => {
    const user = setupUser();
    delete process.env.NEXT_PUBLIC_BACKEND_URL;

    render(
      <ShareButton
        entityType="stt"
        entityId="abc"
        accessToken="tok"
        initialIsPublic={false}
        initialShareToken={null}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Share/ }));
    expect(await screen.findByText("Backend URL not configured")).toBeInTheDocument();
  });

  it("copies the public link and shows the copied state, reverting after a timeout", async () => {
    jest.useFakeTimers();

    render(
      <ShareButton
        entityType="tts"
        entityId="abc"
        accessToken="tok"
        initialIsPublic={true}
        initialShareToken="share123"
      />,
    );

    fireEvent.click(screen.getByText("Copy link"));
    expect(copyToClipboard).toHaveBeenCalledWith(
      `${window.location.origin}/public/tts/share123`,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("Copied")).toBeInTheDocument();

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.getByText("Copy link")).toBeInTheDocument();
  });

  it("re-syncs internal state when initialIsPublic/initialShareToken props change", () => {
    const { rerender } = render(
      <ShareButton
        entityType="stt"
        entityId="abc"
        accessToken="tok"
        initialIsPublic={false}
        initialShareToken={null}
      />,
    );
    expect(screen.getByRole("button", { name: /Share/ })).toBeInTheDocument();

    rerender(
      <ShareButton
        entityType="stt"
        entityId="abc"
        accessToken="tok"
        initialIsPublic={true}
        initialShareToken="synced-token"
      />,
    );

    expect(screen.getByRole("button", { name: "Public" })).toBeInTheDocument();
    expect(screen.getByText("Copy link")).toBeInTheDocument();
  });

  it("clears the share token when the response omits both share_token and view_token", async () => {
    const user = setupUser();
    mockFetchOnce({ is_public: true });

    render(
      <ShareButton
        entityType="stt"
        entityId="abc"
        accessToken="tok"
        initialIsPublic={false}
        initialShareToken={null}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Share/ }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Public" })).toBeInTheDocument(),
    );
    expect(screen.queryByText("Copy link")).not.toBeInTheDocument();
  });

  it("does not render Copy link when public but shareToken is null", () => {
    render(
      <ShareButton
        entityType="stt"
        entityId="abc"
        accessToken="tok"
        initialIsPublic={true}
        initialShareToken={null}
      />,
    );
    expect(screen.queryByText("Copy link")).not.toBeInTheDocument();
  });
});
