// Shared JSON-schema → parameter-tree parsing for tools.
//
// Both the tool builder (AddToolDialog) and the tool-call test editor
// (AddTestDialog) need to read a tool's stored `config.parameters` into a tree
// of typed parameters. The recursive node-parsing rules (nullable unions,
// required-flag handling, nested object properties, array items) are identical
// for both, so they live here once. Each component maps the normalized tree
// into its own shape (ParameterCard's `Parameter`, the test editor's
// `ExpectedParam`).

export type NormalizedToolParam = {
  name: string;
  /** Single JSON-schema data type, with nullable unions collapsed. */
  dataType: string;
  required: boolean;
  /** True when the source type was a nullable union (e.g. ["integer","null"]). */
  nullable: boolean;
  description: string;
  /** Present for object types. */
  properties?: NormalizedToolParam[];
  /** Present for array types — the schema of each item. */
  items?: NormalizedToolParam;
};

// Normalize a JSON-schema "type" that may be a nullable union
// (e.g. ["integer", "null"]) into a single dataType plus a nullable flag.
// The first non-"null" member wins; nullable fields are treated as optional.
export const normalizeSchemaType = (
  rawType: any,
): { dataType: string; nullable: boolean } => {
  if (Array.isArray(rawType)) {
    const nullable = rawType.includes("null");
    const nonNull = rawType.find((t) => t !== "null");
    return {
      dataType: typeof nonNull === "string" ? nonNull : "string",
      nullable,
    };
  }
  return {
    dataType: typeof rawType === "string" ? rawType : "string",
    nullable: false,
  };
};

// Parse a single JSON-schema node into a normalized parameter (recursively for
// object properties and array items). `isRequired` supplies the required flag
// when the schema itself doesn't carry a boolean `required` (objects use
// `required` as an array of child names, so it's only a self-flag when boolean).
export const parseSchemaNode = (
  name: string,
  schema: any,
  isRequired: boolean = true,
): NormalizedToolParam => {
  const { dataType, nullable } = normalizeSchemaType(
    schema?.type ?? (schema?.properties ? "object" : "string"),
  );

  const param: NormalizedToolParam = {
    name,
    dataType,
    nullable,
    required: nullable
      ? false
      : typeof schema?.required === "boolean"
        ? schema.required
        : isRequired,
    description: schema?.description || "",
  };

  if (dataType === "array" && schema?.items) {
    param.items = parseSchemaNode("", schema.items, true);
  }

  if (dataType === "object" && schema?.properties) {
    // `required` on an object schema is the JSON-schema array of required child
    // names; guard against malformed configs that store a boolean here instead.
    const requiredProps = Array.isArray(schema?.required) ? schema.required : [];
    param.properties = Object.entries(schema.properties).map(
      ([propName, propSchema]) =>
        parseSchemaNode(propName, propSchema, requiredProps.includes(propName)),
    );
  }

  return param;
};

// Read a tool config's top-level parameters into normalized form. Handles both
// the array format (each entry carries its own `id`/`name` + `required`
// boolean) and the legacy object format (a JSON-schema object or bare
// properties map).
export const readToolParameters = (
  config: Record<string, any> | undefined,
): NormalizedToolParam[] => {
  const params = config?.parameters;

  if (Array.isArray(params)) {
    return params.map((p: any) =>
      parseSchemaNode(p.id || p.name || "", p, p.required !== false),
    );
  }

  const propsObj =
    config?.parameters?.properties ||
    config?.function?.parameters?.properties ||
    config?.properties ||
    config?.parameters ||
    {};
  const requiredArr = Array.isArray(config?.parameters?.required)
    ? config.parameters.required
    : [];
  return Object.entries(propsObj).map(([name, schema]) =>
    parseSchemaNode(
      name,
      schema,
      // No declared required array → treat every legacy param as required.
      requiredArr.length ? requiredArr.includes(name) : true,
    ),
  );
};
