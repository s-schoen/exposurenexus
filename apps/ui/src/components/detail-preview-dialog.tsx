import type { ReactNode } from "react"
import { Expand } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog.tsx"
import { buttonVariants } from "@/components/ui/button.tsx"
import { cn } from "@/lib/utils.ts"

interface DetailPreviewDialogProps {
  selectedId?: string
  title: string
  description: string
  fullPageHref?: string
  fullPageLabel?: string
  children: ReactNode
  onClose: () => void
}

export function DetailPreviewDialog({
  selectedId,
  title,
  description,
  fullPageHref,
  fullPageLabel = "Open full page",
  children,
  onClose
}: DetailPreviewDialogProps) {
  const open = Boolean(selectedId)

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose()
        }
      }}
    >
      <DialogContent className="flex h-[min(92vh,64rem)] w-[70vw] max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[70vw]">
        {open && (
          <div className="flex h-full min-h-0 flex-col">
            <DialogHeader className="sr-only">
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
            <div className="border-b border-border/70 px-4 py-3 pr-14">
              {fullPageHref && (
                <a
                  href={fullPageHref}
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "rounded-xl"
                  )}
                >
                  <Expand />
                  {fullPageLabel}
                </a>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
