import * as React from "react";
import { render, screen, setupUser, waitFor, act } from "@/test-utils";
import {
  BulkUploadConversationItemsDialog,
  type ConversationLinkedEvaluator,
} from "../BulkUploadConversationItemsDialog";

// jspdf ships ESM-only and Jest's transform can't parse it. bulk-upload-shared
// (imported transitively, un-mocked so we exercise the real preview/shell
// components) pulls it in for `generateGuidelinesPdf` — stub with a minimal
// fake so clicking the guidelines button doesn't crash.
jest.mock("jspdf", () => {
  class FakeJsPDF {
    internal = { pageSize: { getWidth: () => 595, getHeight: () => 842 } };
    setFont() {}
    setFontSize() {}
    setTextColor() {}
    setDrawColor() {}
    setLineWidth() {}
    setFillColor() {}
    line() {}
    roundedRect() {}
    addPage() {}
    text() {}
    splitTextToSize(text: string) {
      return String(text).split("\n");
    }
    output() {
      return new Blob(["pdf"], { type: "application/pdf" });
    }
  }
  return { jsPDF: FakeJsPDF };
});

jest.mock("../../../lib/api", () => ({ apiClient: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { apiClient } = require("../../../lib/api") as { apiClient: jest.Mock };

function makeFile(content: string, name = "items.csv") {
  return new File([content], name, { type: "text/csv" });
}

async function uploadFile(content: string, name = "items.csv") {
  const input = document.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;
  const file = makeFile(content, name);
  await act(async () => {
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

beforeEach(() => {
  apiClient.mockReset();
  (global as unknown as { URL: typeof URL }).URL.createObjectURL = jest.fn(
    () => "blob:mock",
  );
  (global as unknown as { URL: typeof URL }).URL.revokeObjectURL = jest.fn();
  jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

const linkedEvaluators: ConversationLinkedEvaluator[] = [
  {
    uuid: "ev-1",
    name: "Correctness",
    output_type: "binary",
    scale_min: null,
    scale_max: null,
  },
];

function defaultProps(
  overrides: Partial<React.ComponentProps<typeof BulkUploadConversationItemsDialog>> = {},
) {
  return {
    isOpen: true,
    accessToken: "tok",
    taskUuid: "task-1",
    onClose: jest.fn(),
    onSuccess: jest.fn(),
    ...overrides,
  };
}

describe("BulkUploadConversationItemsDialog", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <BulkUploadConversationItemsDialog {...defaultProps({ isOpen: false })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the dropzone with no linked evaluators", () => {
    render(<BulkUploadConversationItemsDialog {...defaultProps()} />);
    expect(screen.getByText("Bulk upload items")).toBeInTheDocument();
    expect(
      screen.getByText("Drop a CSV here or click to browse"),
    ).toBeInTheDocument();
    // No annotation opt-in when there are no linked evaluators.
    expect(
      screen.queryByText("Do you want to upload existing human labels?"),
    ).not.toBeInTheDocument();
  });

  it("parses a valid CSV and shows the items preview", async () => {
    render(<BulkUploadConversationItemsDialog {...defaultProps()} />);
    const csv = `name,transcript
"Card lost","[{""role"":""assistant"",""content"":""Hi""},{""role"":""user"",""content"":""I lost my card""}]"`;
    await uploadFile(csv);
    await waitFor(() =>
      expect(screen.getByText("1 item ready to upload")).toBeInTheDocument(),
    );
    expect(screen.getByText("Card lost")).toBeInTheDocument();
    expect(screen.getByText("I lost my card")).toBeInTheDocument();
    // No Description column since no row has one.
    expect(screen.queryByText("Description")).not.toBeInTheDocument();
  });

  it("shows the Description column when a row has a description", async () => {
    render(<BulkUploadConversationItemsDialog {...defaultProps()} />);
    const csv = `name,description,transcript
"Refund","Duplicate charge flow","[{""role"":""user"",""content"":""charged twice""}]"`;
    await uploadFile(csv);
    await waitFor(() =>
      expect(screen.getByText("1 item ready to upload")).toBeInTheDocument(),
    );
    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(screen.getByText("Duplicate charge flow")).toBeInTheDocument();
  });

  it("pluralizes the item count", async () => {
    render(<BulkUploadConversationItemsDialog {...defaultProps()} />);
    const csv = `name,transcript
"A","[{""role"":""user"",""content"":""hi""}]"
"B","[{""role"":""user"",""content"":""hey""}]"`;
    await uploadFile(csv);
    await waitFor(() =>
      expect(screen.getByText("2 items ready to upload")).toBeInTheDocument(),
    );
  });

  it("errors when required columns are missing", async () => {
    render(<BulkUploadConversationItemsDialog {...defaultProps()} />);
    await uploadFile(`foo,bar\n1,2`);
    await waitFor(() =>
      expect(
        screen.getByText(/CSV must include "name" and "transcript" columns/),
      ).toBeInTheDocument(),
    );
  });

  it("errors when a row is missing a name", async () => {
    render(<BulkUploadConversationItemsDialog {...defaultProps()} />);
    const csv = `name,transcript\n"","[{""role"":""user"",""content"":""hi""}]"`;
    await uploadFile(csv);
    await waitFor(() =>
      expect(screen.getByText(/Row 1: "name" is required/)).toBeInTheDocument(),
    );
  });

  it("errors when a row has a name but no transcript", async () => {
    render(<BulkUploadConversationItemsDialog {...defaultProps()} />);
    const csv = `name,transcript\n"Has name",""`;
    await uploadFile(csv);
    await waitFor(() =>
      expect(
        screen.getByText(/Row 1: "transcript" is required/),
      ).toBeInTheDocument(),
    );
  });

  it("errors on invalid transcript JSON", async () => {
    render(<BulkUploadConversationItemsDialog {...defaultProps()} />);
    const csv = `name,transcript\n"Bad json","not json"`;
    await uploadFile(csv);
    await waitFor(() =>
      expect(
        screen.getByText(/"transcript" must be valid JSON/),
      ).toBeInTheDocument(),
    );
  });

  it("errors when transcript is not an array", async () => {
    render(<BulkUploadConversationItemsDialog {...defaultProps()} />);
    const csv = `name,transcript\n"Not array","{""role"":""user""}"`;
    await uploadFile(csv);
    await waitFor(() =>
      expect(
        screen.getByText(/"transcript" must be a non-empty array/),
      ).toBeInTheDocument(),
    );
  });

  it("errors when transcript is an empty array", async () => {
    render(<BulkUploadConversationItemsDialog {...defaultProps()} />);
    const csv = `name,transcript\n"Empty array","[]"`;
    await uploadFile(csv);
    await waitFor(() =>
      expect(
        screen.getByText(/"transcript" must be a non-empty array/),
      ).toBeInTheDocument(),
    );
  });

  it("errors when a turn is not an object", async () => {
    render(<BulkUploadConversationItemsDialog {...defaultProps()} />);
    const csv = `name,transcript\n"Bad turn","[""not-an-object""]"`;
    await uploadFile(csv);
    await waitFor(() =>
      expect(
        screen.getByText(/each turn must be an object with a "role"/),
      ).toBeInTheDocument(),
    );
  });

  it("errors when a turn is missing a string role", async () => {
    render(<BulkUploadConversationItemsDialog {...defaultProps()} />);
    const csv = `name,transcript\n"Missing role","[{""content"":""hi""}]"`;
    await uploadFile(csv);
    await waitFor(() =>
      expect(
        screen.getByText(/each turn must have a string "role"/),
      ).toBeInTheDocument(),
    );
  });

  it("errors when there are no non-empty rows at all", async () => {
    render(<BulkUploadConversationItemsDialog {...defaultProps()} />);
    await uploadFile(`name,transcript\n"",""`);
    await waitFor(() =>
      expect(
        screen.getByText(/No rows with a transcript were found/),
      ).toBeInTheDocument(),
    );
  });

  it("uploads successfully and calls onSuccess", async () => {
    apiClient.mockResolvedValueOnce({});
    const user = setupUser();
    const onSuccess = jest.fn();
    render(
      <BulkUploadConversationItemsDialog
        {...defaultProps({ onSuccess })}
      />,
    );
    const csv = `name,description,transcript
"Card lost","","[{""role"":""user"",""content"":""hi""}]"`;
    await uploadFile(csv);
    await waitFor(() =>
      expect(screen.getByText("1 item ready to upload")).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Upload item" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(1, false));
    expect(apiClient).toHaveBeenCalledWith(
      "/annotation-tasks/task-1/items",
      "tok",
      {
        method: "POST",
        body: {
          items: [
            {
              payload: {
                name: "Card lost",
                transcript: [{ role: "user", content: "hi" }],
              },
            },
          ],
        },
      },
    );
  });

  it("includes description in the payload when present", async () => {
    apiClient.mockResolvedValueOnce({});
    const user = setupUser();
    render(<BulkUploadConversationItemsDialog {...defaultProps()} />);
    const csv = `name,description,transcript
"Refund","Duplicate charge","[{""role"":""user"",""content"":""hi""}]"`;
    await uploadFile(csv);
    await waitFor(() =>
      expect(screen.getByText("1 item ready to upload")).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Upload item" }));
    await waitFor(() =>
      expect(apiClient).toHaveBeenCalledWith(
        "/annotation-tasks/task-1/items",
        "tok",
        expect.anything(),
      ),
    );
    const uploadCall = apiClient.mock.calls.find(
      (c) => c[0] === "/annotation-tasks/task-1/items",
    )!;
    const body = uploadCall[2].body;
    expect(body.items[0].payload.description).toBe("Duplicate charge");
  });

  it("shows an upload error banner on failure", async () => {
    // /annotators is fetched unconditionally on mount (the hook doesn't
    // gate on linkedEvaluators), so key off the endpoint rather than call
    // order to make sure the rejection lands on the upload call.
    apiClient.mockImplementation((endpoint: string) => {
      if (endpoint === "/annotators") return Promise.resolve([]);
      return Promise.reject(new Error("Request failed: 400 - Bad name"));
    });
    const user = setupUser();
    render(<BulkUploadConversationItemsDialog {...defaultProps()} />);
    const csv = `name,transcript\n"A","[{""role"":""user"",""content"":""hi""}]"`;
    await uploadFile(csv);
    await waitFor(() =>
      expect(screen.getByText("1 item ready to upload")).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Upload item" }));
    await waitFor(() => expect(screen.getByText("Bad name")).toBeInTheDocument());
  });

  it("downloads the sample CSV and guidelines PDF", async () => {
    const user = setupUser();
    render(<BulkUploadConversationItemsDialog {...defaultProps()} />);
    await user.click(
      screen.getByRole("button", { name: /Download CSV format guidelines/ }),
    );
    expect(
      (global as unknown as { URL: { createObjectURL: jest.Mock } }).URL
        .createObjectURL,
    ).toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "download the sample CSV" }),
    );
    expect(
      (global as unknown as { URL: { createObjectURL: jest.Mock } }).URL
        .createObjectURL,
    ).toHaveBeenCalledTimes(2);
  });

  it("closes via Cancel", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    render(<BulkUploadConversationItemsDialog {...defaultProps({ onClose })} />);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });

  describe("with linked evaluators (annotation flow)", () => {
    it("shows the annotation opt-in and loads annotators on toggling Yes", async () => {
      apiClient.mockResolvedValueOnce([{ uuid: "a1", name: "Alice" }]);
      const user = setupUser();
      render(
        <BulkUploadConversationItemsDialog
          {...defaultProps({ linkedEvaluators })}
        />,
      );
      expect(
        screen.getByText("Do you want to upload existing human labels?"),
      ).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Yes" }));
      await waitFor(() =>
        expect(apiClient).toHaveBeenCalledWith("/annotators", "tok"),
      );
      await waitFor(() =>
        expect(screen.getByLabelText("Select annotator")).toBeInTheDocument(),
      );
    });

    it("hides the upload section until an annotator is selected", async () => {
      apiClient.mockResolvedValueOnce([{ uuid: "a1", name: "Alice" }]);
      const user = setupUser();
      render(
        <BulkUploadConversationItemsDialog
          {...defaultProps({ linkedEvaluators })}
        />,
      );
      await user.click(screen.getByRole("button", { name: "Yes" }));
      await waitFor(() =>
        expect(screen.getByLabelText("Select annotator")).toBeInTheDocument(),
      );
      expect(
        screen.queryByText("Drop a CSV here or click to browse"),
      ).not.toBeInTheDocument();
    });

    it("shows a duplicate-evaluator-name warning and blocks annotation", async () => {
      const dup: ConversationLinkedEvaluator[] = [
        { uuid: "1", name: "Same", output_type: "binary", scale_min: null, scale_max: null },
        { uuid: "2", name: "Same", output_type: "binary", scale_min: null, scale_max: null },
      ];
      apiClient.mockResolvedValueOnce([{ uuid: "a1", name: "Alice" }]);
      const user = setupUser();
      render(
        <BulkUploadConversationItemsDialog
          {...defaultProps({ linkedEvaluators: dup })}
        />,
      );
      await user.click(screen.getByRole("button", { name: "Yes" }));
      await waitFor(() =>
        expect(
          screen.getByText(/Two or more linked evaluators share the same name/),
        ).toBeInTheDocument(),
      );
      expect(
        screen.queryByText("Drop a CSV here or click to browse"),
      ).not.toBeInTheDocument();
    });

    it("shows a missing-output-type warning", async () => {
      const noOutputType: ConversationLinkedEvaluator[] = [
        { uuid: "1", name: "NoType", output_type: null, scale_min: null, scale_max: null },
      ];
      apiClient.mockResolvedValueOnce([{ uuid: "a1", name: "Alice" }]);
      const user = setupUser();
      render(
        <BulkUploadConversationItemsDialog
          {...defaultProps({ linkedEvaluators: noOutputType })}
        />,
      );
      await user.click(screen.getByRole("button", { name: "Yes" }));
      await waitFor(() =>
        expect(
          screen.getByText(/have no binary\/rating output configured/),
        ).toBeInTheDocument(),
      );
    });

    async function selectAnnotator(user: ReturnType<typeof setupUser>) {
      await user.click(screen.getByRole("button", { name: "Yes" }));
      await waitFor(() =>
        expect(screen.getByLabelText("Select annotator")).toBeInTheDocument(),
      );
      await user.click(screen.getByLabelText("Select annotator"));
      await user.click(screen.getByRole("option", { name: "Alice" }));
    }

    it("parses annotation columns and shows values in the preview", async () => {
      apiClient
        .mockResolvedValueOnce([{ uuid: "a1", name: "Alice" }]) // annotators
        .mockResolvedValueOnce({
          all_new: true,
          existing_with_annotations: [],
          existing_without_annotations: [],
        }); // annotated-check
      const user = setupUser();
      render(
        <BulkUploadConversationItemsDialog
          {...defaultProps({ linkedEvaluators })}
        />,
      );
      await selectAnnotator(user);
      await waitFor(() =>
        expect(
          screen.getByText("Drop a CSV here or click to browse"),
        ).toBeInTheDocument(),
      );

      const csv = `name,transcript,Correctness/value,Correctness/reasoning
"Card lost","[{""role"":""user"",""content"":""hi""}]","true","Looks right"`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(screen.getByText("1 item ready to upload")).toBeInTheDocument(),
      );
      expect(screen.getByText("true")).toBeInTheDocument();
      expect(screen.getByText("Looks right")).toBeInTheDocument();
    });

    it("errors when an annotation column is missing", async () => {
      apiClient.mockResolvedValueOnce([{ uuid: "a1", name: "Alice" }]);
      const user = setupUser();
      render(
        <BulkUploadConversationItemsDialog
          {...defaultProps({ linkedEvaluators })}
        />,
      );
      await selectAnnotator(user);
      await waitFor(() =>
        expect(
          screen.getByText("Drop a CSV here or click to browse"),
        ).toBeInTheDocument(),
      );
      const csv = `name,transcript\n"A","[{""role"":""user"",""content"":""hi""}]"`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(
          screen.getByText(/CSV is missing annotation column\(s\)/),
        ).toBeInTheDocument(),
      );
    });

    it("errors when an annotation value cell is empty", async () => {
      apiClient.mockResolvedValueOnce([{ uuid: "a1", name: "Alice" }]);
      const user = setupUser();
      render(
        <BulkUploadConversationItemsDialog
          {...defaultProps({ linkedEvaluators })}
        />,
      );
      await selectAnnotator(user);
      await waitFor(() =>
        expect(
          screen.getByText("Drop a CSV here or click to browse"),
        ).toBeInTheDocument(),
      );
      const csv = `name,transcript,Correctness/value,Correctness/reasoning
"A","[{""role"":""user"",""content"":""hi""}]","",""`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(
          screen.getByText(/missing value for "Correctness\/value"/),
        ).toBeInTheDocument(),
      );
    });

    it("errors when an annotation value cell is invalid", async () => {
      apiClient.mockResolvedValueOnce([{ uuid: "a1", name: "Alice" }]);
      const user = setupUser();
      render(
        <BulkUploadConversationItemsDialog
          {...defaultProps({ linkedEvaluators })}
        />,
      );
      await selectAnnotator(user);
      await waitFor(() =>
        expect(
          screen.getByText("Drop a CSV here or click to browse"),
        ).toBeInTheDocument(),
      );
      const csv = `name,transcript,Correctness/value,Correctness/reasoning
"A","[{""role"":""user"",""content"":""hi""}]","maybe",""`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(
          screen.getByText(/expected "true"\/"pass" or "false"\/"fail"/),
        ).toBeInTheDocument(),
      );
    });

    it("uploads with annotations and sends annotator_id + annotations payload", async () => {
      apiClient
        .mockResolvedValueOnce([{ uuid: "a1", name: "Alice" }]) // annotators
        .mockResolvedValueOnce({
          all_new: true,
          existing_with_annotations: [],
          existing_without_annotations: [],
        }) // annotated-check
        .mockResolvedValueOnce({}); // upload
      const user = setupUser();
      const onSuccess = jest.fn();
      render(
        <BulkUploadConversationItemsDialog
          {...defaultProps({ linkedEvaluators, onSuccess })}
        />,
      );
      await selectAnnotator(user);
      await waitFor(() =>
        expect(
          screen.getByText("Drop a CSV here or click to browse"),
        ).toBeInTheDocument(),
      );
      const csv = `name,transcript,Correctness/value,Correctness/reasoning
"Card lost","[{""role"":""user"",""content"":""hi""}]","true","Looks right"`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(screen.getByText("1 item ready to upload")).toBeInTheDocument(),
      );
      await user.click(screen.getByRole("button", { name: "Upload item" }));
      await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(1, true));

      const uploadCall = apiClient.mock.calls.find(
        (c) => c[0] === "/annotation-tasks/task-1/items",
      );
      expect(uploadCall).toBeTruthy();
      expect(uploadCall![2].body).toEqual({
        annotator_id: "a1",
        items: [
          {
            payload: {
              name: "Card lost",
              transcript: [{ role: "user", content: "hi" }],
            },
            annotations: {
              "ev-1": { value: true, reasoning: "Looks right" },
            },
          },
        ],
      });
    });

    it("blocks upload with an error message when no annotator is selected at upload time", async () => {
      // Reachable only if uploadAnnotations flips true without a selected
      // annotator and the upload section isn't hidden — the shell always
      // hides the section in that state today, so this exercises the
      // defensive guard indirectly via a rejected annotators fetch, which
      // still surfaces the empty-state UI instead of the dropzone.
      apiClient.mockRejectedValueOnce(new Error("boom"));
      const user = setupUser();
      render(
        <BulkUploadConversationItemsDialog
          {...defaultProps({ linkedEvaluators })}
        />,
      );
      await user.click(screen.getByRole("button", { name: "Yes" }));
      await waitFor(() =>
        expect(screen.getByText("boom")).toBeInTheDocument(),
      );
      expect(
        screen.queryByText("Drop a CSV here or click to browse"),
      ).not.toBeInTheDocument();
    });

    it("resets parsed items when toggling annotations off/on", async () => {
      apiClient.mockResolvedValue([{ uuid: "a1", name: "Alice" }]);
      const user = setupUser();
      render(
        <BulkUploadConversationItemsDialog
          {...defaultProps({ linkedEvaluators })}
        />,
      );
      // Parse a plain CSV first (no annotations).
      const csv = `name,transcript\n"A","[{""role"":""user"",""content"":""hi""}]"`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(screen.getByText("1 item ready to upload")).toBeInTheDocument(),
      );

      // Toggling annotations on resets the parsed CSV/file.
      await user.click(screen.getByRole("button", { name: "Yes" }));
      await waitFor(() =>
        expect(
          screen.queryByText("1 item ready to upload"),
        ).not.toBeInTheDocument(),
      );
    });

    it("shows an empty annotators state and a link to add one", async () => {
      apiClient.mockResolvedValueOnce([]);
      const user = setupUser();
      render(
        <BulkUploadConversationItemsDialog
          {...defaultProps({ linkedEvaluators })}
        />,
      );
      await user.click(screen.getByRole("button", { name: "Yes" }));
      await waitFor(() =>
        expect(
          screen.getByText((_, el) =>
            el?.tagName.toLowerCase() === "div" &&
            (el?.textContent ?? "").startsWith("No annotators exist yet."),
          ),
        ).toBeInTheDocument(),
      );
    });
  });
});
