import { createCallable } from "react-call";

import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";

import type { ReactCall } from "react-call";

interface ConfirmDialogProps {
  title?: string;
  description?: string;
  cancelText?: string;
  confirmText?: string;
  confirmVariant?: "default" | "destructive";
  message: string;
}

export const ConfirmDialog = ({
  call,
  title = "Confirm",
  description,
  cancelText = "Cancel",
  confirmText = "Confirm",
  confirmVariant,
  message,
}: ReactCall.Props<ConfirmDialogProps, boolean, object>) => {
  return (
    <Dialog open={!call.ended}>
      <DialogContent className="sm:max-w-106.25">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div>
          <span>{message}</span>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => call.end(false)}>
            {cancelText}
          </Button>
          <Button type="button" variant={confirmVariant} onClick={() => call.end(true)}>
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// needed because of hot reload issues with react-call: https://github.com/desko27/react-call/issues/31
const callable = createCallable(((props) => <ConfirmDialog {...props} />) as typeof ConfirmDialog);
ConfirmDialog.call = callable.call;
ConfirmDialog.Root = callable.Root;
ConfirmDialog.callable = callable;
