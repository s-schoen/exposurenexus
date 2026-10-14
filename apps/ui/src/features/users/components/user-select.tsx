import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { createUserOptions } from "@/features/users/components/user-chip.tsx";

import type { UserReferenceLabels } from "@/features/users/components/user-label.tsx";
import type { UserProfile } from "@exposurenexus/contracts/model/user";

const noUserValue = "__no_user__";

interface UserSelectProps {
  id: string;
  name?: string;
  /** The picked user's id, or null for nobody. */
  value: string | null;
  onChange: (value: string | null) => void;
  onBlur?: () => void;
  /** Every user, or `undefined` while they load. */
  users: ReadonlyArray<UserProfile> | undefined;
  /** What nobody reads, such as `ASSIGNEE_LABELS`. */
  labels: UserReferenceLabels;
  disabled?: boolean;
}

/** A form field for a person: avatar and name in the trigger and options, nobody first. */
export function UserSelect({
  id,
  name,
  value,
  onChange,
  onBlur,
  users,
  labels,
  disabled,
}: UserSelectProps) {
  const options = createUserOptions(users, labels, {
    emptyValue: noUserValue,
    currentUserId: value,
  });
  const selected = options.find((option) => option.value === (value ?? noUserValue));

  return (
    <Select
      value={value ?? noUserValue}
      name={name}
      onValueChange={(next) => {
        onChange(next === noUserValue || typeof next !== "string" ? null : next);
        onBlur?.();
      }}
    >
      <SelectTrigger id={id} className="w-full" disabled={disabled}>
        <SelectValue>
          {selected && (
            <>
              {selected.icon}
              {selected.label}
            </>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.icon}
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
