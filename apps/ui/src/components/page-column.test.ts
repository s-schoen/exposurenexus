import { describe, expect, it } from "vitest";

import { isPageColumnPath } from "@/components/page-column.tsx";

describe("isPageColumnPath", () => {
  it.each([
    "/settings/users/8f74bc56-0ac3-47ef-b7e6-8df2c42fb3c0/edit",
    "/vulnerabilities/8f74bc56-0ac3-47ef-b7e6-8df2c42fb3c0/edit",
    "/findings/import",
  ])("puts %s in the page column", (pathname) => {
    expect(isPageColumnPath(pathname)).toBe(true);
  });

  it.each([
    "/settings/users",
    "/settings/roles/",
    "/settings/roles/8f74bc56-0ac3-47ef-b7e6-8df2c42fb3c0",
    "/settings/users/abc/",
  ])("renders the settings page %s full width", (pathname) => {
    expect(isPageColumnPath(pathname)).toBe(false);
  });

  it.each(["/findings", "/assets/web-01", "/findings/renew", "/findings/new", "/assets/import"])(
    "leaves %s full width",
    (pathname) => {
      expect(isPageColumnPath(pathname)).toBe(false);
    },
  );
});
