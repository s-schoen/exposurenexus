import { Asterisk, CircleDashed } from "lucide-react";

export function formatCustomFieldRequired(required: boolean) {
  return required ? "Required" : "Optional";
}

/** An asterisk for required fields and a dashed circle for optional ones. */
export function CustomFieldRequiredIcon({ required }: { required: boolean }) {
  const Icon = required ? Asterisk : CircleDashed;

  return (
    <Icon strokeWidth={1.5} className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
  );
}

/** Required icon and label, for chips, pickers and property values; the parent's gap spaces them. */
export function CustomFieldRequiredLabel({ required }: { required: boolean }) {
  return (
    <>
      <CustomFieldRequiredIcon required={required} />
      {formatCustomFieldRequired(required)}
    </>
  );
}
