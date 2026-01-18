"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { AppLayout } from "@/components/AppLayout";
import { ParameterCard, Parameter } from "@/components/ParameterCard";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";

type ToolData = {
  uuid: string;
  name: string;
  description?: string;
  config: Record<string, any>;
  created_at: string;
  updated_at: string;
};

export default function ToolsPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const backendAccessToken = (session as any)?.backendAccessToken;
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Set page title
  useEffect(() => {
    document.title = "Tools | Pense";
  }, []);
  const [addToolSidebarOpen, setAddToolSidebarOpen] = useState(false);
  const [newToolName, setNewToolName] = useState("");
  const [newToolDescription, setNewToolDescription] = useState("");
  const [parameters, setParameters] = useState<Parameter[]>([]);
  const [tools, setTools] = useState<ToolData[]>([]);
  const [toolsLoading, setToolsLoading] = useState(true);
  const [toolsError, setToolsError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editingToolUuid, setEditingToolUuid] = useState<string | null>(null);
  const [isLoadingTool, setIsLoadingTool] = useState(false);
  const [validationAttempted, setValidationAttempted] = useState(false);
  const sidebarContentRef = useRef<HTMLDivElement>(null);

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [toolToDelete, setToolToDelete] = useState<ToolData | null>(null);
  const [isToolDeleting, setIsToolDeleting] = useState(false);

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

  const removeParameter = (id: string) => {
    setParameters(parameters.filter((p) => p.id !== id));
  };

  const updateParameter = (id: string, updates: Partial<Parameter>) => {
    setParameters(
      parameters.map((p) => (p.id === id ? { ...p, ...updates } : p))
    );
  };

  // Helper to update a parameter at any depth using a path of IDs
  // Special marker "__items__" is used to navigate into array items
  const updateParameterAtPath = (
    params: Parameter[],
    path: string[],
    updates: Partial<Parameter>
  ): Parameter[] => {
    if (path.length === 0) return params;
    const [currentId, ...restPath] = path;
    return params.map((p) => {
      if (p.id !== currentId) return p;
      if (restPath.length === 0) {
        return { ...p, ...updates };
      }
      // Check if we're navigating into items (for array types)
      if (restPath[0] === "__items__") {
        // Create default items if they don't exist
        const currentItems = p.items || {
          id: crypto.randomUUID(),
          dataType: "string",
          name: "",
          required: true,
          description: "",
        };
        if (restPath.length === 1) {
          // Update the items directly
          return { ...p, items: { ...currentItems, ...updates } };
        }
        // Navigate deeper into items
        const [, ...deeperPath] = restPath;
        const updatedItems = updateSingleParameterAtPath(
          currentItems,
          deeperPath,
          updates
        );
        return { ...p, items: updatedItems };
      }
      return {
        ...p,
        properties: updateParameterAtPath(
          p.properties || [],
          restPath,
          updates
        ),
      };
    });
  };

  // Helper to update within a single parameter (for items navigation)
  const updateSingleParameterAtPath = (
    param: Parameter,
    path: string[],
    updates: Partial<Parameter>
  ): Parameter => {
    if (path.length === 0) {
      return { ...param, ...updates };
    }
    const [currentSegment, ...restPath] = path;
    if (currentSegment === "__items__") {
      // Create default items if they don't exist
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
    // Navigate into properties
    return {
      ...param,
      properties: updateParameterAtPath(param.properties || [], path, updates),
    };
  };

  // Helper to add a property at any depth (handles items navigation)
  const addPropertyAtPath = (
    params: Parameter[],
    path: string[]
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
      // Handle items navigation for arrays
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

  // Helper to add a property within a single parameter (for items)
  const addPropertyToSingleParam = (
    param: Parameter,
    path: string[]
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

  // Helper to remove a property at any depth (handles items navigation)
  const removePropertyAtPath = (
    params: Parameter[],
    path: string[],
    idToRemove: string
  ): Parameter[] => {
    if (path.length === 0) {
      return params.filter((p) => p.id !== idToRemove);
    }
    const [currentId, ...restPath] = path;
    return params.map((p) => {
      if (p.id !== currentId) return p;
      // Handle items navigation
      if (restPath[0] === "__items__" && p.items) {
        return {
          ...p,
          items: removePropertyFromSingleParam(
            p.items,
            restPath.slice(1),
            idToRemove
          ),
        };
      }
      if (restPath.length === 0) {
        return {
          ...p,
          properties: (p.properties || []).filter(
            (prop) => prop.id !== idToRemove
          ),
        };
      }
      return {
        ...p,
        properties: removePropertyAtPath(
          p.properties || [],
          restPath,
          idToRemove
        ),
      };
    });
  };

  // Helper to remove a property within a single parameter (for items)
  const removePropertyFromSingleParam = (
    param: Parameter,
    path: string[],
    idToRemove: string
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
          idToRemove
        ),
      };
    }
    return {
      ...param,
      properties: removePropertyAtPath(
        param.properties || [],
        path,
        idToRemove
      ),
    };
  };

  // Handlers that use the path-based helpers
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

  // Helper to set items for an array type parameter at any path
  const setItemsAtPath = (
    params: Parameter[],
    path: string[],
    items: Parameter | undefined
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
    items: Parameter | undefined
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

  const handleSetItemsAtPath = (
    path: string[],
    items: Parameter | undefined
  ) => {
    setValidationAttempted(false);
    setParameters((prev) => setItemsAtPath(prev, path, items));
  };

  // Check for duplicate parameter names at the same level
  const hasDuplicateNames = (params: Parameter[]): boolean => {
    const names = params
      .map((p) => p.name.trim().toLowerCase())
      .filter(Boolean);
    return new Set(names).size !== names.length;
  };

  // Recursive validation helper for parameters, nested properties, and array items
  const hasInvalidParameters = (params: Parameter[]): boolean => {
    // Check for duplicate names at this level
    if (hasDuplicateNames(params)) {
      return true;
    }
    for (const p of params) {
      if (!p.name.trim() || !p.description.trim()) {
        return true;
      }
      // Object type must have at least one property
      if (p.dataType === "object") {
        if (!p.properties || p.properties.length === 0) {
          return true;
        }
        if (hasInvalidParameters(p.properties)) {
          return true;
        }
      }
      if (p.dataType === "array" && p.items) {
        if (hasInvalidSingleParameter(p.items)) {
          return true;
        }
      }
    }
    return false;
  };

  // Validation helper for a single parameter (used for array items)
  const hasInvalidSingleParameter = (param: Parameter): boolean => {
    if (!param.description.trim()) {
      return true;
    }
    // Object type must have at least one property
    if (param.dataType === "object") {
      if (!param.properties || param.properties.length === 0) {
        return true;
      }
      if (hasInvalidParameters(param.properties)) {
        return true;
      }
    }
    if (param.dataType === "array" && param.items) {
      if (hasInvalidSingleParameter(param.items)) {
        return true;
      }
    }
    return false;
  };

  // Fetch tools from backend
  useEffect(() => {
    const fetchTools = async () => {
      if (!backendAccessToken) return;

      try {
        setToolsLoading(true);
        setToolsError(null);
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) {
          throw new Error("BACKEND_URL environment variable is not set");
        }

        const response = await fetch(`${backendUrl}/tools`, {
          method: "GET",
          headers: {
            accept: "application/json",
            "ngrok-skip-browser-warning": "true",
            Authorization: `Bearer ${backendAccessToken}`,
          },
        });

        if (response.status === 401) {
          await signOut({ callbackUrl: "/login" });
          return;
        }

        if (!response.ok) {
          throw new Error("Failed to fetch tools");
        }

        const data: ToolData[] = await response.json();
        setTools(data);
      } catch (err) {
        console.error("Error fetching tools:", err);
        setToolsError(
          err instanceof Error ? err.message : "Failed to load tools"
        );
      } finally {
        setToolsLoading(false);
      }
    };

    fetchTools();
  }, [backendAccessToken]);

  // Delete tool from backend
  // Open delete confirmation dialog
  const openDeleteDialog = (tool: ToolData) => {
    setToolToDelete(tool);
    setDeleteDialogOpen(true);
  };

  // Close delete confirmation dialog
  const closeDeleteDialog = () => {
    if (!isToolDeleting) {
      setDeleteDialogOpen(false);
      setToolToDelete(null);
    }
  };

  const deleteTool = async () => {
    if (!toolToDelete) return;

    try {
      setIsToolDeleting(true);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      const response = await fetch(`${backendUrl}/tools/${toolToDelete.uuid}`, {
        method: "DELETE",
        headers: {
          accept: "application/json",
          "ngrok-skip-browser-warning": "true",
          Authorization: `Bearer ${backendAccessToken}`,
        },
      });

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to delete tool");
      }

      // Remove the tool from local state
      setTools(tools.filter((tool) => tool.uuid !== toolToDelete.uuid));
      closeDeleteDialog();
    } catch (err) {
      console.error("Error deleting tool:", err);
    } finally {
      setIsToolDeleting(false);
    }
  };

  // Helper function to convert Parameter to JSON Schema format for LLM function calling
  const parameterToJsonSchema = (param: Parameter): Record<string, any> => {
    const schema: Record<string, any> = {
      type: param.dataType,
      description: param.description,
    };

    // Handle array type - add items schema
    if (param.dataType === "array" && param.items) {
      schema.items = {
        type: param.items.dataType,
        description: param.items.description,
      };
      // If array items are objects, add their properties
      if (
        param.items.dataType === "object" &&
        param.items.properties &&
        param.items.properties.length > 0
      ) {
        schema.items.properties = {};
        const requiredProps: string[] = [];
        param.items.properties.forEach((prop) => {
          schema.items.properties[prop.name] = parameterToJsonSchema(prop);
          if (prop.required) {
            requiredProps.push(prop.name);
          }
        });
        if (requiredProps.length > 0) {
          schema.items.required = requiredProps;
        }
      }
      // If array items are arrays, recursively add their items
      if (param.items.dataType === "array" && param.items.items) {
        schema.items.items = parameterToJsonSchema({
          ...param.items.items,
          name: "",
          required: true,
        });
        delete schema.items.items.required;
      }
    }

    // Handle object type - add properties schema
    if (
      param.dataType === "object" &&
      param.properties &&
      param.properties.length > 0
    ) {
      schema.properties = {};
      const requiredProps: string[] = [];
      param.properties.forEach((prop) => {
        schema.properties[prop.name] = parameterToJsonSchema(prop);
        if (prop.required) {
          requiredProps.push(prop.name);
        }
      });
      if (requiredProps.length > 0) {
        schema.required = requiredProps;
      }
    }

    return schema;
  };

  // Helper function to build parameters config for API (returns array format)
  const buildParametersConfig = (
    params: Parameter[]
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

  // Create tool via POST API
  const createTool = async () => {
    setValidationAttempted(true);
    if (!newToolName.trim() || !newToolDescription.trim()) return;
    // Validate parameters recursively: name and description are required for all
    if (hasInvalidParameters(parameters)) return;

    try {
      setIsCreating(true);
      setCreateError(null);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      // Build parameters object for the API using JSON Schema format
      const parametersConfig = buildParametersConfig(parameters);

      const response = await fetch(`${backendUrl}/tools`, {
        method: "POST",
        headers: {
          accept: "application/json",
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
          Authorization: `Bearer ${backendAccessToken}`,
        },
        body: JSON.stringify({
          name: newToolName.trim(),
          description: newToolDescription.trim(),
          config: {
            parameters: parametersConfig,
          },
        }),
      });

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to create tool");
      }

      // Refetch the tools list to get the updated data
      const toolsResponse = await fetch(`${backendUrl}/tools`, {
        method: "GET",
        headers: {
          accept: "application/json",
          "ngrok-skip-browser-warning": "true",
          Authorization: `Bearer ${backendAccessToken}`,
        },
      });

      if (toolsResponse.ok) {
        const updatedTools: ToolData[] = await toolsResponse.json();
        setTools(updatedTools);
      }

      // Reset form fields
      setNewToolName("");
      setNewToolDescription("");
      setParameters([]);

      // Close the sidebar
      setAddToolSidebarOpen(false);
    } catch (err) {
      console.error("Error creating tool:", err);
      setCreateError(
        err instanceof Error ? err.message : "Failed to create tool"
      );
    } finally {
      setIsCreating(false);
    }
  };

  // Helper function to parse JSON Schema items into Parameter (for arrays)
  const parseItemsSchema = (itemsConfig: any): Parameter => {
    const itemParam: Parameter = {
      id: crypto.randomUUID(),
      name: "",
      dataType: itemsConfig.type || "string",
      required: true,
      description: itemsConfig.description || "",
    };

    // Parse nested properties for object items
    if (itemsConfig.type === "object" && itemsConfig.properties) {
      itemParam.properties = [];
      const requiredProps = itemsConfig.required || [];
      Object.entries(itemsConfig.properties).forEach(
        ([propName, propConfig]: [string, any]) => {
          itemParam.properties!.push(
            parseParameterSchema(
              propName,
              propConfig,
              requiredProps.includes(propName)
            )
          );
        }
      );
    }

    // Parse nested items for array items
    if (itemsConfig.type === "array" && itemsConfig.items) {
      itemParam.items = parseItemsSchema(itemsConfig.items);
    }

    return itemParam;
  };

  // Helper function to parse JSON Schema parameter into Parameter
  const parseParameterSchema = (
    paramName: string,
    paramConfig: any,
    isRequired: boolean = true
  ): Parameter => {
    const param: Parameter = {
      id: crypto.randomUUID(),
      name: paramName,
      dataType: paramConfig.type || "string",
      required: paramConfig.required ?? isRequired,
      description: paramConfig.description || "",
    };

    // Parse items for array type
    if (paramConfig.type === "array" && paramConfig.items) {
      param.items = parseItemsSchema(paramConfig.items);
    }

    // Parse properties for object type
    if (paramConfig.type === "object" && paramConfig.properties) {
      param.properties = [];
      const requiredProps = paramConfig.required || [];
      Object.entries(paramConfig.properties).forEach(
        ([propName, propConfig]: [string, any]) => {
          param.properties!.push(
            parseParameterSchema(
              propName,
              propConfig,
              requiredProps.includes(propName)
            )
          );
        }
      );
    }

    return param;
  };

  // Fetch tool details by UUID and open edit sidebar
  const openEditTool = async (uuid: string) => {
    try {
      setIsLoadingTool(true);
      setEditingToolUuid(uuid);
      setAddToolSidebarOpen(true);
      setCreateError(null);

      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      const response = await fetch(`${backendUrl}/tools/${uuid}`, {
        method: "GET",
        headers: {
          accept: "application/json",
          "ngrok-skip-browser-warning": "true",
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

      // Populate form fields with tool data
      setNewToolName(toolData.name || "");
      setNewToolDescription(
        toolData.description || toolData.config?.description || ""
      );

      // Convert parameters from config to Parameter array using JSON Schema parser
      const toolParams: Parameter[] = [];
      if (toolData.config?.parameters) {
        // Handle both array format (new) and object format (legacy)
        if (Array.isArray(toolData.config.parameters)) {
          toolData.config.parameters.forEach((paramConfig: any) => {
            const paramName = paramConfig.id || paramConfig.name || "";
            toolParams.push(parseParameterSchema(paramName, paramConfig));
          });
        } else {
          // Legacy object format
          Object.entries(toolData.config.parameters).forEach(
            ([paramName, paramConfig]: [string, any]) => {
              toolParams.push(parseParameterSchema(paramName, paramConfig));
            }
          );
        }
      }
      setParameters(toolParams);
    } catch (err) {
      console.error("Error fetching tool:", err);
      setCreateError(
        err instanceof Error ? err.message : "Failed to load tool"
      );
    } finally {
      setIsLoadingTool(false);
    }
  };

  // Update existing tool via PUT API
  const updateTool = async () => {
    setValidationAttempted(true);
    if (!newToolName.trim() || !newToolDescription.trim() || !editingToolUuid)
      return;
    // Validate parameters recursively: name and description are required for all
    if (hasInvalidParameters(parameters)) return;

    try {
      setIsCreating(true);
      setCreateError(null);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      // Build parameters object for the API using JSON Schema format
      const parametersConfig = buildParametersConfig(parameters);

      const response = await fetch(`${backendUrl}/tools/${editingToolUuid}`, {
        method: "PUT",
        headers: {
          accept: "application/json",
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
          Authorization: `Bearer ${backendAccessToken}`,
        },
        body: JSON.stringify({
          name: newToolName.trim(),
          description: newToolDescription.trim(),
          config: {
            parameters: parametersConfig,
          },
        }),
      });

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to update tool");
      }

      // Refetch the tools list to get the updated data
      const toolsResponse = await fetch(`${backendUrl}/tools`, {
        method: "GET",
        headers: {
          accept: "application/json",
          "ngrok-skip-browser-warning": "true",
          Authorization: `Bearer ${backendAccessToken}`,
        },
      });

      if (toolsResponse.ok) {
        const updatedTools: ToolData[] = await toolsResponse.json();
        setTools(updatedTools);
      }

      // Reset and close
      resetForm();
      setAddToolSidebarOpen(false);
    } catch (err) {
      console.error("Error updating tool:", err);
      setCreateError(
        err instanceof Error ? err.message : "Failed to update tool"
      );
    } finally {
      setIsCreating(false);
    }
  };

  // Reset form fields
  const resetForm = () => {
    setNewToolName("");
    setNewToolDescription("");
    setParameters([]);
    setEditingToolUuid(null);
    setCreateError(null);
    setValidationAttempted(false);
  };

  // Filter tools based on search query
  const filteredTools = tools.filter(
    (tool) =>
      (tool.name &&
        tool.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      ((tool.description || tool.config?.description) &&
        (tool.description || tool.config?.description)
          .toLowerCase()
          .includes(searchQuery.toLowerCase()))
  );

  return (
    <AppLayout
      activeItem="tools"
      onItemChange={(itemId) => router.push(`/${itemId}`)}
      sidebarOpen={sidebarOpen}
      onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Tools</h1>
            <p className="text-muted-foreground text-base leading-relaxed mt-1">
              Manage and configure tools that can be used by your agents.
            </p>
          </div>
          <button
            onClick={() => {
              resetForm();
              setAddToolSidebarOpen(true);
            }}
            className="h-10 px-4 rounded-md text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer"
          >
            Add tool
          </button>
        </div>

        {/* Search Input */}
        <div className="relative max-w-md">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <svg
              className="w-5 h-5 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
              />
            </svg>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tools"
            className="w-full h-10 pl-10 pr-4 rounded-md text-base border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          />
        </div>

        {/* Tools List / Loading / Error / Empty State */}
        {toolsLoading ? (
          <div className="flex items-center justify-center gap-3 py-8">
            <svg
              className="w-5 h-5 animate-spin"
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
        ) : toolsError ? (
          <div className="border border-border rounded-xl p-12 flex flex-col items-center justify-center bg-muted/20">
            <p className="text-base text-red-500 mb-2">{toolsError}</p>
            <button
              onClick={() => window.location.reload()}
              className="text-base text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : filteredTools.length === 0 ? (
          <div className="border border-border rounded-xl p-12 flex flex-col items-center justify-center bg-muted/20">
            <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center mb-4">
              <svg
                className="w-7 h-7 text-muted-foreground"
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
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">
              No tools found
            </h3>
            <p className="text-base text-muted-foreground mb-4">
              {searchQuery
                ? "No tools match your search"
                : "You haven't created any tools yet"}
            </p>
            <button
              onClick={() => {
                resetForm();
                setAddToolSidebarOpen(true);
              }}
              className="h-10 px-4 rounded-md text-base font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
            >
              Add tool
            </button>
          </div>
        ) : (
          <div className="border border-border rounded-xl overflow-hidden">
            {/* Table Header */}
            <div className="grid grid-cols-[200px_1fr_auto] gap-4 px-4 py-2 border-b border-border bg-muted/30">
              <div className="text-sm font-medium text-muted-foreground">
                Name
              </div>
              <div className="text-sm font-medium text-muted-foreground">
                Description
              </div>
              <div className="w-8"></div>
            </div>
            {/* Table Rows */}
            {filteredTools.map((tool) => (
              <div
                key={tool.uuid}
                onClick={() => openEditTool(tool.uuid)}
                className="grid grid-cols-[200px_1fr_auto] gap-4 px-4 py-2 border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors cursor-pointer items-center"
              >
                <div className="overflow-x-auto max-w-full">
                  <p className="text-sm font-medium text-foreground whitespace-nowrap">
                    {tool.name}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-1">
                  {tool.description || tool.config?.description || "—"}
                </p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openDeleteDialog(tool);
                  }}
                  className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Tool Sidebar */}
      {addToolSidebarOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => {
              resetForm();
              setAddToolSidebarOpen(false);
            }}
          />
          {/* Sidebar */}
          <div className="relative w-[40%] min-w-[500px] bg-background border-l border-border flex flex-col h-full shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
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
                  {editingToolUuid ? "Edit tool" : "Add tool"}
                </h2>
              </div>
              <button
                onClick={() => {
                  resetForm();
                  setAddToolSidebarOpen(false);
                }}
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
                  {/* Configuration Section */}
                  <div className="border border-border rounded-xl p-5 space-y-5 bg-muted/30">
                    <div>
                      <h3 className="text-base font-medium mb-1">
                        Configuration
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Describe to the LLM how and when to use the tool
                      </p>
                    </div>

                    {/* Name */}
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={newToolName}
                        onChange={(e) => setNewToolName(e.target.value)}
                        className={`w-full h-10 px-4 rounded-md text-base border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent ${
                          validationAttempted && !newToolName.trim()
                            ? "border-red-500"
                            : "border-border"
                        }`}
                      />
                    </div>

                    {/* Description */}
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Description <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        value={newToolDescription}
                        onChange={(e) => setNewToolDescription(e.target.value)}
                        rows={3}
                        className={`w-full px-4 py-3 rounded-md text-base border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-none ${
                          validationAttempted && !newToolDescription.trim()
                            ? "border-red-500"
                            : "border-border"
                        }`}
                      />
                    </div>
                  </div>

                  {/* Parameters Section */}
                  <div className="border border-border rounded-xl p-5 space-y-5 bg-muted/30">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-base font-medium mb-1">
                          Parameters
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          Define the parameters that will be sent with the event
                        </p>
                      </div>
                      <button
                        onClick={addParameter}
                        className="h-9 px-4 rounded-md text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
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
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-border space-y-3">
              {createError && (
                <p className="text-sm text-red-500">{createError}</p>
              )}
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => {
                    resetForm();
                    setAddToolSidebarOpen(false);
                  }}
                  disabled={isCreating || isLoadingTool}
                  className="h-10 px-4 rounded-md text-base font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={editingToolUuid ? updateTool : createTool}
                  disabled={isCreating || isLoadingTool}
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
      )}

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        isOpen={deleteDialogOpen}
        onClose={closeDeleteDialog}
        onConfirm={deleteTool}
        title="Delete tool"
        message={`Are you sure you want to delete "${toolToDelete?.name}"?`}
        confirmText="Delete"
        isDeleting={isToolDeleting}
      />
    </AppLayout>
  );
}
