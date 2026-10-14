import { CircleAlert, FileJson2, ShieldAlert, UploadCloud, X } from "lucide-react";
import { useId, useState } from "react";

import { FormActions } from "@/components/form-dialog.tsx";
import { Alert, AlertTitle } from "@/components/ui/alert.tsx";
import { Button, buttonVariants } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { usePageMeta } from "@/hooks/use-page-meta.tsx";
import { cn } from "@/lib/utils.ts";

import type { ChangeEvent } from "react";

function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function ImportFindingsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const inputId = useId();

  usePageMeta({
    title: "Import findings",
    icon: ShieldAlert,
    breadcrumbs: [{ label: "Findings", to: "/findings" }],
  });

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const nextFile = e.target.files?.[0] ?? null;
    setFile(nextFile);
  };

  const handleClearFile = () => {
    setFile(null);
    setInputKey((current) => current + 1);
  };

  return (
    <div className="flex flex-col gap-5">
      <Alert>
        <CircleAlert />
        <AlertTitle>Importing scan results is temporarily unavailable.</AlertTitle>
      </Alert>

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
        className="flex w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted px-6 py-10 text-center transition-colors duration-100 hover:border-border-strong hover:bg-accent focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 focus-visible:outline-none"
      >
        <UploadCloud className="size-8 text-muted-foreground" strokeWidth={1.5} />
        <div className="text-sm font-medium text-foreground-secondary">
          {file ? "Replace selected file" : "Choose a file to import"}
        </div>
      </label>

      {file ? (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <FileJson2 className="mt-0.5 size-4 text-muted-foreground" strokeWidth={1.5} />
              <div className="space-y-1">
                <div className="font-medium break-all">{file.name}</div>
                <div className="text-sm text-muted-foreground">
                  {formatFileSize(file.size)}
                  {file.type ? ` • ${file.type}` : ""}
                </div>
              </div>
            </div>
            <Button type="button" variant="ghost" onClick={handleClearFile}>
              <X />
              Clear
            </Button>
          </div>
        </div>
      ) : null}

      <FormActions>
        {file ? (
          <label htmlFor={inputId} className={cn(buttonVariants({ variant: "outline" }))}>
            Select another file
          </label>
        ) : null}
        <Button type="button" disabled>
          <UploadCloud />
          Import findings unavailable
        </Button>
      </FormActions>
    </div>
  );
}
