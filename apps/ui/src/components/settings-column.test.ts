import { describe, expect, it } from "vitest";

import { isSettingsColumnPath } from "@/components/settings-column.tsx";

describe("isSettingsColumnPath", () => {
  it.each([
    "/settings",
    "/settings/users",
    "/settings/roles/",
    "/settings/custom-fields/new",
    "/settings/users/8f74bc56-0ac3-47ef-b7e6-8df2c42fb3c0/edit",
  ])("puts %s in the settings column", (pathname) => {
    expect(isSettingsColumnPath(pathname)).toBe(true);
  });

  it.each(["/settings/roles/8f74bc56-0ac3-47ef-b7e6-8df2c42fb3c0", "/settings/users/abc/"])(
    "renders the detail page %s full width",
    (pathname) => {
      expect(isSettingsColumnPath(pathname)).toBe(false);
    },
  );

  it("leaves pages outside Settings alone", () => {
    expect(isSettingsColumnPath("/assets/web-01")).toBe(false);
  });
});
