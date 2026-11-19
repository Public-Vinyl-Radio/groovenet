// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { registerNavigationGuard } from "@/lib/navigationGuard";
import { useGuardedRouter } from "./useGuardedRouter";

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

afterEach(() => vi.clearAllMocks());

describe("useGuardedRouter (#1231)", () => {
  it("navigates at once with no guard, and keeps the router's other methods", () => {
    const { result } = renderHook(() => useGuardedRouter());
    result.current.push("/tracks", { scroll: false });
    result.current.replace("/albums");
    result.current.back();
    result.current.refresh();
    expect(router.push).toHaveBeenCalledWith("/tracks", { scroll: false });
    expect(router.replace).toHaveBeenCalledWith("/albums");
    expect(router.back).toHaveBeenCalledOnce();
    expect(router.refresh).toHaveBeenCalledOnce();
  });

  it("hands each navigation to the guard, which may run it later", () => {
    const held: { proceed: () => void; href?: string }[] = [];
    const remove = registerNavigationGuard((attempt) => {
      held.push(attempt);
      return true;
    });
    const { result } = renderHook(() => useGuardedRouter());
    result.current.push("/tracks");
    result.current.replace("/albums");
    result.current.back();
    expect(router.push).not.toHaveBeenCalled();
    expect(held.map((a) => a.href)).toEqual(["/tracks", "/albums", undefined]);
    held.forEach((attempt) => attempt.proceed());
    expect(router.push).toHaveBeenCalledWith("/tracks");
    expect(router.replace).toHaveBeenCalledWith("/albums");
    expect(router.back).toHaveBeenCalledOnce();
    remove();
  });
});
