import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useIsMobile } from "@/components/ui/use-mobile.ts";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useIsMobile", () => {
  it("tracks the 768px breakpoint and unsubscribes on unmount", () => {
    const listeners = new Set<EventListener>();
    const addEventListener = vi.fn((_type: string, listener: EventListener) => {
      listeners.add(listener);
    });
    const removeEventListener = vi.fn((_type: string, listener: EventListener) => {
      listeners.delete(listener);
    });
    const matchMedia = vi.fn((query: string) => ({
      media: query,
      matches: window.innerWidth < 768,
      onchange: null,
      addEventListener,
      removeEventListener,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 1024,
    });
    vi.stubGlobal("matchMedia", matchMedia);

    const { result, unmount } = renderHook(() => useIsMobile());

    expect(result.current).toBe(false);
    expect(matchMedia).toHaveBeenCalledWith("(max-width: 767px)");
    expect(listeners).toHaveLength(1);

    const resizeTo = (width: number) => {
      window.innerWidth = width;
      act(() => {
        for (const listener of listeners) {
          listener(new Event("change"));
        }
      });
    };

    resizeTo(767);
    expect(result.current).toBe(true);
    resizeTo(768);
    expect(result.current).toBe(false);
    resizeTo(767);
    expect(result.current).toBe(true);

    unmount();
    expect(removeEventListener).toHaveBeenCalledOnce();
    expect(listeners).toHaveLength(0);
  });
});
