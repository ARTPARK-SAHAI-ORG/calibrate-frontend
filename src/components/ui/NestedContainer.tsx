import React from "react";

type NestedContainerProps = {
  children: React.ReactNode;
  onAddProperty?: () => void;
  addButtonText?: string;
  showAddButton?: boolean;
  showValidationError?: boolean;
};

/**
 * A theme-aware nested container for properties/items sections.
 * Used in ParameterCard, AddToolDialog, DataExtractionTabContent, etc.
 * Provides consistent styling for nested object properties and array items.
 */
export const NestedContainer = ({
  children,
  onAddProperty,
  addButtonText = "Add property",
  showAddButton = true,
  showValidationError = false,
}: NestedContainerProps) => {
  return (
    <div className="border border-border rounded-xl bg-muted p-4 space-y-4">
      {children}
      {showAddButton && onAddProperty && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onAddProperty}
            className={`h-10 px-6 rounded-md text-sm font-medium border bg-background hover:bg-muted/50 transition-colors cursor-pointer ${
              showValidationError ? "border-red-500" : "border-border"
            }`}
          >
            {addButtonText}
          </button>
        </div>
      )}
    </div>
  );
};
