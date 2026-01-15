"use client";

import React, { useState, useRef } from "react";
import {
  DataFieldPropertyCard,
  DataFieldProperty,
} from "@/components/DataFieldPropertyCard";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";

type DataExtractionFieldData = {
  uuid: string;
  type: string;
  name: string;
  description: string;
  required: boolean;
  agent_id: string;
  created_at: string;
  updated_at: string;
};

type DataExtractionTabContentProps = {
  agentUuid: string;
  dataExtractionFields: DataExtractionFieldData[];
  setDataExtractionFields: React.Dispatch<
    React.SetStateAction<DataExtractionFieldData[]>
  >;
  dataExtractionFieldsLoading: boolean;
  dataExtractionFieldsError: string | null;
  saveRef: React.MutableRefObject<() => void>;
};

export type { DataExtractionFieldData };

export function DataExtractionTabContent({
  agentUuid,
  dataExtractionFields,
  setDataExtractionFields,
  dataExtractionFieldsLoading,
  dataExtractionFieldsError,
  saveRef,
}: DataExtractionTabContentProps) {
  // Data extraction sidebar state
  const [addDataFieldSidebarOpen, setAddDataFieldSidebarOpen] = useState(false);
  const [editingFieldUuid, setEditingFieldUuid] = useState<string | null>(null);
  const [dataFieldDataType, setDataFieldDataType] = useState("string");
  const [dataFieldIdentifier, setDataFieldIdentifier] = useState("");
  const [dataFieldDescription, setDataFieldDescription] = useState("");
  const [dataFieldRequired, setDataFieldRequired] = useState(true);
  const [isCreatingDataField, setIsCreatingDataField] = useState(false);
  const [createDataFieldError, setCreateDataFieldError] = useState<
    string | null
  >(null);
  const [dataFieldValidationAttempted, setDataFieldValidationAttempted] =
    useState(false);

  // Bulk selection state
  const [selectedFieldUuids, setSelectedFieldUuids] = useState<Set<string>>(
    new Set()
  );

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fieldToDelete, setFieldToDelete] =
    useState<DataExtractionFieldData | null>(null);
  const [fieldsToDeleteBulk, setFieldsToDeleteBulk] = useState<string[]>([]);

  // Toggle field selection
  const toggleFieldSelection = (uuid: string) => {
    setSelectedFieldUuids((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(uuid)) {
        newSet.delete(uuid);
      } else {
        newSet.add(uuid);
      }
      return newSet;
    });
  };

  // Toggle select all
  const toggleSelectAll = () => {
    if (selectedFieldUuids.size === dataExtractionFields.length) {
      setSelectedFieldUuids(new Set());
    } else {
      setSelectedFieldUuids(new Set(dataExtractionFields.map((f) => f.uuid)));
    }
  };

  // Open delete confirmation dialog for single field
  const openDeleteDialog = (field: DataExtractionFieldData) => {
    setFieldToDelete(field);
    setFieldsToDeleteBulk([]);
    setDeleteDialogOpen(true);
  };

  // Open bulk delete confirmation dialog
  const openBulkDeleteDialog = () => {
    if (selectedFieldUuids.size === 0) return;
    setFieldToDelete(null);
    setFieldsToDeleteBulk(Array.from(selectedFieldUuids));
    setDeleteDialogOpen(true);
  };

  // Close delete confirmation dialog
  const closeDeleteDialog = () => {
    setDeleteDialogOpen(false);
    setFieldToDelete(null);
    setFieldsToDeleteBulk([]);
  };

  // Handle delete field (single or bulk)
  const handleDeleteField = () => {
    if (fieldsToDeleteBulk.length > 0) {
      // Bulk delete
      setDataExtractionFields((prev) =>
        prev.filter((f) => !fieldsToDeleteBulk.includes(f.uuid))
      );
      setSelectedFieldUuids(new Set());
    } else if (fieldToDelete) {
      // Single delete
      setDataExtractionFields((prev) =>
        prev.filter((f) => f.uuid !== fieldToDelete.uuid)
      );
    } else {
      return;
    }
    // Trigger save to persist the change
    setTimeout(() => saveRef.current(), 0);
    closeDeleteDialog();
  };

  // State for data field properties
  const [dataFieldProperties, setDataFieldProperties] = useState<
    DataFieldProperty[]
  >([]);
  const [dataFieldItems, setDataFieldItems] = useState<
    DataFieldProperty | undefined
  >(undefined);
  const dataFieldSidebarContentRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when adding properties
  const scrollDataFieldSidebarToBottom = () => {
    if (dataFieldSidebarContentRef.current) {
      setTimeout(() => {
        dataFieldSidebarContentRef.current?.scrollTo({
          top: dataFieldSidebarContentRef.current.scrollHeight,
          behavior: "smooth",
        });
      }, 50);
    }
  };

  // Reset data field form
  const resetDataFieldForm = () => {
    setEditingFieldUuid(null);
    setDataFieldDataType("string");
    setDataFieldIdentifier("");
    setDataFieldDescription("");
    setDataFieldRequired(true);
    setDataFieldProperties([]);
    setDataFieldItems(undefined);
    setCreateDataFieldError(null);
    setDataFieldValidationAttempted(false);
  };

  // Open a field for editing
  const openEditField = (field: DataExtractionFieldData) => {
    setEditingFieldUuid(field.uuid);
    setDataFieldDataType(field.type);
    setDataFieldIdentifier(field.name);
    setDataFieldDescription(field.description);
    setDataFieldRequired(field.required);
    // TODO: If we store properties/items in the field, we'd need to load them here
    setDataFieldProperties([]);
    setDataFieldItems(
      field.type === "array"
        ? {
            id: crypto.randomUUID(),
            dataType: "string",
            name: "",
            description: "",
          }
        : undefined
    );
    setCreateDataFieldError(null);
    setDataFieldValidationAttempted(false);
    setAddDataFieldSidebarOpen(true);
  };

  // Helper function to convert DataFieldProperty to JSON Schema format
  const dataFieldPropertyToJsonSchema = (
    prop: DataFieldProperty
  ): Record<string, any> => {
    const schema: Record<string, any> = {
      type: prop.dataType,
      description: prop.description,
    };

    // Handle array type - add items schema
    if (prop.dataType === "array" && prop.items) {
      schema.items = {
        type: prop.items.dataType,
        description: prop.items.description,
      };
      // If array items are objects, add their properties
      if (
        prop.items.dataType === "object" &&
        prop.items.properties &&
        prop.items.properties.length > 0
      ) {
        schema.items.properties = {};
        prop.items.properties.forEach((p) => {
          schema.items.properties[p.name] = dataFieldPropertyToJsonSchema(p);
        });
      }
      // If array items are arrays, recursively add their items
      if (prop.items.dataType === "array" && prop.items.items) {
        schema.items.items = dataFieldPropertyToJsonSchema(prop.items.items);
      }
    }

    // Handle object type - add properties schema
    if (
      prop.dataType === "object" &&
      prop.properties &&
      prop.properties.length > 0
    ) {
      schema.properties = {};
      prop.properties.forEach((p) => {
        schema.properties[p.name] = dataFieldPropertyToJsonSchema(p);
      });
    }

    return schema;
  };

  // Recursive validation helper for data field properties
  const hasInvalidDataFieldProperties = (
    props: DataFieldProperty[]
  ): boolean => {
    for (const p of props) {
      if (!p.name.trim() || !p.description.trim()) {
        return true;
      }
      // Object type must have at least one property
      if (p.dataType === "object") {
        if (!p.properties || p.properties.length === 0) {
          return true;
        }
        if (hasInvalidDataFieldProperties(p.properties)) {
          return true;
        }
      }
      if (p.dataType === "array" && p.items) {
        if (hasInvalidSingleDataFieldProperty(p.items)) {
          return true;
        }
      }
    }
    return false;
  };

  // Validation helper for a single property (used for array items)
  const hasInvalidSingleDataFieldProperty = (
    prop: DataFieldProperty
  ): boolean => {
    if (!prop.description.trim()) {
      return true;
    }
    // Object type must have at least one property
    if (prop.dataType === "object") {
      if (!prop.properties || prop.properties.length === 0) {
        return true;
      }
      if (hasInvalidDataFieldProperties(prop.properties)) {
        return true;
      }
    }
    if (prop.dataType === "array" && prop.items) {
      if (hasInvalidSingleDataFieldProperty(prop.items)) {
        return true;
      }
    }
    return false;
  };

  // Check if the name already exists (excluding current field being edited)
  const isNameDuplicate = (name: string): boolean => {
    const trimmedName = name.trim().toLowerCase();
    return dataExtractionFields.some(
      (field) =>
        field.name.toLowerCase() === trimmedName &&
        field.uuid !== editingFieldUuid
    );
  };

  // Check if the entire data field form is valid
  const isDataFieldFormValid = (): boolean => {
    if (!dataFieldIdentifier.trim() || !dataFieldDescription.trim()) {
      return false;
    }
    // Check for duplicate name
    if (isNameDuplicate(dataFieldIdentifier)) {
      return false;
    }
    // Object type must have at least one property
    if (dataFieldDataType === "object") {
      if (dataFieldProperties.length === 0) {
        return false;
      }
      if (hasInvalidDataFieldProperties(dataFieldProperties)) {
        return false;
      }
    }
    if (dataFieldDataType === "array" && dataFieldItems) {
      if (hasInvalidSingleDataFieldProperty(dataFieldItems)) {
        return false;
      }
    }
    return true;
  };

  // Helper functions for data field properties (recursive)
  const addDataFieldProperty = () => {
    setDataFieldValidationAttempted(false);
    setDataFieldProperties((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        dataType: "string",
        name: "",
        description: "",
      },
    ]);
    scrollDataFieldSidebarToBottom();
  };

  const updateDataFieldProperty = (
    id: string,
    updates: Partial<DataFieldProperty>
  ) => {
    setDataFieldProperties((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
    );
  };

  const removeDataFieldProperty = (id: string) => {
    setDataFieldProperties((prev) => prev.filter((p) => p.id !== id));
  };

  // Recursive property update at any depth
  const updatePropertyAtPath = (
    props: DataFieldProperty[],
    path: string[],
    updates: Partial<DataFieldProperty>
  ): DataFieldProperty[] => {
    if (path.length === 0) return props;
    const [currentId, ...restPath] = path;
    return props.map((p) => {
      if (p.id !== currentId) return p;
      if (restPath.length === 0) {
        return { ...p, ...updates };
      }
      if (restPath[0] === "__items__") {
        const currentItems = p.items || {
          id: crypto.randomUUID(),
          dataType: "string",
          name: "",
          description: "",
        };
        if (restPath.length === 1) {
          return { ...p, items: { ...currentItems, ...updates } };
        }
        return {
          ...p,
          items: updateSinglePropertyAtPath(
            currentItems,
            restPath.slice(1),
            updates
          ),
        };
      }
      return {
        ...p,
        properties: updatePropertyAtPath(p.properties || [], restPath, updates),
      };
    });
  };

  const updateSinglePropertyAtPath = (
    prop: DataFieldProperty,
    path: string[],
    updates: Partial<DataFieldProperty>
  ): DataFieldProperty => {
    if (path.length === 0) {
      return { ...prop, ...updates };
    }
    const [currentSegment, ...restPath] = path;
    if (currentSegment === "__items__") {
      const currentItems = prop.items || {
        id: crypto.randomUUID(),
        dataType: "string",
        name: "",
        description: "",
      };
      if (restPath.length === 0) {
        return { ...prop, items: { ...currentItems, ...updates } };
      }
      return {
        ...prop,
        items: updateSinglePropertyAtPath(currentItems, restPath, updates),
      };
    }
    return {
      ...prop,
      properties: updatePropertyAtPath(prop.properties || [], path, updates),
    };
  };

  const addPropertyAtPath = (
    props: DataFieldProperty[],
    path: string[]
  ): DataFieldProperty[] => {
    if (path.length === 0) return props;
    const [currentId, ...restPath] = path;
    return props.map((p) => {
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
              description: "",
            },
          ],
        };
      }
      if (restPath[0] === "__items__" && p.items) {
        return {
          ...p,
          items: addPropertyToSingleProp(p.items, restPath.slice(1)),
        };
      }
      return {
        ...p,
        properties: addPropertyAtPath(p.properties || [], restPath),
      };
    });
  };

  const addPropertyToSingleProp = (
    prop: DataFieldProperty,
    path: string[]
  ): DataFieldProperty => {
    if (path.length === 0) {
      return {
        ...prop,
        properties: [
          ...(prop.properties || []),
          {
            id: crypto.randomUUID(),
            dataType: "string",
            name: "",
            description: "",
          },
        ],
      };
    }
    if (path[0] === "__items__" && prop.items) {
      return {
        ...prop,
        items: addPropertyToSingleProp(prop.items, path.slice(1)),
      };
    }
    return {
      ...prop,
      properties: addPropertyAtPath(prop.properties || [], path),
    };
  };

  const removePropertyAtPath = (
    props: DataFieldProperty[],
    path: string[],
    idToRemove: string
  ): DataFieldProperty[] => {
    if (path.length === 0) {
      return props.filter((p) => p.id !== idToRemove);
    }
    const [currentId, ...restPath] = path;
    return props.map((p) => {
      if (p.id !== currentId) return p;
      if (restPath[0] === "__items__" && p.items) {
        return {
          ...p,
          items: removePropertyFromSingleProp(
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

  const removePropertyFromSingleProp = (
    prop: DataFieldProperty,
    path: string[],
    idToRemove: string
  ): DataFieldProperty => {
    if (path.length === 0) {
      return {
        ...prop,
        properties: (prop.properties || []).filter((p) => p.id !== idToRemove),
      };
    }
    if (path[0] === "__items__" && prop.items) {
      return {
        ...prop,
        items: removePropertyFromSingleProp(
          prop.items,
          path.slice(1),
          idToRemove
        ),
      };
    }
    return {
      ...prop,
      properties: removePropertyAtPath(prop.properties || [], path, idToRemove),
    };
  };

  // Handlers for nested properties
  const handleUpdatePropertyAtPath = (
    path: string[],
    updates: Partial<DataFieldProperty>
  ) => {
    setDataFieldProperties((prev) => updatePropertyAtPath(prev, path, updates));
  };

  const handleAddPropertyAtPath = (path: string[]) => {
    setDataFieldProperties((prev) => addPropertyAtPath(prev, path));
    scrollDataFieldSidebarToBottom();
  };

  const handleRemovePropertyAtPath = (parentPath: string[], id: string) => {
    setDataFieldProperties((prev) =>
      removePropertyAtPath(prev, parentPath, id)
    );
  };

  // Items handlers for top-level array
  const updateDataFieldItemsAtPath = (
    path: string[],
    updates: Partial<DataFieldProperty>
  ) => {
    if (!dataFieldItems) return;
    if (path.length === 0) {
      setDataFieldItems((prev) => (prev ? { ...prev, ...updates } : prev));
      return;
    }
    setDataFieldItems((prev) =>
      prev ? updateSinglePropertyAtPath(prev, path, updates) : prev
    );
  };

  const addPropertyToItems = (path: string[]) => {
    if (!dataFieldItems) return;
    if (path.length === 0) {
      setDataFieldItems((prev) =>
        prev
          ? {
              ...prev,
              properties: [
                ...(prev.properties || []),
                {
                  id: crypto.randomUUID(),
                  dataType: "string",
                  name: "",
                  description: "",
                },
              ],
            }
          : prev
      );
      scrollDataFieldSidebarToBottom();
      return;
    }
    setDataFieldItems((prev) =>
      prev ? addPropertyToSingleProp(prev, path) : prev
    );
    scrollDataFieldSidebarToBottom();
  };

  return (
    <>
      <div className="space-y-6">
        {/* Header with Add button and Bulk Delete */}
        {dataExtractionFields.length > 0 && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  resetDataFieldForm();
                  setAddDataFieldSidebarOpen(true);
                }}
                className="h-10 px-4 rounded-md text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer"
              >
                Add field
              </button>
              {selectedFieldUuids.size > 0 && (
                <button
                  onClick={openBulkDeleteDialog}
                  className="h-10 px-4 rounded-md text-base font-medium border border-red-500 text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                >
                  Delete selected ({selectedFieldUuids.size})
                </button>
              )}
            </div>
          </div>
        )}

        {/* Loading State */}
        {dataExtractionFieldsLoading ? (
          <div className="border border-border rounded-xl p-12 flex flex-col items-center justify-center bg-muted/20">
            <div className="flex items-center gap-3">
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
          </div>
        ) : dataExtractionFieldsError ? (
          /* Error State */
          <div className="border border-border rounded-xl p-12 flex flex-col items-center justify-center bg-muted/20">
            <p className="text-base text-red-500 mb-2">
              {dataExtractionFieldsError}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="text-base text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : dataExtractionFields.length === 0 ? (
          /* Empty State */
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
                  d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 0v1.5c0 .621-.504 1.125-1.125 1.125M12 18.375h-7.5"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">
              No extraction fields defined
            </h3>
            <p className="text-base text-muted-foreground mb-4 text-center max-w-2xl">
              Define custom data specifications to extract from conversation
              transcripts
            </p>
            <button
              onClick={() => {
                resetDataFieldForm();
                setAddDataFieldSidebarOpen(true);
              }}
              className="h-10 px-4 rounded-md text-base font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
            >
              Add field
            </button>
          </div>
        ) : (
          /* Fields List */
          <div className="border border-border rounded-xl overflow-hidden">
            {/* Table Header */}
            <div className="grid grid-cols-[40px_80px_1fr_2fr_70px_auto] gap-4 px-4 py-2 border-b border-border bg-muted/30">
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors cursor-pointer ${
                    selectedFieldUuids.size === dataExtractionFields.length &&
                    dataExtractionFields.length > 0
                      ? "bg-foreground border-foreground"
                      : "border-border hover:border-muted-foreground"
                  }`}
                  title="Select all"
                >
                  {selectedFieldUuids.size === dataExtractionFields.length &&
                    dataExtractionFields.length > 0 && (
                      <svg
                        className="w-3 h-3 text-background"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M4.5 12.75l6 6 9-13.5"
                        />
                      </svg>
                    )}
                </button>
              </div>
              <div className="text-sm font-medium text-muted-foreground">
                Type
              </div>
              <div className="text-sm font-medium text-muted-foreground">
                Name
              </div>
              <div className="text-sm font-medium text-muted-foreground">
                Description
              </div>
              <div className="text-sm font-medium text-muted-foreground">
                Required
              </div>
              <div className="w-8"></div>
            </div>
            {/* Table Body */}
            {dataExtractionFields.map((field) => (
              <div
                key={field.uuid}
                onClick={() => openEditField(field)}
                className="grid grid-cols-[40px_80px_1fr_2fr_70px_auto] gap-4 px-4 py-2 border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors cursor-pointer"
              >
                {/* Checkbox Column */}
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFieldSelection(field.uuid);
                    }}
                    className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors cursor-pointer ${
                      selectedFieldUuids.has(field.uuid)
                        ? "bg-foreground border-foreground"
                        : "border-border hover:border-muted-foreground"
                    }`}
                    title="Select field"
                  >
                    {selectedFieldUuids.has(field.uuid) && (
                      <svg
                        className="w-3 h-3 text-background"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M4.5 12.75l6 6 9-13.5"
                        />
                      </svg>
                    )}
                  </button>
                </div>
                {/* Type Column */}
                <div className="flex items-center">
                  <span className="text-sm text-muted-foreground capitalize">
                    {field.type}
                  </span>
                </div>
                {/* Name Column */}
                <div className="flex items-center">
                  <div className="text-sm font-medium text-foreground">
                    {field.name}
                  </div>
                </div>
                {/* Description Column */}
                <div className="flex items-center">
                  <p className="text-sm text-muted-foreground line-clamp-1">
                    {field.description || "—"}
                  </p>
                </div>
                {/* Required Column */}
                <div className="flex items-center">
                  <span className="text-sm text-muted-foreground">
                    {field.required ? "Yes" : "No"}
                  </span>
                </div>
                {/* Delete Button */}
                <div className="flex items-center">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openDeleteDialog(field);
                    }}
                    className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                    title="Delete field"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Data Field Sidebar */}
      {addDataFieldSidebarOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => {
              resetDataFieldForm();
              setAddDataFieldSidebarOpen(false);
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
                    d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 0v1.5c0 .621-.504 1.125-1.125 1.125M12 18.375h-7.5"
                  />
                </svg>
                <h2 className="text-lg font-semibold">
                  {editingFieldUuid ? "Edit data field" : "Add data field"}
                </h2>
              </div>
              <button
                onClick={() => {
                  resetDataFieldForm();
                  setAddDataFieldSidebarOpen(false);
                }}
                className="flex items-center justify-center w-8 h-8 rounded-full border border-border hover:bg-muted transition-colors cursor-pointer"
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
              ref={dataFieldSidebarContentRef}
              className="flex-1 overflow-y-auto p-6 flex flex-col gap-6"
            >
              {/* Data type and Identifier */}
              <div className="flex gap-4">
                <div className="w-40">
                  <label className="block text-sm font-medium mb-2">
                    Data type
                  </label>
                  <div className="relative">
                    <select
                      value={dataFieldDataType}
                      onChange={(e) => {
                        const newType = e.target.value;
                        setDataFieldDataType(newType);
                        // Reset properties/items when type changes
                        if (newType !== "object") {
                          setDataFieldProperties([]);
                        }
                        if (newType !== "array") {
                          setDataFieldItems(undefined);
                        }
                        // Initialize items for array
                        if (newType === "array" && !dataFieldItems) {
                          setDataFieldItems({
                            id: crypto.randomUUID(),
                            dataType: "string",
                            name: "",
                            description: "",
                          });
                        }
                      }}
                      className="w-full h-10 pl-4 pr-10 rounded-md text-base border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent cursor-pointer appearance-none"
                    >
                      <option value="boolean">Boolean</option>
                      <option value="integer">Integer</option>
                      <option value="number">Number</option>
                      <option value="string">String</option>
                      <option value="object">Object</option>
                      <option value="array">Array</option>
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                      <svg
                        className="w-4 h-4 text-muted-foreground"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                        />
                      </svg>
                    </div>
                  </div>
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-2">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={dataFieldIdentifier}
                    onChange={(e) => setDataFieldIdentifier(e.target.value)}
                    className={`w-full h-10 px-4 rounded-md text-base border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent ${
                      dataFieldValidationAttempted &&
                      (!dataFieldIdentifier.trim() ||
                        isNameDuplicate(dataFieldIdentifier))
                        ? "border-red-500"
                        : "border-border"
                    }`}
                  />
                  {dataFieldValidationAttempted &&
                    isNameDuplicate(dataFieldIdentifier) && (
                      <p className="text-sm text-red-500 mt-1">
                        A field with this name already exists
                      </p>
                    )}
                </div>
              </div>

              {/* Required checkbox */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setDataFieldRequired(!dataFieldRequired)}
                  className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors cursor-pointer ${
                    dataFieldRequired
                      ? "bg-foreground border-foreground"
                      : "border-border hover:border-muted-foreground"
                  }`}
                >
                  {dataFieldRequired && (
                    <svg
                      className="w-3 h-3 text-background"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4.5 12.75l6 6 9-13.5"
                      />
                    </svg>
                  )}
                </button>
                <span className="text-sm font-medium">Required</span>
              </div>

              {/* Description */}
              <div
                className={`flex flex-col min-h-0 ${
                  dataFieldDataType !== "object" &&
                  dataFieldDataType !== "array"
                    ? "flex-1"
                    : ""
                }`}
              >
                <label className="block text-sm font-medium mb-2">
                  Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={dataFieldDescription}
                  onChange={(e) => setDataFieldDescription(e.target.value)}
                  className={`w-full px-4 py-3 rounded-md text-base border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-none ${
                    dataFieldDataType !== "object" &&
                    dataFieldDataType !== "array"
                      ? "flex-1"
                      : "min-h-[120px]"
                  } ${
                    dataFieldValidationAttempted && !dataFieldDescription.trim()
                      ? "border-red-500"
                      : "border-border"
                  }`}
                  placeholder="This field will be passed to the LLM and should describe in detail how to extract the data from the transcript"
                />
              </div>

              {/* Properties section for object type */}
              {dataFieldDataType === "object" && (
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Properties <span className="text-red-500">*</span>
                  </label>
                  <div className="border border-border rounded-xl bg-[#1b1b1b] p-4 space-y-4">
                    {dataFieldProperties.map((prop) => (
                      <DataFieldPropertyCard
                        key={prop.id}
                        property={prop}
                        path={[]}
                        onUpdate={(path, updates) => {
                          if (path.length === 0) {
                            updateDataFieldProperty(prop.id, updates);
                          } else {
                            handleUpdatePropertyAtPath(
                              [prop.id, ...path],
                              updates
                            );
                          }
                        }}
                        onRemove={(parentPath, id) => {
                          if (parentPath.length === 0) {
                            removeDataFieldProperty(id);
                          } else {
                            handleRemovePropertyAtPath(
                              [prop.id, ...parentPath],
                              id
                            );
                          }
                        }}
                        onAddProperty={(path) => {
                          if (path.length === 0) {
                            updateDataFieldProperty(prop.id, {
                              properties: [
                                ...(prop.properties || []),
                                {
                                  id: crypto.randomUUID(),
                                  dataType: "string",
                                  name: "",
                                  description: "",
                                },
                              ],
                            });
                          } else {
                            handleAddPropertyAtPath([prop.id, ...path]);
                          }
                        }}
                        onSetItems={(path, items) => {
                          if (path.length === 0) {
                            updateDataFieldProperty(prop.id, { items });
                          } else {
                            handleUpdatePropertyAtPath([prop.id, ...path], {
                              items,
                            });
                          }
                        }}
                        validationAttempted={dataFieldValidationAttempted}
                      />
                    ))}
                    <div className="flex justify-center">
                      <button
                        type="button"
                        onClick={addDataFieldProperty}
                        className={`h-10 px-6 rounded-md text-sm font-medium border bg-background hover:bg-muted/50 transition-colors cursor-pointer ${
                          dataFieldValidationAttempted &&
                          dataFieldProperties.length === 0
                            ? "border-red-500"
                            : "border-border"
                        }`}
                      >
                        Add property
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Item section for array type */}
              {dataFieldDataType === "array" && (
                <div>
                  <label className="block text-sm font-medium mb-2">Item</label>
                  <div className="border border-border rounded-xl bg-[#1b1b1b] p-4 space-y-4">
                    <DataFieldPropertyCard
                      property={
                        dataFieldItems || {
                          id: crypto.randomUUID(),
                          dataType: "string",
                          name: "",
                          description: "",
                        }
                      }
                      path={[]}
                      onUpdate={(path, updates) => {
                        updateDataFieldItemsAtPath(path, updates);
                      }}
                      onRemove={() => {}}
                      onAddProperty={(path) => {
                        addPropertyToItems(path);
                      }}
                      onSetItems={(path, items) => {
                        if (path.length === 0) {
                          setDataFieldItems((prev) =>
                            prev ? { ...prev, items } : prev
                          );
                        } else {
                          updateDataFieldItemsAtPath(path, { items });
                        }
                      }}
                      validationAttempted={dataFieldValidationAttempted}
                      isArrayItem={true}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-border space-y-3">
              {createDataFieldError && (
                <p className="text-sm text-red-500">{createDataFieldError}</p>
              )}
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => {
                    resetDataFieldForm();
                    setAddDataFieldSidebarOpen(false);
                  }}
                  disabled={isCreatingDataField}
                  className="h-10 px-4 rounded-md text-base font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setDataFieldValidationAttempted(true);
                    if (!isDataFieldFormValid()) return;

                    if (editingFieldUuid) {
                      // Update existing field
                      setDataExtractionFields((prev) =>
                        prev.map((f) =>
                          f.uuid === editingFieldUuid
                            ? {
                                ...f,
                                type: dataFieldDataType,
                                name: dataFieldIdentifier.trim(),
                                description: dataFieldDescription.trim(),
                                required: dataFieldRequired,
                                updated_at: new Date().toISOString(),
                              }
                            : f
                        )
                      );
                    } else {
                      // Construct the field object using form data
                      const newField: DataExtractionFieldData = {
                        uuid: crypto.randomUUID(),
                        type: dataFieldDataType,
                        name: dataFieldIdentifier.trim(),
                        description: dataFieldDescription.trim(),
                        required: dataFieldRequired,
                        agent_id: agentUuid,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                      };

                      // Add the new field to the list
                      setDataExtractionFields((prev) => [...prev, newField]);
                    }

                    // Reset and close
                    resetDataFieldForm();
                    setAddDataFieldSidebarOpen(false);

                    // Trigger save to persist the change
                    setTimeout(() => saveRef.current(), 0);
                  }}
                  disabled={isCreatingDataField}
                  className="h-10 px-4 rounded-md text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isCreatingDataField ? (
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
                      {editingFieldUuid ? "Saving..." : "Creating..."}
                    </>
                  ) : editingFieldUuid ? (
                    "Save"
                  ) : (
                    "Add field"
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
        onConfirm={handleDeleteField}
        title={fieldsToDeleteBulk.length > 0 ? "Delete fields" : "Delete field"}
        message={
          fieldsToDeleteBulk.length > 0
            ? `Are you sure you want to delete ${
                fieldsToDeleteBulk.length
              } field${fieldsToDeleteBulk.length > 1 ? "s" : ""}?`
            : `Are you sure you want to delete "${fieldToDelete?.name}"?`
        }
        confirmText="Delete"
      />
    </>
  );
}
