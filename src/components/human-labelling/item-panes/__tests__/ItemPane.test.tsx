import React from "react";
import { render, screen } from "@/test-utils";
import { ItemPane } from "../../AnnotationJobView";

const item = (payload: Record<string, unknown>) => ({
  uuid: "i1",
  payload,
});

describe("ItemPane picks the pane by task type first", () => {
  it("draws a single agent response tool-call item as input and output", () => {
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
    expect(screen.getByText("book_appointment")).toBeInTheDocument();
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
});
