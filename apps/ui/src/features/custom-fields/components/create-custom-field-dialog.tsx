import { createCallable } from "react-call";

import { FormDialog, useFormDialogSubmit } from "@/components/form-dialog.tsx";
import {
  AssetCustomFieldForm,
  mapAssetCustomFieldFormValues,
} from "@/features/custom-fields/components/asset-custom-field-form.tsx";
import { useAssetCustomFieldDefinitionLifecycle } from "@/features/custom-fields/hooks/use-asset-custom-field-definition-lifecycle.ts";

import type { AssetCustomFieldDefinition } from "@exposurenexus/contracts/model/asset-custom-field";
import type { PropsWithCall } from "react-call";

/** Creates a custom field definition and resolves to it, or to `null` when cancelled. */
export const CreateCustomFieldDialog = ({
  call,
}: PropsWithCall<object, AssetCustomFieldDefinition | null, object>) => {
  const fieldLifecycle = useAssetCustomFieldDefinitionLifecycle();
  const { submitting, submit } = useFormDialogSubmit(fieldLifecycle.createDefinition, (field) =>
    call.end(field),
  );

  return (
    <FormDialog
      title="Create custom field"
      open={!call.ended}
      onOpenChange={(open) => {
        if (!open) call.end(null);
      }}
      submitting={submitting}
    >
      <AssetCustomFieldForm
        mode="create"
        onSubmit={(values) => submit(mapAssetCustomFieldFormValues(values))}
        onCancel={() => call.end(null)}
      />
    </FormDialog>
  );
};

// needed because of hot reload issues with react-call: https://github.com/desko27/react-call/issues/31
const callable = createCallable(((props) => (
  <CreateCustomFieldDialog {...props} />
)) as typeof CreateCustomFieldDialog);
CreateCustomFieldDialog.call = callable.call;
CreateCustomFieldDialog.Root = callable.Root;
CreateCustomFieldDialog.callable = callable;
