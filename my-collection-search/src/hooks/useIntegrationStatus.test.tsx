// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

const mocks = vi.hoisted(() => ({ useHousehold: vi.fn(), fetchIntegrationStatus: vi.fn() }));
vi.mock("@/providers/HouseholdProvider", () => ({ useHousehold: mocks.useHousehold }));
vi.mock("@/services/internalApi/settings", () => ({
  fetchIntegrationStatus: mocks.fetchIntegrationStatus,
}));

import { useIntegrationStatus } from "./useIntegrationStatus";

function Probe() {
  const { isOwner, status } = useIntegrationStatus();
  return (
    <p data-testid="out">
      {String(isOwner)}:{status ? "loaded" : "none"}
    </p>
  );
}

beforeEach(() => vi.resetAllMocks());

describe("useIntegrationStatus", () => {
  it("fetches for the owner", async () => {
    mocks.useHousehold.mockReturnValue({ data: { current: { is_owner: true } } });
    mocks.fetchIntegrationStatus.mockResolvedValue({ keys: {}, embedding_models: [] });
    renderWithProviders(<Probe />);
    await waitFor(() => expect(screen.getByTestId("out").textContent).toBe("true:loaded"));
  });

  it("never fetches for anyone else", () => {
    mocks.useHousehold.mockReturnValue({ data: { current: { is_owner: false } } });
    renderWithProviders(<Probe />);
    expect(screen.getByTestId("out").textContent).toBe("false:none");
    expect(mocks.fetchIntegrationStatus).not.toHaveBeenCalled();
  });
});
