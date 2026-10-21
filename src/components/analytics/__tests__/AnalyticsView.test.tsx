import React from "react";
import { render, screen, fireEvent, setupUser, waitFor, within } from "@/test-utils";
import { AnalyticsView, resolveRange } from "../AnalyticsView";
import { daysAgoStart, formatWhen, toDateInput } from "../format";
import { shortDay, useChartTheme } from "../ActivityChart";
import { act, renderHook } from "@testing-library/react";
import { fetchAnalytics, type AnalyticsActivity, type AnalyticsResponse } from "@/lib/analyticsApi";

jest.mock("../../../lib/analyticsApi", () => ({
  ...jest.requireActual("../../../lib/analyticsApi"),
  fetchAnalytics: jest.fn(),
  fetchSuperadmins: jest.fn(() => Promise.resolve([])),
}));
jest.mock("../../../lib/reportError", () => ({ reportError: jest.fn() }));

const mockFetch = fetchAnalytics as jest.MockedFunction<typeof fetchAnalytics>;

function activity(over: Partial<AnalyticsActivity> = {}): AnalyticsActivity {
  return {
    new_users: 0,
    active_workspaces: 0,
    evaluations: 0,
    failed_evaluations: 0,
    test_runs: 0,
    model_comparisons: 0,
    simulations: 0,
    stt: 0,
    tts: 0,
    labelling_evaluator_runs: 0,
    cost: null,
    traces_received: 0,
    traces_scored: 0,
    labelling_jobs_finished: 0,
    labels_collected: 0,
    items_labelled: 0,
    limit_hits: 0,
    ...over,
  };
}

function workspace(name: string, over: Record<string, unknown> = {}) {
  return {
    org_uuid: `org-${name}`,
    name,
    is_personal: false,
    members: 1,
    last_active_at: "2026-10-01 10:00:00",
    ...activity(),
    ...over,
  } as AnalyticsResponse["workspaces"][number];
}

function response(over: Partial<AnalyticsResponse> = {}): AnalyticsResponse {
  return {
    totals: { users: 214, workspaces: 88, evaluations_running: 4 },
    activity: activity({
      new_users: 15,
      failed_evaluations: 6,
      limit_hits: 2,
      evaluations: 40,
      cost: 12.5,
    }),
    previous: activity({
      new_users: 10,
      failed_evaluations: 4,
      limit_hits: 4,
      evaluations: 40,
    }),
    per_day: [
      { date: "2026-10-01", ...activity({ test_runs: 3 }) } as unknown as AnalyticsResponse["per_day"][number],
    ],
    workspaces: [
      workspace("Alpha", { evaluations: 5, members: 9 }),
      workspace("Beta", { evaluations: 20, members: 2 }),
      workspace("Gamma", { evaluations: 10, members: 4 }),
    ],
    failures: [
      {
        id: "f1",
        created_at: "2026-10-02T08:00:00Z",
        org_uuid: "org-Alpha",
        org_name: "Alpha",
        kind: "test_run",
        error: "first line\nsecond line of the error",
      },
      {
        id: "f2",
        created_at: "2026-10-03T08:00:00Z",
        org_uuid: "org-Beta",
        org_name: "Beta",
        kind: "stt",
        error: null,
      },
    ],
    failures_total: 2,
    limit_hits: [
      {
        created_at: "2026-10-04T08:00:00Z",
        org_uuid: "org-Beta",
        org_name: "Beta",
        limit_name: "max_rows_per_eval",
        kind: "simulation",
        requested: 600,
        cap: 500,
      },
    ],
    limit_hits_total: 1,
    ...over,
  };
}

const card = (label: string) => screen.getByText(label, { selector: "p" }).parentElement!;

beforeEach(() => mockFetch.mockReset());

describe("AnalyticsView", () => {
  it("shows the totals and the activity cards with their change", async () => {
    mockFetch.mockResolvedValue(response());
    render(<AnalyticsView accessToken="t" />);

    expect(await screen.findByText("214")).toBeInTheDocument();
    expect(within(card("Total workspaces")).getByText("88")).toBeInTheDocument();
    expect(within(card("Evaluations running now")).getByText("4")).toBeInTheDocument();

    const newUsers = within(card("New users")).getByText("+50% vs previous 30 days");
    expect(newUsers).toHaveClass("text-green-600");
    // More failures is bad news.
    const failed = within(card("Failed evaluations")).getByText("+50% vs previous 30 days");
    expect(failed).toHaveClass("text-red-600");
    // Fewer limit hits is good news.
    const hits = within(card("Limit hits")).getByText("-50% vs previous 30 days");
    expect(hits).toHaveClass("text-green-600");
    expect(within(card("All evaluations")).getByText("No change vs previous 30 days")).toBeInTheDocument();
    // Nothing to compare against: no line.
    expect(within(card("Traces received")).queryByText(/vs previous/)).toBeNull();
    expect(within(card("Cost")).getByText("$12.50")).toBeInTheDocument();
    expect(within(card("Cost")).getByText("Test runs and model comparisons only")).toBeInTheDocument();

    const today = toDateInput(new Date());
    expect(mockFetch).toHaveBeenCalledWith("t", {
      start: daysAgoStart(30, new Date()),
      end: today,
      tzOffsetMinutes: -new Date().getTimezoneOffset(),
    });
  });

  it("drops the change line for all time", async () => {
    mockFetch.mockResolvedValue(response());
    render(<AnalyticsView accessToken="t" />);
    await screen.findByText("214");

    // Even if a previous period came back, all time has nothing before it.
    fireEvent.change(screen.getByLabelText("Dates"), { target: { value: "all" } });
    await waitFor(() =>
      expect(mockFetch).toHaveBeenLastCalledWith("t", expect.objectContaining({ start: undefined })),
    );
    await waitFor(() => expect(screen.queryByText(/vs previous/)).toBeNull());
  });

  it("drops the change line when previous is null even for a preset", async () => {
    mockFetch.mockResolvedValue(response({ previous: null }));
    render(<AnalyticsView accessToken="t" />);
    await screen.findByText("214");
    expect(screen.queryByText(/vs previous/)).toBeNull();
  });

  it("says vs previous period for custom dates, blocks an end before the start, and clamps a future end", async () => {
    mockFetch.mockResolvedValue(response());
    render(<AnalyticsView accessToken="t" />);
    await screen.findByText("214");

    fireEvent.change(screen.getByLabelText("Dates"), { target: { value: "custom" } });
    expect(await screen.findAllByText("+50% vs previous period")).not.toHaveLength(0);

    const calls = mockFetch.mock.calls.length;
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-05-10" } });
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2026-05-01" } });
    expect(screen.getByText("The end date is before the start date")).toBeInTheDocument();
    const callsAfterError = mockFetch.mock.calls.length;
    // Only the start-date change fetched; the bad end date did not.
    expect(callsAfterError).toBe(calls + 1);

    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2999-01-01" } });
    const today = toDateInput(new Date());
    expect(screen.getByLabelText("End date")).toHaveValue(today);
    await waitFor(() =>
      expect(mockFetch).toHaveBeenLastCalledWith("t", expect.objectContaining({ start: "2026-05-10", end: today })),
    );
    expect(screen.queryByText("The end date is before the start date")).toBeNull();
  });

  it("shows a spinner while loading", () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    const { container } = render(<AnalyticsView accessToken="t" />);
    expect(container.querySelector(".animate-spin")).not.toBeNull();
    expect(screen.queryByText("Total users")).toBeNull();
  });

  it("shows an error with a retry that loads again", async () => {
    const user = setupUser();
    mockFetch.mockRejectedValueOnce(new Error("Request failed: 500 - boom"));
    mockFetch.mockResolvedValueOnce(response());
    render(<AnalyticsView accessToken="t" />);

    expect(await screen.findByText("The analytics could not be loaded")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("214")).toBeInTheDocument();
  });

  it("tells someone who is not the admin that the page is not for them", async () => {
    mockFetch.mockRejectedValue(new Error("Request failed: 403 - forbidden"));
    render(<AnalyticsView accessToken="t" />);
    expect(await screen.findByText("This page is only for Calibrate superadmins")).toBeInTheDocument();
    expect(screen.queryByText("Analytics")).toBeNull();
  });

  it("switches the chart between views and says when nothing happened", async () => {
    const user = setupUser();
    mockFetch.mockResolvedValue(response());
    render(<AnalyticsView accessToken="t" />);
    expect(await screen.findByText("Evaluations per day")).toBeInTheDocument();
    expect(screen.queryByText("Nothing happened in these dates")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Traces" }));
    expect(screen.getByText("Traces per day")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Traces" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Evaluations" })).toHaveAttribute("aria-pressed", "false");
    // The only day had test runs, no traces.
    expect(screen.getByText("Nothing happened in these dates")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Labelling" }));
    expect(screen.getByText("Labelling per day")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Users" }));
    expect(screen.getByText("Workspaces and users per day")).toBeInTheDocument();
  });

  it("sorts the workspaces table both ways", async () => {
    const user = setupUser();
    mockFetch.mockResolvedValue(response());
    render(<AnalyticsView accessToken="t" />);
    await screen.findByText("214");

    const table = screen.getByRole("table");
    const names = () =>
      within(table)
        .getAllByRole("row")
        .slice(1)
        .map((r) => within(r).getAllByRole("cell")[0].textContent);

    expect(names()).toEqual(["Beta", "Gamma", "Alpha"]);
    await user.click(within(table).getByRole("button", { name: /All evaluations/ }));
    expect(names()).toEqual(["Alpha", "Gamma", "Beta"]);
    await user.click(within(table).getByRole("button", { name: /^Members/ }));
    expect(names()).toEqual(["Alpha", "Gamma", "Beta"]);
    await user.click(within(table).getByRole("button", { name: /^Members/ }));
    expect(names()).toEqual(["Beta", "Gamma", "Alpha"]);
    await user.click(within(table).getByRole("button", { name: /^Workspace/ }));
    expect(names()).toEqual(["Gamma", "Beta", "Alpha"]);
  });

  it("filters the failed evaluations and expands a row", async () => {
    const user = setupUser();
    mockFetch.mockResolvedValue(response());
    render(<AnalyticsView accessToken="t" />);
    await screen.findByText("214");

    const row = screen.getByText(/first line/).closest("[role=button]")!;
    expect(row).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText(/first line/)).toHaveClass("truncate");
    await user.click(row);
    expect(row).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/first line/)).toHaveClass("whitespace-pre-wrap");

    expect(screen.getByText("No details were recorded")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "test_run" } });
    expect(screen.queryByText("No details were recorded")).toBeNull();
    expect(screen.getByText(/first line/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Workspace"), { target: { value: "org-Beta" } });
    expect(screen.getByText("No failed evaluations match these filters")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "" } });
    expect(screen.getByText("No details were recorded")).toBeInTheDocument();
    expect(screen.queryByText(/first line/)).toBeNull();
  });

  it("names limit hits in plain words and says when only the latest are shown", async () => {
    mockFetch.mockResolvedValue(response({ failures_total: 96 + 100, limit_hits_total: 1 }));
    render(<AnalyticsView accessToken="t" />);
    await screen.findByText("214");

    expect(screen.getByText("Too many rows in one evaluation")).toBeInTheDocument();
    expect(screen.getByText("600")).toBeInTheDocument();
    expect(screen.getByText("500")).toBeInTheDocument();
    // Two failures held out of 196: the note shows once, for failures only.
    expect(screen.getAllByText("Showing the latest 2")).toHaveLength(1);
  });
});

describe("AnalyticsView edge cases", () => {
  it("keeps the totals when a later date change fails", async () => {
    mockFetch.mockResolvedValueOnce(response());
    mockFetch.mockRejectedValueOnce(new Error("Request failed: 500 - boom"));
    render(<AnalyticsView accessToken="t" />);
    await screen.findByText("214");
    fireEvent.change(screen.getByLabelText("Dates"), { target: { value: "7" } });
    expect(await screen.findByText("The analytics could not be loaded")).toBeInTheDocument();
    expect(screen.getByText("214")).toBeInTheDocument();
    expect(screen.queryByText("Evaluations per day")).toBeNull();
  });

  it("opens a failure from the keyboard, shows unknown limit numbers, and an empty workspace list", async () => {
    const user = setupUser();
    mockFetch.mockResolvedValue(
      response({
        workspaces: [],
        limit_hits: [
          {
            created_at: "2026-10-04T08:00:00Z",
            org_uuid: "org-Beta",
            org_name: "Beta",
            limit_name: "max_scored_traces",
            kind: null,
            requested: null,
            cap: null,
          },
        ],
      }),
    );
    render(<AnalyticsView accessToken="t" />);
    await screen.findByText("214");

    const row = screen.getByText(/first line/).closest("[role=button]") as HTMLElement;
    row.focus();
    await user.keyboard("{Enter}");
    expect(row).toHaveAttribute("aria-expanded", "true");
    await user.keyboard(" ");
    expect(row).toHaveAttribute("aria-expanded", "false");

    expect(screen.getByText("Trace scoring limit reached")).toBeInTheDocument();
    expect(screen.getAllByText("Not known")).toHaveLength(3);
    expect(screen.getByText("No workspaces yet")).toBeInTheDocument();
  });

  it("says so when nothing failed and no limit was hit", async () => {
    mockFetch.mockResolvedValue(response({ failures: [], failures_total: 0, limit_hits: [], limit_hits_total: 0 }));
    render(<AnalyticsView accessToken="t" />);
    expect(await screen.findByText("No evaluations failed in these dates")).toBeInTheDocument();
    expect(screen.getByText("No limits were hit in these dates")).toBeInTheDocument();
  });

  it("drops a picked workspace once new dates leave it with no failures", async () => {
    mockFetch.mockResolvedValueOnce(response());
    mockFetch.mockResolvedValueOnce(response({ failures: [response().failures[1]], failures_total: 1 }));
    render(<AnalyticsView accessToken="t" />);
    await screen.findByText("214");
    fireEvent.change(screen.getByLabelText("Workspace"), { target: { value: "org-Alpha" } });
    expect(screen.queryByText("No details were recorded")).toBeNull();

    fireEvent.change(screen.getByLabelText("Dates"), { target: { value: "7" } });
    expect(await screen.findByText("No details were recorded")).toBeInTheDocument();
    expect(screen.getByLabelText("Workspace")).toHaveValue("");
  });

  it("hides the numbers while the custom dates cannot be used", async () => {
    mockFetch.mockResolvedValue(response());
    render(<AnalyticsView accessToken="t" />);
    await screen.findByText("214");
    fireEvent.change(screen.getByLabelText("Dates"), { target: { value: "custom" } });
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-10-05" } });
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2026-10-01" } });
    expect(screen.queryByText("New users")).toBeNull();
    expect(screen.getByText("214")).toBeInTheDocument();
  });

  it("shows no failures in the plain colour, not red", async () => {
    mockFetch.mockResolvedValue(response({ activity: activity({ failed_evaluations: 0 }) }));
    render(<AnalyticsView accessToken="t" />);
    await screen.findByText("214");
    expect(within(card("Failed evaluations")).getByText("0")).not.toHaveClass("text-red-600");
  });

  it("does not open or close a failure when its text is being selected", async () => {
    mockFetch.mockResolvedValue(response());
    render(<AnalyticsView accessToken="t" />);
    await screen.findByText("214");
    const row = screen.getByText(/first line/).closest("[role=button]")!;
    const spy = jest
      .spyOn(window, "getSelection")
      .mockReturnValue({ toString: () => "first line" } as Selection);
    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-expanded", "false");
    spy.mockRestore();
  });
});

describe("helpers", () => {
  it("useChartTheme reads the app's colours and follows the dark theme", async () => {
    const root = document.documentElement;
    root.style.setProperty("--muted-foreground", "#737373");
    const { result } = renderHook(() => useChartTheme());
    await waitFor(() => expect(result.current.axis).toBe("#737373"));
    expect(result.current.dark).toBe(false);
    await act(async () => {
      root.style.setProperty("--muted-foreground", "#a3a3a3");
      root.classList.add("dark");
    });
    await waitFor(() => expect(result.current).toMatchObject({ dark: true, axis: "#a3a3a3" }));
    await act(async () => root.classList.remove("dark"));
    await waitFor(() => expect(result.current.dark).toBe(false));
    root.style.removeProperty("--muted-foreground");
  });

  it("shortDay reads the date as a local day", () => {
    expect(shortDay("2026-10-01")).toBe(
      new Date(2026, 9, 1).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    );
  });

  it("resolveRange", () => {
    expect(resolveRange("all", "", "", "2026-10-19")).toEqual({ end: "2026-10-19" });
    expect(resolveRange("7", "", "", "2026-10-19")).toEqual({ start: "2026-10-13", end: "2026-10-19" });
    expect(resolveRange("custom", "2026-10-01", "2027-01-01", "2026-10-19")).toEqual({
      start: "2026-10-01",
      end: "2026-10-19",
    });
    expect(resolveRange("custom", "2026-10-05", "2026-10-01", "2026-10-19")).toHaveProperty("error");
    expect(resolveRange("custom", "", "2026-10-01", "2026-10-19")).toHaveProperty("error");
  });

  it("formatWhen reads a time with no zone as UTC", () => {
    expect(formatWhen("2026-10-01 12:00:00")).toBe(formatWhen("2026-10-01T12:00:00Z"));
    expect(formatWhen(null)).toBe("Never");
  });
});
