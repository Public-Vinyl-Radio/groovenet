import React from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getIngestPipelineStatsMock = vi.hoisted(() => vi.fn());
const listRecentDetectionsMock = vi.hoisted(() => vi.fn());
const getIngestRetentionStatusMock = vi.hoisted(() => vi.fn());
const useQueryMock = vi.hoisted(() => vi.fn());

vi.mock("@/services/internalApi/vinylPipeline", () => ({
  getIngestPipelineStats: getIngestPipelineStatsMock,
  listRecentDetections: listRecentDetectionsMock,
  getIngestRetentionStatus: getIngestRetentionStatusMock,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: useQueryMock,
}));

import {
  useIngestRetentionQuery,
  useIngestStatsQuery,
  useRecentDetectionsQuery,
} from "./useVinylPipelineQuery";

function StatsHarness({ minutes, sourceId }: { minutes: number; sourceId?: string }) {
  useIngestStatsQuery({ minutes, source_id: sourceId });
  return null;
}

function DetectionsHarness({ sourceId }: { sourceId?: string }) {
  useRecentDetectionsQuery({ source_id: sourceId, limit: 30 });
  return null;
}

function RetentionHarness() {
  useIngestRetentionQuery();
  return null;
}

beforeEach(() => {
  getIngestPipelineStatsMock.mockReset();
  listRecentDetectionsMock.mockReset();
  getIngestRetentionStatusMock.mockReset();
  useQueryMock.mockReset();
  useQueryMock.mockReturnValue({ data: undefined, error: null, isLoading: false });
});

describe("useIngestStatsQuery", () => {
  it("queries stats with the given params and a 15s poll by default", async () => {
    renderToString(<StatsHarness minutes={15} sourceId="aswitch" />);

    expect(useQueryMock).toHaveBeenCalledOnce();
    const options = useQueryMock.mock.calls[0][0] as {
      queryFn: () => Promise<unknown>;
      refetchInterval: number;
    };
    expect(options.refetchInterval).toBe(15000);

    getIngestPipelineStatsMock.mockResolvedValue({});
    await options.queryFn();
    expect(getIngestPipelineStatsMock).toHaveBeenCalledWith({
      minutes: 15,
      source_id: "aswitch",
    });
  });

  it("lets the caller override the poll interval", () => {
    function Harness() {
      useIngestStatsQuery({ minutes: 60 }, { refetchInterval: 30000 });
      return null;
    }
    renderToString(<Harness />);
    const options = useQueryMock.mock.calls[0][0] as { refetchInterval: number };
    expect(options.refetchInterval).toBe(30000);
  });
});

describe("useRecentDetectionsQuery", () => {
  it("queries detections with a 5s poll by default — the live timeline", async () => {
    renderToString(<DetectionsHarness sourceId="aswitch" />);

    const options = useQueryMock.mock.calls[0][0] as {
      queryFn: () => Promise<unknown>;
      refetchInterval: number;
    };
    expect(options.refetchInterval).toBe(5000);

    listRecentDetectionsMock.mockResolvedValue({ detections: [], count: 0 });
    await options.queryFn();
    expect(listRecentDetectionsMock).toHaveBeenCalledWith({
      source_id: "aswitch",
      limit: 30,
    });
  });

  it("can be disabled", () => {
    function Harness() {
      useRecentDetectionsQuery({}, { enabled: false });
      return null;
    }
    renderToString(<Harness />);
    const options = useQueryMock.mock.calls[0][0] as { enabled: boolean };
    expect(options.enabled).toBe(false);
  });
});

describe("useIngestRetentionQuery", () => {
  it("queries retention status", async () => {
    renderToString(<RetentionHarness />);

    const options = useQueryMock.mock.calls[0][0] as {
      queryFn: () => Promise<unknown>;
    };
    getIngestRetentionStatusMock.mockResolvedValue({});
    await options.queryFn();
    expect(getIngestRetentionStatusMock).toHaveBeenCalledWith();
  });
});
