import * as React from "react";
import { render, screen, setupUser, waitFor, act } from "@/test-utils";
import {
  BulkUploadItemsDialog,
  type BulkContentColumn,
  type BulkLinkedEvaluator,
  type BulkSampleRow,
} from "../BulkUploadItemsDialog";

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
    Object.defineProperty(input, "files", {
      value: [file],
      configurable: true,
    });
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

// ─── Test content columns: one plain-string column + one JSON column that can
// produce a parse error. Everything else about the dialog is generic. ─────
const CONTENT_COLUMNS: BulkContentColumn[] = [
  {
    payloadKey: "body",
    csvColumn: "body",
    headerCandidates: ["body", "text"],
    previewLabel: "Body",
    previewWidth: "minmax(120px, 200px)",
    guidelineDescription: "The main body of the item.",
    guidelineExample: "Hello world",
    parse: (raw) => ({ value: raw }),
    renderPreview: (value) => <div>{String(value ?? "")}</div>,
  },
  {
    payloadKey: "data",
    csvColumn: "data",
    headerCandidates: ["data"],
    previewLabel: "Data",
    previewWidth: "minmax(64px, 88px)",
    guidelineDescription: "A JSON object.",
    parse: (raw, rowIndex) => {
      try {
        return { value: JSON.parse(raw) };
      } catch {
        return { error: `Row ${rowIndex + 1}: "data" must be valid JSON.` };
      }
    },
    renderPreview: (value) => <div>{JSON.stringify(value)}</div>,
  },
];

const SAMPLE_ROWS: BulkSampleRow[] = [
  {
    name: "Item A",
    description: "Description A",
    content: { body: "hello", data: '{"k":1}' },
    variableValue: "some criteria",
    reasoning: "looks good",
  },
];

const SAMPLE_FALLBACK_EVALUATORS: BulkLinkedEvaluator[] = [
  {
    uuid: "",
    name: "Correctness",
    slug: null,
    variables: [{ name: "criteria" }],
    output_type: "binary",
    scale_min: null,
    scale_max: null,
  },
];

const linkedEvaluators: BulkLinkedEvaluator[] = [
  {
    uuid: "ev-1",
    name: "Correctness",
    slug: null,
    variables: [{ name: "criteria" }],
    output_type: "binary",
    scale_min: null,
    scale_max: null,
  },
];

const ratingEvaluator: BulkLinkedEvaluator[] = [
  {
    uuid: "ev-r",
    name: "Quality",
    slug: null,
    variables: [],
    output_type: "rating",
    scale_min: 1,
    scale_max: 5,
  },
];

function defaultProps(
  overrides: Partial<React.ComponentProps<typeof BulkUploadItemsDialog>> = {},
) {
  return {
    isOpen: true,
    accessToken: "tok",
    taskUuid: "task-1",
    contentColumns: CONTENT_COLUMNS,
    sampleRows: SAMPLE_ROWS,
    sampleFallbackEvaluators: SAMPLE_FALLBACK_EVALUATORS,
    guidelinesTitle: "Bulk upload: test items",
    guidelinesIntro: "Upload a CSV with the following columns.",
    sampleFilenameBase: "test_items",
    onClose: jest.fn(),
    onSuccess: jest.fn(),
    ...overrides,
  };
}

describe("BulkUploadItemsDialog", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <BulkUploadItemsDialog {...defaultProps({ isOpen: false })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the dropzone with no linked evaluators", () => {
    render(<BulkUploadItemsDialog {...defaultProps()} />);
    expect(screen.getByText("Bulk upload items")).toBeInTheDocument();
    expect(
      screen.getByText("Drop a CSV here or click to browse"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Do you want to upload existing human labels?"),
    ).not.toBeInTheDocument();
  });

  it("parses a valid CSV and shows the items preview", async () => {
    render(<BulkUploadItemsDialog {...defaultProps()} />);
    const csv = `name,body,data\n"Card lost","hello world","{""k"":1}"`;
    await uploadFile(csv);
    await waitFor(() =>
      expect(screen.getByText("1 item ready to upload")).toBeInTheDocument(),
    );
    expect(screen.getByText("Card lost")).toBeInTheDocument();
    expect(screen.getByText("hello world")).toBeInTheDocument();
    // No Description column since no row carries one.
    expect(screen.queryByText("Description")).not.toBeInTheDocument();
  });

  it("shows the Description column when a row has a description", async () => {
    render(<BulkUploadItemsDialog {...defaultProps()} />);
    const csv = `name,description,body,data\n"Refund","Dup charge","x","{}"`;
    await uploadFile(csv);
    await waitFor(() =>
      expect(screen.getByText("1 item ready to upload")).toBeInTheDocument(),
    );
    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(screen.getByText("Dup charge")).toBeInTheDocument();
  });

  it("pluralizes the item count", async () => {
    render(<BulkUploadItemsDialog {...defaultProps()} />);
    const csv = `name,body,data\n"A","x","{}"\n"B","y","{}"`;
    await uploadFile(csv);
    await waitFor(() =>
      expect(screen.getByText("2 items ready to upload")).toBeInTheDocument(),
    );
  });

  it("errors when required columns are missing", async () => {
    render(<BulkUploadItemsDialog {...defaultProps()} />);
    await uploadFile(`foo,bar\n1,2`);
    await waitFor(() =>
      expect(
        screen.getByText(/CSV must include "name", "body", "data" columns/),
      ).toBeInTheDocument(),
    );
  });

  it("errors when a row is missing a name", async () => {
    render(<BulkUploadItemsDialog {...defaultProps()} />);
    const csv = `name,body,data\n"","x","{}"\n"B","y","{}"`;
    await uploadFile(csv);
    await waitFor(() =>
      expect(screen.getByText(/Row 1: "name" is required/)).toBeInTheDocument(),
    );
  });

  it("errors when a row has a name but no required content", async () => {
    render(<BulkUploadItemsDialog {...defaultProps()} />);
    const csv = `name,body,data\n"Has name","","{}"`;
    await uploadFile(csv);
    await waitFor(() =>
      expect(screen.getByText(/Row 1: "body" is required/)).toBeInTheDocument(),
    );
  });

  it("errors when a content column fails to parse", async () => {
    render(<BulkUploadItemsDialog {...defaultProps()} />);
    const csv = `name,body,data\n"Bad","x","not json"`;
    await uploadFile(csv);
    await waitFor(() =>
      expect(
        screen.getByText(/Row 1: "data" must be valid JSON/),
      ).toBeInTheDocument(),
    );
  });

  it("errors when there are no non-empty rows at all", async () => {
    render(<BulkUploadItemsDialog {...defaultProps()} />);
    await uploadFile(`name,body,data\n"","",""`);
    await waitFor(() =>
      expect(
        screen.getByText(/No rows with content were found in the CSV/),
      ).toBeInTheDocument(),
    );
  });

  it("uploads successfully and calls onSuccess", async () => {
    apiClient.mockResolvedValueOnce({});
    const user = setupUser();
    const onSuccess = jest.fn();
    render(<BulkUploadItemsDialog {...defaultProps({ onSuccess })} />);
    const csv = `name,description,body,data\n"Card lost","","hello","{""k"":1}"`;
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
                body: "hello",
                data: { k: 1 },
                evaluator_variables: {},
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
    render(<BulkUploadItemsDialog {...defaultProps()} />);
    const csv = `name,description,body,data\n"Refund","Dup charge","x","{}"`;
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
    // The same path also serves the GET that loads the task's existing
    // items, so pick the POST that carries the upload body.
    const uploadCall = apiClient.mock.calls.find(
      (c) =>
        c[0] === "/annotation-tasks/task-1/items" && c[2]?.method === "POST",
    )!;
    expect(uploadCall[2].body.items[0].payload.description).toBe("Dup charge");
  });

  it("shows an upload error banner on failure", async () => {
    apiClient.mockImplementation((endpoint: string) => {
      if (endpoint === "/annotators") return Promise.resolve([]);
      return Promise.reject(new Error("Request failed: 400 - Bad name"));
    });
    const user = setupUser();
    render(<BulkUploadItemsDialog {...defaultProps()} />);
    const csv = `name,body,data\n"A","x","{}"`;
    await uploadFile(csv);
    await waitFor(() =>
      expect(screen.getByText("1 item ready to upload")).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Upload item" }));
    await waitFor(() =>
      expect(screen.getByText("Bad name")).toBeInTheDocument(),
    );
  });

  it("downloads the sample CSV and guidelines PDF", async () => {
    const user = setupUser();
    render(<BulkUploadItemsDialog {...defaultProps()} />);
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
    render(<BulkUploadItemsDialog {...defaultProps({ onClose })} />);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });

  describe("columns nothing is read from", () => {
    it("names a column the upload reads nothing from", async () => {
      render(<BulkUploadItemsDialog {...defaultProps()} />);
      const csv = `name,body,data,Tone/valu\n"A","x","{}","true"`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(screen.getByText("1 item ready to upload")).toBeInTheDocument(),
      );
      expect(screen.getByText(/Nothing is read from/)).toHaveTextContent(
        '"Tone/valu"',
      );
    });

    it("does not name a column the upload read under another title", async () => {
      render(<BulkUploadItemsDialog {...defaultProps()} />);
      const csv = `title,body,data,extra\n"A","x","{}","hm"`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(screen.getByText("1 item ready to upload")).toBeInTheDocument(),
      );
      const note = screen.getByText(/Nothing is read from/);
      expect(note).toHaveTextContent('"extra"');
      expect(note).not.toHaveTextContent('"title"');
    });

    it("shows no note when every column is read", async () => {
      render(<BulkUploadItemsDialog {...defaultProps()} />);
      const csv = `name,description,body,data\n"A","d","x","{}"`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(screen.getByText("1 item ready to upload")).toBeInTheDocument(),
      );
      expect(
        screen.queryByText(/Nothing is read from/),
      ).not.toBeInTheDocument();
    });
  });

  describe("evaluator variable columns", () => {
    it("parses variable columns and includes them in the payload", async () => {
      apiClient
        .mockResolvedValueOnce([]) // annotators
        .mockResolvedValueOnce({}); // upload
      const user = setupUser();
      render(<BulkUploadItemsDialog {...defaultProps({ linkedEvaluators })} />);
      const csv = `name,body,data,Correctness/criteria\n"A","x","{}","be helpful"`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(screen.getByText("1 item ready to upload")).toBeInTheDocument(),
      );
      expect(screen.getByText("be helpful")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Upload item" }));
      await waitFor(() =>
        expect(apiClient).toHaveBeenCalledWith(
          "/annotation-tasks/task-1/items",
          "tok",
          expect.anything(),
        ),
      );
      // The same path also serves the GET that loads the task's existing
      // items, so pick the POST that carries the upload body.
      const uploadCall = apiClient.mock.calls.find(
        (c) =>
          c[0] === "/annotation-tasks/task-1/items" && c[2]?.method === "POST",
      )!;
      expect(uploadCall[2].body.items[0].payload.evaluator_variables).toEqual({
        "ev-1": { criteria: "be helpful" },
      });
    });

    it("errors when an evaluator variable column is missing", async () => {
      apiClient.mockResolvedValueOnce([]);
      render(<BulkUploadItemsDialog {...defaultProps({ linkedEvaluators })} />);
      const csv = `name,body,data\n"A","x","{}"`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(
          screen.getByText(
            /missing column\(s\) for evaluator variables: "Correctness\/criteria"/,
          ),
        ).toBeInTheDocument(),
      );
    });

    it("errors when a variable value cell is empty", async () => {
      apiClient.mockResolvedValueOnce([]);
      render(<BulkUploadItemsDialog {...defaultProps({ linkedEvaluators })} />);
      const csv = `name,body,data,Correctness/criteria\n"A","x","{}",""`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(
          screen.getByText(/Row 1: missing value for "Correctness\/criteria"/),
        ).toBeInTheDocument(),
      );
    });

    it("errors when a row has only a variable value but no name", async () => {
      apiClient.mockResolvedValueOnce([]);
      render(<BulkUploadItemsDialog {...defaultProps({ linkedEvaluators })} />);
      const csv = `name,body,data,Correctness/criteria\n"","","","some criteria"`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(
          screen.getByText(/Row 1: "name" is required/),
        ).toBeInTheDocument(),
      );
    });
  });

  describe("annotation flow", () => {
    async function selectAnnotator(user: ReturnType<typeof setupUser>) {
      await user.click(screen.getByRole("button", { name: "Yes" }));
      await waitFor(() =>
        expect(screen.getByLabelText("Select annotator")).toBeInTheDocument(),
      );
      await user.click(screen.getByLabelText("Select annotator"));
      await user.click(screen.getByRole("option", { name: "Alice" }));
    }

    it("shows the annotation opt-in and loads annotators on toggling Yes", async () => {
      apiClient.mockResolvedValueOnce([{ uuid: "a1", name: "Alice" }]);
      const user = setupUser();
      render(<BulkUploadItemsDialog {...defaultProps({ linkedEvaluators })} />);
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

    it("shows a duplicate-evaluator-name warning and blocks the flow", async () => {
      const dup: BulkLinkedEvaluator[] = [
        {
          uuid: "1",
          name: "Same",
          slug: null,
          variables: [],
          output_type: "binary",
          scale_min: null,
          scale_max: null,
        },
        {
          uuid: "2",
          name: "Same",
          slug: null,
          variables: [],
          output_type: "binary",
          scale_min: null,
          scale_max: null,
        },
      ];
      apiClient.mockResolvedValueOnce([{ uuid: "a1", name: "Alice" }]);
      const user = setupUser();
      render(
        <BulkUploadItemsDialog {...defaultProps({ linkedEvaluators: dup })} />,
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
      const noOutputType: BulkLinkedEvaluator[] = [
        {
          uuid: "1",
          name: "NoType",
          slug: null,
          variables: [],
          output_type: null,
          scale_min: null,
          scale_max: null,
        },
      ];
      apiClient.mockResolvedValueOnce([{ uuid: "a1", name: "Alice" }]);
      const user = setupUser();
      render(
        <BulkUploadItemsDialog
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

    it("parses annotation columns and shows values in the preview", async () => {
      apiClient
        .mockResolvedValueOnce([{ uuid: "a1", name: "Alice" }]) // annotators
        .mockResolvedValueOnce([]) // task items (none yet)
        .mockResolvedValueOnce({
          all_new: false,
          existing_with_annotations: [],
          existing_without_annotations: [{ index: 0, name: "A" }],
        }); // annotated-check
      const user = setupUser();
      render(<BulkUploadItemsDialog {...defaultProps({ linkedEvaluators })} />);
      await selectAnnotator(user);
      await waitFor(() =>
        expect(
          screen.getByText("Drop a CSV here or click to browse"),
        ).toBeInTheDocument(),
      );
      const csv = `name,body,data,Correctness/criteria,Correctness/value,Correctness/reasoning\n"A","x","{}","crit","true","looks right"`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(screen.getByText("1 item ready to upload")).toBeInTheDocument(),
      );
      expect(screen.getByText("true")).toBeInTheDocument();
      expect(screen.getByText("looks right")).toBeInTheDocument();
    });

    it("errors when the CSV has no annotation column at all", async () => {
      apiClient.mockResolvedValueOnce([{ uuid: "a1", name: "Alice" }]);
      const user = setupUser();
      render(<BulkUploadItemsDialog {...defaultProps({ linkedEvaluators })} />);
      await selectAnnotator(user);
      await waitFor(() =>
        expect(
          screen.getByText("Drop a CSV here or click to browse"),
        ).toBeInTheDocument(),
      );
      const csv = `name,body,data,Correctness/criteria\n"A","x","{}","crit"`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(
          screen.getByText(/CSV has no annotation column/),
        ).toBeInTheDocument(),
      );
    });

    it("fails the parse when no row has a score", async () => {
      apiClient
        .mockResolvedValueOnce([{ uuid: "a1", name: "Alice" }]) // annotators
        .mockResolvedValueOnce([]); // task items (none yet)
      const user = setupUser();
      const onSuccess = jest.fn();
      render(
        <BulkUploadItemsDialog
          {...defaultProps({ linkedEvaluators, onSuccess })}
        />,
      );
      await selectAnnotator(user);
      await waitFor(() =>
        expect(
          screen.getByText("Drop a CSV here or click to browse"),
        ).toBeInTheDocument(),
      );
      const csv = `name,body,data,Correctness/criteria,Correctness/value,Correctness/reasoning\n"A","x","{}","crit","",""\n"B","y","{}","crit","",""`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(
          screen.getByText(/No scores were filled in/),
        ).toBeInTheDocument(),
      );
      expect(screen.queryByText(/ready to upload/)).not.toBeInTheDocument();
      expect(onSuccess).not.toHaveBeenCalled();
      expect(
        apiClient.mock.calls.filter(
          (c) =>
            c[0] === "/annotation-tasks/task-1/items" &&
            c[2]?.method === "POST",
        ),
      ).toHaveLength(0);
    });

    it("leaves out a row with no scores and says how many were left out", async () => {
      apiClient
        .mockResolvedValueOnce([{ uuid: "a1", name: "Alice" }]) // annotators
        .mockResolvedValueOnce([]) // task items (none yet)
        .mockResolvedValueOnce({
          all_new: false,
          existing_with_annotations: [],
          existing_without_annotations: [{ index: 0, name: "A" }],
        }) // annotated-check: only the one row that is kept
        .mockResolvedValueOnce({}); // upload
      const user = setupUser();
      const onSuccess = jest.fn();
      render(
        <BulkUploadItemsDialog
          {...defaultProps({ linkedEvaluators, onSuccess })}
        />,
      );
      await selectAnnotator(user);
      await waitFor(() =>
        expect(
          screen.getByText("Drop a CSV here or click to browse"),
        ).toBeInTheDocument(),
      );
      const csv = `name,body,data,Correctness/criteria,Correctness/value,Correctness/reasoning\n"A","x","{}","crit","true","ok"\n"B","y","{}","crit","",""`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(screen.getByText("1 item ready to upload")).toBeInTheDocument(),
      );
      expect(screen.getByText("A")).toBeInTheDocument();
      expect(screen.queryByText("B")).not.toBeInTheDocument();
      expect(
        screen.getByText("1 row has no scores and is not included."),
      ).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Upload item" }));
      await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(1, true));
      // The same path also serves the GET that loads the task's existing
      // items, so pick the POST that carries the upload body.
      const uploadCall = apiClient.mock.calls.find(
        (c) =>
          c[0] === "/annotation-tasks/task-1/items" && c[2]?.method === "POST",
      )!;
      expect(uploadCall[2].body).toEqual({
        annotator_id: "a1",
        items: [
          {
            payload: {
              name: "A",
              body: "x",
              data: {},
              evaluator_variables: { "ev-1": { criteria: "crit" } },
            },
            annotations: { "ev-1": { value: true, reasoning: "ok" } },
          },
        ],
      });
    });

    it("keeps a row with no score columns when labels are not being uploaded", async () => {
      apiClient
        .mockResolvedValueOnce([]) // annotators
        .mockResolvedValueOnce({}); // upload
      const user = setupUser();
      const onSuccess = jest.fn();
      render(
        <BulkUploadItemsDialog
          {...defaultProps({ linkedEvaluators, onSuccess })}
        />,
      );
      const csv = `name,body,data,Correctness/criteria\n"A","x","{}","crit"`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(screen.getByText("1 item ready to upload")).toBeInTheDocument(),
      );
      expect(
        screen.queryByText(/no scores and is not included/),
      ).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Upload item" }));
      await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(1, false));
      // The same path also serves the GET that loads the task's existing
      // items, so pick the POST that carries the upload body.
      const uploadCall = apiClient.mock.calls.find(
        (c) =>
          c[0] === "/annotation-tasks/task-1/items" && c[2]?.method === "POST",
      )!;
      expect(uploadCall[2].body).toEqual({
        items: [
          {
            payload: {
              name: "A",
              body: "x",
              data: {},
              evaluator_variables: { "ev-1": { criteria: "crit" } },
            },
          },
        ],
      });
    });

    it("uploads a row whose content and variable cells are blank, leaving those keys out", async () => {
      apiClient
        .mockResolvedValueOnce([{ uuid: "a1", name: "Alice" }]) // annotators
        .mockResolvedValueOnce([]) // task items (none yet)
        .mockResolvedValueOnce({
          all_new: false,
          existing_with_annotations: [],
          existing_without_annotations: [{ index: 0, name: "A" }],
        }) // annotated-check
        .mockResolvedValueOnce({}); // upload
      const user = setupUser();
      const onSuccess = jest.fn();
      render(
        <BulkUploadItemsDialog
          {...defaultProps({ linkedEvaluators, onSuccess })}
        />,
      );
      await selectAnnotator(user);
      await waitFor(() =>
        expect(
          screen.getByText("Drop a CSV here or click to browse"),
        ).toBeInTheDocument(),
      );
      const csv = `name,body,data,Correctness/criteria,Correctness/value,Correctness/reasoning\n"A","","{}","","true","ok"`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(screen.getByText("1 item ready to upload")).toBeInTheDocument(),
      );
      await user.click(screen.getByRole("button", { name: "Upload item" }));
      await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(1, true));
      // The same path also serves the GET that loads the task's existing
      // items, so pick the POST that carries the upload body.
      const uploadCall = apiClient.mock.calls.find(
        (c) =>
          c[0] === "/annotation-tasks/task-1/items" && c[2]?.method === "POST",
      )!;
      expect(uploadCall[2].body).toEqual({
        annotator_id: "a1",
        items: [
          {
            payload: {
              name: "A",
              data: {},
              evaluator_variables: {},
            },
            annotations: { "ev-1": { value: true, reasoning: "ok" } },
          },
        ],
      });
    });

    it("still requires a content cell when labels are not being uploaded", async () => {
      apiClient.mockResolvedValueOnce([]);
      render(<BulkUploadItemsDialog {...defaultProps({ linkedEvaluators })} />);
      const csv = `name,body,data,Correctness/criteria\n"A","","{}","crit"`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(
          screen.getByText(/Row 1: "body" is required/),
        ).toBeInTheDocument(),
      );
    });

    it("still requires a variable cell when labels are not being uploaded", async () => {
      apiClient.mockResolvedValueOnce([]);
      render(<BulkUploadItemsDialog {...defaultProps({ linkedEvaluators })} />);
      const csv = `name,body,data,Correctness/criteria\n"A","x","{}",""`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(
          screen.getByText(/Row 1: missing value for "Correctness\/criteria"/),
        ).toBeInTheDocument(),
      );
    });

    it("uploads one evaluator's scores when the CSV holds only that evaluator's columns", async () => {
      const twoEvaluators: BulkLinkedEvaluator[] = [
        ...linkedEvaluators,
        {
          uuid: "ev-2",
          name: "Tone",
          slug: null,
          variables: [],
          output_type: "binary",
          scale_min: null,
          scale_max: null,
        },
      ];
      apiClient
        .mockResolvedValueOnce([{ uuid: "a1", name: "Alice" }]) // annotators
        .mockResolvedValueOnce([]) // task items (none yet)
        .mockResolvedValueOnce({
          all_new: false,
          existing_with_annotations: [],
          existing_without_annotations: [{ index: 0, name: "A" }],
        }) // annotated-check
        .mockResolvedValueOnce({}); // upload
      const user = setupUser();
      const onSuccess = jest.fn();
      render(
        <BulkUploadItemsDialog
          {...defaultProps({ linkedEvaluators: twoEvaluators, onSuccess })}
        />,
      );
      await selectAnnotator(user);
      await waitFor(() =>
        expect(
          screen.getByText("Drop a CSV here or click to browse"),
        ).toBeInTheDocument(),
      );
      // No "Tone/value" or "Tone/reasoning" column at all.
      const csv = `name,body,data,Correctness/criteria,Correctness/value,Correctness/reasoning\n"A","x","{}","crit","true","ok"`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(screen.getByText("1 item ready to upload")).toBeInTheDocument(),
      );
      await user.click(screen.getByRole("button", { name: "Upload item" }));
      await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(1, true));
      // The same path also serves the GET that loads the task's existing
      // items, so pick the POST that carries the upload body.
      const uploadCall = apiClient.mock.calls.find(
        (c) =>
          c[0] === "/annotation-tasks/task-1/items" && c[2]?.method === "POST",
      )!;
      expect(uploadCall[2].body).toEqual({
        annotator_id: "a1",
        items: [
          {
            payload: {
              name: "A",
              body: "x",
              data: {},
              evaluator_variables: { "ev-1": { criteria: "crit" } },
            },
            annotations: { "ev-1": { value: true, reasoning: "ok" } },
          },
        ],
      });
    });

    it("sends only the evaluator whose value cell is filled", async () => {
      const twoEvaluators: BulkLinkedEvaluator[] = [
        ...linkedEvaluators,
        {
          uuid: "ev-2",
          name: "Tone",
          slug: null,
          variables: [],
          output_type: "binary",
          scale_min: null,
          scale_max: null,
        },
      ];
      apiClient
        .mockResolvedValueOnce([{ uuid: "a1", name: "Alice" }]) // annotators
        .mockResolvedValueOnce([]) // task items (none yet)
        .mockResolvedValueOnce({
          all_new: false,
          existing_with_annotations: [],
          existing_without_annotations: [{ index: 0, name: "A" }],
        }) // annotated-check
        .mockResolvedValueOnce({}); // upload
      const user = setupUser();
      const onSuccess = jest.fn();
      render(
        <BulkUploadItemsDialog
          {...defaultProps({ linkedEvaluators: twoEvaluators, onSuccess })}
        />,
      );
      await selectAnnotator(user);
      await waitFor(() =>
        expect(
          screen.getByText("Drop a CSV here or click to browse"),
        ).toBeInTheDocument(),
      );
      const csv = `name,body,data,Correctness/criteria,Correctness/value,Correctness/reasoning,Tone/value,Tone/reasoning\n"A","x","{}","crit","true","ok","",""`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(screen.getByText("1 item ready to upload")).toBeInTheDocument(),
      );
      await user.click(screen.getByRole("button", { name: "Upload item" }));
      await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(1, true));
      // The same path also serves the GET that loads the task's existing
      // items, so pick the POST that carries the upload body.
      const uploadCall = apiClient.mock.calls.find(
        (c) =>
          c[0] === "/annotation-tasks/task-1/items" && c[2]?.method === "POST",
      )!;
      expect(uploadCall[2].body).toEqual({
        annotator_id: "a1",
        items: [
          {
            payload: {
              name: "A",
              body: "x",
              data: {},
              evaluator_variables: { "ev-1": { criteria: "crit" } },
            },
            annotations: { "ev-1": { value: true, reasoning: "ok" } },
          },
        ],
      });
    });

    it("errors when an annotation value cell is invalid", async () => {
      apiClient.mockResolvedValueOnce([{ uuid: "a1", name: "Alice" }]);
      const user = setupUser();
      render(<BulkUploadItemsDialog {...defaultProps({ linkedEvaluators })} />);
      await selectAnnotator(user);
      await waitFor(() =>
        expect(
          screen.getByText("Drop a CSV here or click to browse"),
        ).toBeInTheDocument(),
      );
      const csv = `name,body,data,Correctness/criteria,Correctness/value,Correctness/reasoning\n"A","x","{}","crit","maybe",""`;
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
        .mockResolvedValueOnce([]) // task items (none yet)
        .mockResolvedValueOnce({
          all_new: false,
          existing_with_annotations: [],
          existing_without_annotations: [{ index: 0, name: "A" }],
        }) // annotated-check
        .mockResolvedValueOnce({}); // upload
      const user = setupUser();
      const onSuccess = jest.fn();
      render(
        <BulkUploadItemsDialog
          {...defaultProps({ linkedEvaluators, onSuccess })}
        />,
      );
      await selectAnnotator(user);
      await waitFor(() =>
        expect(
          screen.getByText("Drop a CSV here or click to browse"),
        ).toBeInTheDocument(),
      );
      const csv = `name,body,data,Correctness/criteria,Correctness/value,Correctness/reasoning\n"A","x","{}","crit","true","looks right"`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(screen.getByText("1 item ready to upload")).toBeInTheDocument(),
      );
      await user.click(screen.getByRole("button", { name: "Upload item" }));
      await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(1, true));
      // The same path also serves the GET that loads the task's existing
      // items, so pick the POST that carries the upload body.
      const uploadCall = apiClient.mock.calls.find(
        (c) =>
          c[0] === "/annotation-tasks/task-1/items" && c[2]?.method === "POST",
      )!;
      expect(uploadCall[2].body).toEqual({
        annotator_id: "a1",
        items: [
          {
            payload: {
              name: "A",
              body: "x",
              data: {},
              evaluator_variables: { "ev-1": { criteria: "crit" } },
            },
            annotations: {
              "ev-1": { value: true, reasoning: "looks right" },
            },
          },
        ],
      });
    });

    it("highlights rows that already have annotations", async () => {
      apiClient
        .mockResolvedValueOnce([{ uuid: "a1", name: "Alice" }]) // annotators
        .mockResolvedValueOnce([]) // task items (none yet)
        .mockResolvedValueOnce({
          all_new: false,
          existing_with_annotations: [{ index: 0, name: "A" }],
          existing_without_annotations: [],
        }); // annotated-check
      const user = setupUser();
      render(<BulkUploadItemsDialog {...defaultProps({ linkedEvaluators })} />);
      await selectAnnotator(user);
      await waitFor(() =>
        expect(
          screen.getByText("Drop a CSV here or click to browse"),
        ).toBeInTheDocument(),
      );
      const csv = `name,body,data,Correctness/criteria,Correctness/value,Correctness/reasoning\n"A","x","{}","crit","true","ok"`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(screen.getByText("1 item ready to upload")).toBeInTheDocument(),
      );
      await waitFor(() =>
        expect(document.querySelector(".bg-red-500\\/10")).toBeTruthy(),
      );
    });

    it("names the rows whose item is not in the task and blocks the upload", async () => {
      apiClient
        .mockResolvedValueOnce([{ uuid: "a1", name: "Alice" }]) // annotators
        .mockResolvedValueOnce([]) // task items
        .mockResolvedValueOnce({
          all_new: false,
          existing_with_annotations: [],
          existing_without_annotations: [{ index: 0, name: "A" }],
        }); // annotated-check: only the first row matches an item
      const user = setupUser();
      render(<BulkUploadItemsDialog {...defaultProps({ linkedEvaluators })} />);
      await selectAnnotator(user);
      await waitFor(() =>
        expect(
          screen.getByText("Drop a CSV here or click to browse"),
        ).toBeInTheDocument(),
      );
      const csv = `name,body,data,Correctness/criteria,Correctness/value,Correctness/reasoning\n"A","x","{}","crit","true","ok"\n"B","y","{}","crit","false","no"`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(screen.getByText("2 items ready to upload")).toBeInTheDocument(),
      );
      await waitFor(() =>
        expect(
          screen.getByText(/This task has no item named "B"/),
        ).toBeInTheDocument(),
      );
      expect(
        screen.getByRole("button", { name: "Upload 2 items" }),
      ).toBeDisabled();
    });

    it("keeps the upload button off while the item check is still running", async () => {
      apiClient
        .mockResolvedValueOnce([{ uuid: "a1", name: "Alice" }]) // annotators
        .mockResolvedValueOnce([]) // task items
        .mockReturnValueOnce(new Promise(() => {})); // annotated-check, never settles
      const user = setupUser();
      render(<BulkUploadItemsDialog {...defaultProps({ linkedEvaluators })} />);
      await selectAnnotator(user);
      await waitFor(() =>
        expect(
          screen.getByText("Drop a CSV here or click to browse"),
        ).toBeInTheDocument(),
      );
      const csv = `name,body,data,Correctness/criteria,Correctness/value,Correctness/reasoning\n"A","x","{}","crit","true","ok"`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(screen.getByText("1 item ready to upload")).toBeInTheDocument(),
      );
      await waitFor(() =>
        expect(
          screen.getByText("Checking for existing items…"),
        ).toBeInTheDocument(),
      );
      expect(
        screen.getByRole("button", { name: "Upload item" }),
      ).toBeDisabled();
    });

    it("uploads when every row matches an item already in the task", async () => {
      apiClient
        .mockResolvedValueOnce([{ uuid: "a1", name: "Alice" }]) // annotators
        .mockResolvedValueOnce([]) // task items
        .mockResolvedValueOnce({
          all_new: false,
          existing_with_annotations: [],
          existing_without_annotations: [
            { index: 0, name: "A" },
            { index: 1, name: "B" },
          ],
        }) // annotated-check: both rows match
        .mockResolvedValueOnce({}); // upload
      const user = setupUser();
      const onSuccess = jest.fn();
      render(
        <BulkUploadItemsDialog
          {...defaultProps({ linkedEvaluators, onSuccess })}
        />,
      );
      await selectAnnotator(user);
      await waitFor(() =>
        expect(
          screen.getByText("Drop a CSV here or click to browse"),
        ).toBeInTheDocument(),
      );
      const csv = `name,body,data,Correctness/criteria,Correctness/value,Correctness/reasoning\n"A","x","{}","crit","true","ok"\n"B","y","{}","crit","false","no"`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(screen.getByText("2 items ready to upload")).toBeInTheDocument(),
      );
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Upload 2 items" }),
        ).toBeEnabled(),
      );
      expect(screen.queryByText(/This task has no item named/)).toBeNull();
      await user.click(screen.getByRole("button", { name: "Upload 2 items" }));
      await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(2, true));
    });

    it("clears a shown upload error when the labels question is toggled", async () => {
      apiClient
        .mockResolvedValueOnce([{ uuid: "a1", name: "Alice" }]) // annotators
        .mockResolvedValueOnce([]) // task items
        .mockResolvedValueOnce({
          all_new: false,
          existing_with_annotations: [],
          existing_without_annotations: [{ index: 0, name: "A" }],
        }) // annotated-check
        .mockRejectedValueOnce(new Error("Request failed: 500 - upload broke")); // upload
      const user = setupUser();
      render(<BulkUploadItemsDialog {...defaultProps({ linkedEvaluators })} />);
      await selectAnnotator(user);
      await waitFor(() =>
        expect(
          screen.getByText("Drop a CSV here or click to browse"),
        ).toBeInTheDocument(),
      );
      const csv = `name,body,data,Correctness/criteria,Correctness/value,Correctness/reasoning\n"A","x","{}","crit","true","ok"`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(screen.getByText("1 item ready to upload")).toBeInTheDocument(),
      );
      await user.click(screen.getByRole("button", { name: "Upload item" }));
      await waitFor(() =>
        expect(screen.getByText("upload broke")).toBeInTheDocument(),
      );
      await user.click(screen.getByRole("button", { name: "No" }));
      await waitFor(() =>
        expect(screen.queryByText("upload broke")).toBeNull(),
      );
    });

    it("resets parsed items when toggling annotations on", async () => {
      apiClient.mockResolvedValue([{ uuid: "a1", name: "Alice" }]);
      const user = setupUser();
      render(<BulkUploadItemsDialog {...defaultProps({ linkedEvaluators })} />);
      const csv = `name,body,data,Correctness/criteria\n"A","x","{}","crit"`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(screen.getByText("1 item ready to upload")).toBeInTheDocument(),
      );
      await user.click(screen.getByRole("button", { name: "Yes" }));
      await waitFor(() =>
        expect(
          screen.queryByText("1 item ready to upload"),
        ).not.toBeInTheDocument(),
      );
    });

    it("adds an annotator without leaving the dialog when none exist", async () => {
      apiClient
        .mockResolvedValueOnce([]) // annotators
        .mockResolvedValueOnce([]) // task items (none yet)
        .mockResolvedValueOnce({ uuid: "new-1", message: "ok" }); // create
      const user = setupUser();
      render(<BulkUploadItemsDialog {...defaultProps({ linkedEvaluators })} />);
      await user.click(screen.getByRole("button", { name: "Yes" }));
      await waitFor(() =>
        expect(screen.getByLabelText("New annotator name")).toBeInTheDocument(),
      );
      await user.type(screen.getByLabelText("New annotator name"), "Alice");
      await user.click(screen.getByRole("button", { name: "Add" }));
      // The new annotator lands in the picker already selected, so the CSV
      // dropzone opens without a trip to the annotators page.
      await waitFor(() =>
        expect(
          screen.getByText("Drop a CSV here or click to browse"),
        ).toBeInTheDocument(),
      );
      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(apiClient).toHaveBeenCalledWith("/annotators", expect.anything(), {
        method: "POST",
        body: { name: "Alice" },
      });
    });
  });

  describe("downloading the task's own items", () => {
    // The download is a Blob handed to URL.createObjectURL; read the text of
    // the most recent one so the test can check the CSV that was produced.
    async function lastDownloadedCsv(): Promise<string> {
      const createObjectURL = (
        global as unknown as { URL: { createObjectURL: jest.Mock } }
      ).URL.createObjectURL;
      const blob = createObjectURL.mock.calls.at(-1)?.[0] as Blob;
      if (typeof blob.text === "function") return blob.text();
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.readAsText(blob);
      });
    }

    async function openWithAnnotations(user: ReturnType<typeof setupUser>) {
      await user.click(screen.getByRole("button", { name: "Yes" }));
      await waitFor(() =>
        expect(screen.getByLabelText("Select annotator")).toBeInTheDocument(),
      );
      await user.click(screen.getByLabelText("Select annotator"));
      await user.click(screen.getByRole("option", { name: "Alice" }));
      await waitFor(() =>
        expect(
          screen.getByText("Drop a CSV here or click to browse"),
        ).toBeInTheDocument(),
      );
    }

    it("downloads the task's existing items with blank label columns", async () => {
      apiClient
        .mockResolvedValueOnce([{ uuid: "a1", name: "Alice" }]) // annotators
        .mockResolvedValueOnce([
          {
            uuid: "i1",
            payload: {
              name: "Item one",
              description: "First one",
              body: "hello",
              data: { k: 1 },
              evaluator_variables: { "ev-1": { criteria: "be helpful" } },
            },
          },
          {
            uuid: "i2",
            payload: { name: "Item two", body: "bye", data: { k: 2 } },
          },
        ]); // task items
      const user = setupUser();
      render(<BulkUploadItemsDialog {...defaultProps({ linkedEvaluators })} />);
      await openWithAnnotations(user);
      await waitFor(() =>
        expect(apiClient).toHaveBeenCalledWith(
          "/annotation-tasks/task-1/items",
          "tok",
        ),
      );
      await waitFor(() =>
        expect(
          screen.getByRole("button", {
            name: "download your dataset as a CSV",
          }),
        ).toBeInTheDocument(),
      );
      await user.click(
        screen.getByRole("button", {
          name: "download your dataset as a CSV",
        }),
      );
      const lines = (await lastDownloadedCsv()).split("\n");
      expect(lines[0]).toBe(
        "name,description,body,data,Correctness/criteria,Correctness/value,Correctness/reasoning",
      );
      expect(lines[1]).toBe(
        'Item one,First one,hello,"{""k"":1}",be helpful,,',
      );
      expect(lines[2]).toBe('Item two,,bye,"{""k"":2}",,,');
      expect(lines).toHaveLength(3);
    });

    it("falls back to the sample CSV when the task has no items yet", async () => {
      apiClient
        .mockResolvedValueOnce([{ uuid: "a1", name: "Alice" }]) // annotators
        .mockResolvedValueOnce([]); // task items
      const user = setupUser();
      render(<BulkUploadItemsDialog {...defaultProps({ linkedEvaluators })} />);
      await openWithAnnotations(user);
      await waitFor(() =>
        expect(apiClient).toHaveBeenCalledWith(
          "/annotation-tasks/task-1/items",
          "tok",
        ),
      );
      expect(
        screen.queryByRole("button", {
          name: "download your dataset as a CSV",
        }),
      ).not.toBeInTheDocument();
      await user.click(
        screen.getByRole("button", { name: "download the sample CSV" }),
      );
      const lines = (await lastDownloadedCsv()).split("\n");
      expect(lines[0]).toBe(
        "name,description,body,data,Correctness/criteria,Correctness/value,Correctness/reasoning",
      );
      expect(lines[1]).toContain("Item A");
      expect(lines[1]).toContain("looks good");
    });
  });

  describe("rating evaluator sample generation", () => {
    it("downloads a sample CSV with annotation columns after opting in", async () => {
      apiClient.mockResolvedValueOnce([{ uuid: "a1", name: "Alice" }]);
      const user = setupUser();
      render(
        <BulkUploadItemsDialog
          {...defaultProps({ linkedEvaluators: ratingEvaluator })}
        />,
      );
      await user.click(screen.getByRole("button", { name: "Yes" }));
      await waitFor(() =>
        expect(screen.getByLabelText("Select annotator")).toBeInTheDocument(),
      );
      await user.click(screen.getByLabelText("Select annotator"));
      await user.click(screen.getByRole("option", { name: "Alice" }));
      await user.click(
        screen.getByRole("button", { name: "download the sample CSV" }),
      );
      expect(
        (global as unknown as { URL: { createObjectURL: jest.Mock } }).URL
          .createObjectURL,
      ).toHaveBeenCalled();
    });
  });
});
