import { toast } from "sonner"
import { APIError } from "@/api/common.ts"

export const FORBIDDEN_ACTION_MESSAGE = "You are not allowed to do that."

export function isForbiddenAPIError(error: unknown): boolean {
  return error instanceof APIError && error.statusCode === 403
}

export function actionErrorMessage(
  error: unknown,
  fallbackMessage: string
): string {
  if (isForbiddenAPIError(error)) {
    return FORBIDDEN_ACTION_MESSAGE
  }

  return fallbackMessage
}

export function toastActionError(
  error: unknown,
  fallbackMessage: string
): void {
  toast.error(actionErrorMessage(error, fallbackMessage))
}
