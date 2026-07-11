import { render, screen, setupUser, waitFor } from "@/test-utils";
import { SimulationRunsTab } from "../SimulationRunsTab";
import { signOut } from "next-auth/react";

jest.mock("../../../lib/reportError", () => ({
  reportError: jest.fn(),
}));

jest.mock("../../../hooks", () => ({
  useAccessToken: jest.fn(() => "tok"),
}));

const { useAccessToken } = jest.requireMock("../../../hooks") as {
  useAccessToken: jest.Mock;
};
const mockSignOut = signOut as jest.Mock;

function jsonResponse(body: unknown, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as Response;
}

describe("SimulationRunsTab", () => {
  const originalBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
  let fetchMock: jest.Mock;
  let reloadSpy: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    useAccessToken.mockReturnValue("tok");
    process.env.NEXT_PUBLIC_BACKEND_URL = "https://backend.example.com";
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    reloadSpy = jest.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload: reloadSpy },
    });
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_BACKEND_URL = originalBackendUrl;
  });

  it("does not fetch when there is no access token yet", () => {
    useAccessToken.mockReturnValue(null);
    render(<SimulationRunsTab simulationUuid="sim-1" />);
    expect(fetchMock).not.toHaveBeenCalled();
    // Stays in the initial loading state.
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("shows an error state when the backend URL is not set", async () => {
    delete process.env.NEXT_PUBLIC_BACKEND_URL;
    render(<SimulationRunsTab simulationUuid="sim-1" />);

    expect(
      await screen.findByText("BACKEND_URL environment variable is not set"),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches runs and renders the empty state", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ runs: [] }));
    render(<SimulationRunsTab simulationUuid="sim-1" />);

    expect(await screen.findByText("No runs yet")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://backend.example.com/simulations/sim-1/runs",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      }),
    );
  });

  it("treats a missing runs field in the payload as an empty list", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    render(<SimulationRunsTab simulationUuid="sim-1" />);
    expect(await screen.findByText("No runs yet")).toBeInTheDocument();
  });

  it("signs out and redirects on a 401 response", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 401));
    mockSignOut.mockResolvedValueOnce(undefined);
    render(<SimulationRunsTab simulationUuid="sim-1" />);

    await waitFor(() =>
      expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: "/login" }),
    );
  });

  it("shows an error state with a retry button on a non-ok response, and reloads on retry", async () => {
    const user = setupUser();
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 500));
    render(<SimulationRunsTab simulationUuid="sim-1" />);

    expect(await screen.findByText("Failed to fetch runs")).toBeInTheDocument();
    await user.click(screen.getByText("Retry"));
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it("shows a generic error message when fetch rejects with a non-Error", async () => {
    fetchMock.mockRejectedValueOnce("network down");
    render(<SimulationRunsTab simulationUuid="sim-1" />);
    expect(await screen.findByText("Failed to load runs")).toBeInTheDocument();
  });

  it("shows the Error message when fetch rejects with an Error instance", async () => {
    fetchMock.mockRejectedValueOnce(new Error("boom"));
    render(<SimulationRunsTab simulationUuid="sim-1" />);
    expect(await screen.findByText("boom")).toBeInTheDocument();
  });

  it("renders run rows sorted by created_at descending by default, with status/type badges and links", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        runs: [
          {
            uuid: "r1",
            name: "Run One",
            status: "done",
            type: "text",
            created_at: "2024-01-01 10:00:00",
          },
          {
            uuid: "r2",
            name: "Run Two",
            status: "in_progress",
            type: "audio",
            created_at: "2024-02-01 10:00:00",
          },
        ],
      }),
    );
    render(<SimulationRunsTab simulationUuid="sim-1" />);

    expect(await screen.findByText("2 runs")).toBeInTheDocument();

    const links = screen.getAllByRole("link");
    // Desktop + mobile render duplicate links; the first row (desktop) should
    // be the more recent run since default sort is descending.
    expect(links[0]).toHaveAttribute(
      "href",
      "/simulations/sim-1/runs/r2",
    );
    expect(screen.getAllByText("Done").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Running").length).toBeGreaterThan(0);
    expect(screen.getAllByText("text").length).toBeGreaterThan(0);
    expect(screen.getAllByText("audio").length).toBeGreaterThan(0);
  });

  it("renders singular 'run' label when there is exactly one run", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        runs: [
          {
            uuid: "r1",
            name: "Solo Run",
            status: "queued",
            type: "voice",
            created_at: "2024-01-01 10:00:00",
          },
        ],
      }),
    );
    render(<SimulationRunsTab simulationUuid="sim-1" />);
    expect(await screen.findByText("1 run")).toBeInTheDocument();
    // "voice" falls into the audio badge class but renders its own label text.
    expect(screen.getAllByText("voice").length).toBeGreaterThan(0);
  });

  it("falls back to an unknown-type badge class for an unrecognized type", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        runs: [
          {
            uuid: "r1",
            name: "Weird Run",
            status: "mystery",
            type: "weird" as any,
            created_at: "2024-01-01 10:00:00",
          },
        ],
      }),
    );
    render(<SimulationRunsTab simulationUuid="sim-1" />);
    expect(await screen.findByText("1 run")).toBeInTheDocument();
    expect(screen.getAllByText("weird").length).toBeGreaterThan(0);
    // Unrecognized status falls through formatStatus's default (returns as-is).
    expect(screen.getAllByText("mystery").length).toBeGreaterThan(0);
  });

  it("falls back to updated_at when created_at is missing, and shows '-' when both are absent/invalid", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        runs: [
          {
            uuid: "r1",
            name: "Run With Updated Only",
            status: "done",
            type: "text",
            updated_at: "2024-03-01 10:00:00",
          },
          {
            uuid: "r2",
            name: "Run With Neither Date",
            status: "done",
            type: "text",
          },
        ],
      }),
    );
    render(<SimulationRunsTab simulationUuid="sim-1" />);
    expect(await screen.findByText("2 runs")).toBeInTheDocument();
    expect(screen.getAllByText("-").length).toBeGreaterThan(0);
  });

  it("toggles sort order via the desktop 'Created At' header button", async () => {
    const user = setupUser();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        runs: [
          {
            uuid: "r1",
            name: "Older Run",
            status: "done",
            type: "text",
            created_at: "2024-01-01 10:00:00",
          },
          {
            uuid: "r2",
            name: "Newer Run",
            status: "done",
            type: "text",
            created_at: "2024-02-01 10:00:00",
          },
        ],
      }),
    );
    render(<SimulationRunsTab simulationUuid="sim-1" />);
    await screen.findByText("2 runs");

    // Default: descending -> newest run first.
    let links = screen.getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/simulations/sim-1/runs/r2");

    await user.click(screen.getByText("Created At"));

    links = screen.getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/simulations/sim-1/runs/r1");
  });

  it("toggles sort order via the mobile 'Sort by date' button", async () => {
    const user = setupUser();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        runs: [
          {
            uuid: "r1",
            name: "Older Run",
            status: "done",
            type: "text",
            created_at: "2024-01-01 10:00:00",
          },
          {
            uuid: "r2",
            name: "Newer Run",
            status: "done",
            type: "text",
            created_at: "2024-02-01 10:00:00",
          },
        ],
      }),
    );
    render(<SimulationRunsTab simulationUuid="sim-1" />);
    await screen.findByText("2 runs");

    await user.click(screen.getByText("Sort by date"));

    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/simulations/sim-1/runs/r1");
  });

  it("falls back to string comparison when a date is invalid", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        runs: [
          {
            uuid: "r1",
            name: "Valid Date Run",
            status: "done",
            type: "text",
            created_at: "2024-01-01 10:00:00",
          },
          {
            uuid: "r2",
            name: "Invalid Date Run",
            status: "done",
            type: "text",
            created_at: "not-a-date",
          },
        ],
      }),
    );
    render(<SimulationRunsTab simulationUuid="sim-1" />);
    expect(await screen.findByText("2 runs")).toBeInTheDocument();
    // Doesn't crash and still renders both rows.
    expect(screen.getAllByText("Valid Date Run").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Invalid Date Run").length).toBeGreaterThan(0);
  });

  it("falls back to string comparison in ascending order too, when a date is invalid", async () => {
    const user = setupUser();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        runs: [
          {
            uuid: "r1",
            name: "Valid Date Run",
            status: "done",
            type: "text",
            created_at: "2024-01-01 10:00:00",
          },
          {
            uuid: "r2",
            name: "Invalid Date Run",
            status: "done",
            type: "text",
            created_at: "not-a-date",
          },
        ],
      }),
    );
    render(<SimulationRunsTab simulationUuid="sim-1" />);
    await screen.findByText("2 runs");

    await user.click(screen.getByText("Created At"));

    expect(screen.getAllByText("Valid Date Run").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Invalid Date Run").length).toBeGreaterThan(0);
  });

  it("toggles sort order back and forth (asc -> desc -> asc)", async () => {
    const user = setupUser();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        runs: [
          {
            uuid: "r1",
            name: "Older Run",
            status: "done",
            type: "text",
            created_at: "2024-01-01 10:00:00",
          },
          {
            uuid: "r2",
            name: "Newer Run",
            status: "done",
            type: "text",
            created_at: "2024-02-01 10:00:00",
          },
        ],
      }),
    );
    render(<SimulationRunsTab simulationUuid="sim-1" />);
    await screen.findByText("2 runs");

    const header = screen.getByText("Created At");
    await user.click(header); // desc -> asc
    let links = screen.getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/simulations/sim-1/runs/r1");

    await user.click(header); // asc -> desc
    links = screen.getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/simulations/sim-1/runs/r2");
  });

  it("sorts a mix of runs with created_at, only updated_at, and neither date", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        runs: [
          {
            uuid: "r1",
            name: "Has Created At",
            status: "done",
            type: "text",
            created_at: "2024-01-01 10:00:00",
          },
          {
            uuid: "r2",
            name: "Has Updated At Only",
            status: "done",
            type: "text",
            updated_at: "2024-02-01 10:00:00",
          },
          {
            uuid: "r3",
            name: "Has Neither Date",
            status: "done",
            type: "text",
          },
        ],
      }),
    );
    render(<SimulationRunsTab simulationUuid="sim-1" />);
    expect(await screen.findByText("3 runs")).toBeInTheDocument();
    expect(screen.getAllByText("Has Created At").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Has Updated At Only").length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("Has Neither Date").length).toBeGreaterThan(0);
  });

  it("refetches when simulationUuid changes", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ runs: [] }));
    const { rerender } = render(<SimulationRunsTab simulationUuid="sim-1" />);
    await screen.findByText("No runs yet");

    rerender(<SimulationRunsTab simulationUuid="sim-2" />);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "https://backend.example.com/simulations/sim-2/runs",
        expect.anything(),
      ),
    );
  });
});
