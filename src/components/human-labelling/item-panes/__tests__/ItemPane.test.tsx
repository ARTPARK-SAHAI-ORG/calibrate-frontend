import React from "react";
import { render, screen } from "@/test-utils";
import { ItemPane } from "../../AnnotationJobView";

const item = (payload: Record<string, unknown>) => ({
  id: 1,
  uuid: "i1",
  task_id: "task-1",
  payload,
  created_at: "2024-01-01",
  deleted_at: null,
});

describe("ItemPane picks the pane by task type first", () => {
  it("draws a basic agent tool-call item as input and output", () => {
    render(
      <ItemPane
        item={item({
          input: "Book me a slot in Bengaluru",
          output: "",
          actual_tool_calls: [
            { tool: "book_appointment", arguments: { city: "Bengaluru" } },
          ],
          expected_tool_calls: [
            {
              tool: "book_appointment",
              arguments: { city: { match_type: "exact", value: "Bengaluru" } },
            },
          ],
        })}
        taskType="llm-general"
      />,
    );
    expect(screen.getByText("Input")).toBeInTheDocument();
    expect(screen.getByText("Book me a slot in Bengaluru")).toBeInTheDocument();
    expect(screen.getAllByText("book_appointment")[0]).toBeInTheDocument();
  });

  it("draws a next-reply tool-call item as a conversation", () => {
    render(
      <ItemPane
        item={item({
          chat_history: [{ role: "user", content: "Book me a slot" }],
          agent_response: "",
          actual_tool_calls: [
            { tool: "book_appointment", arguments: { city: "Bengaluru" } },
          ],
        })}
        taskType="llm"
      />,
    );
    expect(screen.getByText("Book me a slot")).toBeInTheDocument();
    expect(screen.getByText("book_appointment")).toBeInTheDocument();
    expect(screen.queryByText("Input")).not.toBeInTheDocument();
  });

  it("draws the expected answer when an item carries one but no tool-call flag", () => {
    render(
      <ItemPane
        item={item({
          chat_history: [{ role: "user", content: "Hi" }],
          agent_response: "",
          expected_tool_calls: [{ tool: "book_train", arguments: {} }],
          actual_tool_calls: [],
        })}
        taskType="llm"
      />,
    );
    expect(screen.getByText("Expected answer")).toBeInTheDocument();
  });
});
