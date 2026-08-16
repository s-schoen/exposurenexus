import { CircleAlert, FileJson2, UploadCloud, X } from "lucide-react";
import { useId, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Button, buttonVariants } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { usePageMeta } from "@/context/page.tsx";
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
    title: "Import Findings",
    description: "Automated scan imports are currently work in progress.",
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
    <div className="flex w-full flex-col">
      <Card className="w-full border-border/70">
        <CardHeader>
          <CardTitle>Upload file</CardTitle>
          <CardDescription>
            Select a nuclei export file to prepare for the future import workflow.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Alert>
            <CircleAlert />
            <AlertTitle>Automated imports are work in progress</AlertTitle>
            <AlertDescription>
              Importing scan results is temporarily unavailable while observation-based finding
              matching is being implemented.
            </AlertDescription>
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
                <Button type="button" variant="ghost" onClick={handleClearFile}>
                  <X />
                  Clear
                </Button>
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button type="button" disabled>
              <UploadCloud />
              Import findings unavailable
            </Button>
            <label htmlFor={inputId} className={cn(buttonVariants({ variant: "outline" }))}>
              Select another file
            </label>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
