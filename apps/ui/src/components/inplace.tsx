import React, { useCallback, useEffect, useRef, useState } from "react"
import { LucideCheck, PencilIcon, XIcon } from "lucide-react"
import type { HTMLInputTypeAttribute, ReactNode } from "react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger
} from "@/components/ui/select.tsx"
import { Input } from "@/components/ui/input.tsx"
import { cn } from "@/lib/utils.ts"

export type EditElement<T> =
  | { type: "input"; inputType?: HTMLInputTypeAttribute }
  | {
      type: "select"
      options: Array<{ label: string; value: T }>
    }
  | {
      type: "custom"
      hideActions?: boolean
      render: (props: {
        value: T
        onChange: (value: T) => void
        onCommit: (value?: T) => void
        onCancel: () => void
      }) => ReactNode
    }

interface InplaceProps<T> {
  value: T
  onSave: (value: T) => void | Promise<void>
  displayElement?: (value: T) => ReactNode
  editElement?: EditElement<T>
  editOnClick?: boolean
  showEditIcon?: boolean
  onEditingChange?: (editing: boolean) => void
}

export function Inplace<T>({
  value,
  onSave,
  displayElement,
  editElement = { type: "input" },
  editOnClick = false,
  showEditIcon = true,
  onEditingChange
}: InplaceProps<T>) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<T>(value)
  const [hovered, setHovered] = useState(false)
  const [selectOpen, setSelectOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    onEditingChange?.(editing)
  }, [editing, onEditingChange])

  const enterEdit = useCallback(() => {
    setDraft(value)
    setEditing(true)
    setSelectOpen(true)
    // focus after paint
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [value])

  const cancel = useCallback(() => {
    setSelectOpen(false)
    setEditing(false)
    setDraft(value)
  }, [value])

  const commit = useCallback(
    async (overrideDraft?: T) => {
      if (draft === value && !overrideDraft) {
        setEditing(false)
        return
      }
      try {
        overrideDraft ? await onSave(overrideDraft) : await onSave(draft)
      } finally {
        setEditing(false)
        setSelectOpen(false)
      }
    },
    [draft, value, onSave]
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") commit()
    if (e.key === "Escape") cancel()
  }

  function renderDisplayComponent(): ReactNode {
    if (displayElement) {
      return displayElement(value)
    }

    return <span>{String(value)}</span>
  }

  function renderEditComponent(): ReactNode {
    if (editElement.type === "custom") {
      return editElement.render({
        value: draft,
        onChange: setDraft,
        onCommit: commit,
        onCancel: cancel
      })
    }

    if (editElement.type === "select") {
      const selectedLabel =
        editElement.options.find((opt) => opt.value === draft)?.label ??
        String(draft)

      return (
        <Select
          open={selectOpen}
          onOpenChange={setSelectOpen}
          value={String(draft)}
          onValueChange={(v) => {
            const typed =
              typeof value === "number" ? (Number(v) as T) : (v as T)
            setDraft(typed)
            commit(typed)
          }}
        >
          <SelectTrigger className="h-7 min-w-32 text-sm">
            <span className="min-w-0 flex-1 truncate text-left">
              {selectedLabel}
            </span>
          </SelectTrigger>
          <SelectContent>
            {editElement.options.map((opt) => (
              <SelectItem key={String(opt.value)} value={String(opt.value)}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    }

    // default: input
    return (
      <Input
        ref={inputRef}
        type={editElement.inputType ?? "text"}
        value={String(draft)}
        onChange={(e) => {
          const raw = e.target.value
          const typed =
            typeof value === "number" ? (Number(raw) as T) : (raw as T)
          setDraft(typed)
        }}
        onKeyDown={handleKeyDown}
        className="h-7 w-auto min-w-32 py-0 text-sm"
      />
    )
  }

  function getIcons(): ReactNode {
    if (editing && editElement.type === "custom" && editElement.hideActions) {
      return null
    }

    return (
      <div className="flex items-center gap-1">
        {editing ? (
          <div className="flex items-center gap-2">
            {editElement.type !== "select" && (
              <Button onClick={() => commit()} size="icon-sm" variant="ghost">
                <LucideCheck />
              </Button>
            )}
            <Button onClick={() => cancel()} size="icon-sm" variant="ghost">
              <XIcon />
            </Button>
          </div>
        ) : (
          <Button
            onClick={() => enterEdit()}
            size="icon-sm"
            variant="ghost"
            className={hovered && showEditIcon ? "opacity-100" : "opacity-0"}
          >
            <PencilIcon />
          </Button>
        )}
      </div>
    )
  }

  return (
    <div
      className={cn("flex", "items-center", "gap-4", "min-w-36", {
        "cursor-pointer": editOnClick
      })}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div onClick={editOnClick ? enterEdit : undefined}>
        {editing ? renderEditComponent() : renderDisplayComponent()}
      </div>
      {getIcons()}
    </div>
  )
}
