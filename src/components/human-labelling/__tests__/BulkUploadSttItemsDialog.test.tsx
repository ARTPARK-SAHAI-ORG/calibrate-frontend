import * as React from "react";
import { render, screen, setupUser, waitFor, act } from "@/test-utils";
import {
  BulkUploadSttItemsDialog,
  type SttLinkedEvaluator,
} from "../BulkUploadSttItemsDialog";

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

// Every download goes through URL.createObjectURL(blob); keep the blobs so a
// test can read back the file the user would have got.
let createdBlobs: Blob[] = [];

async function lastDownloadedText(): Promise<string> {
  const blob = createdBlobs[createdBlobs.length - 1];
  expect(blob).toBeTruthy();
  if (typeof blob.text === "function") return blob.text();
  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });
}

beforeEach(() => {
  apiClient.mockReset();
  createdBlobs = [];
  (global as unknown as { URL: typeof URL }).URL.createObjectURL = jest.fn(
    (blob: Blob) => {
      createdBlobs.push(blob);
      return "blob:mock";
    },
  );
  (global as unknown as { URL: typeof URL }).URL.revokeObjectURL = jest.fn();
  jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

const linkedEvaluators: SttLinkedEvaluator[] = [
  {
    uuid: "ev-1",
    name: "Correctness",
    output_type: "binary",
    scale_min: null,
    scale_max: null,
  },
];

function defaultProps(
  overrides: Partial<
    React.ComponentProps<typeof BulkUploadSttItemsDialog>
  > = {},
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

describe("BulkUploadSttItemsDialog", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <BulkUploadSttItemsDialog {...defaultProps({ isOpen: false })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the dropzone with no linked evaluators", () => {
    render(<BulkUploadSttItemsDialog {...defaultProps()} />);
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
    render(<BulkUploadSttItemsDialog {...defaultProps()} />);
    const csv = `name,reference_transcript,predicted_transcript
"Greeting","Hello there","hello there"`;
    await uploadFile(csv);
    await waitFor(() =>
      expect(screen.getByText("1 item ready to upload")).toBeInTheDocument(),
    );
    expect(screen.getByText("Greeting")).toBeInTheDocument();
    expect(screen.getByText("Hello there")).toBeInTheDocument();
    expect(screen.getByText("hello there")).toBeInTheDocument();
  });

  it("accepts header aliases for the required columns", async () => {
    render(<BulkUploadSttItemsDialog {...defaultProps()} />);
    // "title" -> name, "reference" -> reference_transcript, "prediction" -> predicted
    const csv = `title,reference,prediction
"Row A","actual words","guessed words"`;
    await uploadFile(csv);
    await waitFor(() =>
      expect(screen.getByText("1 item ready to upload")).toBeInTheDocument(),
    );
    expect(screen.getByText("Row A")).toBeInTheDocument();
  });

  it("pluralizes the item count", async () => {
    render(<BulkUploadSttItemsDialog {...defaultProps()} />);
    const csv = `name,reference_transcript,predicted_transcript
"A","ref a","pred a"
"B","ref b","pred b"`;
    await uploadFile(csv);
    await waitFor(() =>
      expect(screen.getByText("2 items ready to upload")).toBeInTheDocument(),
    );
  });

  it("errors when required columns are missing", async () => {
    render(<BulkUploadSttItemsDialog {...defaultProps()} />);
    await uploadFile(`foo,bar\n1,2`);
    await waitFor(() =>
      expect(
        screen.getByText(
          /CSV must include "name", "reference_transcript" and "predicted_transcript" columns/,
        ),
      ).toBeInTheDocument(),
    );
  });

  it("errors when a row is missing a name", async () => {
    render(<BulkUploadSttItemsDialog {...defaultProps()} />);
    const csv = `name,reference_transcript,predicted_transcript\n"","ref","pred"`;
    await uploadFile(csv);
    await waitFor(() =>
      expect(screen.getByText(/Row 1: "name" is required/)).toBeInTheDocument(),
    );
  });

  it("errors when a row is missing a transcript", async () => {
    render(<BulkUploadSttItemsDialog {...defaultProps()} />);
    const csv = `name,reference_transcript,predicted_transcript\n"Has name","ref",""`;
    await uploadFile(csv);
    await waitFor(() =>
      expect(
        screen.getByText(
          /Row 1: both "reference_transcript" and "predicted_transcript" are required/,
        ),
      ).toBeInTheDocument(),
    );
  });

  it("skips fully-empty rows and errors when no rows have content", async () => {
    render(<BulkUploadSttItemsDialog {...defaultProps()} />);
    await uploadFile(
      `name,reference_transcript,predicted_transcript\n"","",""`,
    );
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
    render(<BulkUploadSttItemsDialog {...defaultProps({ onSuccess })} />);
    const csv = `name,reference_transcript,predicted_transcript
"Greeting","Hello there","hello there"`;
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
                name: "Greeting",
                reference_transcript: "Hello there",
                predicted_transcript: "hello there",
              },
            },
          ],
        },
      },
    );
  });

  it("shows an upload error banner on failure", async () => {
    apiClient.mockImplementation((endpoint: string) => {
      if (endpoint === "/annotators") return Promise.resolve([]);
      return Promise.reject(new Error("Request failed: 400 - Bad name"));
    });
    const user = setupUser();
    render(<BulkUploadSttItemsDialog {...defaultProps()} />);
    const csv = `name,reference_transcript,predicted_transcript\n"A","ref","pred"`;
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
    render(<BulkUploadSttItemsDialog {...defaultProps()} />);
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
    render(<BulkUploadSttItemsDialog {...defaultProps({ onClose })} />);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows a parse error and disables Upload after clearing", async () => {
    const user = setupUser();
    render(<BulkUploadSttItemsDialog {...defaultProps()} />);
    await uploadFile(`foo,bar\n1,2`);
    await waitFor(() =>
      expect(
        screen.getByText(
          /CSV must include "name", "reference_transcript" and "predicted_transcript" columns/,
        ),
      ).toBeInTheDocument(),
    );
    // Clear via the remove-file button resets state.
    await user.click(screen.getByLabelText("Remove file"));
    expect(
      screen.getByText("Drop a CSV here or click to browse"),
    ).toBeInTheDocument();
  });

  describe("with linked evaluators (annotation flow)", () => {
    it("shows the annotation opt-in and loads annotators on toggling Yes", async () => {
      apiClient.mockResolvedValueOnce([{ uuid: "a1", name: "Alice" }]);
      const user = setupUser();
      render(
        <BulkUploadSttItemsDialog {...defaultProps({ linkedEvaluators })} />,
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
        <BulkUploadSttItemsDialog {...defaultProps({ linkedEvaluators })} />,
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
      const dup: SttLinkedEvaluator[] = [
        {
          uuid: "1",
          name: "Same",
          output_type: "binary",
          scale_min: null,
          scale_max: null,
        },
        {
          uuid: "2",
          name: "Same",
          output_type: "binary",
          scale_min: null,
          scale_max: null,
        },
      ];
      apiClient.mockResolvedValueOnce([{ uuid: "a1", name: "Alice" }]);
      const user = setupUser();
      render(
        <BulkUploadSttItemsDialog
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
      const noOutputType: SttLinkedEvaluator[] = [
        {
          uuid: "1",
          name: "NoType",
          output_type: null,
          scale_min: null,
          scale_max: null,
        },
      ];
      apiClient.mockResolvedValueOnce([{ uuid: "a1", name: "Alice" }]);
      const user = setupUser();
      render(
        <BulkUploadSttItemsDialog
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
        .mockResolvedValueOnce([]) // the task's existing items
        .mockResolvedValueOnce({
          all_new: false,
          existing_with_annotations: [],
          existing_without_annotations: [{ index: 0, name: "Greeting" }],
        }); // annotated-check
      const user = setupUser();
      render(
        <BulkUploadSttItemsDialog {...defaultProps({ linkedEvaluators })} />,
      );
      await selectAnnotator(user);
      await waitFor(() =>
        expect(
          screen.getByText("Drop a CSV here or click to browse"),
        ).toBeInTheDocument(),
      );

      const csv = `name,reference_transcript,predicted_transcript,Correctness/value,Correctness/reasoning
"Greeting","Hello there","hello there","true","Looks right"`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(screen.getByText("1 item ready to upload")).toBeInTheDocument(),
      );
      expect(screen.getByText("true")).toBeInTheDocument();
      expect(screen.getByText("Looks right")).toBeInTheDocument();
    });

    it("errors when the CSV has no annotation column at all", async () => {
      apiClient.mockResolvedValueOnce([{ uuid: "a1", name: "Alice" }]);
      const user = setupUser();
      render(
        <BulkUploadSttItemsDialog {...defaultProps({ linkedEvaluators })} />,
      );
      await selectAnnotator(user);
      await waitFor(() =>
        expect(
          screen.getByText("Drop a CSV here or click to browse"),
        ).toBeInTheDocument(),
      );
      const csv = `name,reference_transcript,predicted_transcript\n"A","ref","pred"`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(
          screen.getByText(/CSV has no annotation column/),
        ).toBeInTheDocument(),
      );
    });

    it("sends no annotations for a row whose value cell is blank when another row has one", async () => {
      apiClient
        .mockResolvedValueOnce([{ uuid: "a1", name: "Alice" }]) // annotators
        .mockResolvedValueOnce([]) // the task's existing items
        .mockResolvedValueOnce({
          all_new: false,
          existing_with_annotations: [],
          existing_without_annotations: [
            { index: 0, name: "A" },
            { index: 1, name: "B" },
          ],
        }) // annotated-check
        .mockResolvedValueOnce({}); // upload
      const user = setupUser();
      const onSuccess = jest.fn();
      render(
        <BulkUploadSttItemsDialog
          {...defaultProps({ linkedEvaluators, onSuccess })}
        />,
      );
      await selectAnnotator(user);
      await waitFor(() =>
        expect(
          screen.getByText("Drop a CSV here or click to browse"),
        ).toBeInTheDocument(),
      );
      const csv = `name,reference_transcript,predicted_transcript,Correctness/value,Correctness/reasoning
"A","ref","pred","",""
"B","ref b","pred b","true","Fine"`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(screen.getByText("2 items ready to upload")).toBeInTheDocument(),
      );
      await user.click(screen.getByRole("button", { name: "Upload 2 items" }));
      await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(2, true));
      const uploadCall = apiClient.mock.calls.find(
        (c) =>
          c[0] === "/annotation-tasks/task-1/items" && c[2]?.method === "POST",
      );
      expect(uploadCall![2].body.items[0]).toEqual({
        payload: {
          name: "A",
          reference_transcript: "ref",
          predicted_transcript: "pred",
        },
      });
    });

    it("uploads a row whose predicted transcript is blank when labels are being uploaded", async () => {
      apiClient
        .mockResolvedValueOnce([{ uuid: "a1", name: "Alice" }]) // annotators
        .mockResolvedValueOnce([]) // the task's existing items
        .mockResolvedValueOnce({
          all_new: false,
          existing_with_annotations: [],
          existing_without_annotations: [{ index: 0, name: "Silence" }],
        }) // annotated-check
        .mockResolvedValueOnce({}); // upload
      const user = setupUser();
      const onSuccess = jest.fn();
      render(
        <BulkUploadSttItemsDialog
          {...defaultProps({ linkedEvaluators, onSuccess })}
        />,
      );
      await selectAnnotator(user);
      await waitFor(() =>
        expect(
          screen.getByText("Drop a CSV here or click to browse"),
        ).toBeInTheDocument(),
      );
      const csv = `name,reference_transcript,predicted_transcript,Correctness/value,Correctness/reasoning
"Silence","Hello there","","false","Nothing was transcribed"`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(screen.getByText("1 item ready to upload")).toBeInTheDocument(),
      );
      expect(
        screen.queryByText(
          /both "reference_transcript" and "predicted_transcript" are required/,
        ),
      ).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Upload item" }));
      await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(1, true));
      const uploadCall = apiClient.mock.calls.find(
        (c) =>
          c[0] === "/annotation-tasks/task-1/items" && c[2]?.method === "POST",
      );
      expect(uploadCall![2].body.items[0].payload).toEqual({
        name: "Silence",
        reference_transcript: "Hello there",
        predicted_transcript: "",
      });
    });

    it("still requires both transcripts when labels are not being uploaded", async () => {
      render(
        <BulkUploadSttItemsDialog {...defaultProps({ linkedEvaluators })} />,
      );
      const csv = `name,reference_transcript,predicted_transcript,Correctness/value,Correctness/reasoning
"Silence","Hello there","","false","Nothing was transcribed"`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(
          screen.getByText(
            /Row 1: both "reference_transcript" and "predicted_transcript" are required/,
          ),
        ).toBeInTheDocument(),
      );
      expect(
        screen.queryByText("1 item ready to upload"),
      ).not.toBeInTheDocument();
    });

    it("refuses to upload when no value cell was filled in", async () => {
      apiClient
        .mockResolvedValueOnce([{ uuid: "a1", name: "Alice" }]) // annotators
        .mockResolvedValueOnce([]) // the task's existing items
        .mockResolvedValueOnce({
          all_new: false,
          existing_with_annotations: [],
          existing_without_annotations: [
            { index: 0, name: "A" },
            { index: 1, name: "B" },
          ],
        }); // annotated-check
      const user = setupUser();
      const onSuccess = jest.fn();
      render(
        <BulkUploadSttItemsDialog
          {...defaultProps({ linkedEvaluators, onSuccess })}
        />,
      );
      await selectAnnotator(user);
      await waitFor(() =>
        expect(
          screen.getByText("Drop a CSV here or click to browse"),
        ).toBeInTheDocument(),
      );
      const csv = `name,reference_transcript,predicted_transcript,Correctness/value,Correctness/reasoning
"A","ref","pred","",""
"B","ref b","pred b","",""`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(screen.getByText("2 items ready to upload")).toBeInTheDocument(),
      );
      await user.click(screen.getByRole("button", { name: "Upload 2 items" }));
      await waitFor(() =>
        expect(
          screen.getByText(
            "No scores were filled in. Add a value in at least one evaluator column, or answer No to uploading existing human labels.",
          ),
        ).toBeInTheDocument(),
      );
      expect(onSuccess).not.toHaveBeenCalled();
      expect(
        apiClient.mock.calls.find(
          (c) =>
            c[0] === "/annotation-tasks/task-1/items" &&
            c[2]?.method === "POST",
        ),
      ).toBeUndefined();
    });

    it("errors when an annotation value cell is invalid", async () => {
      apiClient.mockResolvedValueOnce([{ uuid: "a1", name: "Alice" }]);
      const user = setupUser();
      render(
        <BulkUploadSttItemsDialog {...defaultProps({ linkedEvaluators })} />,
      );
      await selectAnnotator(user);
      await waitFor(() =>
        expect(
          screen.getByText("Drop a CSV here or click to browse"),
        ).toBeInTheDocument(),
      );
      const csv = `name,reference_transcript,predicted_transcript,Correctness/value,Correctness/reasoning
"A","ref","pred","maybe",""`;
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
        .mockResolvedValueOnce([]) // the task's existing items
        .mockResolvedValueOnce({
          all_new: false,
          existing_with_annotations: [],
          existing_without_annotations: [{ index: 0, name: "Greeting" }],
        }) // annotated-check
        .mockResolvedValueOnce({}); // upload
      const user = setupUser();
      const onSuccess = jest.fn();
      render(
        <BulkUploadSttItemsDialog
          {...defaultProps({ linkedEvaluators, onSuccess })}
        />,
      );
      await selectAnnotator(user);
      await waitFor(() =>
        expect(
          screen.getByText("Drop a CSV here or click to browse"),
        ).toBeInTheDocument(),
      );
      const csv = `name,reference_transcript,predicted_transcript,Correctness/value,Correctness/reasoning
"Greeting","Hello there","hello there","true","Looks right"`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(screen.getByText("1 item ready to upload")).toBeInTheDocument(),
      );
      await user.click(screen.getByRole("button", { name: "Upload item" }));
      await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(1, true));

      const uploadCall = apiClient.mock.calls.find(
        (c) =>
          c[0] === "/annotation-tasks/task-1/items" && c[2]?.method === "POST",
      );
      expect(uploadCall).toBeTruthy();
      expect(uploadCall![2].body).toEqual({
        annotator_id: "a1",
        items: [
          {
            payload: {
              name: "Greeting",
              reference_transcript: "Hello there",
              predicted_transcript: "hello there",
            },
            annotations: {
              "ev-1": { value: true, reasoning: "Looks right" },
            },
          },
        ],
      });
    });

    it("blocks annotation flow when an evaluator has no output type and shows warning", async () => {
      apiClient.mockResolvedValueOnce([{ uuid: "a1", name: "Alice" }]);
      const noOutputType: SttLinkedEvaluator[] = [
        {
          uuid: "1",
          name: "NoType",
          output_type: null,
          scale_min: null,
          scale_max: null,
        },
      ];
      const user = setupUser();
      render(
        <BulkUploadSttItemsDialog
          {...defaultProps({ linkedEvaluators: noOutputType })}
        />,
      );
      await user.click(screen.getByRole("button", { name: "Yes" }));
      await waitFor(() =>
        expect(
          screen.getByText(
            /Annotation upload isn't available|have no binary\/rating output configured/,
          ),
        ).toBeInTheDocument(),
      );
      // Upload section stays hidden.
      expect(
        screen.queryByText("Drop a CSV here or click to browse"),
      ).not.toBeInTheDocument();
    });

    it("downloads the annotation sample CSV and guidelines once an annotator is picked", async () => {
      const ratingEval: SttLinkedEvaluator[] = [
        {
          uuid: "ev-r",
          name: "Quality",
          output_type: "rating",
          scale_min: 1,
          scale_max: 5,
        },
      ];
      apiClient
        .mockResolvedValueOnce([{ uuid: "a1", name: "Alice" }]) // annotators
        .mockResolvedValueOnce([]) // the task's existing items
        .mockResolvedValueOnce({
          all_new: true,
          existing_with_annotations: [],
          existing_without_annotations: [],
        }); // annotated-check (harmless if unreached)
      const user = setupUser();
      render(
        <BulkUploadSttItemsDialog
          {...defaultProps({ linkedEvaluators: ratingEval })}
        />,
      );
      await selectAnnotator(user);
      await waitFor(() =>
        expect(
          screen.getByText("Drop a CSV here or click to browse"),
        ).toBeInTheDocument(),
      );
      // These build the sample CSV + guidelines PDF with annotation columns.
      await user.click(
        screen.getByRole("button", { name: /Download CSV format guidelines/ }),
      );
      await user.click(
        screen.getByRole("button", { name: "download the sample CSV" }),
      );
      expect(
        (global as unknown as { URL: { createObjectURL: jest.Mock } }).URL
          .createObjectURL,
      ).toHaveBeenCalledTimes(2);
    });

    it("downloads the task's own items instead of the sample when the task has items", async () => {
      apiClient.mockImplementation((endpoint: string) => {
        if (endpoint === "/annotators")
          return Promise.resolve([{ uuid: "a1", name: "Alice" }]);
        if (endpoint === "/annotation-tasks/task-1/items")
          return Promise.resolve([
            {
              uuid: "i1",
              payload: {
                name: "Greeting",
                reference_transcript: "Hello, there",
                predicted_transcript: "hello there",
              },
            },
            {
              uuid: "i2",
              payload: {
                name: "Flight booking",
                reference_transcript: "I would like to book a flight.",
                predicted_transcript: "I'd like to book a flight",
              },
            },
          ]);
        return Promise.resolve({});
      });
      const user = setupUser();
      render(
        <BulkUploadSttItemsDialog {...defaultProps({ linkedEvaluators })} />,
      );
      await selectAnnotator(user);
      await waitFor(() =>
        expect(
          screen.getByText("Drop a CSV here or click to browse"),
        ).toBeInTheDocument(),
      );
      await user.click(
        screen.getByRole("button", {
          name: "download your dataset as a CSV",
        }),
      );

      const csv = await lastDownloadedText();
      const rows = csv.split("\n");
      expect(rows[0]).toBe(
        "name,reference_transcript,predicted_transcript,Correctness/value,Correctness/reasoning",
      );
      expect(rows[1]).toBe('Greeting,"Hello, there",hello there,,');
      expect(rows[2]).toBe(
        "Flight booking,I would like to book a flight.,I'd like to book a flight,,",
      );
      expect(rows).toHaveLength(3);
    });

    it("keeps the sample CSV when the task has no items yet", async () => {
      apiClient.mockImplementation((endpoint: string) => {
        if (endpoint === "/annotators")
          return Promise.resolve([{ uuid: "a1", name: "Alice" }]);
        if (endpoint === "/annotation-tasks/task-1/items")
          return Promise.resolve([]);
        return Promise.resolve({});
      });
      const user = setupUser();
      render(
        <BulkUploadSttItemsDialog {...defaultProps({ linkedEvaluators })} />,
      );
      await selectAnnotator(user);
      await waitFor(() =>
        expect(
          screen.getByText("Drop a CSV here or click to browse"),
        ).toBeInTheDocument(),
      );
      await user.click(
        screen.getByRole("button", { name: "download the sample CSV" }),
      );

      const csv = await lastDownloadedText();
      expect(csv.split("\n")[0]).toBe(
        "name,reference_transcript,predicted_transcript,Correctness/value,Correctness/reasoning",
      );
      expect(csv).toContain("Greeting");
      expect(csv).toContain("Hello, how are you today?");
      // The sample carries a filled-in label value; the task's own items do not.
      expect(csv).toContain("true");
    });

    it("adds an annotator without leaving the dialog when none exist", async () => {
      apiClient
        .mockResolvedValueOnce([]) // annotators
        .mockResolvedValueOnce([]) // the task's existing items
        .mockResolvedValueOnce({ uuid: "new-1", message: "ok" }); // create
      const user = setupUser();
      render(
        <BulkUploadSttItemsDialog {...defaultProps({ linkedEvaluators })} />,
      );
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

    it("resets parsed items when toggling annotations off/on", async () => {
      apiClient.mockResolvedValue([{ uuid: "a1", name: "Alice" }]);
      const user = setupUser();
      render(
        <BulkUploadSttItemsDialog {...defaultProps({ linkedEvaluators })} />,
      );
      // Parse a plain CSV first (no annotations).
      const csv = `name,reference_transcript,predicted_transcript\n"A","ref","pred"`;
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

    it("uploads a rating annotation with a numeric value", async () => {
      const ratingEval: SttLinkedEvaluator[] = [
        {
          uuid: "ev-r",
          name: "Quality",
          output_type: "rating",
          scale_min: 1,
          scale_max: 5,
        },
      ];
      apiClient
        .mockResolvedValueOnce([{ uuid: "a1", name: "Alice" }]) // annotators
        .mockResolvedValueOnce([]) // the task's existing items
        .mockResolvedValueOnce({
          all_new: false,
          existing_with_annotations: [],
          existing_without_annotations: [{ index: 0, name: "Greeting" }],
        }) // annotated-check
        .mockResolvedValueOnce({}); // upload
      const user = setupUser();
      const onSuccess = jest.fn();
      render(
        <BulkUploadSttItemsDialog
          {...defaultProps({ linkedEvaluators: ratingEval, onSuccess })}
        />,
      );
      await selectAnnotator(user);
      await waitFor(() =>
        expect(
          screen.getByText("Drop a CSV here or click to browse"),
        ).toBeInTheDocument(),
      );
      const csv = `name,reference_transcript,predicted_transcript,Quality/value,Quality/reasoning
"Greeting","Hello there","hello there","4","Good"`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(screen.getByText("1 item ready to upload")).toBeInTheDocument(),
      );
      await user.click(screen.getByRole("button", { name: "Upload item" }));
      await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(1, true));
      const uploadCall = apiClient.mock.calls.find(
        (c) =>
          c[0] === "/annotation-tasks/task-1/items" && c[2]?.method === "POST",
      );
      expect(uploadCall![2].body.items[0].annotations["ev-r"]).toEqual({
        value: 4,
        reasoning: "Good",
      });
    });

    it("blocks the upload and names a row whose item is not in the task", async () => {
      apiClient
        .mockResolvedValueOnce([{ uuid: "a1", name: "Alice" }]) // annotators
        .mockResolvedValueOnce([
          {
            uuid: "i1",
            payload: {
              name: "Greeting",
              reference_transcript: "Hello there",
              predicted_transcript: "hello there",
            },
          },
        ]) // the task's existing items
        .mockResolvedValueOnce({
          all_new: false,
          existing_with_annotations: [],
          existing_without_annotations: [{ index: 0, name: "Greeting" }],
        }); // annotated-check: row 2 matches no item
      const user = setupUser();
      const onSuccess = jest.fn();
      render(
        <BulkUploadSttItemsDialog
          {...defaultProps({ linkedEvaluators, onSuccess })}
        />,
      );
      await selectAnnotator(user);
      await waitFor(() =>
        expect(
          screen.getByText("Drop a CSV here or click to browse"),
        ).toBeInTheDocument(),
      );
      const csv = `name,reference_transcript,predicted_transcript,Correctness/value,Correctness/reasoning
"Greeting","Hello there","hello there","true","Looks right"
"Farewell","Bye now","bye now","true","Also right"`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(
          screen.getByText(/This task has no item named "Farewell"/),
        ).toBeInTheDocument(),
      );
      // The named row is the only one missing, so the row that does match is
      // not blamed.
      expect(
        screen.queryByText(/This task has no item named "Greeting"/),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Upload 2 items" }),
      ).toBeDisabled();
      await user.click(screen.getByRole("button", { name: "Upload 2 items" }));
      expect(onSuccess).not.toHaveBeenCalled();
      expect(
        apiClient.mock.calls.find(
          (c) =>
            c[0] === "/annotation-tasks/task-1/items" &&
            c[2]?.method === "POST",
        ),
      ).toBeUndefined();
    });

    it("uploads with no warning when every row matches an item in the task", async () => {
      apiClient
        .mockResolvedValueOnce([{ uuid: "a1", name: "Alice" }]) // annotators
        .mockResolvedValueOnce([]) // the task's existing items
        .mockResolvedValueOnce({
          all_new: false,
          existing_with_annotations: [],
          existing_without_annotations: [
            { index: 0, name: "Greeting" },
            { index: 1, name: "Farewell" },
          ],
        }) // annotated-check
        .mockResolvedValueOnce({}); // upload
      const user = setupUser();
      const onSuccess = jest.fn();
      render(
        <BulkUploadSttItemsDialog
          {...defaultProps({ linkedEvaluators, onSuccess })}
        />,
      );
      await selectAnnotator(user);
      await waitFor(() =>
        expect(
          screen.getByText("Drop a CSV here or click to browse"),
        ).toBeInTheDocument(),
      );
      const csv = `name,reference_transcript,predicted_transcript,Correctness/value,Correctness/reasoning
"Greeting","Hello there","hello there","true","Looks right"
"Farewell","Bye now","bye now","false","Wrong words"`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(screen.getByText("2 items ready to upload")).toBeInTheDocument(),
      );
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Upload 2 items" }),
        ).toBeEnabled(),
      );
      expect(
        screen.queryByText(/This task has no item named/),
      ).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Upload 2 items" }));
      await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(2, true));
      const uploadCall = apiClient.mock.calls.find(
        (c) =>
          c[0] === "/annotation-tasks/task-1/items" && c[2]?.method === "POST",
      );
      expect(uploadCall![2].body.items).toHaveLength(2);
    });

    it("clears the upload error when the labels question is answered again", async () => {
      apiClient.mockImplementation(
        (endpoint: string, token: string, opts?: { method?: string }) => {
          if (endpoint === "/annotators")
            return Promise.resolve([{ uuid: "a1", name: "Alice" }]);
          if (endpoint.endsWith("/items/annotated-check"))
            return Promise.resolve({
              all_new: false,
              existing_with_annotations: [],
              existing_without_annotations: [{ index: 0, name: "Greeting" }],
            });
          if (opts?.method === "POST")
            return Promise.reject(new Error("Request failed: 400 - Bad name"));
          return Promise.resolve([]);
        },
      );
      const user = setupUser();
      render(
        <BulkUploadSttItemsDialog {...defaultProps({ linkedEvaluators })} />,
      );
      await selectAnnotator(user);
      await waitFor(() =>
        expect(
          screen.getByText("Drop a CSV here or click to browse"),
        ).toBeInTheDocument(),
      );
      const csv = `name,reference_transcript,predicted_transcript,Correctness/value,Correctness/reasoning
"Greeting","Hello there","hello there","true","Looks right"`;
      await uploadFile(csv);
      await waitFor(() =>
        expect(screen.getByText("1 item ready to upload")).toBeInTheDocument(),
      );
      await user.click(screen.getByRole("button", { name: "Upload item" }));
      await waitFor(() =>
        expect(screen.getByText("Bad name")).toBeInTheDocument(),
      );
      // Answering the labels question again starts over, so the failed
      // upload's message must not stay on screen.
      await user.click(screen.getByRole("button", { name: "No" }));
      await waitFor(() =>
        expect(screen.queryByText("Bad name")).not.toBeInTheDocument(),
      );
      expect(
        screen.getByText("Drop a CSV here or click to browse"),
      ).toBeInTheDocument();
    });
  });
});
