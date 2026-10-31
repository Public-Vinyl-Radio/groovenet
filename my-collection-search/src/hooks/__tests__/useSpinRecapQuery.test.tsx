// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

const api = vi.hoisted(() => ({ getSpinRecap: vi.fn() }));
vi.mock("@/services/internalApi/spins", () => api);

import { useSpinRecapQuery } from "../useSpinsQuery";

function setup(params: Parameters<typeof useSpinRecapQuery>[0], enabled?: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...renderHook(() => useSpinRecapQuery(params, { enabled }), { wrapper }) };
}

describe("useSpinRecapQuery", () => {
  it("loads the month under the spins root", async () => {
    const recap = { stats: { spins: { value: 3, previous: 1 } } };
    api.getSpinRecap.mockReset().mockResolvedValue(recap);
    const { client, result } = setup({ friend_id: 7, month: "2026-10" });

    expect(result.current.recap).toBeNull();
    await waitFor(() => expect(result.current.recap).toEqual(recap));
    expect(api.getSpinRecap).toHaveBeenCalledWith({ friend_id: 7, month: "2026-10" });
    const key = queryKeys.spinRecap({ friend_id: 7, month: "2026-10" });
    expect(client.getQueryData(key)).toEqual(recap);
    expect(key.slice(0, 1)).toEqual(queryKeys.spinsRoot());
  });

  it("can be disabled", () => {
    api.getSpinRecap.mockReset();
    setup({ friend_id: 0, month: "2026-10" }, false);
    expect(api.getSpinRecap).not.toHaveBeenCalled();
  });
});
