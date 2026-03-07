import { afterEach, describe, expect, it, vi } from "vitest";
import { confirmAction } from "./confirm.client";

describe("confirmAction", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the browser confirm result", () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal("window", { confirm });

    expect(confirmAction("Delete restaurant?")).toBe(true);
    expect(confirm).toHaveBeenCalledWith("Delete restaurant?");
  });

  it("returns false during non-browser execution", () => {
    vi.stubGlobal("window", undefined);

    expect(confirmAction("Delete restaurant?")).toBe(false);
  });
});
