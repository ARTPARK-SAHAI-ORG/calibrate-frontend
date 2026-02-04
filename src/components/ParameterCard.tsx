import { NestedContainer } from "@/components/ui/NestedContainer";

export type Parameter = {
  id: string;
  dataType: string;
  name: string;
  required?: boolean; // Optional - only used when showRequired is true
  description: string;
  properties?: Parameter[];
  items?: Parameter; // For array types - defines the schema of array items
};

type ParameterCardProps = {
  param: Parameter;
  path: string[];
  onUpdate: (path: string[], updates: Partial<Parameter>) => void;
  onRemove: (parentPath: string[], id: string) => void;
  onAddProperty: (path: string[]) => void;
  onSetItems: (path: string[], items: Parameter | undefined) => void;
  validationAttempted: boolean;
  isProperty?: boolean;
  isArrayItem?: boolean;
  siblingNames?: string[]; // Names of sibling parameters (excluding this one)
  hideDelete?: boolean; // Hide delete button (e.g., when only one parameter exists)
  showRequired?: boolean; // Show required checkbox (default: true)
};

// Recursive component for rendering parameter/property cards
// Can be used for tool parameters, data field properties, etc.
export const ParameterCard = ({
  param,
  path,
  onUpdate,
  onRemove,
  onAddProperty,
  onSetItems,
  validationAttempted,
  isProperty = false,
  isArrayItem = false,
  siblingNames = [],
  hideDelete = false,
  showRequired = true,
}: ParameterCardProps) => {
  const currentPath = [...path, param.id];
  const parentPath = path;

  // Check if the current name is a duplicate
  const isDuplicateName =
    param.name.trim() !== "" &&
    siblingNames.some(
      (name) => name.toLowerCase() === param.name.trim().toLowerCase()
    );

  return (
    <div className="border border-border rounded-xl p-5 space-y-5 bg-background">
      {/* Data type and Name/Identifier */}
      <div className={isArrayItem ? "" : "flex gap-4"}>
        <div className={isArrayItem ? "" : "w-40"}>
          <label className="block text-sm font-medium mb-2">Data type</label>
          <div className="relative">
            <select
              value={param.dataType}
              onChange={(e) => {
                const newType = e.target.value;
                if (isArrayItem) {
                  // For array items, update via the items path
                  onUpdate([...path], { dataType: newType });
                } else {
                  onUpdate(currentPath, { dataType: newType });
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
        {/* Name/Identifier - not shown for array items */}
        {!isArrayItem && (
          <div className="flex-1">
            <label className="block text-sm font-medium mb-2">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={param.name}
              onChange={(e) => onUpdate(currentPath, { name: e.target.value })}
              className={`w-full h-10 px-4 rounded-md text-base border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent ${
                validationAttempted && (!param.name.trim() || isDuplicateName)
                  ? "border-red-500"
                  : "border-border"
              }`}
            />
            {validationAttempted && isDuplicateName && (
              <p className="text-sm text-red-500 mt-1">
                A parameter with this name already exists
              </p>
            )}
          </div>
        )}
      </div>

      {/* Required checkbox - not shown for array items or when showRequired is false */}
      {!isArrayItem && showRequired && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => onUpdate(currentPath, { required: !param.required })}
            className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors cursor-pointer ${
              param.required
                ? "bg-foreground border-foreground"
                : "border-border hover:border-muted-foreground"
            }`}
          >
            {param.required && (
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
      )}

      {/* Description */}
      <div>
        <label className="block text-sm font-medium mb-2">
          Description <span className="text-red-500">*</span>
        </label>
        <textarea
          value={param.description}
          onChange={(e) => {
            if (isArrayItem) {
              onUpdate([...path], { description: e.target.value });
            } else {
              onUpdate(currentPath, { description: e.target.value });
            }
          }}
          rows={3}
          placeholder="This field will be passed to the LLM and should describe in detail what the parameter is for and how it should be populated"
          className={`w-full px-4 py-3 rounded-md text-base border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-none ${
            validationAttempted && !param.description.trim()
              ? "border-red-500"
              : "border-border"
          }`}
        />
      </div>

      {/* Properties section for object type */}
      {param.dataType === "object" && (
        <div>
          <label className="block text-sm font-medium mb-2">
            Properties <span className="text-red-500">*</span>
          </label>
          <NestedContainer
            onAddProperty={() =>
              onAddProperty(isArrayItem ? [...path] : currentPath)
            }
            showValidationError={
              validationAttempted &&
              (!param.properties || param.properties.length === 0)
            }
          >
            {/* Render nested properties recursively */}
            {param.properties && param.properties.length > 0 && (
              <div className="space-y-4">
                {param.properties.map((prop) => (
                  <ParameterCard
                    key={prop.id}
                    param={prop}
                    path={isArrayItem ? [...path] : currentPath}
                    onUpdate={onUpdate}
                    onRemove={onRemove}
                    onAddProperty={onAddProperty}
                    onSetItems={onSetItems}
                    validationAttempted={validationAttempted}
                    isProperty={true}
                    siblingNames={
                      param.properties
                        ?.filter((p) => p.id !== prop.id)
                        .map((p) => p.name) ?? []
                    }
                    showRequired={showRequired}
                  />
                ))}
              </div>
            )}
          </NestedContainer>
        </div>
      )}

      {/* Item section for array type */}
      {param.dataType === "array" && (
        <div>
          <label className="block text-sm font-medium mb-2">Item</label>
          <NestedContainer showAddButton={false}>
            <ParameterCard
              param={
                param.items || {
                  id: crypto.randomUUID(),
                  dataType: "string",
                  name: "",
                  required: true,
                  description: "",
                }
              }
              path={
                isArrayItem
                  ? [...path, "__items__"]
                  : [...currentPath, "__items__"]
              }
              onUpdate={onUpdate}
              onRemove={onRemove}
              onAddProperty={onAddProperty}
              onSetItems={onSetItems}
              validationAttempted={validationAttempted}
              isArrayItem={true}
              showRequired={showRequired}
            />
          </NestedContainer>
        </div>
      )}

      {/* Delete button - not shown for array items or when hideDelete is true */}
      {!isArrayItem && !hideDelete && (
        <div className="flex justify-end">
          <button
            onClick={() => onRemove(parentPath, param.id)}
            className="h-9 px-4 rounded-md text-sm font-medium text-red-500 bg-red-500/10 hover:text-red-600 hover:bg-red-500/20 transition-colors cursor-pointer"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
};
