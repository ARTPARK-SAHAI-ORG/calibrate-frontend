import React from "react";
import { render, screen, setupUser, fireEvent, waitFor } from "@/test-utils";
import {
  EvaluationTabContent,
  type EvaluationCriteriaData,
} from "../EvaluationTabContent";

if (!global.crypto.randomUUID) {
  // jsdom doesn't implement crypto.randomUUID; stub it for the "create" flow.
  Object.defineProperty(global.crypto, "randomUUID", {
    value: () => "test-uuid",
    configurable: true,
  });
}

const makeCriteria = (
  overrides: Partial<EvaluationCriteriaData> = {}
): EvaluationCriteriaData => ({
  uuid: "c1",
  name: "Resolved issue",
  description: "Checks the issue was resolved",
  agent_id: "agent-1",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  ...overrides,
});

function renderComponent(
  overrides: Partial<React.ComponentProps<typeof EvaluationTabContent>> = {}
) {
  const setEvaluationCriteria = jest.fn();
  const saveRef = { current: jest.fn() };
  const props: React.ComponentProps<typeof EvaluationTabContent> = {
    agentUuid: "agent-1",
    evaluationCriteria: [],
    setEvaluationCriteria,
    evaluationCriteriaLoading: false,
    evaluationCriteriaError: null,
    saveRef,
    ...overrides,
  };
  const utils = render(<EvaluationTabContent {...props} />);
  return { ...utils, setEvaluationCriteria, saveRef, props };
}

describe("EvaluationTabContent", () => {
  it("renders the loading state", () => {
    renderComponent({ evaluationCriteriaLoading: true });
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("renders the error state and reloads on retry click", async () => {
    const user = setupUser();
    const reloadSpy = jest.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload: reloadSpy },
    });

    renderComponent({ evaluationCriteriaError: "Something went wrong" });
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();

    await user.click(screen.getByText("Retry"));
    expect(reloadSpy).toHaveBeenCalled();
  });

  it("renders the empty state and opens the add sidebar", async () => {
    const user = setupUser();
    renderComponent({ evaluationCriteria: [] });
    expect(
      screen.getByText("No evaluation criteria defined")
    ).toBeInTheDocument();

    await user.click(screen.getByText("Add criteria"));
    expect(screen.getByText("Add evaluation criteria")).toBeInTheDocument();
  });

  it("renders the criteria list with singular/plural count", () => {
    const { rerender } = renderComponent({
      evaluationCriteria: [makeCriteria()],
    });
    expect(screen.getByText("1 criterion")).toBeInTheDocument();
    expect(screen.getByText("Resolved issue")).toBeInTheDocument();

    rerender(
      <EvaluationTabContent
        agentUuid="agent-1"
        evaluationCriteria={[makeCriteria(), makeCriteria({ uuid: "c2", name: "Second" })]}
        setEvaluationCriteria={jest.fn()}
        evaluationCriteriaLoading={false}
        evaluationCriteriaError={null}
        saveRef={{ current: jest.fn() }}
      />
    );
    expect(screen.getByText("2 criteria")).toBeInTheDocument();
  });

  it("shows a dash for a criteria row with an empty description", () => {
    renderComponent({
      evaluationCriteria: [makeCriteria({ description: "" })],
    });
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("opens the sidebar in edit mode when clicking a row and closes it via cancel", async () => {
    const user = setupUser();
    renderComponent({ evaluationCriteria: [makeCriteria()] });

    await user.click(screen.getByText("Resolved issue"));
    expect(screen.getByText("Edit evaluation criteria")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Resolved issue")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("Checks the issue was resolved")
    ).toBeInTheDocument();

    await user.click(screen.getByText("Cancel"));
    expect(
      screen.queryByText("Edit evaluation criteria")
    ).not.toBeInTheDocument();
  });

  it("closes the sidebar via the backdrop and the X button", async () => {
    const user = setupUser();
    const { container } = renderComponent({
      evaluationCriteria: [makeCriteria()],
    });

    await user.click(screen.getByText("Add criteria"));
    expect(screen.getByText("Add evaluation criteria")).toBeInTheDocument();

    const backdrop = container.querySelector(".backdrop-blur-sm") as HTMLElement;
    fireEvent.click(backdrop);
    expect(
      screen.queryByText("Add evaluation criteria")
    ).not.toBeInTheDocument();

    await user.click(screen.getByText("Add criteria"));
    const closeButtons = screen.getAllByRole("button");
    const xButton = closeButtons.find(
      (b) => b.querySelector("path")?.getAttribute("d") === "M6 18L18 6M6 6l12 12"
    ) as HTMLButtonElement;
    await user.click(xButton);
    expect(
      screen.queryByText("Add evaluation criteria")
    ).not.toBeInTheDocument();
  });

  it("shows a validation error when submitting an empty name", async () => {
    const user = setupUser();
    renderComponent({ evaluationCriteria: [makeCriteria()] });

    await user.click(screen.getByText("Add criteria"));
    const submitButtons = screen.getAllByText("Add criteria");
    await user.click(submitButtons[submitButtons.length - 1]);

    // Form should remain open since validation failed (empty name).
    expect(screen.getByText("Add evaluation criteria")).toBeInTheDocument();
  });

  it("shows a duplicate name validation error", async () => {
    const user = setupUser();
    renderComponent({ evaluationCriteria: [makeCriteria()] });

    await user.click(screen.getByText("Add criteria"));
    const nameInput = screen.getByPlaceholderText(
      "Enter the name of the criteria"
    );
    await user.type(nameInput, "Resolved issue");

    const submitButtons = screen.getAllByText("Add criteria");
    await user.click(submitButtons[submitButtons.length - 1]);

    expect(
      screen.getByText("A criteria with this name already exists")
    ).toBeInTheDocument();
  });

  it("creates a new criteria and triggers save", async () => {
    const user = setupUser();
    const { setEvaluationCriteria, saveRef } = renderComponent({
      evaluationCriteria: [],
    });

    await user.click(screen.getByText("Add criteria"));
    const nameInput = screen.getByPlaceholderText(
      "Enter the name of the criteria"
    );
    await user.type(nameInput, "New criteria");
    const instructionsInput = screen.getByPlaceholderText(
      /Describe how the agent should evaluate/
    );
    await user.type(instructionsInput, "Some instructions");

    const submitButtons = screen.getAllByText("Add criteria");
    await user.click(submitButtons[submitButtons.length - 1]);

    expect(setEvaluationCriteria).toHaveBeenCalled();
    const updater = setEvaluationCriteria.mock.calls[0][0];
    const result = updater([]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("New criteria");
    expect(result[0].description).toBe("Some instructions");
    expect(result[0].agent_id).toBe("agent-1");

    expect(
      screen.queryByText("Add evaluation criteria")
    ).not.toBeInTheDocument();

    await waitFor(() => expect(saveRef.current).toHaveBeenCalled());
  });

  it("updates an existing criteria on save", async () => {
    const user = setupUser();
    const { setEvaluationCriteria, saveRef } = renderComponent({
      evaluationCriteria: [makeCriteria()],
    });

    await user.click(screen.getByText("Resolved issue"));
    const nameInput = screen.getByDisplayValue("Resolved issue");
    await user.clear(nameInput);
    await user.type(nameInput, "Updated name");

    await user.click(screen.getByText("Save"));

    expect(setEvaluationCriteria).toHaveBeenCalled();
    const updater = setEvaluationCriteria.mock.calls[0][0];
    const result = updater([makeCriteria()]);
    expect(result[0].name).toBe("Updated name");

    await waitFor(() => expect(saveRef.current).toHaveBeenCalled());
  });

  it("leaves other criteria untouched when updating one", async () => {
    const user = setupUser();
    const other = makeCriteria({ uuid: "c2", name: "Other" });
    const { setEvaluationCriteria } = renderComponent({
      evaluationCriteria: [makeCriteria(), other],
    });

    await user.click(screen.getByText("Resolved issue"));
    const nameInput = screen.getByDisplayValue("Resolved issue");
    await user.clear(nameInput);
    await user.type(nameInput, "Renamed");
    await user.click(screen.getByText("Save"));

    expect(setEvaluationCriteria).toHaveBeenCalled();
    const updater = setEvaluationCriteria.mock.calls[0][0];
    const result = updater([makeCriteria(), other]);
    expect(result[0].name).toBe("Renamed");
    // The non-edited row is returned as-is (the `: c` branch of the map).
    expect(result[1]).toBe(other);
  });

  it("opens the delete dialog and deletes a criteria", async () => {
    const user = setupUser();
    const { container, setEvaluationCriteria, saveRef } = renderComponent({
      evaluationCriteria: [makeCriteria()],
    });

    const deleteButton = container.querySelector(
      'button[title="Delete criteria"]'
    ) as HTMLButtonElement;
    await user.click(deleteButton);

    expect(screen.getByText("Delete criteria")).toBeInTheDocument();
    expect(
      screen.getByText('Are you sure you want to delete "Resolved issue"?')
    ).toBeInTheDocument();

    await user.click(screen.getByText("Delete"));

    expect(setEvaluationCriteria).toHaveBeenCalled();
    const updater = setEvaluationCriteria.mock.calls[0][0];
    const result = updater([makeCriteria()]);
    expect(result).toHaveLength(0);

    await waitFor(() => expect(saveRef.current).toHaveBeenCalled());
  });

  it("closes the delete dialog without deleting on cancel", async () => {
    const user = setupUser();
    const { container, setEvaluationCriteria } = renderComponent({
      evaluationCriteria: [makeCriteria()],
    });

    const deleteButton = container.querySelector(
      'button[title="Delete criteria"]'
    ) as HTMLButtonElement;
    await user.click(deleteButton);
    await user.click(screen.getByText("Cancel"));

    expect(screen.queryByText("Delete criteria")).not.toBeInTheDocument();
    expect(setEvaluationCriteria).not.toHaveBeenCalled();
  });
});
