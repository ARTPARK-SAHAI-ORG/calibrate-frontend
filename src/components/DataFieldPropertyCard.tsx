import { ParameterCard, Parameter } from "@/components/ParameterCard";

/**
 * @deprecated Use ParameterCard with showRequired={false} instead.
 * This is a compatibility wrapper that will be removed in a future version.
 */
export type DataFieldProperty = Parameter;

type DataFieldPropertyCardProps = {
  property: Parameter;
  path: string[];
  onUpdate: (path: string[], updates: Partial<Parameter>) => void;
  onRemove: (parentPath: string[], id: string) => void;
  onAddProperty: (path: string[]) => void;
  onSetItems: (path: string[], items: Parameter | undefined) => void;
  validationAttempted?: boolean;
  isArrayItem?: boolean;
};

/**
 * @deprecated Use ParameterCard with showRequired={false} instead.
 * This wrapper maps the old DataFieldPropertyCard API to ParameterCard.
 */
export const DataFieldPropertyCard = ({
  property,
  path,
  onUpdate,
  onRemove,
  onAddProperty,
  onSetItems,
  validationAttempted = false,
  isArrayItem = false,
}: DataFieldPropertyCardProps) => {
  return (
    <ParameterCard
      param={property}
      path={path}
      onUpdate={onUpdate}
      onRemove={onRemove}
      onAddProperty={onAddProperty}
      onSetItems={onSetItems}
      validationAttempted={validationAttempted}
      isArrayItem={isArrayItem}
      showRequired={false}
    />
  );
};
