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
      expect(
        screen.getByText(/Row 1: "name" is required/),
      ).toBeInTheDocument(),
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
    await uploadFile(`name,reference_transcript,predicted_transcript\n"","",""`);
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
          screen.getByText(
            /Two or more linked evaluators share the same name/,
          ),
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
        .mockResolvedValueOnce({
          all_new: true,
          existing_with_annotations: [],
          existing_without_annotations: [],
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

    it("errors when an annotation column is missing", async () => {
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
          screen.getByText(/CSV is missing annotation column\(s\)/),
        ).toBeInTheDocument(),
      );
    });

    it("errors when an annotation value cell is empty", async () => {
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
"A","ref","pred","",""`;
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
        .mockResolvedValueOnce({
          all_new: true,
          existing_with_annotations: [],
          existing_without_annotations: [],
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
        (c) => c[0] === "/annotation-tasks/task-1/items",
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

    it("shows an empty annotators state and a link to add one", async () => {
      apiClient.mockResolvedValueOnce([]);
      const user = setupUser();
      render(
        <BulkUploadSttItemsDialog {...defaultProps({ linkedEvaluators })} />,
      );
      await user.click(screen.getByRole("button", { name: "Yes" }));
      await waitFor(() =>
        expect(
          screen.getByText(
            (_, el) =>
              el?.tagName.toLowerCase() === "div" &&
              (el?.textContent ?? "").startsWith("No annotators exist yet."),
          ),
        ).toBeInTheDocument(),
      );
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
        .mockResolvedValueOnce({
          all_new: true,
          existing_with_annotations: [],
          existing_without_annotations: [],
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
        (c) => c[0] === "/annotation-tasks/task-1/items",
      );
      expect(uploadCall![2].body.items[0].annotations["ev-r"]).toEqual({
        value: 4,
        reasoning: "Good",
      });
    });
  });
});
