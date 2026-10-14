import {
  AssetEnvironment,
  AssetLifecycleState,
  AssetType,
  createAssetSchema,
} from "@exposurenexus/contracts/model/asset";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { createCallable } from "react-call";

import { FormActions, FormDialog, useFormDialogSubmit } from "@/components/form-dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { AssetIdentifierEditor } from "@/features/assets/components/asset-identifier-editor.tsx";
import { AssetLifecycleLabel } from "@/features/assets/components/asset-lifecycle-label.tsx";
import { AssetTypeIcon } from "@/features/assets/components/asset-type-icon.tsx";
import { useAssetLifecycle } from "@/features/assets/hooks/use-asset-lifecycle.ts";
import { formatAssetEnvironment } from "@/features/assets/lib/asset-environment.ts";
import { formatAssetType } from "@/features/assets/lib/asset-type.ts";
import { OWNER_LABELS, UserSelect, createListUsersQueryOptions } from "@/features/users";

import type { Asset, CreateAsset } from "@exposurenexus/contracts/model/asset";
import type { PropsWithCall } from "react-call";

const formSchema = createAssetSchema;

/** Creates an asset and resolves to it, or to `null` when cancelled. */
export const CreateAssetDialog = ({ call }: PropsWithCall<object, Asset | null, object>) => {
  const assetLifecycle = useAssetLifecycle();
  const { submitting, submit } = useFormDialogSubmit(assetLifecycle.createAsset, (asset) =>
    call.end(asset),
  );
  const users = useQuery(createListUsersQueryOptions());
  const defaultValues: CreateAsset = {
    displayName: "",
    type: AssetType.Host,
    environment: AssetEnvironment.Unknown,
    lifecycleState: AssetLifecycleState.Active,
    ownerId: null,
    identifiers: [],
  };
  const form = useForm({
    defaultValues,
    validators: {
      onSubmit: formSchema,
    },
    onSubmit: async ({ value }) => {
      await submit({
        displayName: value.displayName,
        type: value.type,
        environment: value.environment,
        lifecycleState: value.lifecycleState,
        ownerId: value.ownerId ?? null,
        ...(value.identifiers && value.identifiers.length > 0
          ? { identifiers: value.identifiers }
          : {}),
      });
    },
  });

  return (
    <FormDialog
      title="Create asset"
      open={!call.ended}
      onOpenChange={(open) => {
        if (!open) call.end(null);
      }}
      submitting={submitting}
    >
      <form
        id="asset-form"
        onSubmit={async (e) => {
          e.preventDefault();
          await form.handleSubmit();
        }}
        className="flex flex-col gap-6"
      >
        <FieldGroup>
          <form.Field
            name="displayName"
            children={(field) => {
              const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor={field.name}>Display name</FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    aria-invalid={isInvalid}
                    placeholder="Asset display name"
                    autoComplete="off"
                  />
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              );
            }}
          />
          <form.Field
            name="type"
            children={(field) => {
              return (
                <Field>
                  <FieldLabel htmlFor={field.name}>Type</FieldLabel>
                  <Select
                    value={field.state.value}
                    name={field.name}
                    onValueChange={(e) => {
                      field.handleChange(e as AssetType);
                      field.handleBlur();
                    }}
                  >
                    <SelectTrigger id={field.name} className="w-full">
                      <SelectValue>
                        <AssetTypeIcon type={field.state.value} decorative />
                        {formatAssetType(field.state.value)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {Object.values(AssetType).map((type) => (
                          <SelectItem key={type} value={type}>
                            <AssetTypeIcon type={type} decorative />
                            {formatAssetType(type)}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              );
            }}
          />
          <form.Field
            name="environment"
            children={(field) => {
              return (
                <Field>
                  <FieldLabel htmlFor={field.name}>Environment</FieldLabel>
                  <Select
                    value={field.state.value}
                    name={field.name}
                    onValueChange={(value) => {
                      field.handleChange(value as AssetEnvironment);
                      field.handleBlur();
                    }}
                  >
                    <SelectTrigger id={field.name} className="w-full">
                      <SelectValue>
                        {formatAssetEnvironment(field.state.value ?? AssetEnvironment.Unknown)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {Object.values(AssetEnvironment).map((environment) => (
                          <SelectItem key={environment} value={environment}>
                            {formatAssetEnvironment(environment)}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              );
            }}
          />
          <form.Field
            name="lifecycleState"
            children={(field) => {
              return (
                <Field>
                  <FieldLabel htmlFor={field.name}>Lifecycle</FieldLabel>
                  <Select
                    value={field.state.value}
                    name={field.name}
                    onValueChange={(value) => {
                      field.handleChange(value as AssetLifecycleState);
                      field.handleBlur();
                    }}
                  >
                    <SelectTrigger id={field.name} className="w-full">
                      <SelectValue>
                        <AssetLifecycleLabel
                          state={field.state.value ?? AssetLifecycleState.Active}
                        />
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {Object.values(AssetLifecycleState).map((state) => (
                          <SelectItem key={state} value={state}>
                            <AssetLifecycleLabel state={state} />
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              );
            }}
          />
          <form.Field
            name="ownerId"
            children={(field) => (
              <Field>
                <FieldLabel htmlFor={field.name}>Owner</FieldLabel>
                <UserSelect
                  id={field.name}
                  name={field.name}
                  value={field.state.value ?? null}
                  onChange={field.handleChange}
                  onBlur={field.handleBlur}
                  users={users.data}
                  labels={OWNER_LABELS}
                />
              </Field>
            )}
          />
          <form.Field
            name="identifiers"
            children={(field) => (
              <AssetIdentifierEditor
                value={field.state.value ?? []}
                onChange={(value) => field.handleChange(value)}
              />
            )}
          />
        </FieldGroup>
        <FormActions>
          <Button
            type="button"
            variant="outline"
            onClick={() => call.end(null)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting && <Spinner />}
            Create asset
          </Button>
        </FormActions>
      </form>
    </FormDialog>
  );
};

// needed because of hot reload issues with react-call: https://github.com/desko27/react-call/issues/31
const callable = createCallable(((props) => (
  <CreateAssetDialog {...props} />
)) as typeof CreateAssetDialog);
CreateAssetDialog.call = callable.call;
CreateAssetDialog.Root = callable.Root;
CreateAssetDialog.callable = callable;
