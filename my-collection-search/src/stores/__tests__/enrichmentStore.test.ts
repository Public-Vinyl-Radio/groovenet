import { beforeEach, describe, expect, it } from "vitest";
import { useEnrichmentStore } from "../enrichmentStore";

const initial = useEnrichmentStore.getState();

beforeEach(() => {
  useEnrichmentStore.setState(initial, true);
});

describe("enrichmentStore", () => {
  it("leaves AI metadata off by default and the matchers on (#380)", () => {
    expect(useEnrichmentStore.getState().enrichmentTypes).toEqual({
      llm: false,
      appleMusic: true,
      youtube: true,
      fetchAudio: false,
    });
  });

  it("turns AI metadata on for a session without touching the other sources", () => {
    useEnrichmentStore.getState().setEnrichmentTypes({ llm: true });
    expect(useEnrichmentStore.getState().enrichmentTypes).toMatchObject({ llm: true, appleMusic: true, youtube: true });
  });

  it("keeps the source choices when a run is reset", () => {
    const store = useEnrichmentStore.getState();
    store.setEnrichmentTypes({ llm: true });
    store.setQueue([{ trackId: "t1", friendId: 1 }]);
    store.markResult("t1:1", { saved: true });

    useEnrichmentStore.getState().reset();

    expect(useEnrichmentStore.getState()).toMatchObject({ queue: [], results: {}, enrichmentTypes: { llm: true } });
  });
});
