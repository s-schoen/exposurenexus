import { beforeEach, describe, expect, it, vi } from "vitest";

import { createVulnerabilityRepository } from "./vulnerability-repository.js";

describe("repository factories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a vulnerability catalog repository bound to the injected db", async () => {
    const execute = vi.fn().mockResolvedValue([]);
    const selectAll = vi.fn().mockReturnValue({ execute });
    const selectFrom = vi.fn().mockReturnValue({ selectAll });
    const db = { selectFrom };

    const repository = createVulnerabilityRepository(db as never);

    await repository.list();

    expect(selectFrom).toHaveBeenCalledWith("vulnerability");
    expect(execute).toHaveBeenCalledOnce();
  });
});
