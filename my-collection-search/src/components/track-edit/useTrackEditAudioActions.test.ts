// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { TrackEditFormState } from "@/components/track-edit/types";

const { mockUpload, mockAnalyze, mockToast } = vi.hoisted(() => ({
  mockUpload: vi.fn(),
  mockAnalyze: vi.fn(),
  mockToast: vi.fn(),
}));

vi.mock("@/hooks/useUploadTrackAudioMutation", () => ({
  useUploadTrackAudioMutation: () => ({ mutateAsync: mockUpload, isPending: false }),
}));
vi.mock("@/hooks/useAsyncAnalyzeTrackMutation", () => ({
  useAsyncAnalyzeTrackMutation: () => ({ mutateAsync: mockAnalyze, isPending: false }),
}));
vi.mock("@/components/ui/toaster", () => ({
  toaster: { create: (...args: unknown[]) => mockToast(...args) },
}));

import { useTrackEditAudioActions } from "./useTrackEditAudioActions";

function baseForm(): TrackEditFormState {
  return {
    track_id: "t1",
    album: "",
    title: "",
    artist: "",
    local_tags: "",
    track_genres: [],
    notes: "",
    bpm: "",
    key: "",
    bpm_confidence: null,
    key_confidence: null,
    danceability: "",
    apple_music_url: "",
    youtube_url: "",
    soundcloud_url: "",
    star_rating: 0,
    friend_id: 1,
  };
}

/** Runs the setForm updater the hook staged, against the given previous form. */
function applyStagedUpdate(setForm: ReturnType<typeof vi.fn>, prevForm: TrackEditFormState) {
  const updater = setForm.mock.calls[0][0] as (prev: TrackEditFormState) => TrackEditFormState;
  return updater(prevForm);
}

describe("useTrackEditAudioActions key staging (#524)", () => {
  it("applies the edma key and its confidence from the upload response", async () => {
    mockUpload.mockResolvedValue({
      analysis: { tonal: { key_edma: { key: "F", scale: "major", strength: 0.42 } } },
    });
    const setForm = vi.fn();
    const form = baseForm();
    const { result } = renderHook(() =>
      useTrackEditAudioActions({ form, setForm, onSave: vi.fn() }),
    );

    await act(async () => {
      await result.current.handleFileUpload(new File([], "song.mp3"));
    });

    const next = applyStagedUpdate(setForm, form);
    expect(next.key).toBe("F major");
    expect(next.key_confidence).toBe(0.42);
  });

  it("keeps the previous key when the upload has no usable key estimate", async () => {
    mockUpload.mockResolvedValue({ analysis: {} });
    const setForm = vi.fn();
    const form = { ...baseForm(), key: "D minor", key_confidence: 0.9 };
    const { result } = renderHook(() =>
      useTrackEditAudioActions({ form, setForm, onSave: vi.fn() }),
    );

    await act(async () => {
      await result.current.handleFileUpload(new File([], "song.mp3"));
    });

    const next = applyStagedUpdate(setForm, form);
    expect(next.key).toBe("D minor");
    expect(next.key_confidence).toBe(0.9);
  });

  it("sends the track's friend_id with the upload", async () => {
    mockUpload.mockResolvedValue({ analysis: {} });
    const form = { ...baseForm(), track_id: "t9", friend_id: 4 };
    const { result } = renderHook(() =>
      useTrackEditAudioActions({ form, setForm: vi.fn(), onSave: vi.fn() }),
    );
    const file = new File([], "song.mp3");

    await act(async () => {
      await result.current.handleFileUpload(file);
    });

    expect(mockUpload).toHaveBeenCalledWith({ file, track_id: "t9", friend_id: 4 });
  });

  it("reports an error instead of uploading when the track has no friend_id", async () => {
    const form = { ...baseForm(), friend_id: undefined };
    const { result } = renderHook(() =>
      useTrackEditAudioActions({ form, setForm: vi.fn(), onSave: vi.fn() }),
    );

    await act(async () => {
      await result.current.handleFileUpload(new File([], "song.mp3"));
    });

    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Upload Failed", type: "error" }),
    );
  });

  it("surfaces an upload failure as an error toast instead of staging anything", async () => {
    mockUpload.mockRejectedValue(new Error("network down"));
    const setForm = vi.fn();
    const form = baseForm();
    const { result } = renderHook(() =>
      useTrackEditAudioActions({ form, setForm, onSave: vi.fn() }),
    );

    await act(async () => {
      await result.current.handleFileUpload(new File([], "song.mp3"));
    });

    expect(setForm).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Upload Failed", type: "error" }),
    );
  });
});

describe("useTrackEditAudioActions bpm confidence staging (#531)", () => {
  it("applies the bpm and its histogram margin from the upload response", async () => {
    mockUpload.mockResolvedValue({
      analysis: {
        rhythm: {
          bpm: 103.48,
          bpm_histogram_first_peak_weight: 0.3,
          bpm_histogram_second_peak_weight: 0.28,
        },
      },
    });
    const setForm = vi.fn();
    const form = baseForm();
    const { result } = renderHook(() =>
      useTrackEditAudioActions({ form, setForm, onSave: vi.fn() }),
    );

    await act(async () => {
      await result.current.handleFileUpload(new File([], "song.mp3"));
    });

    const next = applyStagedUpdate(setForm, form);
    expect(next.bpm).toBe("103");
    expect(next.bpm_confidence).toBe(0.02);
  });

  it("keeps the previous confidence when the upload has no histogram", async () => {
    mockUpload.mockResolvedValue({ analysis: {} });
    const setForm = vi.fn();
    const form = { ...baseForm(), bpm: "120", bpm_confidence: 0.4 };
    const { result } = renderHook(() =>
      useTrackEditAudioActions({ form, setForm, onSave: vi.fn() }),
    );

    await act(async () => {
      await result.current.handleFileUpload(new File([], "song.mp3"));
    });

    expect(applyStagedUpdate(setForm, form).bpm_confidence).toBe(0.4);
  });
});
