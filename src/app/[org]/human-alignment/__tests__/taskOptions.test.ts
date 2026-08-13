import {
  taskOptionsWithAgreement,
  TaskOptionSource,
} from "../taskOptions";

describe("taskOptionsWithAgreement", () => {
  it("keeps only tasks flagged has_agreement", () => {
    const tasks: TaskOptionSource[] = [
      { uuid: "1", name: "Alpha", has_agreement: true },
      { uuid: "2", name: "Beta", has_agreement: false },
      { uuid: "3", name: "Gamma", has_agreement: true },
    ];

    expect(taskOptionsWithAgreement(tasks)).toEqual([
      { uuid: "1", name: "Alpha" },
      { uuid: "3", name: "Gamma" },
    ]);
  });

  it("treats a missing has_agreement flag as excluded", () => {
    const tasks: TaskOptionSource[] = [
      { uuid: "1", name: "NoFlag" },
      { uuid: "2", name: "Yes", has_agreement: true },
    ];

    expect(taskOptionsWithAgreement(tasks)).toEqual([
      { uuid: "2", name: "Yes" },
    ]);
  });

  it("maps each kept task down to just uuid and name", () => {
    const tasks: TaskOptionSource[] = [
      { uuid: "1", name: "Alpha", has_agreement: true },
    ];

    const result = taskOptionsWithAgreement(tasks);

    expect(result).toEqual([{ uuid: "1", name: "Alpha" }]);
    expect(Object.keys(result[0])).toEqual(["uuid", "name"]);
  });

  it("returns an empty array when no task has agreement data", () => {
    const tasks: TaskOptionSource[] = [
      { uuid: "1", name: "A", has_agreement: false },
      { uuid: "2", name: "B" },
    ];

    expect(taskOptionsWithAgreement(tasks)).toEqual([]);
  });

  it("returns an empty array for an empty list", () => {
    expect(taskOptionsWithAgreement([])).toEqual([]);
  });
});
