import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react"

const mocks = vi.hoisted(() => ({
  toastActionError: vi.fn(),
  toastSuccess: vi.fn(),
  uploadFindingFile: vi.fn(),
  usePageMeta: vi.fn()
}))

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal()

  return Object.assign({}, actual, {
    createFileRoute: () => (options: Record<string, unknown>) => ({
      options
    })
  })
})

vi.mock("@/api/finding.ts", () => ({
  uploadFindingFile: mocks.uploadFindingFile
}))

vi.mock("@/context/page.tsx", () => ({
  usePageMeta: mocks.usePageMeta
}))

vi.mock("@/lib/action-error-toast.ts", () => ({
  actionErrorMessage: (_error: unknown, fallback: string) => fallback,
  toastActionError: mocks.toastActionError
}))

vi.mock("sonner", () => ({
  toast: {
    success: mocks.toastSuccess
  }
}))

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })

  return {
    promise,
    reject,
    resolve
  }
}

async function renderImportRoute() {
  const { RouteComponent } =
    await import("@/routes/_authenticated/findings/import.tsx")

  return render(<RouteComponent />)
}

describe("findings import route", () => {
  beforeEach(() => {
    mocks.toastActionError.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.uploadFindingFile.mockReset()
    mocks.usePageMeta.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it("shows a no-file error when importing without selecting a file", async () => {
    await renderImportRoute()

    fireEvent.click(screen.getByRole("button", { name: /import findings/i }))

    expect(
      await screen.findByText(
        "Select a nuclei export file before starting the import."
      )
    ).toBeTruthy()
    expect(mocks.uploadFindingFile).not.toHaveBeenCalled()
  })

  it("shows selected file metadata and clears the file", async () => {
    await renderImportRoute()
    const file = new File(["{}"], "nuclei.json", {
      type: "application/json"
    })

    fireEvent.change(screen.getByLabelText(/select findings import file/i), {
      target: {
        files: [file]
      }
    })

    expect(screen.getByText("nuclei.json")).toBeTruthy()
    expect(screen.getByText(/2 B/)).toBeTruthy()
    expect(screen.getByText(/application\/json/)).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: /clear/i }))

    await waitFor(() => {
      expect(screen.queryByText("nuclei.json")).toBeNull()
    })
  })

  it("uploads selected files and resets the selection on success", async () => {
    await renderImportRoute()
    const file = new File(["{}"], "nuclei.json", {
      type: "application/json"
    })
    mocks.uploadFindingFile.mockResolvedValueOnce(undefined)

    fireEvent.change(screen.getByLabelText(/select findings import file/i), {
      target: {
        files: [file]
      }
    })
    fireEvent.click(screen.getByRole("button", { name: /import findings/i }))

    await waitFor(() => {
      expect(mocks.uploadFindingFile).toHaveBeenCalledWith("nuclei", file)
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Imported nuclei.json")
    expect(screen.queryByText("nuclei.json")).toBeNull()
  })

  it("disables upload controls while import is pending", async () => {
    await renderImportRoute()
    const deferred = createDeferred<void>()
    const file = new File(["{}"], "nuclei.json", {
      type: "application/json"
    })
    mocks.uploadFindingFile.mockReturnValueOnce(deferred.promise)

    fireEvent.change(screen.getByLabelText(/select findings import file/i), {
      target: {
        files: [file]
      }
    })
    fireEvent.click(screen.getByRole("button", { name: /import findings/i }))

    expect(
      (await screen.findByRole("button", { name: /importing/i })).hasAttribute(
        "disabled"
      )
    ).toBe(true)
    expect(
      screen.getByRole("button", { name: /clear/i }).hasAttribute("disabled")
    ).toBe(true)

    deferred.resolve()
  })

  it("shows upload failures and keeps the selected file", async () => {
    await renderImportRoute()
    const error = new Error("Upload failed")
    const file = new File(["{}"], "nuclei.json", {
      type: "application/json"
    })
    mocks.uploadFindingFile.mockRejectedValueOnce(error)

    fireEvent.change(screen.getByLabelText(/select findings import file/i), {
      target: {
        files: [file]
      }
    })
    fireEvent.click(screen.getByRole("button", { name: /import findings/i }))

    await waitFor(() => {
      expect(mocks.toastActionError).toHaveBeenCalledWith(
        error,
        `Failed to upload findings for import: ${error}`
      )
    })
    expect(
      screen.getByText(`Failed to upload findings for import: ${error}`)
    ).toBeTruthy()
    expect(screen.getByText("nuclei.json")).toBeTruthy()
  })
})
