"use client";

import { useState, useEffect, useRef } from "react";
import { signOut } from "next-auth/react";
import { ParameterCard, Parameter } from "@/components/ParameterCard";
import { NestedContainer } from "@/components/ui/NestedContainer";
import { useHideFloatingButton } from "@/components/AppLayout";
import { readNameConflictMessage } from "@/lib/parseBackendError";

type ToolData = {
  uuid: string;
  name: string;
  description?: string;
  config: Record<string, any>;
  created_at: string;
  updated_at: string;
};

type ToolType = "structured_output" | "webhook";

type AddToolDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  toolType: ToolType;
  editingToolUuid: string | null;
  backendAccessToken: string | undefined;
  onToolsUpdated: (tools: ToolData[]) => void;
};

const TOOL_TYPE_CONFIG: Record<
  ToolType,
  { addTitle: string; editTitle: string; description: string }
> = {
  structured_output: {
    addTitle: "Add structured output tool",
    editTitle: "Edit structured output tool",
    description:
      "Structured output tools enable agents to extract information from a conversation in a defined format. Example: the user's name or order details.",
  },
  webhook: {
    addTitle: "Add webhook tool",
    editTitle: "Edit webhook tool",
    description:
      "Webhook tools allow agents to call external APIs or services to perform actions. Example: sending a notification or querying a database.",
  },
};

export function AddToolDialog({
  isOpen,
  onClose,
  toolType,
  editingToolUuid,
  backendAccessToken,
  onToolsUpdated,
}: AddToolDialogProps) {
  // Hide the floating "Talk to Us" button when this dialog is open
  useHideFloatingButton(isOpen);

  const [toolName, setToolName] = useState("");
  const [toolDescription, setToolDescription] = useState("");
  const [parameters, setParameters] = useState<Parameter[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  // Duplicate-name 409 messages render inline next to the name field.
  const [nameConflictError, setNameConflictError] = useState<string | null>(
    null,
  );
  const [isLoadingTool, setIsLoadingTool] = useState(false);
  const [validationAttempted, setValidationAttempted] = useState(false);
  const sidebarContentRef = useRef<HTMLDivElement>(null);

  // UI ⇆ JSON view toggle. In JSON mode the whole tool definition is edited as
  // raw text; valid JSON syncs live into the form state below (the single source
  // of truth), so the existing create/update paths keep working unchanged.
  const [viewMode, setViewMode] = useState<"ui" | "json">("ui");
  const [jsonText, setJsonText] = useState("");
  // JSON syntax / structural parse error (the "JSON mistake").
  const [jsonError, setJsonError] = useState<string | null>(null);
  // Field-completeness errors from a failed submit (valid JSON, but missing
  // names/descriptions/properties). Surfaced as the form's inline red errors,
  // and shown at the top of the JSON editor when toggled back.
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Bumped on each failed submit to scroll the first invalid field into view.
  const [errorScrollTick, setErrorScrollTick] = useState(0);

  // Webhook-specific state
  const [webhookMethod, setWebhookMethod] = useState<
    "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  >("POST");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [responseTimeout, setResponseTimeout] = useState(20);
  const [showTimeoutTooltip, setShowTimeoutTooltip] = useState(false);

  // Headers state
  type WebhookHeader = {
    id: string;
    name: string;
    value: string;
  };
  const [webhookHeaders, setWebhookHeaders] = useState<WebhookHeader[]>([]);

  // Query parameters state (for webhook tools) - uses same Parameter type
  const [queryParameters, setQueryParameters] = useState<Parameter[]>([]);
  const [newlyAddedQueryParamId, setNewlyAddedQueryParamId] = useState<
    string | null
  >(null);
  const queryParamRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Body parameters state (for webhook tools with POST, PUT, PATCH methods)
  const [bodyDescription, setBodyDescription] = useState("");
  const [bodyParameters, setBodyParameters] = useState<Parameter[]>([]);

  // Reset form when dialog opens/closes or editingToolUuid changes
  useEffect(() => {
    if (isOpen) {
      // Always open in Form view, with a clean JSON editor buffer.
      setViewMode("ui");
      setJsonText("");
      setJsonError(null);
      setSubmitError(null);
      if (editingToolUuid) {
        // Load existing tool data
        loadToolData(editingToolUuid);
      } else {
        // Reset for new tool
        resetForm();
        // Add one default parameter for structured output tools
        if (toolType === "structured_output") {
          setParameters([
            {
              id: crypto.randomUUID(),
              dataType: "string",
              name: "",
              required: true,
              description: "",
            },
          ]);
        }
      }
    }
  }, [isOpen, editingToolUuid, toolType]);

  const resetForm = () => {
    setToolName("");
    setToolDescription("");
    setParameters([]);
    setCreateError(null);
    setNameConflictError(null);
    setValidationAttempted(false);
    // Reset webhook-specific fields
    setWebhookMethod("POST");
    setWebhookUrl("");
    setResponseTimeout(20);
    setWebhookHeaders([]);
    setQueryParameters([]);
    setBodyDescription("");
    setBodyParameters([]);
    setViewMode("ui");
    setJsonText("");
    setJsonError(null);
    setSubmitError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  // After a failed submit, scroll the first invalid field into view. The timeout
  // lets React paint the red borders (and any json→form view switch) first.
  // Every invalid field shares the `border-red-500` class, so the first match in
  // document order is the topmost error.
  useEffect(() => {
    if (errorScrollTick === 0) return;
    const timer = setTimeout(() => {
      const firstError =
        sidebarContentRef.current?.querySelector(".border-red-500");
      firstError?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
    return () => clearTimeout(timer);
  }, [errorScrollTick]);

  // Scroll to newly added query parameter
  useEffect(() => {
    if (newlyAddedQueryParamId) {
      setTimeout(() => {
        const element = queryParamRefs.current.get(newlyAddedQueryParamId);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        setNewlyAddedQueryParamId(null);
      }, 50);
    }
  }, [newlyAddedQueryParamId]);

  // Scroll to bottom when parameters change (new parameter added)
  const scrollToBottom = () => {
    if (sidebarContentRef.current) {
      setTimeout(() => {
        sidebarContentRef.current?.scrollTo({
          top: sidebarContentRef.current.scrollHeight,
          behavior: "smooth",
        });
      }, 50);
    }
  };

  const addParameter = () => {
    setValidationAttempted(false);
    setParameters([
      ...parameters,
      {
        id: crypto.randomUUID(),
        dataType: "string",
        name: "",
        required: true,
        description: "",
      },
    ]);
    scrollToBottom();
  };

  // Helper to update a parameter at any depth using a path of IDs
  const updateParameterAtPath = (
    params: Parameter[],
    path: string[],
    updates: Partial<Parameter>,
  ): Parameter[] => {
    if (path.length === 0) return params;
    const [currentId, ...restPath] = path;
    return params.map((p) => {
      if (p.id !== currentId) return p;
      if (restPath.length === 0) {
        return { ...p, ...updates };
      }
      if (restPath[0] === "__items__") {
        const currentItems = p.items || {
          id: crypto.randomUUID(),
          dataType: "string",
          name: "",
          required: true,
          description: "",
        };
        if (restPath.length === 1) {
          return { ...p, items: { ...currentItems, ...updates } };
        }
        const [, ...deeperPath] = restPath;
        const updatedItems = updateSingleParameterAtPath(
          currentItems,
          deeperPath,
          updates,
        );
        return { ...p, items: updatedItems };
      }
      return {
        ...p,
        properties: updateParameterAtPath(
          p.properties || [],
          restPath,
          updates,
        ),
      };
    });
  };

  const updateSingleParameterAtPath = (
    param: Parameter,
    path: string[],
    updates: Partial<Parameter>,
  ): Parameter => {
    if (path.length === 0) {
      return { ...param, ...updates };
    }
    const [currentSegment, ...restPath] = path;
    if (currentSegment === "__items__") {
      const currentItems = param.items || {
        id: crypto.randomUUID(),
        dataType: "string",
        name: "",
        required: true,
        description: "",
      };
      if (restPath.length === 0) {
        return { ...param, items: { ...currentItems, ...updates } };
      }
      return {
        ...param,
        items: updateSingleParameterAtPath(currentItems, restPath, updates),
      };
    }
    return {
      ...param,
      properties: updateParameterAtPath(param.properties || [], path, updates),
    };
  };

  const addPropertyAtPath = (
    params: Parameter[],
    path: string[],
  ): Parameter[] => {
    if (path.length === 0) return params;
    const [currentId, ...restPath] = path;
    return params.map((p) => {
      if (p.id !== currentId) return p;
      if (restPath.length === 0) {
        return {
          ...p,
          properties: [
            ...(p.properties || []),
            {
              id: crypto.randomUUID(),
              dataType: "string",
              name: "",
              required: true,
              description: "",
            },
          ],
        };
      }
      if (restPath[0] === "__items__" && p.items) {
        return {
          ...p,
          items: addPropertyToSingleParam(p.items, restPath.slice(1)),
        };
      }
      return {
        ...p,
        properties: addPropertyAtPath(p.properties || [], restPath),
      };
    });
  };

  const addPropertyToSingleParam = (
    param: Parameter,
    path: string[],
  ): Parameter => {
    if (path.length === 0) {
      return {
        ...param,
        properties: [
          ...(param.properties || []),
          {
            id: crypto.randomUUID(),
            dataType: "string",
            name: "",
            required: true,
            description: "",
          },
        ],
      };
    }
    if (path[0] === "__items__" && param.items) {
      return {
        ...param,
        items: addPropertyToSingleParam(param.items, path.slice(1)),
      };
    }
    return {
      ...param,
      properties: addPropertyAtPath(param.properties || [], path),
    };
  };

  const removePropertyAtPath = (
    params: Parameter[],
    path: string[],
    idToRemove: string,
  ): Parameter[] => {
    if (path.length === 0) {
      return params.filter((p) => p.id !== idToRemove);
    }
    const [currentId, ...restPath] = path;
    return params.map((p) => {
      if (p.id !== currentId) return p;
      if (restPath[0] === "__items__" && p.items) {
        return {
          ...p,
          items: removePropertyFromSingleParam(
            p.items,
            restPath.slice(1),
            idToRemove,
          ),
        };
      }
      if (restPath.length === 0) {
        return {
          ...p,
          properties: (p.properties || []).filter(
            (prop) => prop.id !== idToRemove,
          ),
        };
      }
      return {
        ...p,
        properties: removePropertyAtPath(
          p.properties || [],
          restPath,
          idToRemove,
        ),
      };
    });
  };

  const removePropertyFromSingleParam = (
    param: Parameter,
    path: string[],
    idToRemove: string,
  ): Parameter => {
    if (path.length === 0) {
      return {
        ...param,
        properties: (param.properties || []).filter((p) => p.id !== idToRemove),
      };
    }
    if (path[0] === "__items__" && param.items) {
      return {
        ...param,
        items: removePropertyFromSingleParam(
          param.items,
          path.slice(1),
          idToRemove,
        ),
      };
    }
    return {
      ...param,
      properties: removePropertyAtPath(
        param.properties || [],
        path,
        idToRemove,
      ),
    };
  };

  const setItemsAtPath = (
    params: Parameter[],
    path: string[],
    items: Parameter | undefined,
  ): Parameter[] => {
    if (path.length === 0) return params;
    const [currentId, ...restPath] = path;
    return params.map((p) => {
      if (p.id !== currentId) return p;
      if (restPath.length === 0) {
        return { ...p, items };
      }
      if (restPath[0] === "__items__" && p.items) {
        return {
          ...p,
          items: setItemsOnSingleParam(p.items, restPath.slice(1), items),
        };
      }
      return {
        ...p,
        properties: setItemsAtPath(p.properties || [], restPath, items),
      };
    });
  };

  const setItemsOnSingleParam = (
    param: Parameter,
    path: string[],
    items: Parameter | undefined,
  ): Parameter => {
    if (path.length === 0) {
      return { ...param, items };
    }
    if (path[0] === "__items__" && param.items) {
      return {
        ...param,
        items: setItemsOnSingleParam(param.items, path.slice(1), items),
      };
    }
    return {
      ...param,
      properties: setItemsAtPath(param.properties || [], path, items),
    };
  };

  // Handlers
  const handleUpdateAtPath = (path: string[], updates: Partial<Parameter>) => {
    setParameters((prev) => updateParameterAtPath(prev, path, updates));
  };

  const handleAddPropertyAtPath = (path: string[]) => {
    setValidationAttempted(false);
    setParameters((prev) => addPropertyAtPath(prev, path));
    scrollToBottom();
  };

  const handleRemoveAtPath = (parentPath: string[], id: string) => {
    setParameters((prev) => removePropertyAtPath(prev, parentPath, id));
  };

  const handleSetItemsAtPath = (
    path: string[],
    items: Parameter | undefined,
  ) => {
    setValidationAttempted(false);
    setParameters((prev) => setItemsAtPath(prev, path, items));
  };

  // Query parameter handlers (same logic, different state)
  const handleQueryUpdateAtPath = (
    path: string[],
    updates: Partial<Parameter>,
  ) => {
    setQueryParameters((prev) => updateParameterAtPath(prev, path, updates));
  };

  const handleQueryAddPropertyAtPath = (path: string[]) => {
    setValidationAttempted(false);
    setQueryParameters((prev) => addPropertyAtPath(prev, path));
    scrollToBottom();
  };

  const handleQueryRemoveAtPath = (parentPath: string[], id: string) => {
    setQueryParameters((prev) => removePropertyAtPath(prev, parentPath, id));
  };

  const handleQuerySetItemsAtPath = (
    path: string[],
    items: Parameter | undefined,
  ) => {
    setValidationAttempted(false);
    setQueryParameters((prev) => setItemsAtPath(prev, path, items));
  };

  const addQueryParameter = () => {
    setValidationAttempted(false);
    const newId = crypto.randomUUID();
    setQueryParameters([
      ...queryParameters,
      {
        id: newId,
        dataType: "string",
        name: "",
        required: true,
        description: "",
      },
    ]);
    setNewlyAddedQueryParamId(newId);
  };

  // Body parameter handlers (same logic, different state)
  const handleBodyUpdateAtPath = (
    path: string[],
    updates: Partial<Parameter>,
  ) => {
    setBodyParameters((prev) => updateParameterAtPath(prev, path, updates));
  };

  const handleBodyAddPropertyAtPath = (path: string[]) => {
    setValidationAttempted(false);
    setBodyParameters((prev) => addPropertyAtPath(prev, path));
    scrollToBottom();
  };

  const handleBodyRemoveAtPath = (parentPath: string[], id: string) => {
    setBodyParameters((prev) => removePropertyAtPath(prev, parentPath, id));
  };

  const handleBodySetItemsAtPath = (
    path: string[],
    items: Parameter | undefined,
  ) => {
    setValidationAttempted(false);
    setBodyParameters((prev) => setItemsAtPath(prev, path, items));
  };

  const addBodyParameter = () => {
    setValidationAttempted(false);
    setBodyParameters([
      ...bodyParameters,
      {
        id: crypto.randomUUID(),
        dataType: "string",
        name: "",
        required: true,
        description: "",
      },
    ]);
    scrollToBottom();
  };

  // Validation helpers
  const isValidUrl = (url: string): boolean => {
    if (!url.trim()) return false;
    try {
      const urlObj = new URL(url.trim());
      // Must be http or https
      if (urlObj.protocol !== "http:" && urlObj.protocol !== "https:") {
        return false;
      }
      // Hostname must have a dot (domain.tld) or be localhost
      const hostname = urlObj.hostname;
      if (hostname !== "localhost" && !hostname.includes(".")) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  };

  const hasDuplicateNames = (params: Parameter[]): boolean => {
    const names = params
      .map((p) => p.name.trim().toLowerCase())
      .filter(Boolean);
    return new Set(names).size !== names.length;
  };

  const hasInvalidParameters = (params: Parameter[]): boolean => {
    if (hasDuplicateNames(params)) return true;
    for (const p of params) {
      if (!p.name.trim() || !p.description.trim()) return true;
      if (p.dataType === "object") {
        if (!p.properties || p.properties.length === 0) return true;
        if (hasInvalidParameters(p.properties)) return true;
      }
      if (p.dataType === "array" && p.items) {
        if (hasInvalidSingleParameter(p.items)) return true;
      }
    }
    return false;
  };

  const hasInvalidSingleParameter = (param: Parameter): boolean => {
    if (!param.description.trim()) return true;
    if (param.dataType === "object") {
      if (!param.properties || param.properties.length === 0) return true;
      if (hasInvalidParameters(param.properties)) return true;
    }
    if (param.dataType === "array" && param.items) {
      if (hasInvalidSingleParameter(param.items)) return true;
    }
    return false;
  };

  const hasInvalidHeaders = (headers: WebhookHeader[]): boolean => {
    for (const header of headers) {
      if (!header.name.trim() || !header.value.trim()) return true;
    }
    return false;
  };

  // JSON Schema helpers
  const parameterToJsonSchema = (param: Parameter): Record<string, any> => {
    const schema: Record<string, any> = {
      type: param.dataType,
      description: param.description,
    };

    if (param.dataType === "array" && param.items) {
      schema.items = {
        type: param.items.dataType,
        description: param.items.description,
      };
      if (
        param.items.dataType === "object" &&
        param.items.properties &&
        param.items.properties.length > 0
      ) {
        schema.items.properties = {};
        const requiredProps: string[] = [];
        param.items.properties.forEach((prop) => {
          schema.items.properties[prop.name] = parameterToJsonSchema(prop);
          if (prop.required) requiredProps.push(prop.name);
        });
        if (requiredProps.length > 0) schema.items.required = requiredProps;
      }
      if (param.items.dataType === "array" && param.items.items) {
        schema.items.items = parameterToJsonSchema({
          ...param.items.items,
          name: "",
          required: true,
        });
        delete schema.items.items.required;
      }
    }

    if (
      param.dataType === "object" &&
      param.properties &&
      param.properties.length > 0
    ) {
      schema.properties = {};
      const requiredProps: string[] = [];
      param.properties.forEach((prop) => {
        schema.properties[prop.name] = parameterToJsonSchema(prop);
        if (prop.required) requiredProps.push(prop.name);
      });
      if (requiredProps.length > 0) schema.required = requiredProps;
    }

    return schema;
  };

  const buildParametersConfig = (
    params: Parameter[],
  ): Array<Record<string, any>> => {
    return params
      .filter((param) => param.name)
      .map((param) => {
        const schema = parameterToJsonSchema(param);
        return {
          id: param.name,
          ...schema,
          required: param.required,
        };
      });
  };

  // Convert a list of parameters into an OpenAI-style object schema
  // ({ type: "object", properties: { name: {...} }, required: [...] }).
  // Empty-named (in-progress) params are dropped, matching buildParametersConfig.
  const paramsToObjectSchema = (params: Parameter[]): Record<string, any> => {
    const properties: Record<string, any> = {};
    const required: string[] = [];
    params
      .filter((param) => param.name)
      .forEach((param) => {
        properties[param.name] = parameterToJsonSchema(param);
        if (param.required) required.push(param.name);
      });
    const schema: Record<string, any> = { type: "object", properties };
    if (required.length > 0) schema.required = required;
    return schema;
  };

  // Inverse of paramsToObjectSchema: turn an object schema back into Parameter[].
  const objectSchemaToParams = (schema: any): Parameter[] => {
    if (!schema || typeof schema !== "object" || !schema.properties) return [];
    const requiredProps: string[] = Array.isArray(schema.required)
      ? schema.required
      : [];
    return Object.entries(schema.properties).map(
      ([propName, propConfig]: [string, any]) =>
        parseParameterSchema(
          propName,
          propConfig,
          requiredProps.includes(propName),
        ),
    );
  };

  // Normalize a JSON-schema "type" that may be a nullable union
  // (e.g. ["integer", "null"]) into a single dataType plus a nullable flag.
  // The first non-"null" member wins; nullable fields are treated as optional.
  const normalizeSchemaType = (
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

  const parseItemsSchema = (itemsConfig: any): Parameter => {
    const { dataType } = normalizeSchemaType(itemsConfig.type);
    const itemParam: Parameter = {
      id: crypto.randomUUID(),
      name: "",
      dataType,
      required: true,
      description: itemsConfig.description || "",
    };

    if (dataType === "object" && itemsConfig.properties) {
      itemParam.properties = [];
      const requiredProps = itemsConfig.required || [];
      Object.entries(itemsConfig.properties).forEach(
        ([propName, propConfig]: [string, any]) => {
          itemParam.properties!.push(
            parseParameterSchema(
              propName,
              propConfig,
              requiredProps.includes(propName),
            ),
          );
        },
      );
    }

    if (dataType === "array" && itemsConfig.items) {
      itemParam.items = parseItemsSchema(itemsConfig.items);
    }

    return itemParam;
  };

  const parseParameterSchema = (
    paramName: string,
    paramConfig: any,
    isRequired: boolean = true,
  ): Parameter => {
    const { dataType, nullable } = normalizeSchemaType(paramConfig.type);
    const param: Parameter = {
      id: crypto.randomUUID(),
      name: paramName,
      dataType,
      // A nullable union (e.g. ["integer", "null"]) marks the field optional.
      required: nullable ? false : (paramConfig.required ?? isRequired),
      description: paramConfig.description || "",
    };

    if (dataType === "array" && paramConfig.items) {
      param.items = parseItemsSchema(paramConfig.items);
    }

    if (dataType === "object" && paramConfig.properties) {
      param.properties = [];
      const requiredProps = paramConfig.required || [];
      Object.entries(paramConfig.properties).forEach(
        ([propName, propConfig]: [string, any]) => {
          param.properties!.push(
            parseParameterSchema(
              propName,
              propConfig,
              requiredProps.includes(propName),
            ),
          );
        },
      );
    }

    return param;
  };

  // ----- JSON view (serialize / parse / apply) -----

  // Serialize the current form state into the canonical tool JSON (OpenAI
  // function-call schema for parameters, plus the webhook block for webhooks).
  const buildToolJson = (): string => {
    const base: Record<string, any> = {
      name: toolName,
      description: toolDescription,
    };
    if (toolType === "webhook") {
      const webhook: Record<string, any> = {
        method: webhookMethod,
        url: webhookUrl,
        timeout: responseTimeout,
        headers: webhookHeaders.map((h) => ({ name: h.name, value: h.value })),
        queryParameters: paramsToObjectSchema(queryParameters),
      };
      if (["POST", "PUT", "PATCH"].includes(webhookMethod)) {
        webhook.body = {
          description: bodyDescription,
          parameters: paramsToObjectSchema(bodyParameters),
        };
      }
      base.webhook = webhook;
    } else {
      base.parameters = paramsToObjectSchema(parameters);
    }
    return JSON.stringify(base, null, 2);
  };

  const isObjectSchema = (value: any): boolean =>
    typeof value === "object" && value !== null && !Array.isArray(value);

  // Validate the structural shape of pasted/edited JSON. Returns a single
  // human-readable error string, or the parsed object when it is acceptable.
  const parseToolJson = (text: string): { value?: any; error?: string } => {
    let obj: any;
    try {
      obj = JSON.parse(text);
    } catch (e) {
      return { error: `Invalid JSON: ${(e as Error).message}` };
    }
    if (!isObjectSchema(obj)) {
      return { error: "The top-level value must be a JSON object." };
    }
    if (obj.name != null && typeof obj.name !== "string") {
      return { error: '"name" must be a string.' };
    }
    if (obj.description != null && typeof obj.description !== "string") {
      return { error: '"description" must be a string.' };
    }
    if (toolType === "webhook") {
      if (obj.webhook != null && !isObjectSchema(obj.webhook)) {
        return { error: '"webhook" must be an object.' };
      }
      const qp = obj.webhook?.queryParameters;
      if (qp != null && !isObjectSchema(qp)) {
        return {
          error:
            '"webhook.queryParameters" must be an object schema (with "properties").',
        };
      }
      const bp = obj.webhook?.body?.parameters;
      if (bp != null && !isObjectSchema(bp)) {
        return {
          error:
            '"webhook.body.parameters" must be an object schema (with "properties").',
        };
      }
    } else if (obj.parameters != null && !isObjectSchema(obj.parameters)) {
      return {
        error:
          '"parameters" must be an object schema (type "object" with "properties").',
      };
    }
    return { value: obj };
  };

  // Push a parsed JSON object into the form state.
  const applyToolJson = (obj: any) => {
    setToolName(typeof obj.name === "string" ? obj.name : "");
    setToolDescription(
      typeof obj.description === "string" ? obj.description : "",
    );
    if (toolType === "webhook") {
      const webhook = obj.webhook || {};
      const method = ["GET", "POST", "PUT", "PATCH", "DELETE"].includes(
        webhook.method,
      )
        ? webhook.method
        : "POST";
      setWebhookMethod(method);
      setWebhookUrl(typeof webhook.url === "string" ? webhook.url : "");
      setResponseTimeout(
        typeof webhook.timeout === "number" ? webhook.timeout : 20,
      );
      setWebhookHeaders(
        (Array.isArray(webhook.headers) ? webhook.headers : []).map(
          (h: any) => ({
            id: crypto.randomUUID(),
            name: typeof h?.name === "string" ? h.name : "",
            value: typeof h?.value === "string" ? h.value : "",
          }),
        ),
      );
      setQueryParameters(objectSchemaToParams(webhook.queryParameters));
      setBodyDescription(
        typeof webhook.body?.description === "string"
          ? webhook.body.description
          : "",
      );
      setBodyParameters(objectSchemaToParams(webhook.body?.parameters));
    } else {
      setParameters(objectSchemaToParams(obj.parameters));
    }
  };

  // Live-sync: valid JSON flows into form state on every keystroke; invalid JSON
  // surfaces an inline error and leaves the last-good state untouched. Editing the
  // JSON also clears any stale field-completeness message from a prior submit.
  const handleJsonChange = (text: string) => {
    setJsonText(text);
    setSubmitError(null);
    const result = parseToolJson(text);
    if (result.error) {
      setJsonError(result.error);
      return;
    }
    setJsonError(null);
    applyToolJson(result.value);
  };

  const switchToJson = () => {
    setJsonText(buildToolJson());
    // Rebuilt JSON is always syntactically valid, so no parse error. Recompute the
    // field-completeness message (only after a submit was attempted) so it stays
    // accurate and visible at the top of the editor when toggling back.
    setJsonError(null);
    setSubmitError(validationAttempted ? collectIncompleteFields() : null);
    setViewMode("json");
  };

  const switchToUi = () => {
    setViewMode("ui");
  };

  // Build a specific, field-by-field list of what is missing. Mirrors the rules in
  // hasInvalidParameters / hasInvalidSingleParameter exactly, but reports each
  // offending field by name/path instead of a single boolean.
  const collectItemIssues = (item: Parameter, label: string): string[] => {
    const issues: string[] = [];
    if (!item.description.trim()) {
      issues.push(`${label}: item description is required`);
    }
    if (item.dataType === "object") {
      if (!item.properties || item.properties.length === 0) {
        issues.push(`${label}: object items need at least one property`);
      } else {
        issues.push(...collectParamIssues(item.properties, `${label} › `));
      }
    }
    if (item.dataType === "array" && item.items) {
      issues.push(...collectItemIssues(item.items, `${label}[]`));
    }
    return issues;
  };

  const collectParamIssues = (
    params: Parameter[],
    prefix: string,
  ): string[] => {
    const issues: string[] = [];
    const counts = new Map<string, number>();
    params.forEach((p) => {
      const key = p.name.trim().toLowerCase();
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
    });
    const reportedDup = new Set<string>();
    params.forEach((p) => {
      const name = p.name.trim();
      const label = `${prefix}${name || "(unnamed)"}`;
      if (!name) issues.push(`${label}: name is required`);
      if (!p.description.trim()) issues.push(`${label}: description is required`);
      const dupKey = name.toLowerCase();
      if (name && (counts.get(dupKey) || 0) > 1 && !reportedDup.has(dupKey)) {
        reportedDup.add(dupKey);
        issues.push(`${prefix}${name}: duplicate name`);
      }
      if (p.dataType === "object") {
        if (!p.properties || p.properties.length === 0) {
          issues.push(`${label}: object needs at least one property`);
        } else {
          issues.push(...collectParamIssues(p.properties, `${label} › `));
        }
      }
      if (p.dataType === "array" && p.items) {
        issues.push(...collectItemIssues(p.items, `${label}[]`));
      }
    });
    return issues;
  };

  // Returns a multi-line message naming every incomplete field, or null if valid.
  const collectIncompleteFields = (): string | null => {
    const issues: string[] = [];
    if (!toolName.trim()) issues.push("Name is required");
    if (!toolDescription.trim()) issues.push("Description is required");
    if (toolType === "webhook") {
      if (!isValidUrl(webhookUrl)) issues.push("A valid webhook URL is required");
      if (webhookHeaders.length > 0 && hasInvalidHeaders(webhookHeaders)) {
        issues.push("Each header needs both a name and a value");
      }
      issues.push(...collectParamIssues(queryParameters, "Query param "));
      if (["POST", "PUT", "PATCH"].includes(webhookMethod)) {
        if (!bodyDescription.trim()) issues.push("Body description is required");
        issues.push(...collectParamIssues(bodyParameters, "Body param "));
      }
    } else {
      issues.push(...collectParamIssues(parameters, "Parameter "));
    }
    if (issues.length === 0) return null;
    return `Please fix:\n${issues.map((i) => `• ${i}`).join("\n")}`;
  };

  const handleSubmit = () => {
    // Can't submit (or validate fields on) unparseable JSON.
    if (viewMode === "json" && jsonError) return;

    setValidationAttempted(true);
    const message = collectIncompleteFields();
    if (message) {
      setSubmitError(message);
      // From JSON mode, switch to the form so the inline red errors show in
      // context (the message stays visible at the top if they toggle back).
      if (viewMode === "json") setViewMode("ui");
      // Scroll the first invalid field into view (after the switch + repaint).
      setErrorScrollTick((t) => t + 1);
      return;
    }

    setSubmitError(null);
    if (editingToolUuid) {
      updateTool();
    } else {
      createTool();
    }
  };

  // Load tool data for editing
  const loadToolData = async (uuid: string) => {
    try {
      setIsLoadingTool(true);
      setCreateError(null);

      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      const response = await fetch(`${backendUrl}/tools/${uuid}`, {
        method: "GET",
        headers: {
          accept: "application/json",
          Authorization: `Bearer ${backendAccessToken}`,
        },
      });

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to fetch tool details");
      }

      const toolData: ToolData = await response.json();

      setToolName(toolData.name || "");
      setToolDescription(
        toolData.description || toolData.config?.description || "",
      );

      const toolParams: Parameter[] = [];
      if (toolData.config?.parameters) {
        if (Array.isArray(toolData.config.parameters)) {
          toolData.config.parameters.forEach((paramConfig: any) => {
            const paramName = paramConfig.id || paramConfig.name || "";
            toolParams.push(parseParameterSchema(paramName, paramConfig));
          });
        } else {
          Object.entries(toolData.config.parameters).forEach(
            ([paramName, paramConfig]: [string, any]) => {
              toolParams.push(parseParameterSchema(paramName, paramConfig));
            },
          );
        }
      }
      setParameters(toolParams);

      // Load webhook-specific fields if present
      if (toolData.config?.webhook) {
        setWebhookMethod(toolData.config.webhook.method || "POST");
        setWebhookUrl(toolData.config.webhook.url || "");
        setResponseTimeout(toolData.config.webhook.timeout || 20);
        // Load headers
        if (toolData.config.webhook.headers) {
          setWebhookHeaders(
            toolData.config.webhook.headers.map((h: any) => ({
              id: crypto.randomUUID(),
              name: h.name || "",
              value: h.value || "",
            })),
          );
        }
        // Load query parameters (same format as parameters)
        if (toolData.config.webhook.queryParameters) {
          const queryParams: Parameter[] = [];
          if (Array.isArray(toolData.config.webhook.queryParameters)) {
            toolData.config.webhook.queryParameters.forEach(
              (paramConfig: any) => {
                const paramName = paramConfig.id || paramConfig.name || "";
                queryParams.push(parseParameterSchema(paramName, paramConfig));
              },
            );
          }
          setQueryParameters(queryParams);
        }
        // Load body parameters (same format as parameters)
        if (toolData.config.webhook.body) {
          setBodyDescription(toolData.config.webhook.body.description || "");
          if (toolData.config.webhook.body.parameters) {
            const bodyParams: Parameter[] = [];
            if (Array.isArray(toolData.config.webhook.body.parameters)) {
              toolData.config.webhook.body.parameters.forEach(
                (paramConfig: any) => {
                  const paramName = paramConfig.id || paramConfig.name || "";
                  bodyParams.push(parseParameterSchema(paramName, paramConfig));
                },
              );
            }
            setBodyParameters(bodyParams);
          }
        }
      }
    } catch (err) {
      console.error("Error fetching tool:", err);
      setCreateError(
        err instanceof Error ? err.message : "Failed to load tool",
      );
    } finally {
      setIsLoadingTool(false);
    }
  };

  // Refetch tools list
  const refetchTools = async () => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!backendUrl) return;

    const toolsResponse = await fetch(`${backendUrl}/tools`, {
      method: "GET",
      headers: {
        accept: "application/json",
        Authorization: `Bearer ${backendAccessToken}`,
      },
    });

    if (toolsResponse.ok) {
      const updatedTools: ToolData[] = await toolsResponse.json();
      onToolsUpdated(updatedTools);
    }
  };

  // Create tool
  const createTool = async () => {
    setValidationAttempted(true);
    if (!toolName.trim() || !toolDescription.trim()) return;

    if (toolType === "webhook") {
      // Validate webhook URL
      if (!isValidUrl(webhookUrl)) return;
      // Validate headers - if any header exists, both name and value are required
      if (webhookHeaders.length > 0 && hasInvalidHeaders(webhookHeaders))
        return;
      // Validate query parameters
      if (queryParameters.length > 0 && hasInvalidParameters(queryParameters))
        return;
      // Validate body description and parameters for POST/PUT/PATCH methods
      if (["POST", "PUT", "PATCH"].includes(webhookMethod)) {
        if (!bodyDescription.trim()) return;
        if (bodyParameters.length > 0 && hasInvalidParameters(bodyParameters))
          return;
      }
    } else {
      // Validate structured output parameters
      if (hasInvalidParameters(parameters)) return;
    }

    try {
      setIsCreating(true);
      setCreateError(null);
      setNameConflictError(null);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      const parametersConfig = buildParametersConfig(parameters);

      // Build config based on tool type
      const config: Record<string, any> = {
        type: toolType, // Store tool type in config
        parameters: parametersConfig,
      };

      if (toolType === "webhook") {
        config.webhook = {
          method: webhookMethod,
          url: webhookUrl.trim(),
          timeout: responseTimeout,
          headers: webhookHeaders
            .filter((h) => h.name.trim())
            .map((h) => ({
              name: h.name.trim(),
              value: h.value.trim(),
            })),
          queryParameters: buildParametersConfig(queryParameters),
          // Only include body for methods that support it
          ...(["POST", "PUT", "PATCH"].includes(webhookMethod) && {
            body: {
              description: bodyDescription.trim(),
              parameters: buildParametersConfig(bodyParameters),
            },
          }),
        };
      }

      const response = await fetch(`${backendUrl}/tools`, {
        method: "POST",
        headers: {
          accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${backendAccessToken}`,
        },
        body: JSON.stringify({
          name: toolName.trim(),
          description: toolDescription.trim(),
          config,
        }),
      });

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        const conflict = await readNameConflictMessage(response);
        if (conflict) {
          setNameConflictError(conflict);
          setIsCreating(false);
          return;
        }
        throw new Error("Failed to create tool");
      }

      await refetchTools();
      handleClose();
    } catch (err) {
      console.error("Error creating tool:", err);
      setCreateError(
        err instanceof Error ? err.message : "Failed to create tool",
      );
    } finally {
      setIsCreating(false);
    }
  };

  // Update tool
  const updateTool = async () => {
    setValidationAttempted(true);
    if (!toolName.trim() || !toolDescription.trim() || !editingToolUuid) return;

    if (toolType === "webhook") {
      // Validate webhook URL
      if (!isValidUrl(webhookUrl)) return;
      // Validate headers - if any header exists, both name and value are required
      if (webhookHeaders.length > 0 && hasInvalidHeaders(webhookHeaders))
        return;
      // Validate query parameters
      if (queryParameters.length > 0 && hasInvalidParameters(queryParameters))
        return;
      // Validate body description and parameters for POST/PUT/PATCH methods
      if (["POST", "PUT", "PATCH"].includes(webhookMethod)) {
        if (!bodyDescription.trim()) return;
        if (bodyParameters.length > 0 && hasInvalidParameters(bodyParameters))
          return;
      }
    } else {
      // Validate structured output parameters
      if (hasInvalidParameters(parameters)) return;
    }

    try {
      setIsCreating(true);
      setCreateError(null);
      setNameConflictError(null);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      const parametersConfig = buildParametersConfig(parameters);

      // Build config based on tool type
      const config: Record<string, any> = {
        type: toolType, // Store tool type in config
        parameters: parametersConfig,
      };

      if (toolType === "webhook") {
        config.webhook = {
          method: webhookMethod,
          url: webhookUrl.trim(),
          timeout: responseTimeout,
          headers: webhookHeaders
            .filter((h) => h.name.trim())
            .map((h) => ({
              name: h.name.trim(),
              value: h.value.trim(),
            })),
          queryParameters: buildParametersConfig(queryParameters),
          // Only include body for methods that support it
          ...(["POST", "PUT", "PATCH"].includes(webhookMethod) && {
            body: {
              description: bodyDescription.trim(),
              parameters: buildParametersConfig(bodyParameters),
            },
          }),
        };
      }

      const response = await fetch(`${backendUrl}/tools/${editingToolUuid}`, {
        method: "PUT",
        headers: {
          accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${backendAccessToken}`,
        },
        body: JSON.stringify({
          name: toolName.trim(),
          description: toolDescription.trim(),
          config,
        }),
      });

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        const conflict = await readNameConflictMessage(response);
        if (conflict) {
          setNameConflictError(conflict);
          setIsCreating(false);
          return;
        }
        throw new Error("Failed to update tool");
      }

      await refetchTools();
      handleClose();
    } catch (err) {
      console.error("Error updating tool:", err);
      setCreateError(
        err instanceof Error ? err.message : "Failed to update tool",
      );
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />
      {/* Sidebar */}
      <div className="relative w-full md:w-[40%] md:min-w-[500px] bg-background md:border-l border-border flex flex-col h-full shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <svg
              className="w-5 h-5 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z"
              />
            </svg>
            <h2 className="text-lg font-semibold">
              {editingToolUuid
                ? TOOL_TYPE_CONFIG[toolType].editTitle
                : TOOL_TYPE_CONFIG[toolType].addTitle}
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div
          ref={sidebarContentRef}
          className="flex-1 overflow-y-auto p-6 space-y-6"
        >
          {isLoadingTool ? (
            <div className="flex items-center justify-center py-12">
              <svg
                className="w-6 h-6 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
            </div>
          ) : (
            <>
              {/* Helper Callout — shown at the top in both Form and JSON views */}
              <div className="flex gap-3 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
                <svg
                  className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
                  />
                </svg>
                <p className="text-sm text-blue-700 dark:text-blue-200">
                  {TOOL_TYPE_CONFIG[toolType].description}
                </p>
              </div>

              {/* View mode toggle: Form ⇆ JSON */}
              <div className="flex items-center justify-end">
                <div className="flex items-center gap-0.5 rounded-full bg-muted/60 p-0.5">
                  <button
                    type="button"
                    onClick={switchToUi}
                    className={`h-7 px-3 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                      viewMode === "ui"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Form
                  </button>
                  <button
                    type="button"
                    onClick={switchToJson}
                    className={`h-7 px-3 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                      viewMode === "json"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    JSON
                  </button>
                </div>
              </div>

              {viewMode === "json" ? (
                <div className="space-y-2">
                  {(jsonError || submitError) && (
                    <div className="rounded-md border border-red-500 bg-red-500/10 px-4 py-3">
                      <p className="text-sm text-red-500 whitespace-pre-line">
                        {jsonError || submitError}
                      </p>
                    </div>
                  )}
                  <textarea
                    value={jsonText}
                    onChange={(e) => handleJsonChange(e.target.value)}
                    spellCheck={false}
                    placeholder='{ "name": "", "description": "", "parameters": { "type": "object", "properties": {} } }'
                    className={`w-full min-h-[480px] px-4 py-3 rounded-md text-sm font-mono bg-background text-foreground placeholder:text-muted-foreground border focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-y ${
                      jsonError || submitError
                        ? "border-red-500"
                        : "border-border"
                    }`}
                  />
                </div>
              ) : (
                <>
                  {/* Configuration Section */}
                  <div className="border border-border rounded-xl p-5 space-y-5 bg-muted/100">
                    <div>
                      <h3 className="text-base font-medium mb-1">
                        Configuration
                      </h3>
                    </div>

                    {/* Name */}
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={toolName}
                        onChange={(e) => {
                          setToolName(e.target.value);
                          if (nameConflictError) setNameConflictError(null);
                        }}
                        placeholder="An informative name for the tool that reflects its purpose"
                        className={`w-full h-10 px-4 rounded-md text-base border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent ${
                          nameConflictError ||
                          (validationAttempted && !toolName.trim())
                            ? "border-red-500"
                            : "border-border"
                        }`}
                      />
                      {nameConflictError && (
                        <p className="mt-1 text-sm text-red-500">
                          {nameConflictError}
                        </p>
                      )}
                    </div>

                    {/* Description */}
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Description <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        value={toolDescription}
                        onChange={(e) => setToolDescription(e.target.value)}
                        placeholder="Describe to the LLM how and when to use the tool along with what should be passed to the tool"
                        rows={3}
                        className={`w-full px-4 py-3 rounded-md text-base border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-none ${
                          validationAttempted && !toolDescription.trim()
                            ? "border-red-500"
                            : "border-border"
                        }`}
                      />
                    </div>

                    {/* Webhook-specific fields */}
                    {toolType === "webhook" && (
                      <>
                        {/* Method and URL */}
                        <div className="flex gap-4">
                          <div className="w-36">
                            <label className="block text-sm font-medium mb-2">
                              Method
                            </label>
                            <div className="relative">
                              <select
                                value={webhookMethod}
                                onChange={(e) =>
                                  setWebhookMethod(
                                    e.target.value as
                                      | "GET"
                                      | "POST"
                                      | "PUT"
                                      | "PATCH"
                                      | "DELETE",
                                  )
                                }
                                className="w-full h-10 px-4 pr-10 rounded-md text-base border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent appearance-none cursor-pointer"
                              >
                                <option value="GET">GET</option>
                                <option value="POST">POST</option>
                                <option value="PUT">PUT</option>
                                <option value="PATCH">PATCH</option>
                                <option value="DELETE">DELETE</option>
                              </select>
                              <svg
                                className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M19 9l-7 7-7-7"
                                />
                              </svg>
                            </div>
                          </div>
                          <div className="flex-1">
                            <label className="block text-sm font-medium mb-2">
                              URL <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="text"
                              value={webhookUrl}
                              onChange={(e) => setWebhookUrl(e.target.value)}
                              placeholder="https://example.com/{hi}/webhook"
                              className={`w-full h-10 px-4 rounded-md text-base border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent ${
                                validationAttempted &&
                                toolType === "webhook" &&
                                !isValidUrl(webhookUrl)
                                  ? "border-red-500"
                                  : "border-border"
                              }`}
                            />
                            {validationAttempted &&
                              toolType === "webhook" &&
                              !isValidUrl(webhookUrl) && (
                                <p className="text-xs text-red-500 mt-1">
                                  {webhookUrl.trim()
                                    ? "Please enter a valid URL"
                                    : "URL is required"}
                                </p>
                              )}
                          </div>
                        </div>

                        {/* Response Timeout */}
                        <div>
                          <label className="block text-sm font-medium mb-1">
                            Response timeout (seconds)
                          </label>
                          <p className="text-sm text-muted-foreground mb-3">
                            How long to wait for the webhook tool to respond
                            before timing out. Default is 20 seconds.
                          </p>
                          <div className="relative pt-6">
                            {/* Tooltip */}
                            {showTimeoutTooltip && (
                              <div
                                className="absolute -top-1 transform -translate-x-1/2 pointer-events-none z-10"
                                style={{
                                  left: `calc(${
                                    ((responseTimeout - 1) / 119) * 100
                                  }% + ${
                                    8 - ((responseTimeout - 1) / 119) * 16
                                  }px)`,
                                }}
                              >
                                <div className="bg-foreground text-background text-xs font-medium px-2 py-1 rounded-md whitespace-nowrap">
                                  {responseTimeout} secs
                                </div>
                                <div className="w-2 h-2 bg-foreground transform rotate-45 absolute left-1/2 -translate-x-1/2 -bottom-1" />
                              </div>
                            )}
                            {/* Track background */}
                            <div className="relative h-2">
                              {/* Unfilled track */}
                              <div className="absolute inset-0 bg-muted rounded-full" />
                              {/* Filled track */}
                              <div
                                className="absolute top-0 left-0 h-full bg-foreground rounded-full"
                                style={{
                                  width: `${((responseTimeout - 1) / 119) * 100}%`,
                                }}
                              />
                              {/* Input */}
                              <input
                                type="range"
                                min={1}
                                max={120}
                                value={responseTimeout}
                                onChange={(e) =>
                                  setResponseTimeout(
                                    parseInt(e.target.value, 10),
                                  )
                                }
                                onMouseEnter={() => setShowTimeoutTooltip(true)}
                                onMouseLeave={() =>
                                  setShowTimeoutTooltip(false)
                                }
                                onFocus={() => setShowTimeoutTooltip(true)}
                                onBlur={() => setShowTimeoutTooltip(false)}
                                className="absolute inset-0 w-full h-full appearance-none bg-transparent cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-md [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-foreground [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:shadow-md"
                              />
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Headers Section - Webhook only */}
                  {toolType === "webhook" && (
                    <div className="border border-border rounded-xl p-5 space-y-5 bg-muted/100">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-base font-medium mb-1">
                            Headers
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            Define headers that will be sent with the request
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            setWebhookHeaders([
                              ...webhookHeaders,
                              {
                                id: crypto.randomUUID(),
                                name: "",
                                value: "",
                              },
                            ]);
                          }}
                          className="h-9 px-4 rounded-md text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer whitespace-nowrap flex-shrink-0"
                        >
                          Add header
                        </button>
                      </div>

                      {/* Header Cards */}
                      {webhookHeaders.map((header) => (
                        <div
                          key={header.id}
                          className="border border-border rounded-xl p-4 space-y-4 bg-background"
                        >
                          {/* Name */}
                          <div>
                            <label className="block text-sm font-medium mb-2">
                              Name <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="text"
                              value={header.name}
                              onChange={(e) => {
                                setWebhookHeaders(
                                  webhookHeaders.map((h) =>
                                    h.id === header.id
                                      ? { ...h, name: e.target.value }
                                      : h,
                                  ),
                                );
                              }}
                              placeholder="e.g. Authorization"
                              className={`w-full h-10 px-4 rounded-md text-base border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent ${
                                validationAttempted && !header.name.trim()
                                  ? "border-red-500"
                                  : "border-border"
                              }`}
                            />
                          </div>

                          {/* Value */}
                          <div>
                            <label className="block text-sm font-medium mb-2">
                              Value <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="text"
                              value={header.value}
                              onChange={(e) => {
                                setWebhookHeaders(
                                  webhookHeaders.map((h) =>
                                    h.id === header.id
                                      ? { ...h, value: e.target.value }
                                      : h,
                                  ),
                                );
                              }}
                              placeholder="Header value"
                              className={`w-full h-10 px-4 rounded-md text-base border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent ${
                                validationAttempted && !header.value.trim()
                                  ? "border-red-500"
                                  : "border-border"
                              }`}
                            />
                          </div>

                          {/* Delete button */}
                          <div className="flex justify-end">
                            <button
                              onClick={() => {
                                setWebhookHeaders(
                                  webhookHeaders.filter(
                                    (h) => h.id !== header.id,
                                  ),
                                );
                              }}
                              className="h-9 px-4 rounded-md text-sm font-medium text-red-500 bg-red-500/10 hover:text-red-600 hover:bg-red-500/20 transition-colors cursor-pointer"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Parameters Section - Structured Output Tools Only */}
                  {toolType === "structured_output" && (
                    <div className="border border-border rounded-xl p-5 space-y-5 bg-muted/100">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-base font-medium mb-1">
                            Parameters
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            Define the structure of the output that the agent
                            should produce
                          </p>
                        </div>
                        <button
                          onClick={addParameter}
                          className="h-9 px-4 rounded-md text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer whitespace-nowrap flex-shrink-0"
                        >
                          Add param
                        </button>
                      </div>

                      {/* Parameter Cards */}
                      {parameters.map((param) => (
                        <ParameterCard
                          key={param.id}
                          param={param}
                          path={[]}
                          onUpdate={handleUpdateAtPath}
                          onRemove={handleRemoveAtPath}
                          onAddProperty={handleAddPropertyAtPath}
                          onSetItems={handleSetItemsAtPath}
                          validationAttempted={validationAttempted}
                          siblingNames={parameters
                            .filter((p) => p.id !== param.id)
                            .map((p) => p.name)}
                        />
                      ))}
                    </div>
                  )}

                  {/* Query Parameters Section - Webhook Tools Only */}
                  {toolType === "webhook" && (
                    <div className="border border-border rounded-xl p-5 space-y-5 bg-muted/100">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-base font-medium mb-1">
                            Query parameters
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            Define parameters that will be collected by the LLM
                            and sent as the query of the request.
                          </p>
                        </div>
                        <button
                          onClick={addQueryParameter}
                          className="h-9 px-4 rounded-md text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer whitespace-nowrap flex-shrink-0"
                        >
                          Add param
                        </button>
                      </div>

                      {/* Query Parameter Cards */}
                      {queryParameters.map((param) => (
                        <div
                          key={param.id}
                          ref={(el) => {
                            if (el) {
                              queryParamRefs.current.set(param.id, el);
                            } else {
                              queryParamRefs.current.delete(param.id);
                            }
                          }}
                        >
                          <ParameterCard
                            param={param}
                            path={[]}
                            onUpdate={handleQueryUpdateAtPath}
                            onRemove={handleQueryRemoveAtPath}
                            onAddProperty={handleQueryAddPropertyAtPath}
                            onSetItems={handleQuerySetItemsAtPath}
                            validationAttempted={validationAttempted}
                            siblingNames={queryParameters
                              .filter((p) => p.id !== param.id)
                              .map((p) => p.name)}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Body Parameters Section - Webhook Tools with POST, PUT, PATCH Only */}
                  {toolType === "webhook" &&
                    ["POST", "PUT", "PATCH"].includes(webhookMethod) && (
                      <div className="border border-border rounded-xl p-5 space-y-5 bg-muted/50">
                        <div>
                          <h3 className="text-base font-medium mb-1">
                            Body parameters
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            Define parameters that will be collected by the LLM
                            and sent as the body of the request.
                          </p>
                        </div>

                        {/* Inner container for body content */}
                        <div className="border border-border rounded-xl p-4 space-y-4 bg-background">
                          {/* Body Description */}
                          <div>
                            <label className="block text-sm font-medium mb-2">
                              Description{" "}
                              <span className="text-red-500">*</span>
                            </label>
                            <textarea
                              value={bodyDescription}
                              onChange={(e) =>
                                setBodyDescription(e.target.value)
                              }
                              placeholder="Describe the body structure"
                              rows={3}
                              className={`w-full px-4 py-3 rounded-md text-base border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-none ${
                                validationAttempted && !bodyDescription.trim()
                                  ? "border-red-500"
                                  : "border-border"
                              }`}
                            />
                          </div>

                          {/* Properties - same UI as object type properties */}
                          <div>
                            <label className="block text-sm font-medium mb-2">
                              Properties
                            </label>
                            <NestedContainer onAddProperty={addBodyParameter}>
                              {/* Body Parameter Cards */}
                              {bodyParameters.length > 0 && (
                                <div className="space-y-4">
                                  {bodyParameters.map((param) => (
                                    <ParameterCard
                                      key={param.id}
                                      param={param}
                                      path={[]}
                                      onUpdate={handleBodyUpdateAtPath}
                                      onRemove={handleBodyRemoveAtPath}
                                      onAddProperty={
                                        handleBodyAddPropertyAtPath
                                      }
                                      onSetItems={handleBodySetItemsAtPath}
                                      validationAttempted={validationAttempted}
                                      siblingNames={bodyParameters
                                        .filter((p) => p.id !== param.id)
                                        .map((p) => p.name)}
                                    />
                                  ))}
                                </div>
                              )}
                            </NestedContainer>
                          </div>
                        </div>
                      </div>
                    )}
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border space-y-3">
          {createError && <p className="text-sm text-red-500">{createError}</p>}
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={handleClose}
              disabled={isCreating || isLoadingTool}
              className="h-10 px-4 rounded-md text-base font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={
                isCreating ||
                isLoadingTool ||
                (viewMode === "json" && !!jsonError)
              }
              className="h-10 px-4 rounded-md text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isCreating ? (
                <>
                  <svg
                    className="w-4 h-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  {editingToolUuid ? "Saving..." : "Creating..."}
                </>
              ) : editingToolUuid ? (
                "Save"
              ) : (
                "Add tool"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
