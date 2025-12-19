import { createFileRoute } from "@tanstack/react-router"
import { AlertCircleIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx"

export const Route = createFileRoute("/_authenticated/")({
  component: App
})

function App() {
  return (
    <div className="w-full items-start">
      <Alert className="w-full" variant="destructive">
        <AlertCircleIcon />
        <AlertTitle>WIP</AlertTitle>
        <AlertDescription>Not implemented yet</AlertDescription>
      </Alert>
    </div>
  )
}
