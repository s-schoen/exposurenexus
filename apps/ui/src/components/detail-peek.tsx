import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Link } from "@tanstack/react-router";
import { Link2, Maximize2, X } from "lucide-react";
import { Suspense, createContext, use, useState } from "react";
import { toast } from "sonner";

import { findDataListRowFocusTarget } from "@/components/data-list/data-list.tsx";
import { Button, buttonVariants } from "@/components/ui/button.tsx";

import type { ReactNode } from "react";

// Undefined outside the shell, so a peek falls back to the body; null until the shell's region
// mounts, which Base UI's portal waits for.
const PeekContainerContext = createContext<HTMLElement | null | undefined>(undefined);

/** The region below the page header that a peek slides over. The shell wraps page content in it. */
export function DetailPeekContainer({ children }: { children: ReactNode }) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  return (
    <div ref={setContainer} className="relative min-h-0 flex-1 overflow-hidden">
      <PeekContainerContext value={container}>{children}</PeekContainerContext>
    </div>
  );
}

interface DetailPeekProps {
  /** The row whose peek is open, from `?selected=`. */
  selectedId?: string;
  /** The panel's accessible name, such as "Finding details". */
  label: string;
  getFullPageHref: (id: string) => string;
  children: (id: string) => ReactNode;
  onClose: () => void;
}

// Plane's side peek: a non-modal panel over the right of the list, with no backdrop. The list stays
// clickable, and selecting another row swaps the content instead of closing the panel.
export function DetailPeek({
  selectedId,
  label,
  getFullPageHref,
  children,
  onClose,
}: DetailPeekProps) {
  const container = use(PeekContainerContext);
  // Keeps the last id after the selection clears, so the panel slides out with its content.
  const [shownId, setShownId] = useState(selectedId);

  if (selectedId && selectedId !== shownId) {
    setShownId(selectedId);
  }

  const fullPageHref = shownId ? getFullPageHref(shownId) : undefined;

  const copyLink = async () => {
    if (!fullPageHref) {
      return;
    }

    try {
      await navigator.clipboard.writeText(new URL(fullPageHref, window.location.origin).href);
      toast.success("Link copied");
    } catch {
      toast.error("Unable to copy the link");
    }
  };

  return (
    <DialogPrimitive.Root
      open={Boolean(selectedId)}
      modal={false}
      // Clicks on the list select rows; only Escape and the close button close the peek.
      disablePointerDismissal
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogPrimitive.Portal container={container}>
        <DialogPrimitive.Popup
          data-slot="detail-peek"
          finalFocus={() => (shownId ? findDataListRowFocusTarget(shownId) : null) ?? true}
          className="absolute inset-y-0 right-0 z-20 flex w-full flex-col border-l border-border bg-card shadow-peek transition duration-300 ease-snappy outline-none data-ending-style:translate-x-full data-ending-style:opacity-0 data-ending-style:duration-150 data-ending-style:ease-in data-starting-style:translate-x-full data-starting-style:opacity-0 md:w-1/2 md:min-w-96"
        >
          <DialogPrimitive.Title className="sr-only">{label}</DialogPrimitive.Title>
          <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
            <div className="flex items-center gap-1">
              <DialogPrimitive.Close
                render={<Button variant="ghost" size="icon" aria-label="Close" />}
              >
                <X strokeWidth={1.5} />
              </DialogPrimitive.Close>
              {fullPageHref && (
                <Link
                  to={fullPageHref}
                  aria-label="Open full page"
                  className={buttonVariants({ variant: "ghost", size: "icon" })}
                >
                  <Maximize2 strokeWidth={1.5} />
                </Link>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Copy link"
              onClick={() => {
                void copyLink();
              }}
            >
              <Link2 strokeWidth={1.5} />
            </Button>
          </div>
          {/* Keyed by id, so switching rows fades the new content in. Full-bleed detail layouts
              bring their own padding. */}
          <div
            key={shownId}
            className="min-h-0 flex-1 animate-fade-in overflow-y-auto p-5 has-data-full-bleed:p-0"
          >
            <Suspense fallback={null}>{shownId && children(shownId)}</Suspense>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
