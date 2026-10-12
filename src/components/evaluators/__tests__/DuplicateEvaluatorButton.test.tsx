import { render, screen, waitFor, setupUser } from "@/test-utils";
import { toast } from "sonner";
import { DuplicateEvaluatorButton } from "../DuplicateEvaluatorButton";
import { fetchAllEvaluators, fetchEvaluatorDetail } from "@/lib/evaluatorApi";

jest.mock("../../../hooks", () => ({
  useAccessToken: () => "test-token",
}));

jest.mock("../../../lib/nav", () => ({
  useOrgUuid: () => "org-1",
}));

jest.mock("../../../lib/evaluatorApi", () => ({
  ...jest.requireActual("../../../lib/evaluatorApi"),
  fetchAllEvaluators: jest.fn(),
  fetchEvaluatorDetail: jest.fn(),
}));

jest.mock("sonner", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

jest.mock("../CreateEvaluatorFlow", () => ({
  CreateEvaluatorFlow: ({
    open,
    duplicateOf,
    existingEvaluators,
    onCreated,
    onClose,
  }: {
    open: boolean;
    duplicateOf?: { name: string; evaluator_type?: string } | null;
    existingEvaluators: { name: string }[];
    onCreated: (e: { uuid: string; name: string }) => void;
    onClose: () => void;
  }) =>
    open ? (
      <div data-testid="create-flow" data-type={duplicateOf?.evaluator_type}>
        <span data-testid="duplicate-of">{duplicateOf?.name}</span>
        <span data-testid="existing">
          {existingEvaluators.map((e) => e.name).join(",")}
        </span>
        <button
          type="button"
          onClick={() => {
            onCreated({ uuid: "ev-new", name: "Copy of Tone" });
            onClose();
          }}
        >
          Finish create
        </button>
      </div>
    ) : null,
}));

const mockDetail = fetchEvaluatorDetail as jest.MockedFunction<
  typeof fetchEvaluatorDetail
>;
const mockAll = fetchAllEvaluators as jest.MockedFunction<
  typeof fetchAllEvaluators
>;

const evaluator = {
  uuid: "ev-1",
  name: "Tone",
  evaluator_type: "llm" as const,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAll.mockResolvedValue([
    {
      uuid: "ev-2",
      name: "Politeness",
      description: "",
      created_at: "",
      updated_at: "",
    },
  ]);
});

test("reads the evaluator and the library, then opens the form as a copy", async () => {
  mockDetail.mockResolvedValue({ uuid: "ev-1", name: "Tone" });
  const user = setupUser();
  render(<DuplicateEvaluatorButton evaluator={evaluator} />);

  await user.click(screen.getByRole("button", { name: "Duplicate" }));

  expect(mockDetail).toHaveBeenCalledWith("ev-1", "test-token");
  expect(mockAll).toHaveBeenCalledWith("test-token");
  const flow = await screen.findByTestId("create-flow");
  // Drawn at the top of the page, not inside whatever holds the button.
  expect(flow.parentElement?.parentElement).toBe(document.body);
  expect(screen.getByTestId("duplicate-of")).toHaveTextContent("Tone");
  // The list's kind fills in for a detail that leaves it out.
  expect(flow).toHaveAttribute("data-type", "llm");
  expect(screen.getByTestId("existing")).toHaveTextContent("Politeness");
});

test("says so and opens nothing when the evaluator cannot be read", async () => {
  mockDetail.mockRejectedValue(new Error("Network down"));
  const user = setupUser();
  render(<DuplicateEvaluatorButton evaluator={evaluator} />);

  await user.click(screen.getByRole("button", { name: "Duplicate" }));

  await waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith(
      "Could not read the evaluator to copy it",
    ),
  );
  expect(screen.queryByTestId("create-flow")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Duplicate" })).toBeEnabled();
});

test("hands the created copy to onCreated and closes the form", async () => {
  mockDetail.mockResolvedValue({ uuid: "ev-1", name: "Tone" });
  const onCreated = jest.fn();
  const user = setupUser();
  render(
    <DuplicateEvaluatorButton evaluator={evaluator} onCreated={onCreated} />,
  );

  await user.click(screen.getByRole("button", { name: "Duplicate" }));
  await user.click(await screen.findByText("Finish create"));

  expect(onCreated).toHaveBeenCalledWith({
    uuid: "ev-new",
    name: "Copy of Tone",
  });
  expect(toast.success).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(screen.queryByTestId("create-flow")).not.toBeInTheDocument(),
  );
});

test("without onCreated, a toast names the copy and can open its page", async () => {
  mockDetail.mockResolvedValue({ uuid: "ev-1", name: "Tone" });
  const user = setupUser();
  render(<DuplicateEvaluatorButton evaluator={evaluator} />);

  await user.click(screen.getByRole("button", { name: "Duplicate" }));
  await user.click(await screen.findByText("Finish create"));

  expect(toast.success).toHaveBeenCalledWith(
    "Created Copy of Tone",
    expect.objectContaining({
      action: expect.objectContaining({ label: "Open it" }),
    }),
  );
  const open = jest.spyOn(window, "open").mockReturnValue(null);
  (toast.success as jest.Mock).mock.calls[0][1].action.onClick();
  // A new tab, so whatever is open behind the button is kept.
  expect(open).toHaveBeenCalledWith(
    "/org-1/evaluators/ev-new",
    "_blank",
    "noopener,noreferrer",
  );
  open.mockRestore();
});
