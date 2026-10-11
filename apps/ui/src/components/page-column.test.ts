import { describe, expect, it } from "vitest";

import { isPageColumnPath } from "@/components/page-column.tsx";

describe("isPageColumnPath", () => {
  it.each([
    "/settings",
    "/settings/users",
    "/settings/roles/",
    "/settings/custom-fields/new",
    "/settings/users/8f74bc56-0ac3-47ef-b7e6-8df2c42fb3c0/edit",
    "/findings/new",
    "/vulnerabilities/new/",
    "/vulnerabilities/8f74bc56-0ac3-47ef-b7e6-8df2c42fb3c0/edit",
  ])("puts %s in the page column", (pathname) => {
    expect(isPageColumnPath(pathname)).toBe(true);
  });

  it.each(["/settings/roles/8f74bc56-0ac3-47ef-b7e6-8df2c42fb3c0", "/settings/users/abc/"])(
    "renders the settings detail page %s full width",
    (pathname) => {
      expect(isPageColumnPath(pathname)).toBe(false);
    },
  );

  it.each(["/findings", "/findings/import", "/assets/web-01", "/findings/renew"])(
    "leaves %s full width",
    (pathname) => {
      expect(isPageColumnPath(pathname)).toBe(false);
    },
  );
});
