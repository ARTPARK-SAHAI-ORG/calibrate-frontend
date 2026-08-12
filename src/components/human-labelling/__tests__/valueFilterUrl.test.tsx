import React from "react";
import { render, screen, setupUser } from "@/test-utils";
import {
  DISAGREEMENTS_PARAM,
  VALUE_FILTERS_PARAM,
  decodeValueFilters,
  encodeValueFilters,
  readUrlParam,
  useUrlValueFilters,
  writeUrlParam,
} from "../valueFilterUrl";

function setSearch(search: string) {
  window.history.replaceState(null, "", `/tasks/t-1${search}`);
}

beforeEach(() => setSearch(""));

describe("encodeValueFilters / decodeValueFilters", () => {
  it("round-trips several filters with both kinds of score", () => {
    const filters = [
      { evaluatorId: "ev-1", values: [true, false] },
      { evaluatorId: "ev-2", values: [1, 4] },
    ];
    const raw = encodeValueFilters(filters);
    expect(raw).toBe("ev-1:true.false,ev-2:1.4");
    expect(decodeValueFilters(raw)).toEqual(filters);
  });

  it("leaves out a filter with no picked scores", () => {
    expect(encodeValueFilters([{ evaluatorId: "ev-1", values: [] }])).toBe("");
  });

  it("reads nothing from an empty or broken value", () => {
    expect(decodeValueFilters(null)).toEqual([]);
    expect(decodeValueFilters("")).toEqual([]);
    expect(decodeValueFilters("ev-1,:true,ev-2:")).toEqual([]);
    expect(decodeValueFilters("ev-1:abc")).toEqual([]);
  });
});

describe("readUrlParam / writeUrlParam", () => {
  it("adds, keeps and removes the value without touching other params", () => {
    setSearch("?tab=runs");
    writeUrlParam(DISAGREEMENTS_PARAM, "1");
    expect(readUrlParam(DISAGREEMENTS_PARAM)).toBe("1");
    expect(readUrlParam("tab")).toBe("runs");
    writeUrlParam(DISAGREEMENTS_PARAM, null);
    expect(readUrlParam(DISAGREEMENTS_PARAM)).toBeNull();
    expect(window.location.search).toBe("?tab=runs");
  });

  it("leaves a bare path when the last param goes", () => {
    writeUrlParam(DISAGREEMENTS_PARAM, "1");
    writeUrlParam(DISAGREEMENTS_PARAM, null);
    expect(window.location.search).toBe("");
    expect(window.location.pathname).toBe("/tasks/t-1");
  });
});

function Harness() {
  const [filters, setFilters] = useUrlValueFilters();
  return (
    <div>
      <span data-testid="filters">{JSON.stringify(filters)}</span>
      <button onClick={() => setFilters([{ evaluatorId: "ev-9", values: [2] }])}>
        pick
      </button>
      <button onClick={() => setFilters([])}>clear</button>
    </div>
  );
}

describe("useUrlValueFilters", () => {
  it("starts from the filters already in the address bar", () => {
    setSearch(`?${VALUE_FILTERS_PARAM}=ev-1%3Atrue`);
    render(<Harness />);
    expect(screen.getByTestId("filters")).toHaveTextContent(
      '[{"evaluatorId":"ev-1","values":[true]}]',
    );
  });

  it("starts empty when there is nothing in the address bar", () => {
    render(<Harness />);
    expect(screen.getByTestId("filters")).toHaveTextContent("[]");
  });

  it("writes a picked filter to the address bar and clears it again", async () => {
    const user = setupUser();
    render(<Harness />);

    await user.click(screen.getByText("pick"));
    expect(readUrlParam(VALUE_FILTERS_PARAM)).toBe("ev-9:2");
    expect(screen.getByTestId("filters")).toHaveTextContent(
      '[{"evaluatorId":"ev-9","values":[2]}]',
    );

    await user.click(screen.getByText("clear"));
    expect(readUrlParam(VALUE_FILTERS_PARAM)).toBeNull();
    expect(screen.getByTestId("filters")).toHaveTextContent("[]");
  });
});
