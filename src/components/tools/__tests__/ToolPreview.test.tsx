import React from "react";
import { render, screen } from "@/test-utils";
import { ToolPreview } from "../ToolPreview";
import type { ToolData } from "@/components/AddToolDialog";

const structuredTool: ToolData = {
  uuid: "t-1",
  name: "Extract order",
  description: "Pulls the order id from the conversation",
  config: {
    type: "structured_output",
    parameters: [
      {
        id: "order_id",
        type: "string",
        description: "The order id",
        required: true,
      },
      {
        id: "notes",
        type: "string",
        description: "",
        required: false,
      },
    ],
  },
  created_at: "2024-01-01",
  updated_at: "2024-01-01",
};

const webhookTool: ToolData = {
  uuid: "t-2",
  name: "Book flight",
  description: "Books a flight",
  config: {
    type: "webhook",
    webhook: {
      method: "POST",
      url: "https://example.com/book",
      queryParameters: [
        { id: "city", type: "string", description: "", required: true },
      ],
      body: {
        parameters: [
          {
            id: "date",
            type: "string",
            description: "Travel date",
            required: false,
          },
        ],
      },
    },
  },
  created_at: "2024-01-01",
  updated_at: "2024-01-01",
};

describe("ToolPreview", () => {
  it("shows a placeholder when nothing is selected", () => {
    render(<ToolPreview tool={null} />);
    expect(
      screen.getByText("Select a tool to see its details"),
    ).toBeInTheDocument();
  });

  it("shows a structured-output tool's name, type, description and parameters", () => {
    render(<ToolPreview tool={structuredTool} />);
    expect(screen.getByText("Extract order")).toBeInTheDocument();
    expect(screen.getByText("Structured Output")).toBeInTheDocument();
    expect(
      screen.getByText("Pulls the order id from the conversation"),
    ).toBeInTheDocument();
    expect(screen.getByText("order_id")).toBeInTheDocument();
    expect(screen.getByText("The order id")).toBeInTheDocument();
    expect(screen.getByText("notes")).toBeInTheDocument();
    expect(screen.getByText(/optional/)).toBeInTheDocument();
  });

  it("shows a webhook tool's method, url, query and body parameters separately", () => {
    render(<ToolPreview tool={webhookTool} />);
    expect(screen.getByText("Webhook")).toBeInTheDocument();
    expect(screen.getByText("POST")).toBeInTheDocument();
    expect(screen.getByText("https://example.com/book")).toBeInTheDocument();
    expect(screen.getByText("Query parameters")).toBeInTheDocument();
    expect(screen.getByText("city")).toBeInTheDocument();
    expect(screen.getByText("Body parameters")).toBeInTheDocument();
    expect(screen.getByText("date")).toBeInTheDocument();
    expect(screen.getByText("Travel date")).toBeInTheDocument();
    // A structured-output-only "Parameters" section should not appear.
    expect(screen.queryByText("Parameters")).not.toBeInTheDocument();
  });

  it("hides a parameter section entirely when there is nothing in it", () => {
    const bareWebhook: ToolData = {
      ...webhookTool,
      config: {
        type: "webhook",
        webhook: { method: "GET", url: "https://example.com/ping" },
      },
    };
    render(<ToolPreview tool={bareWebhook} />);
    expect(screen.queryByText("Query parameters")).not.toBeInTheDocument();
    expect(screen.queryByText("Body parameters")).not.toBeInTheDocument();
  });

  it("falls back to config.description and defaults to Structured Output with no type set", () => {
    const legacyTool: ToolData = {
      uuid: "t-3",
      name: "Legacy tool",
      config: { description: "From config" },
      created_at: "2024-01-01",
      updated_at: "2024-01-01",
    };
    render(<ToolPreview tool={legacyTool} />);
    expect(screen.getByText("Structured Output")).toBeInTheDocument();
    expect(screen.getByText("From config")).toBeInTheDocument();
  });
});
