import * as simulationTabs from "../index";

describe("simulation-tabs barrel", () => {
  it("re-exports the simulation tab components", () => {
    expect(simulationTabs.SimulationConfigTab).toBeDefined();
    expect(simulationTabs.SimulationRunsTab).toBeDefined();
  });
});
