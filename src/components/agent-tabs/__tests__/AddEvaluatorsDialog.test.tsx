import { render, screen, setupUser, waitFor } from "@/test-utils";
import { AddEvaluatorsDialog } from "../AddEvaluatorsDialog";
import type { EvaluatorData } from "@/lib/evaluatorApi";

const evaluator = (over: Partial<EvaluatorData> = {}): EvaluatorData => ({
  uuid: over.uuid ?? "ev-1",
  name: over.name ?? "Evaluator",
  description: over.description ?? "Description",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  owner_user_id: over.owner_user_id ?? "user-1",
  // Defaults are distinguished by is_default only (every evaluator has an owner).
  is_default: over.is_default ?? false,
  output_type: "binary",
  evaluator_type: "llm",
  ...over,
});

describe("AddEvaluatorsDialog", () => {
  it("shows section headers when both default and custom evaluators are available", () => {
    render(
      <AddEvaluatorsDialog
        isOpen
        onClose={jest.fn()}
        onAdd={jest.fn()}
        availableEvaluators={[
          evaluator({
            uuid: "ev-default",
            name: "Correctness",
            is_default: true,
          }),
          evaluator({
            uuid: "ev-custom",
            name: "Tone check",
            owner_user_id: "user-1",
          }),
        ]}
      />,
    );

    expect(screen.getByText("Default")).toBeInTheDocument();
    expect(screen.getByText("My evaluators")).toBeInTheDocument();
    expect(screen.getByText("Correctness")).toBeInTheDocument();
    expect(screen.getByText("Tone check")).toBeInTheDocument();
  });

  it("hides section headers when only default evaluators are available", () => {
    render(
      <AddEvaluatorsDialog
        isOpen
        onClose={jest.fn()}
        onAdd={jest.fn()}
        availableEvaluators={[
          evaluator({
            uuid: "ev-default",
            name: "Correctness",
            is_default: true,
          }),
        ]}
      />,
    );

    expect(screen.getByText("Correctness")).toBeInTheDocument();
    expect(screen.queryByText("Default")).not.toBeInTheDocument();
    expect(screen.queryByText("My evaluators")).not.toBeInTheDocument();
  });

  it("hides section headers when only custom evaluators are available", () => {
    render(
      <AddEvaluatorsDialog
        isOpen
        onClose={jest.fn()}
        onAdd={jest.fn()}
        availableEvaluators={[
          evaluator({
            uuid: "ev-custom",
            name: "Tone check",
            owner_user_id: "user-1",
          }),
        ]}
      />,
    );

    expect(screen.getByText("Tone check")).toBeInTheDocument();
    expect(screen.queryByText("Default")).not.toBeInTheDocument();
    expect(screen.queryByText("My evaluators")).not.toBeInTheDocument();
  });

  it("unchecks a selected evaluator before adding", async () => {
    const user = setupUser();
    const onAdd = jest.fn();

    render(
      <AddEvaluatorsDialog
        isOpen
        onClose={jest.fn()}
        onAdd={onAdd}
        availableEvaluators={[
          evaluator({ uuid: "ev-a", name: "Tone check" }),
        ]}
      />,
    );

    const checkbox = screen.getByRole("checkbox");
    await user.click(checkbox);
    expect(screen.getByRole("button", { name: "Add (1)" })).toBeEnabled();
    await user.click(checkbox);
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("filters evaluators by search and adds the selected ones", async () => {
    const user = setupUser();
    const onAdd = jest.fn().mockResolvedValue(undefined);
    const onClose = jest.fn();

    render(
      <AddEvaluatorsDialog
        isOpen
        onClose={onClose}
        onAdd={onAdd}
        availableEvaluators={[
          evaluator({
            uuid: "ev-a",
            name: "Tone check",
            owner_user_id: "user-1",
          }),
          evaluator({
            uuid: "ev-b",
            name: "Policy fit",
            owner_user_id: "user-1",
          }),
        ]}
      />,
    );

    await user.type(screen.getByPlaceholderText("Search evaluators"), "tone");
    expect(screen.getByText("Tone check")).toBeInTheDocument();
    expect(screen.queryByText("Policy fit")).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Add (1)" }));

    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith(["ev-a"]),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("shows an empty-search message when nothing matches", async () => {
    const user = setupUser();

    render(
      <AddEvaluatorsDialog
        isOpen
        onClose={jest.fn()}
        onAdd={jest.fn()}
        availableEvaluators={[
          evaluator({ uuid: "ev-a", name: "Tone check" }),
        ]}
      />,
    );

    await user.type(
      screen.getByPlaceholderText("Search evaluators"),
      "missing",
    );
    expect(screen.getByText("No matching evaluators.")).toBeInTheDocument();
  });

  it("shows the all-added empty state when the library list is empty", () => {
    render(
      <AddEvaluatorsDialog
        isOpen
        onClose={jest.fn()}
        onAdd={jest.fn()}
        availableEvaluators={[]}
      />,
    );

    expect(
      screen.getByText("All evaluators are already added"),
    ).toBeInTheDocument();
  });

  it("keeps the dialog open and shows the error when adding fails", async () => {
    const user = setupUser();
    const onAdd = jest.fn().mockRejectedValue(new Error("Backend is down"));
    const onClose = jest.fn();

    render(
      <AddEvaluatorsDialog
        isOpen
        onClose={onClose}
        onAdd={onAdd}
        availableEvaluators={[
          evaluator({ uuid: "ev-a", name: "Tone check", owner_user_id: "u" }),
        ]}
      />,
    );

    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Add (1)" }));

    // The failure is surfaced and the dialog stays open (onClose not called).
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Backend is down",
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});
