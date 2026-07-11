import React from "react";
import { render, screen, setupUser, waitFor, act, within } from "@/test-utils";
import { BulkUploadTestsModal } from "../BulkUploadTestsModal";

// ---- Mocks (relative paths — @/... jest.mock does not resolve) ----

jest.mock("../../hooks", () => ({
  useAccessToken: jest.fn(() => "test-token"),
}));
import { useAccessToken } from "../../hooks";

jest.mock("../../lib/reportError", () => ({
  reportError: jest.fn(),
}));

jest.mock("../AgentPicker", () => ({
  MultiAgentPicker: ({
    selectedAgentUuids,
    onToggleAgent,
    onAgentsLoaded,
  }: {
    selectedAgentUuids: string[];
    onToggleAgent: (uuid: string) => void;
    onAgentsLoaded?: (agents: { uuid: string; name: string }[]) => void;
  }) => {
    const agents = [
      { uuid: "agent-1", name: "Agent One" },
      { uuid: "agent-2", name: "Agent Two" },
    ];
    React.useEffect(() => {
      onAgentsLoaded?.(agents);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return (
      <div data-testid="multi-agent-picker">
        {agents.map((a) => (
          <button
            key={a.uuid}
            type="button"
            onClick={() => onToggleAgent(a.uuid)}
            aria-pressed={selectedAgentUuids.includes(a.uuid)}
          >
            {a.name}
          </button>
        ))}
      </div>
    );
  },
}));

jest.mock("../human-labelling/bulk-upload-shared", () => ({
  ChatHistoryPreview: ({ turns }: { turns: unknown[] }) => (
    <div data-testid="chat-history-preview">{turns.length} turns</div>
  ),
  generateGuidelinesPdf: jest.fn(() => new Blob(["pdf"], { type: "application/pdf" })),
}));
import { generateGuidelinesPdf } from "../human-labelling/bulk-upload-shared";

const mockedUseAccessToken = useAccessToken as jest.Mock;

// ---- Test helpers ----

const EVALUATORS_RESPONSE = {
  items: [
    {
      uuid: "eval-1",
      name: "Helpfulness",
      slug: "helpfulness",
      evaluator_type: "llm",
      live_version: {
        variables: [{ name: "criteria", description: "What to check" }],
      },
    },
    {
      uuid: "eval-2",
      name: "Politeness",
      slug: "politeness",
      evaluator_type: "llm",
      live_version: { variables: [] },
    },
    {
      uuid: "eval-3",
      name: "ConvoQuality",
      slug: "convo-quality",
      evaluator_type: "conversation",
      live_version: { variables: [] },
    },
  ],
};

const TOOLS_RESPONSE = [
  { uuid: "tool-1", name: "book_room", description: "", config: {}, created_at: "", updated_at: "" },
];

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

function makeFile(content: string, name = "tests.csv") {
  return new File([content], name, { type: "text/csv" });
}

async function uploadFile(content: string, name = "tests.csv") {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = makeFile(content, name);
  await act(async () => {
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function selectTestType(user: ReturnType<typeof setupUser>, label: string) {
  await user.click(screen.getByText(label));
}

function defaultProps(overrides: Partial<React.ComponentProps<typeof BulkUploadTestsModal>> = {}) {
  return {
    isOpen: true,
    onClose: jest.fn(),
    onSuccess: jest.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedUseAccessToken.mockReturnValue("test-token");
  process.env.NEXT_PUBLIC_BACKEND_URL = "http://backend.test";
  (global as any).URL.createObjectURL = jest.fn(() => "blob:mock");
  (global as any).URL.revokeObjectURL = jest.fn();
  (Element.prototype as any).scrollIntoView = jest.fn();
  (Element.prototype as any).scrollTo = jest.fn();
  global.fetch = jest.fn((url: string) => {
    if (String(url).includes("/evaluators")) return jsonResponse(EVALUATORS_RESPONSE) as any;
    if (String(url).includes("/tools")) return jsonResponse(TOOLS_RESPONSE) as any;
    return jsonResponse({}) as any;
  }) as any;
});

describe("BulkUploadTestsModal", () => {
  it("renders nothing when isOpen is false", () => {
    const { container } = render(<BulkUploadTestsModal {...defaultProps({ isOpen: false })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the test type selector when open", () => {
    render(<BulkUploadTestsModal {...defaultProps()} />);
    expect(screen.getByText("Bulk upload tests")).toBeInTheDocument();
    expect(screen.getByText("Next Reply")).toBeInTheDocument();
    expect(screen.getByText("Tool Call")).toBeInTheDocument();
    expect(screen.getByText("Conversation")).toBeInTheDocument();
  });

  it("closes via the header X button", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    const { container } = render(<BulkUploadTestsModal {...defaultProps({ onClose })} />);
    const closeBtn = container.querySelector("button") as HTMLButtonElement;
    await user.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it("closes via the Cancel button", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    render(<BulkUploadTestsModal {...defaultProps({ onClose })} />);
    await user.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });

  describe("Tool call uploads", () => {
    async function openToolCallDropzone(user: ReturnType<typeof setupUser>) {
      render(<BulkUploadTestsModal {...defaultProps()} />);
      await selectTestType(user, "Tool Call");
      await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/tools"),
        expect.any(Object),
      ));
      await waitFor(() =>
        expect(screen.getByText(/Drag and drop a CSV/)).toBeInTheDocument(),
      );
    }

    it("fetches tools and shows the dropzone", async () => {
      const user = setupUser();
      await openToolCallDropzone(user);
    });

    it("rejects a dropped file that isn't a .csv", async () => {
      const user = setupUser();
      await openToolCallDropzone(user);
      const dropzone = screen.getByText(/Drag and drop a CSV/).closest("div")!;
      const file = new File(["hi"], "notes.txt", { type: "text/plain" });
      await act(async () => {
        const dataTransfer = { files: [file] };
        dropzone.dispatchEvent(
          Object.assign(new Event("drop", { bubbles: true, cancelable: true }), {
            dataTransfer,
          }),
        );
      });
      expect(screen.getByText("Please upload a .csv file")).toBeInTheDocument();
    });

    it("parses a valid tool-call CSV and shows the preview", async () => {
      const user = setupUser();
      await openToolCallDropzone(user);
      const csv = `name,conversation_history,tool_calls
"Book room test","[{""role"":""user"",""content"":""hi""}]","[{""tool"":""book_room"",""arguments"":{},""accept_any_arguments"":true}]"`;
      await uploadFile(csv);
      await waitFor(() => expect(screen.getByText("Found 1 test")).toBeInTheDocument());
      expect(screen.getByText("Book room test")).toBeInTheDocument();
    });

    it("flags an unknown tool referenced in the CSV", async () => {
      const user = setupUser();
      await openToolCallDropzone(user);
      const csv = `name,conversation_history,tool_calls
"Test A","[{""role"":""user"",""content"":""hi""}]","[{""tool"":""mystery_tool"",""arguments"":{}}]"`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(
          screen.getByText(/doesn't exist in your Tools tab/),
        ).toBeInTheDocument(),
      );
    });

    it("shows an error for empty CSV", async () => {
      const user = setupUser();
      await openToolCallDropzone(user);
      await uploadFile("name,conversation_history,tool_calls\n");
      await waitFor(() => expect(screen.getByText("CSV file is empty")).toBeInTheDocument());
    });

    it("shows an error for missing required columns", async () => {
      const user = setupUser();
      await openToolCallDropzone(user);
      await uploadFile(`name,conversation_history\n"a","[]"`);
      await waitFor(() =>
        expect(screen.getByText(/Missing required columns/)).toBeInTheDocument(),
      );
    });

    it("shows an error for duplicate test names", async () => {
      const user = setupUser();
      await openToolCallDropzone(user);
      const csv = `name,conversation_history,tool_calls
"Dup","[{""role"":""user"",""content"":""hi""}]","[{""tool"":""book_room"",""arguments"":{},""accept_any_arguments"":true}]"
"Dup","[{""role"":""user"",""content"":""hi""}]","[{""tool"":""book_room"",""arguments"":{},""accept_any_arguments"":true}]"`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(screen.getByText(/Duplicate test names found/)).toBeInTheDocument(),
      );
    });

    it("shows a per-row error for missing test name", async () => {
      const user = setupUser();
      await openToolCallDropzone(user);
      const csv = `name,conversation_history,tool_calls
"","[{""role"":""user"",""content"":""hi""}]","[{""tool"":""book_room""}]"`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(screen.getByText(/missing test name/)).toBeInTheDocument(),
      );
    });

    it("shows a per-row error for missing conversation_history", async () => {
      const user = setupUser();
      await openToolCallDropzone(user);
      const csv = `name,conversation_history,tool_calls
"Test A","","[{""tool"":""book_room""}]"`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(screen.getByText(/missing conversation_history/)).toBeInTheDocument(),
      );
    });

    it("shows a per-row error for invalid conversation_history JSON", async () => {
      const user = setupUser();
      await openToolCallDropzone(user);
      const csv = `name,conversation_history,tool_calls
"Test A","not json","[{""tool"":""book_room""}]"`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(
          screen.getByText(/conversation_history is not valid JSON/),
        ).toBeInTheDocument(),
      );
    });

    it("shows a per-row error when conversation_history is not an array", async () => {
      const user = setupUser();
      await openToolCallDropzone(user);
      const csv = `name,conversation_history,tool_calls
"Test A","{""role"":""user""}","[{""tool"":""book_room""}]"`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(
          screen.getByText(/conversation_history must be a JSON array/),
        ).toBeInTheDocument(),
      );
    });

    it("shows a per-row error for missing tool_calls", async () => {
      const user = setupUser();
      await openToolCallDropzone(user);
      const csv = `name,conversation_history,tool_calls
"Test A","[{""role"":""user"",""content"":""hi""}]",""`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(screen.getByText(/missing tool_calls/)).toBeInTheDocument(),
      );
    });

    it("shows a per-row error for invalid tool_calls JSON", async () => {
      const user = setupUser();
      await openToolCallDropzone(user);
      const csv = `name,conversation_history,tool_calls
"Test A","[{""role"":""user"",""content"":""hi""}]","not json"`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(screen.getByText(/tool_calls is not valid JSON/)).toBeInTheDocument(),
      );
    });

    it("shows a per-row error when tool_calls is not an array", async () => {
      const user = setupUser();
      await openToolCallDropzone(user);
      const csv = `name,conversation_history,tool_calls
"Test A","[{""role"":""user"",""content"":""hi""}]","{""tool"":""book_room""}"`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(screen.getByText(/tool_calls must be a JSON array/)).toBeInTheDocument(),
      );
    });

    it("shows a fetch-error message and blocks parsing when /tools fails", async () => {
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (String(url).includes("/tools")) {
          return Promise.resolve({ ok: false, status: 500, json: async () => ({}) });
        }
        return jsonResponse({});
      });
      const user = setupUser();
      render(<BulkUploadTestsModal {...defaultProps()} />);
      await selectTestType(user, "Tool Call");
      await waitFor(() =>
        expect(screen.getByText(/Failed to load tools/)).toBeInTheDocument(),
      );
    });

    it("signs out when /tools returns 401", async () => {
      const { signOut } = jest.requireMock("next-auth/react");
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (String(url).includes("/tools")) {
          return Promise.resolve({ ok: false, status: 401, json: async () => ({}) });
        }
        return jsonResponse({});
      });
      const user = setupUser();
      render(<BulkUploadTestsModal {...defaultProps()} />);
      await selectTestType(user, "Tool Call");
      await waitFor(() => expect(signOut).toHaveBeenCalled());
    });

    it("renders an empty conversation-history and empty tool_calls preview", async () => {
      const user = setupUser();
      await openToolCallDropzone(user);
      const csv = `name,conversation_history,tool_calls
"Empty history","[]","[{""tool"":""book_room""}]"
"Empty calls","[{""role"":""user"",""content"":""hi""}]","[]"`;
      await uploadFile(csv);
      await waitFor(() => expect(screen.getByText("Found 2 tests")).toBeInTheDocument());
      expect(screen.getByText("(empty)")).toBeInTheDocument();
      expect(screen.getByText("empty tool_calls array")).toBeInTheDocument();
    });

    it("renders tool-call arguments, a 'should NOT be called' badge, and any-arguments text", async () => {
      const user = setupUser();
      await openToolCallDropzone(user);
      const csv = `name,conversation_history,tool_calls
"Args test","[{""role"":""user"",""content"":""hi""}]","[{""tool"":""book_room"",""arguments"":{""room"":""101"",""count"":3}},{""tool"":""book_room"",""is_called"":false},{""tool"":""book_room"",""accept_any_arguments"":true}]"`;
      await uploadFile(csv);
      await waitFor(() => expect(screen.getByText("Found 1 test")).toBeInTheDocument());
      expect(screen.getByText("should NOT be called")).toBeInTheDocument();
      expect(screen.getByText("any arguments accepted")).toBeInTheDocument();
    });

    it("stashes a dropped file until the /tools fetch resolves, then auto-parses it", async () => {
      let resolveTools: (v: unknown) => void = () => {};
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (String(url).includes("/tools")) {
          return new Promise((resolve) => {
            resolveTools = resolve;
          });
        }
        return jsonResponse({});
      });
      const user = setupUser();
      render(<BulkUploadTestsModal {...defaultProps()} />);
      await selectTestType(user, "Tool Call");

      const csv = `name,conversation_history,tool_calls
"Book room test","[{""role"":""user"",""content"":""hi""}]","[{""tool"":""book_room"",""arguments"":{},""accept_any_arguments"":true}]"`;
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = makeFile(csv);
      await act(async () => {
        Object.defineProperty(input, "files", { value: [file], configurable: true });
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
      expect(screen.queryByText("Found 1 test")).not.toBeInTheDocument();

      await act(async () => {
        resolveTools({ ok: true, status: 200, json: async () => TOOLS_RESPONSE });
      });
      await waitFor(() => expect(screen.getByText("Found 1 test")).toBeInTheDocument());
    });

    it("removes an uploaded file via the clear button", async () => {
      const user = setupUser();
      await openToolCallDropzone(user);
      const csv = `name,conversation_history,tool_calls
"Book room test","[{""role"":""user"",""content"":""hi""}]","[{""tool"":""book_room"",""arguments"":{},""accept_any_arguments"":true}]"`;
      await uploadFile(csv);
      await waitFor(() => expect(screen.getByText("tests.csv")).toBeInTheDocument());
      const clearBtn = screen.getByText("tests.csv").parentElement!.querySelector("button")!;
      await user.click(clearBtn);
      expect(screen.queryByText("tests.csv")).not.toBeInTheDocument();
    });

    it("submits successfully and calls onSuccess/onClose", async () => {
      (global.fetch as jest.Mock).mockImplementation((url: string, opts?: any) => {
        if (String(url).includes("/tools")) return jsonResponse(TOOLS_RESPONSE) as any;
        if (String(url).includes("/tests/bulk")) {
          return jsonResponse({ created: 1, warnings: [] }) as any;
        }
        return jsonResponse({}) as any;
      });
      const user = setupUser();
      const onSuccess = jest.fn();
      const onClose = jest.fn();
      render(<BulkUploadTestsModal {...defaultProps({ onSuccess, onClose })} />);
      await selectTestType(user, "Tool Call");
      await waitFor(() => expect(screen.getByText(/Drag and drop a CSV/)).toBeInTheDocument());
      const csv = `name,conversation_history,tool_calls
"Book room test","[{""role"":""user"",""content"":""hi""}]","[{""tool"":""book_room"",""arguments"":{},""accept_any_arguments"":true}]"`;
      await uploadFile(csv);
      await waitFor(() => expect(screen.getByText("Found 1 test")).toBeInTheDocument());

      const uploadBtn = screen.getByText(/Upload 1 test/);
      await user.click(uploadBtn);

      await waitFor(() => expect(onSuccess).toHaveBeenCalled());
      expect(onClose).toHaveBeenCalled();
      const bulkCall = (global.fetch as jest.Mock).mock.calls.find((c) =>
        String(c[0]).includes("/tests/bulk"),
      );
      expect(bulkCall).toBeTruthy();
      const body = JSON.parse(bulkCall[1].body);
      expect(body.type).toBe("tool_call");
      expect(body.tests).toHaveLength(1);
    });

    it("shows upload warnings without closing, then Done closes it", async () => {
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (String(url).includes("/tools")) return jsonResponse(TOOLS_RESPONSE) as any;
        if (String(url).includes("/tests/bulk")) {
          return jsonResponse({ created: 1, warnings: ["Test 1 had a minor issue"] }) as any;
        }
        return jsonResponse({}) as any;
      });
      const user = setupUser();
      const onClose = jest.fn();
      render(<BulkUploadTestsModal {...defaultProps({ onClose })} />);
      await selectTestType(user, "Tool Call");
      await waitFor(() => expect(screen.getByText(/Drag and drop a CSV/)).toBeInTheDocument());
      const csv = `name,conversation_history,tool_calls
"Book room test","[{""role"":""user"",""content"":""hi""}]","[{""tool"":""book_room"",""arguments"":{},""accept_any_arguments"":true}]"`;
      await uploadFile(csv);
      await waitFor(() => expect(screen.getByText("Found 1 test")).toBeInTheDocument());
      await user.click(screen.getByText(/Upload 1 test/));

      await waitFor(() =>
        expect(screen.getByText("Test 1 had a minor issue")).toBeInTheDocument(),
      );
      expect(onClose).not.toHaveBeenCalled();
      await user.click(screen.getByText("Done"));
      expect(onClose).toHaveBeenCalled();
    });

    it("shows an upload error message on failed submit", async () => {
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (String(url).includes("/tools")) return jsonResponse(TOOLS_RESPONSE) as any;
        if (String(url).includes("/tests/bulk")) {
          return Promise.resolve({
            ok: false,
            status: 400,
            json: async () => ({ detail: "Bad request" }),
          });
        }
        return jsonResponse({}) as any;
      });
      const user = setupUser();
      render(<BulkUploadTestsModal {...defaultProps()} />);
      await selectTestType(user, "Tool Call");
      await waitFor(() => expect(screen.getByText(/Drag and drop a CSV/)).toBeInTheDocument());
      const csv = `name,conversation_history,tool_calls
"Book room test","[{""role"":""user"",""content"":""hi""}]","[{""tool"":""book_room"",""arguments"":{},""accept_any_arguments"":true}]"`;
      await uploadFile(csv);
      await waitFor(() => expect(screen.getByText("Found 1 test")).toBeInTheDocument());
      await user.click(screen.getByText(/Upload 1 test/));
      await waitFor(() => expect(screen.getByText("Bad request")).toBeInTheDocument());
    });

    it("falls back to a status-based error message when the body has no detail", async () => {
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (String(url).includes("/tools")) return jsonResponse(TOOLS_RESPONSE) as any;
        if (String(url).includes("/tests/bulk")) {
          return Promise.resolve({ ok: false, status: 403, json: async () => ({}) });
        }
        return jsonResponse({}) as any;
      });
      const user = setupUser();
      render(<BulkUploadTestsModal {...defaultProps()} />);
      await selectTestType(user, "Tool Call");
      await waitFor(() => expect(screen.getByText(/Drag and drop a CSV/)).toBeInTheDocument());
      const csv = `name,conversation_history,tool_calls
"Book room test","[{""role"":""user"",""content"":""hi""}]","[{""tool"":""book_room"",""arguments"":{},""accept_any_arguments"":true}]"`;
      await uploadFile(csv);
      await waitFor(() => expect(screen.getByText("Found 1 test")).toBeInTheDocument());
      await user.click(screen.getByText(/Upload 1 test/));
      await waitFor(() =>
        expect(
          screen.getByText(/don't have permission to access one or more/),
        ).toBeInTheDocument(),
      );
    });

    it("signs out on a 401 submit response", async () => {
      const { signOut } = jest.requireMock("next-auth/react");
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (String(url).includes("/tools")) return jsonResponse(TOOLS_RESPONSE) as any;
        if (String(url).includes("/tests/bulk")) {
          return Promise.resolve({ ok: false, status: 401, json: async () => ({}) });
        }
        return jsonResponse({}) as any;
      });
      const user = setupUser();
      render(<BulkUploadTestsModal {...defaultProps()} />);
      await selectTestType(user, "Tool Call");
      await waitFor(() => expect(screen.getByText(/Drag and drop a CSV/)).toBeInTheDocument());
      const csv = `name,conversation_history,tool_calls
"Book room test","[{""role"":""user"",""content"":""hi""}]","[{""tool"":""book_room"",""arguments"":{},""accept_any_arguments"":true}]"`;
      await uploadFile(csv);
      await waitFor(() => expect(screen.getByText("Found 1 test")).toBeInTheDocument());
      await user.click(screen.getByText(/Upload 1 test/));
      await waitFor(() => expect(signOut).toHaveBeenCalled());
    });

    it("downloads the guidelines PDF and sample CSV", async () => {
      const user = setupUser();
      await openToolCallDropzone(user);
      await user.click(screen.getByText("Download CSV format guidelines"));
      expect(generateGuidelinesPdf).toHaveBeenCalled();
      await user.click(screen.getByText("download the sample CSV"));
      expect((global as any).URL.createObjectURL).toHaveBeenCalled();
    });

    it("assigns tests to agents and includes agent_uuids on submit", async () => {
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (String(url).includes("/tools")) return jsonResponse(TOOLS_RESPONSE) as any;
        if (String(url).includes("/tests/bulk")) return jsonResponse({ created: 1 }) as any;
        return jsonResponse({}) as any;
      });
      const user = setupUser();
      render(<BulkUploadTestsModal {...defaultProps()} />);
      await selectTestType(user, "Tool Call");
      await waitFor(() => expect(screen.getByText(/Drag and drop a CSV/)).toBeInTheDocument());
      const csv = `name,conversation_history,tool_calls
"Book room test","[{""role"":""user"",""content"":""hi""}]","[{""tool"":""book_room"",""arguments"":{},""accept_any_arguments"":true}]"`;
      await uploadFile(csv);
      await waitFor(() => expect(screen.getByText("Found 1 test")).toBeInTheDocument());

      await waitFor(() => expect(screen.getByTestId("multi-agent-picker")).toBeInTheDocument());
      await user.click(screen.getByText("Agent One"));

      await user.click(screen.getByText(/Upload 1 test/));
      await waitFor(() =>
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining("/tests/bulk"),
          expect.any(Object),
        ),
      );
      const bulkCall = (global.fetch as jest.Mock).mock.calls.find((c) =>
        String(c[0]).includes("/tests/bulk"),
      );
      const body = JSON.parse(bulkCall[1].body);
      expect(body.agent_uuids).toEqual(["agent-1"]);
    });

    it("hides the assign-to-agents section when lockedAgentUuid is set and sends it on submit", async () => {
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (String(url).includes("/tools")) return jsonResponse(TOOLS_RESPONSE) as any;
        if (String(url).includes("/tests/bulk")) return jsonResponse({ created: 1 }) as any;
        return jsonResponse({}) as any;
      });
      const user = setupUser();
      render(<BulkUploadTestsModal {...defaultProps({ lockedAgentUuid: "locked-agent" })} />);
      await selectTestType(user, "Tool Call");
      await waitFor(() => expect(screen.getByText(/Drag and drop a CSV/)).toBeInTheDocument());
      const csv = `name,conversation_history,tool_calls
"Book room test","[{""role"":""user"",""content"":""hi""}]","[{""tool"":""book_room"",""arguments"":{},""accept_any_arguments"":true}]"`;
      await uploadFile(csv);
      await waitFor(() => expect(screen.getByText("Found 1 test")).toBeInTheDocument());
      expect(screen.queryByTestId("multi-agent-picker")).not.toBeInTheDocument();

      await user.click(screen.getByText(/Upload 1 test/));
      await waitFor(() =>
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining("/tests/bulk"),
          expect.any(Object),
        ),
      );
      const bulkCall = (global.fetch as jest.Mock).mock.calls.find((c) =>
        String(c[0]).includes("/tests/bulk"),
      );
      const body = JSON.parse(bulkCall[1].body);
      expect(body.agent_uuids).toEqual(["locked-agent"]);
    });
  });

  describe("Next Reply (evaluator-based) uploads", () => {
    async function pickEvaluator(user: ReturnType<typeof setupUser>, name: string) {
      const trigger = screen.getByText("Select one or more evaluators");
      await user.click(trigger);
      await waitFor(() => expect(screen.getByText(name)).toBeInTheDocument());
      await user.click(screen.getByText(name));
      // Close the dropdown to commit the selection (click outside).
      await user.click(document.body);
    }

    it("fetches llm evaluators and requires a selection before showing the dropzone", async () => {
      const user = setupUser();
      render(<BulkUploadTestsModal {...defaultProps()} />);
      await selectTestType(user, "Next Reply");
      await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/evaluators"),
        expect.any(Object),
      ));
      expect(screen.queryByText(/Drag and drop a CSV/)).not.toBeInTheDocument();

      await pickEvaluator(user, "Helpfulness");
      await waitFor(() =>
        expect(screen.getByText(/Drag and drop a CSV/)).toBeInTheDocument(),
      );
    });

    it("parses a valid response CSV with a variable evaluator", async () => {
      const user = setupUser();
      render(<BulkUploadTestsModal {...defaultProps()} />);
      await selectTestType(user, "Next Reply");
      await waitFor(() => expect(screen.queryByText("Loading evaluators")).not.toBeInTheDocument());
      await pickEvaluator(user, "Helpfulness");
      await waitFor(() => expect(screen.getByText(/Drag and drop a CSV/)).toBeInTheDocument());

      const csv = `name,conversation_history,Helpfulness,Helpfulness/criteria
"Greeting test","[{""role"":""user"",""content"":""hi""}]","true","Be nice"`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(screen.getByText(/ready to upload/)).toBeInTheDocument(),
      );
      expect(screen.getByText("Greeting test")).toBeInTheDocument();
    });

    it("errors when a row has an invalid include flag", async () => {
      const user = setupUser();
      render(<BulkUploadTestsModal {...defaultProps()} />);
      await selectTestType(user, "Next Reply");
      await pickEvaluator(user, "Helpfulness");
      await waitFor(() => expect(screen.getByText(/Drag and drop a CSV/)).toBeInTheDocument());

      const csv = `name,conversation_history,Helpfulness,Helpfulness/criteria
"Greeting test","[{""role"":""user"",""content"":""hi""}]","maybe","Be nice"`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(screen.getByText(/must be true or false/)).toBeInTheDocument(),
      );
    });

    it("errors when a required variable value is missing", async () => {
      const user = setupUser();
      render(<BulkUploadTestsModal {...defaultProps()} />);
      await selectTestType(user, "Next Reply");
      await pickEvaluator(user, "Helpfulness");
      await waitFor(() => expect(screen.getByText(/Drag and drop a CSV/)).toBeInTheDocument());

      const csv = `name,conversation_history,Helpfulness,Helpfulness/criteria
"Greeting test","[{""role"":""user"",""content"":""hi""}]","true",""`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(screen.getByText(/missing value\(s\) for/)).toBeInTheDocument(),
      );
    });

    it("errors when every evaluator is excluded on a row", async () => {
      const user = setupUser();
      render(<BulkUploadTestsModal {...defaultProps()} />);
      await selectTestType(user, "Next Reply");
      await pickEvaluator(user, "Politeness");
      await waitFor(() => expect(screen.getByText(/Drag and drop a CSV/)).toBeInTheDocument());

      const csv = `name,conversation_history,Politeness
"Greeting test","[{""role"":""user"",""content"":""hi""}]","false"`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(screen.getByText(/no evaluators attached/)).toBeInTheDocument(),
      );
    });

    it("submits an evaluator-based upload with the resolved evaluators payload", async () => {
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (String(url).includes("/evaluators")) return jsonResponse(EVALUATORS_RESPONSE) as any;
        if (String(url).includes("/tests/bulk")) return jsonResponse({ created: 1 }) as any;
        return jsonResponse({}) as any;
      });
      const user = setupUser();
      render(<BulkUploadTestsModal {...defaultProps()} />);
      await selectTestType(user, "Next Reply");
      await pickEvaluator(user, "Politeness");
      await waitFor(() => expect(screen.getByText(/Drag and drop a CSV/)).toBeInTheDocument());

      const csv = `name,conversation_history,Politeness
"Greeting test","[{""role"":""user"",""content"":""hi""}]","true"`;
      await uploadFile(csv);
      await waitFor(() => expect(screen.getByText(/ready to upload/)).toBeInTheDocument());

      await user.click(screen.getByText(/Upload 1 test/));
      await waitFor(() =>
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining("/tests/bulk"),
          expect.any(Object),
        ),
      );
      const bulkCall = (global.fetch as jest.Mock).mock.calls.find((c) =>
        String(c[0]).includes("/tests/bulk"),
      );
      const body = JSON.parse(bulkCall[1].body);
      expect(body.type).toBe("response");
      expect(body.tests[0].evaluators).toEqual([{ evaluator_uuid: "eval-2" }]);
    });

    it("shows a fetch-error message when /evaluators fails", async () => {
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (String(url).includes("/evaluators")) {
          return Promise.resolve({ ok: false, status: 500, json: async () => ({}) });
        }
        return jsonResponse({});
      });
      const user = setupUser();
      render(<BulkUploadTestsModal {...defaultProps()} />);
      await selectTestType(user, "Next Reply");
      await waitFor(() =>
        expect(screen.getByText(/Failed to load evaluators/)).toBeInTheDocument(),
      );
    });

    it("signs out when /evaluators returns 401", async () => {
      const { signOut } = jest.requireMock("next-auth/react");
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (String(url).includes("/evaluators")) {
          return Promise.resolve({ ok: false, status: 401, json: async () => ({}) });
        }
        return jsonResponse({});
      });
      const user = setupUser();
      render(<BulkUploadTestsModal {...defaultProps()} />);
      await selectTestType(user, "Next Reply");
      await waitFor(() => expect(signOut).toHaveBeenCalled());
    });

    it("downloads the sample CSV tailored to the selected evaluators", async () => {
      const user = setupUser();
      render(<BulkUploadTestsModal {...defaultProps()} />);
      await selectTestType(user, "Next Reply");
      await pickEvaluator(user, "Helpfulness");
      await waitFor(() => expect(screen.getByText(/Drag and drop a CSV/)).toBeInTheDocument());
      await user.click(screen.getByText("download the sample CSV"));
      expect((global as any).URL.createObjectURL).toHaveBeenCalled();
    });

    it("filters evaluators by the conversation evaluator_type for Conversation uploads", async () => {
      const user = setupUser();
      render(<BulkUploadTestsModal {...defaultProps()} />);
      await selectTestType(user, "Conversation");
      await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/evaluators"),
        expect.any(Object),
      ));
      const trigger = screen.getByText("Select one or more evaluators");
      await user.click(trigger);
      await waitFor(() => expect(screen.getByText("ConvoQuality")).toBeInTheDocument());
      expect(screen.queryByText("Helpfulness")).not.toBeInTheDocument();
    });
  });

  describe("row/column limits", () => {
    it("rejects a CSV with more than 500 rows", async () => {
      const user = setupUser();
      render(<BulkUploadTestsModal {...defaultProps()} />);
      await selectTestType(user, "Tool Call");
      await waitFor(() => expect(screen.getByText(/Drag and drop a CSV/)).toBeInTheDocument());

      const header = "name,conversation_history,tool_calls\n";
      const row = `"Test","[{""role"":""user"",""content"":""hi""}]","[{""tool"":""book_room""}]"\n`;
      const csv = header + row.repeat(501);
      await uploadFile(csv);
      await waitFor(() =>
        expect(screen.getByText(/the maximum is 500 tests per upload/)).toBeInTheDocument(),
      );
    });
  });
});
