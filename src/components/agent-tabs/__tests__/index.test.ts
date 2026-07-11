// The barrel eagerly pulls in the bulk-upload tree, which imports jspdf (ESM,
// not transformed by jest). A stub keeps the module graph loadable.
jest.mock("jspdf", () => ({ jsPDF: class {} }));

import * as agentTabs from "../index";

describe("agent-tabs barrel", () => {
  it("re-exports all tab contents and sub-components", () => {
    const expected = [
      "AgentTabContent",
      "AgentConnectionTabContent",
      "ToolsTabContent",
      "DataExtractionTabContent",
      "EvaluationTabContent",
      "TestsTabContent",
      "EvaluatorsTabContent",
      "AddEvaluatorsDialog",
      "SettingsTabContent",
      "LLMSelectorModal",
      "AddToolDialog",
      "DeleteToolDialog",
      "InbuiltToolsPanel",
    ];
    for (const name of expected) {
      expect(agentTabs[name as keyof typeof agentTabs]).toBeDefined();
    }
  });
});
