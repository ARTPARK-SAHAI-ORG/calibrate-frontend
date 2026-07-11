import { render } from "@testing-library/react";
import * as React from "react";
import {
  BulkUploadLlmGeneralItemsDialog,
  type LlmGeneralLinkedEvaluator,
} from "../BulkUploadLlmGeneralItemsDialog";

// The generic BulkUploadItemsDialog is a large, separately-tested component.
// Stub it here and capture the props the wrapper passes through, so we can
// exercise the llm-general-specific contentColumns/sampleRows data that this
// file defines.
let capturedProps: any = null;
jest.mock("../BulkUploadItemsDialog", () => ({
  BulkUploadItemsDialog: (props: any) => {
    capturedProps = props;
    return <div data-testid="bulk-upload-items-dialog" />;
  },
}));

const linkedEvaluators: LlmGeneralLinkedEvaluator[] = [
  {
    uuid: "ev-1",
    name: "Accuracy",
    slug: "accuracy",
    variables: [{ name: "criteria" }],
    output_type: "binary",
    scale_min: null,
    scale_max: null,
  },
];

describe("BulkUploadLlmGeneralItemsDialog", () => {
  beforeEach(() => {
    capturedProps = null;
  });

  it("passes core props through to BulkUploadItemsDialog", () => {
    const onClose = jest.fn();
    const onSuccess = jest.fn();
    render(
      <BulkUploadLlmGeneralItemsDialog
        isOpen
        accessToken="tok"
        taskUuid="task-1"
        linkedEvaluators={linkedEvaluators}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    expect(capturedProps).not.toBeNull();
    expect(capturedProps.isOpen).toBe(true);
    expect(capturedProps.accessToken).toBe("tok");
    expect(capturedProps.taskUuid).toBe("task-1");
    expect(capturedProps.linkedEvaluators).toBe(linkedEvaluators);
    expect(capturedProps.onClose).toBe(onClose);
    expect(capturedProps.onSuccess).toBe(onSuccess);
    expect(capturedProps.guidelinesTitle).toBe(
      "Bulk upload — LLM output labelling items"
    );
    expect(capturedProps.guidelinesIntro).toMatch(/non-conversational/);
    expect(capturedProps.sampleFilenameBase).toBe("llm_response_items");
    expect(capturedProps.sampleRows).toHaveLength(2);
    expect(capturedProps.contentColumns).toHaveLength(2);
  });

  it("defaults linkedEvaluators to an empty array when omitted", () => {
    render(
      <BulkUploadLlmGeneralItemsDialog
        isOpen={false}
        accessToken="tok"
        taskUuid="task-1"
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />
    );
    expect(capturedProps.isOpen).toBe(false);
    expect(capturedProps.linkedEvaluators).toEqual([]);
  });

  describe("input content column", () => {
    function getColumn() {
      render(
        <BulkUploadLlmGeneralItemsDialog
          isOpen
          accessToken="tok"
          taskUuid="task-1"
          linkedEvaluators={linkedEvaluators}
          onClose={jest.fn()}
          onSuccess={jest.fn()}
        />
      );
      return capturedProps.contentColumns.find(
        (c: any) => c.payloadKey === "input"
      );
    }

    it("parses the raw string through unchanged", () => {
      const column = getColumn();
      const result = column.parse("Summarise this text");
      expect(result).toEqual({ value: "Summarise this text" });
    });

    it("renders the text in the preview", () => {
      const column = getColumn();
      const { container } = render(column.renderPreview("Some input"));
      expect(container.textContent).toBe("Some input");
    });

    it("renders an empty string when value is nullish", () => {
      const column = getColumn();
      const { container } = render(column.renderPreview(undefined));
      expect(container.textContent).toBe("");
    });
  });

  describe("output content column", () => {
    function getColumn() {
      render(
        <BulkUploadLlmGeneralItemsDialog
          isOpen
          accessToken="tok"
          taskUuid="task-1"
          linkedEvaluators={linkedEvaluators}
          onClose={jest.fn()}
          onSuccess={jest.fn()}
        />
      );
      return capturedProps.contentColumns.find(
        (c: any) => c.payloadKey === "output"
      );
    }

    it("parses the raw string through unchanged", () => {
      const column = getColumn();
      const result = column.parse("A short summary");
      expect(result).toEqual({ value: "A short summary" });
    });

    it("renders the text in the preview", () => {
      const column = getColumn();
      const { container } = render(column.renderPreview("Some output"));
      expect(container.textContent).toBe("Some output");
    });
  });
});
