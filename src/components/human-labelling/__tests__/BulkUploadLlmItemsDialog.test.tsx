import { render } from "@testing-library/react";
import * as React from "react";
import {
  BulkUploadLlmItemsDialog,
  type LinkedEvaluator,
} from "../BulkUploadLlmItemsDialog";

// The generic BulkUploadItemsDialog is a large, separately-tested component.
// Stub it here and capture the props the wrapper passes through, so we can
// exercise the LLM-specific contentColumns/sampleRows/sampleFallbackEvaluators
// data that this file defines.
let capturedProps: any = null;
jest.mock("../BulkUploadItemsDialog", () => ({
  BulkUploadItemsDialog: (props: any) => {
    capturedProps = props;
    return <div data-testid="bulk-upload-items-dialog" />;
  },
}));

// bulk-upload-shared.tsx transitively imports jspdf (an ESM-only package
// jest's transform can't parse). This file only needs ChatHistoryPreview /
// TurnObject from it, so stub the module with a minimal equivalent.
jest.mock("../bulk-upload-shared", () => ({
  ChatHistoryPreview: ({ turns }: { turns: { role: string; content?: string }[] }) => (
    <div data-testid="chat-history-preview">
      {turns.map((t, i) => (
        <div key={i}>
          {t.role}: {t.content ?? ""}
        </div>
      ))}
    </div>
  ),
}));

const linkedEvaluators: LinkedEvaluator[] = [
  {
    uuid: "ev-1",
    name: "Correctness",
    slug: "correctness",
    variables: [{ name: "criteria" }],
    output_type: "binary",
    scale_min: null,
    scale_max: null,
  },
];

describe("BulkUploadLlmItemsDialog", () => {
  beforeEach(() => {
    capturedProps = null;
  });

  it("passes core props through to BulkUploadItemsDialog", () => {
    const onClose = jest.fn();
    const onSuccess = jest.fn();
    render(
      <BulkUploadLlmItemsDialog
        isOpen
        accessToken="tok"
        taskUuid="task-1"
        linkedEvaluators={linkedEvaluators}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );

    expect(capturedProps).not.toBeNull();
    expect(capturedProps.isOpen).toBe(true);
    expect(capturedProps.accessToken).toBe("tok");
    expect(capturedProps.taskUuid).toBe("task-1");
    expect(capturedProps.linkedEvaluators).toBe(linkedEvaluators);
    expect(capturedProps.onClose).toBe(onClose);
    expect(capturedProps.onSuccess).toBe(onSuccess);
    expect(capturedProps.guidelinesTitle).toBe(
      "Bulk upload — LLM labelling items",
    );
    expect(capturedProps.sampleFilenameBase).toBe("llm_items");
    expect(capturedProps.sampleRows).toHaveLength(2);
    expect(capturedProps.sampleFallbackEvaluators).toHaveLength(1);
  });

  it("does not render BulkUploadItemsDialog content when closed (still forwards isOpen=false)", () => {
    render(
      <BulkUploadLlmItemsDialog
        isOpen={false}
        accessToken="tok"
        taskUuid="task-1"
        linkedEvaluators={[]}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />,
    );
    expect(capturedProps.isOpen).toBe(false);
  });

  describe("chat_history content column", () => {
    function getColumn() {
      render(
        <BulkUploadLlmItemsDialog
          isOpen
          accessToken="tok"
          taskUuid="task-1"
          linkedEvaluators={linkedEvaluators}
          onClose={jest.fn()}
          onSuccess={jest.fn()}
        />,
      );
      return capturedProps.contentColumns.find(
        (c: any) => c.payloadKey === "chat_history",
      );
    }

    it("parses a valid conversation array", () => {
      const column = getColumn();
      const raw = JSON.stringify([
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello!" },
      ]);
      const result = column.parse(raw, 0);
      expect(result.error).toBeUndefined();
      expect(result.value).toHaveLength(2);
    });

    it("errors on invalid JSON", () => {
      const column = getColumn();
      const result = column.parse("{not json", 2);
      expect(result.error).toMatch(/Row 3/);
      expect(result.error).toMatch(/must be valid JSON/);
    });

    it("errors on a non-array value", () => {
      const column = getColumn();
      const result = column.parse(JSON.stringify({ role: "user" }), 0);
      expect(result.error).toMatch(/non-empty array/);
    });

    it("errors on an empty array", () => {
      const column = getColumn();
      const result = column.parse(JSON.stringify([]), 0);
      expect(result.error).toMatch(/non-empty array/);
    });

    it("errors when a turn is missing a string role", () => {
      const column = getColumn();
      const raw = JSON.stringify([{ content: "Hi" }]);
      const result = column.parse(raw, 4);
      expect(result.error).toMatch(/Row 5, turn 1/);
      expect(result.error).toMatch(/string "role"/);
    });

    it("errors when a turn is not an object", () => {
      const column = getColumn();
      const raw = JSON.stringify(["not-an-object"]);
      const result = column.parse(raw, 0);
      expect(result.error).toMatch(/string "role"/);
    });

    it("renders a preview using ChatHistoryPreview", () => {
      const column = getColumn();
      const preview = column.renderPreview([
        { role: "user", content: "Hi" },
      ]);
      const { container } = render(preview);
      expect(container.textContent).toContain("Hi");
    });

    it("renders a preview with an empty/undefined value", () => {
      const column = getColumn();
      const preview = column.renderPreview(undefined);
      expect(() => render(preview)).not.toThrow();
    });
  });

  describe("agent_response content column", () => {
    function getColumn() {
      render(
        <BulkUploadLlmItemsDialog
          isOpen
          accessToken="tok"
          taskUuid="task-1"
          linkedEvaluators={linkedEvaluators}
          onClose={jest.fn()}
          onSuccess={jest.fn()}
        />,
      );
      return capturedProps.contentColumns.find(
        (c: any) => c.payloadKey === "agent_response",
      );
    }

    it("parses the raw string through unchanged", () => {
      const column = getColumn();
      const result = column.parse("You can return it within 30 days.");
      expect(result.value).toBe("You can return it within 30 days.");
      expect(result.error).toBeUndefined();
    });

    it("renders the reply text in the preview", () => {
      const column = getColumn();
      const { container } = render(column.renderPreview("Hello there"));
      expect(container.textContent).toBe("Hello there");
    });

    it("renders an empty string when value is nullish", () => {
      const column = getColumn();
      const { container } = render(column.renderPreview(undefined));
      expect(container.textContent).toBe("");
    });
  });
});
