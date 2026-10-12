import { createCallable } from "react-call";

import { FormDialog, useFormDialogSubmit } from "@/components/form-dialog.tsx";
import { CreateFindingForm } from "@/features/findings/components/create-finding-form.tsx";
import { useFindingLifecycle } from "@/features/findings/hooks/use-finding-lifecycle.ts";

import type { Finding } from "@exposurenexus/contracts/model/finding";
import type { PropsWithCall } from "react-call";

/** Creates a manual finding and resolves to it, or to `null` when cancelled. */
export const CreateFindingDialog = ({ call }: PropsWithCall<object, Finding | null, object>) => {
  const findingLifecycle = useFindingLifecycle();
  const { submitting, submit } = useFormDialogSubmit(findingLifecycle.createFinding, (finding) =>
    call.end(finding),
  );

  return (
    <FormDialog
      title="Create finding"
      size="wide"
      open={!call.ended}
      onOpenChange={(open) => {
        if (!open) call.end(null);
      }}
      submitting={submitting}
    >
      <CreateFindingForm onSubmit={submit} onCancel={() => call.end(null)} />
    </FormDialog>
  );
};

// needed because of hot reload issues with react-call: https://github.com/desko27/react-call/issues/31
const callable = createCallable(((props) => (
  <CreateFindingDialog {...props} />
)) as typeof CreateFindingDialog);
CreateFindingDialog.call = callable.call;
CreateFindingDialog.Root = callable.Root;
CreateFindingDialog.callable = callable;
