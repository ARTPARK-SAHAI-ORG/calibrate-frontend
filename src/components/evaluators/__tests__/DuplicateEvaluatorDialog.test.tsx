import { render, screen, setupUser, waitFor } from "@/test-utils";
import { signOut } from "next-auth/react";
import { DuplicateEvaluatorDialog } from "../DuplicateEvaluatorDialog";
import type { EvaluatorData } from "@/lib/evaluatorApi";

jest.mock("next-auth/react", () => ({
  signOut: jest.fn(),
}));

const original: EvaluatorData = {
  uuid: "ev-1",
  name: "Tone check",
  description: "Checks tone",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  owner_user_id: "user-1",
  output_type: "binary",
  evaluator_type: "llm",
};

const existing: EvaluatorData[] = [
  original,
  {
    uuid: "ev-2",
    name: "Other",
    description: "",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    owner_user_id: "user-1",
    output_type: "binary",
    evaluator_type: "llm",
  },
];

beforeEach(() => {
  process.env.NEXT_PUBLIC_BACKEND_URL = "http://test-backend";
  (signOut as jest.Mock).mockClear();
  global.fetch = jest.fn();
});

describe("DuplicateEvaluatorDialog", () => {
  it("prefills the name and blocks duplicate names already in the library", async () => {
    const user = setupUser();
    render(
      <DuplicateEvaluatorDialog
        originalEvaluator={original}
        existingEvaluators={existing}
        onClose={jest.fn()}
        onDuplicated={jest.fn()}
        backendAccessToken="token"
      />,
    );

    const input = screen.getByPlaceholderText("Enter evaluator name");
    expect(input).toHaveValue("Copy of Tone check");

    await user.clear(input);
    await user.type(input, "Other");
    expect(
      screen.getByText("An evaluator with this name already exists"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Duplicate" })).toBeDisabled();
  });

  it("blocks reserved evaluator names", async () => {
    const user = setupUser();
    render(
      <DuplicateEvaluatorDialog
        originalEvaluator={original}
        existingEvaluators={existing}
        onClose={jest.fn()}
        onDuplicated={jest.fn()}
        backendAccessToken="token"
      />,
    );

    const input = screen.getByPlaceholderText("Enter evaluator name");
    await user.clear(input);
    await user.type(input, "name");
    expect(
      screen.getByText(
        '"name" is a reserved keyword and can\'t be used as an evaluator name',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Duplicate" })).toBeDisabled();
  });

  it("POSTs the duplicate endpoint and calls onDuplicated on success", async () => {
    const user = setupUser();
    const onDuplicated = jest.fn();
    const onClose = jest.fn();

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        uuid: "ev-copy",
        description: "Checks tone",
        created_at: "2026-01-02T00:00:00Z",
        updated_at: "2026-01-02T00:00:00Z",
        owner_user_id: "user-1",
        evaluator_type: "llm",
        output_type: "binary",
      }),
    });

    render(
      <DuplicateEvaluatorDialog
        originalEvaluator={original}
        existingEvaluators={existing}
        onClose={onClose}
        onDuplicated={onDuplicated}
        backendAccessToken="token"
      />,
    );

    const input = screen.getByPlaceholderText("Enter evaluator name");
    await user.clear(input);
    await user.type(input, "Tone copy");
    await user.click(screen.getByRole("button", { name: "Duplicate" }));

    await waitFor(() => expect(onDuplicated).toHaveBeenCalledTimes(1));
    expect(onDuplicated.mock.calls[0][0]).toMatchObject({
      uuid: "ev-copy",
      name: "Tone copy",
    });
    expect(onClose).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith(
      "http://test-backend/evaluators/ev-1/duplicate",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Tone copy" }),
      }),
    );
  });

  it("shows a name error on a 409 conflict", async () => {
    const user = setupUser();

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 409,
      headers: { get: () => "application/json" },
      json: async () => ({ detail: "Evaluator name already exists" }),
      text: async () => "",
    });

    render(
      <DuplicateEvaluatorDialog
        originalEvaluator={original}
        existingEvaluators={existing}
        onClose={jest.fn()}
        onDuplicated={jest.fn()}
        backendAccessToken="token"
      />,
    );

    const input = screen.getByPlaceholderText("Enter evaluator name");
    await user.clear(input);
    await user.type(input, "Fresh name");
    await user.click(screen.getByRole("button", { name: "Duplicate" }));

    expect(
      await screen.findByText("Evaluator name already exists"),
    ).toBeInTheDocument();
  });

  it("calls onClose when Cancel is clicked", async () => {
    const user = setupUser();
    const onClose = jest.fn();

    render(
      <DuplicateEvaluatorDialog
        originalEvaluator={original}
        existingEvaluators={existing}
        onClose={onClose}
        onDuplicated={jest.fn()}
        backendAccessToken="token"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });
});
