import { sanitizeJsonString, parseJsonLenient } from "../jsonSanitize";

describe("sanitizeJsonString", () => {
  it("replaces curly double quotes with straight quotes", () => {
    expect(sanitizeJsonString("“hello”")).toBe('"hello"');
  });

  it("replaces curly single quotes with straight quotes", () => {
    expect(sanitizeJsonString("‘hello’")).toBe("'hello'");
  });

  it("leaves already-ascii strings unchanged", () => {
    expect(sanitizeJsonString('{"a":"b"}')).toBe('{"a":"b"}');
  });

  it("handles mixed quote variants", () => {
    expect(sanitizeJsonString("„x‟″‶")).toBe('"x"""');
  });
});

describe("parseJsonLenient", () => {
  it("parses valid JSON directly", () => {
    expect(parseJsonLenient('{"a":1}')).toEqual({ a: 1 });
  });

  it("sanitizes smart quotes and re-parses on failure", () => {
    expect(parseJsonLenient('{“a”: 1}')).toEqual({ a: 1 });
  });

  it("throws the original error when sanitization does not change the string", () => {
    expect(() => parseJsonLenient("not json")).toThrow();
  });

  it("throws when sanitized string still fails to parse", () => {
    expect(() => parseJsonLenient("“not json")).toThrow();
  });
});
