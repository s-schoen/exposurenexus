import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils.ts";

describe("cn", () => {
  it("keeps the 13px text size next to a text color", () => {
    expect(cn("text-13", "text-muted-foreground")).toBe("text-13 text-muted-foreground");
  });

  it("lets a later text size replace the 13px size", () => {
    expect(cn("text-13", "text-sm")).toBe("text-sm");
  });

  it("treats the theme shadows as shadows", () => {
    expect(cn("shadow-overlay", "shadow-none")).toBe("shadow-none");
  });
});
