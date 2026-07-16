/**
 * Unit tests for useAgentDeletion — the shared selection + delete logic behind
 * the agents list. Covers: selection + select-all, single vs bulk delete
 * routing, the 404 all-or-nothing rejection, 401 sign-out, and generic
 * failures.
 */
import { renderHook, act } from "@testing-library/react";
import { signOut } from "next-auth/react";
import { useAgentDeletion } from "@/hooks/useAgentDeletion";
import { reportError } from "@/lib/reportError";

jest.mock("../../lib/reportError", () => ({
  __esModule: true,
  reportError: jest.fn(),
}));

const mockSignOut = signOut as jest.Mock;
const mockReportError = reportError as jest.Mock;

type Agent = { uuid: string; name: string };
const agents: Agent[] = [
  { uuid: "a1", name: "Support Bot" },
  { uuid: "a2", name: "Connect Bot" },
];

const originalFetch = global.fetch;

beforeEach(() => {
  process.env.NEXT_PUBLIC_BACKEND_URL = "http://localhost:8000";
});

afterEach(() => {
  global.fetch = originalFetch;
  jest.clearAllMocks();
});

function setup(onDeleted: jest.Mock = jest.fn()) {
  const utils = renderHook(() =>
    useAgentDeletion<Agent>({ agents, onDeleted, accessToken: "tok" }),
  );
  return { ...utils, onDeleted };
}

describe("selection", () => {
  it("toggles a single agent's selection", () => {
    const { result } = setup();

    const props = result.current.agentCheckboxProps(agents[0]);
    expect(props.checked).toBe(false);

    act(() => props.onToggle());
    expect(result.current.selectedAgentUuids.has("a1")).toBe(true);

    // Toggling again clears it.
    act(() => result.current.agentCheckboxProps(agents[0]).onToggle());
    expect(result.current.selectedAgentUuids.has("a1")).toBe(false);
  });

  it("select-all picks every agent, then clears", () => {
    const { result } = setup();

    expect(result.current.hasSelectableAgents).toBe(true);

    act(() => result.current.toggleSelectAll());
    expect(result.current.selectedAgentUuids.size).toBe(2);
    expect(result.current.allSelected).toBe(true);

    act(() => result.current.toggleSelectAll());
    expect(result.current.selectedAgentUuids.size).toBe(0);
    expect(result.current.allSelected).toBe(false);
  });

  it("reports no selectable agents when the list is empty", () => {
    const { result } = renderHook(() =>
      useAgentDeletion<Agent>({
        agents: [],
        onDeleted: jest.fn(),
        accessToken: "tok",
      }),
    );
    expect(result.current.hasSelectableAgents).toBe(false);
    expect(result.current.allSelected).toBe(false);
  });

  it("drops selected agents that are no longer visible after the list narrows", () => {
    const { result, rerender } = renderHook(
      ({ list }) =>
        useAgentDeletion<Agent>({
          agents: list,
          onDeleted: jest.fn(),
          accessToken: "tok",
        }),
      { initialProps: { list: agents } },
    );

    act(() => result.current.toggleSelectAll());
    expect(result.current.selectedAgentUuids.size).toBe(2);

    // Simulate a search filtering the list down to just "Connect Bot".
    rerender({ list: [agents[1]] });
    expect(result.current.selectedAgentUuids.has("a1")).toBe(false);
    expect(result.current.selectedAgentUuids.has("a2")).toBe(true);
    expect(result.current.selectedAgentUuids.size).toBe(1);
  });

  it("opens and closes the delete dialog, clearing any error", () => {
    const { result } = setup();

    act(() => result.current.openDeleteDialog(agents[0]));
    expect(result.current.deleteDialogOpen).toBe(true);
    expect(result.current.agentToDelete?.uuid).toBe("a1");

    act(() => result.current.closeDeleteDialog());
    expect(result.current.deleteDialogOpen).toBe(false);
    expect(result.current.deleteError).toBeNull();
  });

  it("does not open the bulk dialog with an empty selection", () => {
    const { result } = setup();
    act(() => result.current.openBulkDeleteDialog());
    expect(result.current.deleteDialogOpen).toBe(false);
  });
});

describe("bulk delete", () => {
  it("issues one POST /agents/bulk-delete with the selected uuids and prunes them", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ deleted_count: 2 }),
    }) as unknown as typeof fetch;
    const { result, onDeleted } = setup();

    act(() => result.current.toggleSelectAll());
    act(() => result.current.openBulkDeleteDialog());
    await act(async () => {
      await result.current.deleteAgents();
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:8000/agents/bulk-delete",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ agent_uuids: ["a1", "a2"] }),
      }),
    );
    expect(onDeleted).toHaveBeenCalledWith(["a1", "a2"]);
    expect(result.current.selectedAgentUuids.size).toBe(0);
    expect(result.current.deleteDialogOpen).toBe(false);
  });

  it("surfaces a 404 rejection listing missing agents and deletes nothing", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({
        detail: { message: "not found", not_found: ["a2"] },
      }),
    }) as unknown as typeof fetch;
    const { result, onDeleted } = setup();

    act(() => result.current.toggleSelectAll());
    act(() => result.current.openBulkDeleteDialog());
    await act(async () => {
      await result.current.deleteAgents();
    });

    expect(onDeleted).not.toHaveBeenCalled();
    expect(result.current.deleteError).toMatch(/no longer available/);
    // Dialog stays open so the user can read the reason.
    expect(result.current.deleteDialogOpen).toBe(true);
  });

  it("falls back to the server message when 404 lists no missing uuids", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ detail: { message: "Server said no." } }),
    }) as unknown as typeof fetch;
    const { result } = setup();

    act(() => result.current.toggleSelectAll());
    act(() => result.current.openBulkDeleteDialog());
    await act(async () => {
      await result.current.deleteAgents();
    });

    expect(result.current.deleteError).toBe("Server said no.");
  });

  it("uses a default message when a 404 has no not_found and no string message", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ detail: {} }),
    }) as unknown as typeof fetch;
    const { result } = setup();

    act(() => result.current.toggleSelectAll());
    act(() => result.current.openBulkDeleteDialog());
    await act(async () => {
      await result.current.deleteAgents();
    });

    expect(result.current.deleteError).toBe("Nothing was deleted.");
  });
});

describe("single delete", () => {
  it("issues DELETE /agents/{uuid} without a body", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    }) as unknown as typeof fetch;
    const { result, onDeleted } = setup();

    act(() => result.current.openDeleteDialog(agents[0]));
    await act(async () => {
      await result.current.deleteAgents();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:8000/agents/a1",
      expect.objectContaining({ method: "DELETE" }),
    );
    const init = (global.fetch as jest.Mock).mock.calls[0][1];
    expect(init.body).toBeUndefined();
    expect(onDeleted).toHaveBeenCalledWith(["a1"]);
  });
});

describe("auth + errors", () => {
  it("signs the user out on 401", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    }) as unknown as typeof fetch;
    const { result, onDeleted } = setup();

    act(() => result.current.openDeleteDialog(agents[0]));
    await act(async () => {
      await result.current.deleteAgents();
    });

    expect(mockSignOut).toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("reports and surfaces a generic error when the request throws", async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error("network")) as unknown as typeof fetch;
    const { result, onDeleted } = setup();

    act(() => result.current.openDeleteDialog(agents[0]));
    await act(async () => {
      await result.current.deleteAgents();
    });

    expect(mockReportError).toHaveBeenCalled();
    expect(result.current.deleteError).toMatch(/Something went wrong/);
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("throws a generic failure for a non-ok single delete", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    }) as unknown as typeof fetch;
    const { result, onDeleted } = setup();

    act(() => result.current.openDeleteDialog(agents[0]));
    await act(async () => {
      await result.current.deleteAgents();
    });

    expect(mockReportError).toHaveBeenCalled();
    expect(result.current.deleteError).toMatch(/Something went wrong/);
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
