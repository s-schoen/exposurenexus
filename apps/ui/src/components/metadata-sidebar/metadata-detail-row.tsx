import type { ReactNode } from "react"
import { Inplace } from "@/components/inplace.tsx"
import type { EditElement } from "@/components/inplace.tsx"

interface MetadataDetailRowBaseProps {
  label: string
  mono?: boolean
}

interface StaticMetadataDetailRowProps extends MetadataDetailRowBaseProps {
  value: string
  editable?: never
}

interface EditableMetadataDetailRowProps<T>
  extends MetadataDetailRowBaseProps {
  value?: never
  editable: {
    value: T
    onSave: (value: T) => void | Promise<void>
    displayElement?: (value: T) => ReactNode
    editElement?: EditElement<T>
    editOnClick?: boolean
    showEditIcon?: boolean
  }
}

type MetadataDetailRowProps<T> =
  | StaticMetadataDetailRowProps
  | EditableMetadataDetailRowProps<T>

export function MetadataDetailRow<T>({
  label,
  mono = false,
  ...props
}: MetadataDetailRowProps<T>) {
  const editable = "editable" in props ? props.editable : undefined

  if (editable) {
    return (
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </span>
        <div className="text-sm text-foreground">
          <Inplace
            value={editable.value}
            onSave={editable.onSave}
            displayElement={editable.displayElement}
            editElement={editable.editElement}
            editOnClick={editable.editOnClick}
            showEditIcon={editable.showEditIcon}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start justify-between gap-6">
      <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      <span
        className={
          mono
            ? "max-w-[16rem] truncate text-right font-mono text-xs text-foreground"
            : "max-w-[16rem] text-right text-sm text-foreground"
        }
      >
        {props.value}
      </span>
    </div>
  )
}
