// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const fetchGenrePage = vi.hoisted(() => vi.fn());
vi.mock("@/services/internalApi/genres", () => ({ fetchGenrePage }));

import { useGenrePageQuery } from "../useGenrePageQuery";

function render(slug: string, friendId: number | undefined) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useGenrePageQuery(slug, friendId), { wrapper });
}

describe("useGenrePageQuery", () => {
  beforeEach(() => {
    fetchGenrePage.mockReset().mockResolvedValue({ genre: { slug: "cumbia" } });
  });

  it("loads the page for the current collection", async () => {
    const { result } = render("cumbia", 6);

    await waitFor(() => expect(result.current.data).toEqual({ genre: { slug: "cumbia" } }));
    expect(fetchGenrePage).toHaveBeenCalledWith("cumbia", 6);
  });

  it("waits until the collection is known", () => {
    const { result } = render("cumbia", undefined);

    expect(result.current.fetchStatus).toBe("idle");
    expect(fetchGenrePage).not.toHaveBeenCalled();
  });
});
