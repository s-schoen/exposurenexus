import { beforeEach, describe, expect, it, vi } from "vitest";

import { APIError } from "@/api/common.ts";
import {
  FORBIDDEN_ACTION_MESSAGE,
  actionErrorMessage,
  isForbiddenAPIError,
  toastActionError,
} from "@/lib/action-error-toast.ts";

const { toastErrorMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: toastErrorMock,
  },
}));

describe("action error toast helpers", () => {
  beforeEach(() => {
    toastErrorMock.mockClear();
  });

  it("detects forbidden API errors", () => {
    expect(isForbiddenAPIError(new APIError(403, "Forbidden"))).toBe(true);
    expect(isForbiddenAPIError(new APIError(400, "Bad Request"))).toBe(false);
    expect(isForbiddenAPIError(new Error("Forbidden"))).toBe(false);
  });

  it("uses the not-allowed message for forbidden API errors", () => {
    expect(actionErrorMessage(new APIError(403, "Forbidden"), "Fallback")).toBe(
      FORBIDDEN_ACTION_MESSAGE,
    );
  });

  it("uses the fallback message for non-forbidden errors", () => {
    expect(actionErrorMessage(new APIError(500, "Server Error"), "Fallback")).toBe("Fallback");
    expect(actionErrorMessage(new Error("Network error"), "Fallback")).toBe("Fallback");
  });

  it("shows a toast with the resolved action error message", () => {
    toastActionError(new APIError(403, "Forbidden"), "Fallback");

    expect(toastErrorMock).toHaveBeenCalledWith(FORBIDDEN_ACTION_MESSAGE);
  });
});
