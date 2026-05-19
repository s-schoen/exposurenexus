import { createCallable } from "react-call"
import { AssetType, assetSchema } from "@exposurenexus/types/model/asset"
import { useForm } from "@tanstack/react-form"
import { useQuery } from "@tanstack/react-query"
import type { ReactCall } from "react-call"
import type { Asset } from "@exposurenexus/types/model/asset"
import { createListUsersQueryOptions } from "@/api/user.ts"
import { Button } from "@/components/ui/button.tsx"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog.tsx"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel
} from "@/components/ui/field.tsx"
import { Input } from "@/components/ui/input.tsx"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select.tsx"

import { capitalizeFirstLetter } from "@/lib/format.ts"

interface AssetDialogProps {}

const formSchema = assetSchema.omit({ id: true })
const noOwnerValue = "__no_owner__"

export const AssetDialog = ({
  call
}: ReactCall.Props<AssetDialogProps, Asset | null, {}>) => {
  const users = useQuery(createListUsersQueryOptions())
  const form = useForm({
    defaultValues: {
      name: "",
      type: AssetType.Host,
      ownerId: null as string | null
    },
    validators: {
      onSubmit: formSchema
    },
    onSubmit: ({ value }) => {
      call.end({
        id: "",
        name: value.name,
        type: value.type,
        ownerId: value.ownerId ?? null
      })
    }
  })

  return (
    <Dialog open={!call.ended}>
      <form
        id="asset-form"
        onSubmit={async (e) => {
          e.preventDefault()
          await form.handleSubmit()
        }}
      >
        <DialogContent className="sm:max-w-106.25">
          <DialogHeader>
            <DialogTitle>Create Asset</DialogTitle>
            <DialogDescription>Create a new asset</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <form.Field
              name="name"
              children={(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Name</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      aria-invalid={isInvalid}
                      placeholder="Asset name"
                      autoComplete="off"
                    />
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                )
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
                        field.handleChange(e as AssetType)
                        field.handleBlur()
                      }}
                    >
                      <SelectTrigger id={field.name}>
                        <SelectValue placeholder="Select asset type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {Object.values(AssetType).map((t) => (
                            <SelectItem key={t} value={t}>
                              {capitalizeFirstLetter(t)}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                )
              }}
            />
            <form.Field
              name="ownerId"
              children={(field) => {
                return (
                  <Field>
                    <FieldLabel htmlFor={field.name}>Owner</FieldLabel>
                    <Select
                      value={field.state.value ?? noOwnerValue}
                      name={field.name}
                      onValueChange={(value) => {
                        field.handleChange(
                          value === noOwnerValue ? null : value
                        )
                        field.handleBlur()
                      }}
                    >
                      <SelectTrigger id={field.name}>
                        <SelectValue placeholder="Select asset owner" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value={noOwnerValue}>No Owner</SelectItem>
                          {users.data?.map((user) => (
                            <SelectItem key={user.id} value={user.id}>
                              {user.displayName}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                )
              }}
            />
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => call.end(null)}
            >
              Cancel
            </Button>
            <Button type="submit" form="asset-form">
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </form>
    </Dialog>
  )
}

// needed because of hot reload issues with react-call: https://github.com/desko27/react-call/issues/31
const callable = createCallable(((props) => (
  <AssetDialog {...props} />
)) as typeof AssetDialog)
AssetDialog.call = callable.call
AssetDialog.Root = callable.Root
AssetDialog.callable = callable
