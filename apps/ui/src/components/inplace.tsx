import React, {
  type ReactNode,
  useCallback,
  useRef,
  useState,
  type HTMLInputTypeAttribute
} from "react"
import { Button } from "@/components/ui/button"
import { PencilIcon, LucideCheck, XIcon } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select.tsx"
import { Input } from "@/components/ui/input.tsx"

type EditElement<T> =
  | { type: "input"; inputType?: HTMLInputTypeAttribute }
  | {
      type: "select"
      options: { label: string; value: T }[]
    }
  | {
      type: "custom"
      render: (props: {
        value: T
        onChange: (value: T) => void
        onCommit: () => void
        onCancel: () => void
      }) => ReactNode
    }

interface InplaceProps<T> {
  value: T
  onSave: (value: T) => void | Promise<void>
  displayElement?: (value: T) => ReactNode
  editElement?: EditElement<T>
}

export function Inplace<T>({
  value,
  onSave,
  displayElement,
  editElement = { type: "input" }
}: InplaceProps<T>) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<T>(value)
  const [hovered, setHovered] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const enterEdit = useCallback(() => {
    setDraft(value)
    setEditing(true)
    // focus after paint
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [value])

  const cancel = useCallback(() => {
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
      return (
        <Select
          value={
            editElement.options.find((opt) => opt.value === draft)?.label ??
            String(draft)
          }
          onValueChange={(v) => {
            const typed =
              typeof value === "number" ? (Number(v) as T) : (v as T)
            setDraft(typed)
            commit(typed)
          }}
        >
          <SelectTrigger className="h-7 min-w-32 text-sm">
            <SelectValue />
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
        type={
          editElement.type === "input"
            ? (editElement.inputType ?? "text")
            : "text"
        }
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
    return (
      <div className="flex items-center gap-1">
        {editing ? (
          <div className="flex items-center gap-2">
            <Button onClick={() => commit()} size="icon-sm" variant="ghost">
              <LucideCheck />
            </Button>
            <Button onClick={() => commit()} size="icon-sm" variant="ghost">
              <XIcon />
            </Button>
          </div>
        ) : (
          <Button
            onClick={() => enterEdit()}
            size="icon-sm"
            variant="ghost"
            className={hovered ? "opacity-100" : "opacity-0"}
          >
            <PencilIcon />
          </Button>
        )}
      </div>
    )
  }

  return (
    <div
      className="flex items-center gap-4 min-w-36"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {editing ? renderEditComponent() : renderDisplayComponent()}
      {getIcons()}
    </div>
  )
}
