import React from "react";
import { render, screen, setupUser } from "@/test-utils";
import PublicBenchmarkPage from "../page";

jest.mock("next/navigation", () => ({
  useParams: () => ({ token: "tok-1" }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/public/benchmark/tok-1",
}));

const RUN = {
  task_id: "run-1",
  status: "done",
  leaderboard_summary: [
    { model: "alpha", pass_rate: "95", cost: "0.10", latency_p50: "1000" },
    { model: "beta", pass_rate: "70", cost: "0.02", latency_p50: "500" },
  ],
  model_results: [
    { model: "alpha", pass_rate: 95, test_results: [] },
    { model: "beta", pass_rate: 70, test_results: [] },
  ],
};

describe("PublicBenchmarkPage", () => {
  beforeEach(() => {
    // The public page chrome asks the browser whether it is in dark mode.
    window.matchMedia = jest.fn().mockReturnValue({
      matches: false,
      media: "(prefers-color-scheme: dark)",
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
    });
    process.env.NEXT_PUBLIC_BACKEND_URL = "http://backend.test";
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => RUN,
    }) as unknown as typeof fetch;
  });

  it("shows the priority sliders on the Model selection tab", async () => {
    const user = setupUser();
    render(<PublicBenchmarkPage />);

    const tab = await screen.findByRole("button", { name: /model selection/i });
    await user.click(tab);

    expect(screen.getByText("Rank by your priorities")).toBeInTheDocument();
    expect(screen.getByLabelText("Quality weight")).toBeInTheDocument();
    expect(screen.getByLabelText("Cost weight")).toBeInTheDocument();
    expect(screen.getByLabelText("Latency weight")).toBeInTheDocument();
  });
});
