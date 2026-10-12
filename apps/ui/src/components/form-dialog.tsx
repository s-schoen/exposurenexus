import { Suspense, createContext, useContext, useState } from "react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { cn } from "@/lib/utils";

import type { ReactNode } from "react";

const InFormDialogContext = createContext(false);

interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** `wide` fits two-column forms and tables. */
  size?: "default" | "wide";
  /** While a submit runs, the dialog ignores every close request. */
  submitting?: boolean;
  children: ReactNode;
}

/**
 * The modal that create forms open in. It scrolls as a whole and pins the form's `FormActions`
 * to its bottom edge. A backdrop click doesn't close it, so a stray click can't drop a draft.
 */
export function FormDialog({
  open,
  onOpenChange,
  title,
  size = "default",
  submitting = false,
  children,
}: FormDialogProps) {
  return (
    <Dialog
      open={open}
      disablePointerDismissal
      onOpenChange={(nextOpen) => {
        if (!nextOpen && submitting) return;
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent
        className={cn(
          "max-h-[calc(100dvh-2rem)] overflow-y-auto",
          size === "wide" ? "sm:max-w-3xl" : "sm:max-w-xl",
        )}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <InFormDialogContext value={true}>
          <Suspense
            fallback={
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            }
          >
            {children}
          </Suspense>
        </InFormDialogContext>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A form's cancel and submit buttons. On a page they close the form; in a `FormDialog` they stick
 * to the dialog's bottom edge while the fields scroll.
 */
export function FormActions({ children }: { children: ReactNode }) {
  const inDialog = useContext(InFormDialogContext);

  return (
    <div
      className={cn(
        "flex justify-end gap-2",
        inDialog && "sticky -bottom-6 -mx-6 -mb-6 border-t border-border bg-popover px-6 py-4",
      )}
    >
      {children}
    </div>
  );
}

/**
 * Runs a create from a form dialog. `submitting` stays true until the create settles, and
 * `onCreated` only runs for a created record, so a failed create leaves the dialog and its draft.
 */
export function useFormDialogSubmit<TPayload, TResult>(
  create: (payload: TPayload) => Promise<TResult | null>,
  onCreated: (result: TResult) => void,
) {
  const [submitting, setSubmitting] = useState(false);

  const submit = async (payload: TPayload) => {
    setSubmitting(true);
    let result: TResult | null;
    try {
      result = await create(payload);
    } finally {
      setSubmitting(false);
    }
    if (result !== null) onCreated(result);
  };

  return { submitting, submit };
}
