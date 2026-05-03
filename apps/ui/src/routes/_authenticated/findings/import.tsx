import { createFileRoute } from "@tanstack/react-router"
import { useId, useState } from "react"
import { CircleAlert, FileJson2, UploadCloud, X } from "lucide-react"
import { toast } from "sonner"
import type { ChangeEvent } from "react"
import { uploadFindingFile } from "@/api/finding.ts"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx"
import { Button, buttonVariants } from "@/components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card.tsx"
import { Input } from "@/components/ui/input.tsx"
import { usePageMeta } from "@/context/page.tsx"
import {
  actionErrorMessage,
  toastActionError
} from "@/lib/action-error-toast.ts"
import { cn } from "@/lib/utils.ts"

export const Route = createFileRoute("/_authenticated/findings/import")({
  component: RouteComponent
})

function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} B`
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export function RouteComponent() {
  const [file, setFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [inputKey, setInputKey] = useState(0)
  const inputId = useId()
  usePageMeta({
    title: "Import Findings",
    description:
      "Upload external scan results and ingest them into the platform as findings."
  })

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const nextFile = e.target.files?.[0] ?? null
    setFile(nextFile)
    setErrorMessage(null)
  }

  const handleClearFile = () => {
    setFile(null)
    setErrorMessage(null)
    setInputKey((current) => current + 1)
  }

  const handleImport = async () => {
    if (!file) {
      setErrorMessage("Select a nuclei export file before starting the import.")
      return
    }

    setIsUploading(true)
    setErrorMessage(null)

    try {
      await uploadFindingFile("nuclei", file)
      toast.success(`Imported ${file.name}`)
      handleClearFile()
    } catch (error) {
      const message = actionErrorMessage(
        error,
        `Failed to upload findings for import: ${error}`
      )
      setErrorMessage(message)
      toastActionError(error, message)
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="flex w-full flex-col">
      <Card className="w-full border-border/70">
        <CardHeader>
          <CardTitle>Upload file</CardTitle>
          <CardDescription>
            Select a nuclei export file and import it into OpenVLP.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Input
            key={inputKey}
            id={inputId}
            type="file"
            onChange={handleFileChange}
            className="sr-only"
            aria-label="Select findings import file"
          />

          <label
            htmlFor={inputId}
            className="group flex w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-transform group-hover:scale-105">
              <UploadCloud className="size-7" />
            </div>
            <div className="space-y-1">
              <div className="text-base font-medium">
                {file ? "Replace selected file" : "Choose a file to import"}
              </div>
              <p className="text-sm text-muted-foreground">
                Pick a nuclei result file from your machine.
              </p>
            </div>
          </label>

          {file ? (
            <div className="rounded-2xl border border-border/80 bg-background p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <FileJson2 className="size-5" />
                  </div>
                  <div className="space-y-1">
                    <div className="font-medium break-all">{file.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {formatFileSize(file.size)}
                      {file.type ? ` • ${file.type}` : ""}
                    </div>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleClearFile}
                  disabled={isUploading}
                >
                  <X />
                  Clear
                </Button>
              </div>
            </div>
          ) : null}

          {errorMessage ? (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>Import failed</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button onClick={handleImport} disabled={isUploading}>
              <UploadCloud />
              {isUploading ? "Importing..." : "Import findings"}
            </Button>
            <label
              htmlFor={inputId}
              className={cn(
                buttonVariants({ variant: "outline" }),
                isUploading && "pointer-events-none opacity-50"
              )}
            >
              Select another file
            </label>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
