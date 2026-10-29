"use client";

import { useState } from "react";
import type React from "react";
import { cleanSoundcloudUrl } from "@/lib/url";
import { extractBpmConfidence } from "@/lib/essentiaBpm";
import { extractKeyAnalysis } from "@/lib/essentiaKey";
import { toaster } from "@/components/ui/toaster";
import { useAsyncAnalyzeTrackMutation } from "@/hooks/useAsyncAnalyzeTrackMutation";
import { useUploadTrackAudioMutation } from "@/hooks/useUploadTrackAudioMutation";
import type { TrackEditFormProps, TrackEditFormState } from "@/components/track-edit/types";

type UseTrackEditAudioActionsArgs = {
  form: TrackEditFormState;
  setForm: React.Dispatch<React.SetStateAction<TrackEditFormState>>;
  onSave: (data: TrackEditFormProps) => void | Promise<void>;
};

export function useTrackEditAudioActions({ form, setForm, onSave }: UseTrackEditAudioActionsArgs) {
  const [removeAudioLoading, setRemoveAudioLoading] = useState(false);

  const { mutateAsync: analyze, isPending: analyzeLoading } = useAsyncAnalyzeTrackMutation();
  const { mutateAsync: uploadAudio, isPending: uploadLoading } = useUploadTrackAudioMutation();

  // Upload the file, then stage the analysis results into the form so the user
  // can review before saving (server persists local_audio_url on its own).
  const handleFileUpload = async (selectedFile: File) => {
    try {
      if (form.friend_id === undefined) {
        throw new Error("Track has no friend_id");
      }
      const { analysis: data } = await uploadAudio({
        file: selectedFile,
        track_id: form.track_id,
        friend_id: form.friend_id,
      });
      const bpm_confidence = extractBpmConfidence(data.rhythm);
      const { key, key_confidence } = extractKeyAnalysis(data.tonal);
      setForm((prev) => ({
        ...prev,
        bpm: typeof data.rhythm?.bpm === "number" ? String(Math.round(data.rhythm.bpm)) : prev.bpm,
        bpm_confidence: bpm_confidence ?? prev.bpm_confidence,
        key: key ?? prev.key,
        key_confidence: key_confidence ?? prev.key_confidence,
        danceability:
          typeof data.rhythm?.danceability === "number"
            ? data.rhythm.danceability.toFixed(3)
            : prev.danceability,
        duration_seconds:
          typeof data.metadata?.audio_properties?.length === "number"
            ? Math.round(data.metadata.audio_properties.length)
            : prev.duration_seconds,
      }));

      toaster.create({
        title: "Upload Successful",
        description: "Audio file uploaded and analyzed",
        type: "success",
      });
    } catch (err) {
      toaster.create({
        title: "Upload Failed",
        description: err instanceof Error ? err.message : String(err),
        type: "error",
      });
    }
  };

  const handleAnalyzeAudio = async () => {
    try {
      if (!form.friend_id) {
        throw new Error("Track is missing friend_id");
      }
      const response = await analyze({
        apple_music_url: form.apple_music_url,
        youtube_url: form.youtube_url,
        soundcloud_url: cleanSoundcloudUrl(form.soundcloud_url),
        track_id: form.track_id,
        friend_id: form.friend_id,
      });
      console.log("Analysis job queued:", response);

      toaster.create({
        title: "Audio Analysis Queued",
        description: `Job ID: ${response.jobId}. The track will be analyzed automatically. Check the Job Queue for progress.`,
        type: "success",
      });
    } catch (err) {
      console.error("Audio analysis error:", err);
      toaster.create({
        title: "Audio Analysis Failed",
        description: "Error queuing audio analysis: " + (err instanceof Error ? err.message : err),
        type: "error",
      });
    }
  };

  const handleRemoveAudio = async () => {
    setRemoveAudioLoading(true);
    try {
      if (!form.friend_id) {
        throw new Error("Track is missing friend_id");
      }

      await Promise.resolve(
        onSave({
          ...form,
          bpm: Number(form.bpm) || null,
          key: form.key || null,
          danceability: Number(form.danceability) || null,
          duration_seconds: Number(form.duration_seconds) || null,
          friend_id: form.friend_id,
          soundcloud_url: cleanSoundcloudUrl(form.soundcloud_url),
          local_audio_url: null,
        }),
      );

      toaster.create({
        title: "Audio Removed",
        description: "Local audio file has been removed",
        type: "success",
      });
    } catch (err) {
      toaster.create({
        title: "Remove Audio Failed",
        description: err instanceof Error ? err.message : "Unknown error",
        type: "error",
      });
      throw err;
    } finally {
      setRemoveAudioLoading(false);
    }
  };

  const analyzeDisabled =
    analyzeLoading || (!form.apple_music_url && !form.youtube_url && !form.soundcloud_url);

  return {
    analyzeLoading,
    analyzeDisabled,
    uploadLoading,
    handleAnalyzeAudio,
    handleFileUpload,
    handleRemoveAudio,
    removeAudioLoading,
  };
}
