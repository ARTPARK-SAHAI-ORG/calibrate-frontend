/**
 * A connection agent with custom fields can run a text simulation: it can be
 * picked for the simulation, and "Text Simulation" in the Launch menu starts
 * a text run.
 */
import React from "react";
import { render, screen, waitFor, setupUser } from "@/test-utils";

jest.mock("next/navigation", () => ({
  __esModule: true,
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => "/simulations/sim-1",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ uuid: "sim-1" }),
  redirect: jest.fn(),
  notFound: jest.fn(),
}));

jest.mock("../../../../../components/AppLayout", () => ({
  AppLayout: ({
    children,
    headerActions,
  }: {
    children: React.ReactNode;
    headerActions?: React.ReactNode;
  }) => (
    <>
      {headerActions}
      {children}
    </>
  ),
  useHideFloatingButton: () => {},
}));

jest.mock("../../../../../hooks", () => ({
  ...jest.requireActual("../../../../../hooks"),
  useAccessToken: () => "test-token",
  useUsesOwnProviderKeys: () => false,
  useOpenRouterModels: () => ({ providers: [], availability: null }),
}));

import SimulationDetailPage from "../page";

const BACKEND = "https://api.example.com";
const originalFetch = global.fetch;
const originalBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

const ok = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
});

const AGENT = {
  uuid: "agent-1",
  name: "Clinic Bot",
  type: "connection",
  connection_verified: true,
  has_default_inputs: true,
};

let fetchMock: jest.Mock;

beforeEach(() => {
  process.env.NEXT_PUBLIC_BACKEND_URL = BACKEND;
  fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
    const path = url.replace(BACKEND, "");
    if (path === "/simulations/sim-1" && init?.method === "GET")
      return ok({
        uuid: "sim-1",
        name: "Clinic",
        created_at: "2024-01-01",
        updated_at: "2024-01-01",
      });
    if (path === "/simulations/sim-1" && init?.method === "PUT") return ok({});
    if (path === "/simulations/sim-1/run") return ok({ task_id: "run-1" });
    if (path === "/agents") return ok([AGENT]);
    if (path === "/personas")
      return ok([{ uuid: "p-1", name: "Anxious parent", description: "" }]);
    if (path === "/scenarios")
      return ok([{ uuid: "s-1", name: "Book a visit", description: "" }]);
    return ok([]);
  });
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env.NEXT_PUBLIC_BACKEND_URL = originalBackendUrl;
});

it("picks a connection agent with custom fields and launches a text simulation", async () => {
  const user = setupUser();
  render(<SimulationDetailPage />);

  await user.click(
    await screen.findByRole("button", {
      name: "Choose an agent for this simulation",
    }),
  );
  await user.click(await screen.findByText("Clinic Bot"));

  await user.click(screen.getByText("Choose one or more personas"));
  await user.click(await screen.findByText("Anxious parent"));
  await user.click(screen.getByText("Choose one or more scenarios"));
  await user.click(await screen.findByText("Book a visit"));

  await user.click(screen.getByRole("button", { name: "Create" }));
  await user.click(await screen.findByRole("button", { name: "Launch" }));

  const text = screen.getByRole("button", { name: "Text Simulation" });
  expect(text).toBeEnabled();
  await user.click(text);

  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      `${BACKEND}/simulations/sim-1/run`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ type: "text" }),
      }),
    ),
  );
});
