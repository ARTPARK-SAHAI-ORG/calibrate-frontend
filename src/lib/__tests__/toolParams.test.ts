import {
  normalizeSchemaType,
  parseSchemaNode,
  readToolParameters,
} from "@/lib/toolParams";

describe("normalizeSchemaType", () => {
  it("collapses a nullable union to the non-null type", () => {
    expect(normalizeSchemaType(["integer", "null"])).toEqual({
      dataType: "integer",
      nullable: true,
    });
  });

  it("handles a union with null first", () => {
    expect(normalizeSchemaType(["null", "string"])).toEqual({
      dataType: "string",
      nullable: true,
    });
  });

  it("falls back to string when the union has no non-null string member", () => {
    expect(normalizeSchemaType(["null", 42])).toEqual({
      dataType: "string",
      nullable: true,
    });
  });

  it("handles a non-array string type", () => {
    expect(normalizeSchemaType("boolean")).toEqual({
      dataType: "boolean",
      nullable: false,
    });
  });

  it("falls back to string for a non-string, non-array type", () => {
    expect(normalizeSchemaType(123)).toEqual({
      dataType: "string",
      nullable: false,
    });
    expect(normalizeSchemaType(undefined)).toEqual({
      dataType: "string",
      nullable: false,
    });
  });
});

describe("parseSchemaNode", () => {
  it("parses a simple required string field", () => {
    const node = parseSchemaNode("name", { type: "string", description: "The name" });
    expect(node).toEqual({
      name: "name",
      dataType: "string",
      nullable: false,
      required: true,
      description: "The name",
    });
  });

  it("defaults description to empty string when absent", () => {
    const node = parseSchemaNode("name", { type: "string" });
    expect(node.description).toBe("");
  });

  it("marks nullable fields as not required regardless of isRequired", () => {
    const node = parseSchemaNode("age", { type: ["integer", "null"] }, true);
    expect(node.required).toBe(false);
    expect(node.nullable).toBe(true);
  });

  it("respects a boolean `required` on the schema itself over isRequired", () => {
    const node = parseSchemaNode("age", { type: "integer", required: false }, true);
    expect(node.required).toBe(false);
  });

  it("falls back to isRequired when schema.required is not boolean", () => {
    const node = parseSchemaNode("age", { type: "integer", required: "yes" }, false);
    expect(node.required).toBe(false);
  });

  it("falls back to string when type and properties are both absent", () => {
    const node = parseSchemaNode("foo", {});
    expect(node.dataType).toBe("string");
  });

  it("infers object type from presence of properties when type is absent", () => {
    const node = parseSchemaNode("addr", { properties: { city: { type: "string" } } });
    expect(node.dataType).toBe("object");
  });

  it("parses array items recursively", () => {
    const node = parseSchemaNode("tags", {
      type: "array",
      items: { type: "string" },
    });
    expect(node.items).toEqual({
      name: "",
      dataType: "string",
      nullable: false,
      required: true,
      description: "",
    });
  });

  it("does not set items when array schema has no items", () => {
    const node = parseSchemaNode("tags", { type: "array" });
    expect(node.items).toBeUndefined();
  });

  it("parses object properties recursively, respecting the required array", () => {
    const node = parseSchemaNode("addr", {
      type: "object",
      properties: {
        city: { type: "string" },
        zip: { type: "string" },
      },
      required: ["city"],
    });
    expect(node.properties).toHaveLength(2);
    const city = node.properties!.find((p) => p.name === "city")!;
    const zip = node.properties!.find((p) => p.name === "zip")!;
    expect(city.required).toBe(true);
    expect(zip.required).toBe(false);
  });

  it("treats a non-array `required` on an object schema as no required props", () => {
    const node = parseSchemaNode("addr", {
      type: "object",
      properties: { city: { type: "string" } },
      required: "city",
    });
    expect(node.properties![0].required).toBe(false);
  });

  it("does not set properties when object schema has no properties", () => {
    const node = parseSchemaNode("addr", { type: "object" });
    expect(node.properties).toBeUndefined();
  });
});

describe("readToolParameters", () => {
  it("returns [] when config is undefined", () => {
    expect(readToolParameters(undefined)).toEqual([]);
  });

  it("parses the array format, defaulting required to true", () => {
    const params = readToolParameters({
      parameters: [
        { id: "a", type: "string" },
        { name: "b", type: "integer", required: false },
      ],
    });
    expect(params.map((p) => p.name)).toEqual(["a", "b"]);
    expect(params[0].required).toBe(true);
    expect(params[1].required).toBe(false);
  });

  it("falls back to entry.name when entry.id is absent, and to '' when both absent", () => {
    const params = readToolParameters({ parameters: [{ type: "string" }] });
    expect(params[0].name).toBe("");
  });

  it("parses the legacy parameters.properties object format with a required array", () => {
    const params = readToolParameters({
      parameters: {
        properties: {
          city: { type: "string" },
          zip: { type: "string" },
        },
        required: ["city"],
      },
    });
    expect(params.find((p) => p.name === "city")!.required).toBe(true);
    expect(params.find((p) => p.name === "zip")!.required).toBe(false);
  });

  it("parses function.parameters.properties format", () => {
    const params = readToolParameters({
      function: { parameters: { properties: { q: { type: "string" } } } },
    });
    expect(params.map((p) => p.name)).toEqual(["q"]);
  });

  it("parses a bare config.properties format", () => {
    const params = readToolParameters({ properties: { q: { type: "string" } } });
    expect(params.map((p) => p.name)).toEqual(["q"]);
  });

  it("treats config.parameters itself as the properties map when nothing else matches", () => {
    const params = readToolParameters({ parameters: { q: { type: "string" } } });
    expect(params.map((p) => p.name)).toEqual(["q"]);
  });

  it("returns [] when nothing matches any shape", () => {
    expect(readToolParameters({})).toEqual([]);
  });

  it("treats every legacy param as required when no required array is declared", () => {
    const params = readToolParameters({
      properties: { q: { type: "string" } },
    });
    expect(params[0].required).toBe(true);
  });
});
