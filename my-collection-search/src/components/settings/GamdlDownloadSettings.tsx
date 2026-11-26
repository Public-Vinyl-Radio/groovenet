"use client";

import { Box, Checkbox, NativeSelect, Spinner, Text } from "@chakra-ui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GamdlSettingsChanges } from "@groovenet/contracts";
import { useUsername } from "@/providers/UsernameProvider";
import { queryKeys } from "@/lib/queryKeys";
import { fetchGamdlSettings, updateGamdlSettings } from "@/services/internalApi/settings";
import { AUDIO_QUALITY_OPTIONS } from "@/types/gamdl";
import SettingsRow from "./SettingsRow";

export default function GamdlDownloadSettings() {
  const { friend } = useUsername();
  const friendId = friend?.id ?? 0;
  const client = useQueryClient();
  const key = queryKeys.gamdlSettings(friendId);
  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchGamdlSettings(friendId),
    enabled: friendId > 0,
  });
  const save = useMutation({
    mutationFn: (changes: GamdlSettingsChanges) =>
      updateGamdlSettings({ ...changes, friend_id: friendId }),
    onSuccess: (response) =>
      client.setQueryData(queryKeys.gamdlSettings(response.settings.friend_id), {
        settings: response.settings,
      }),
  });
  if (!friendId) return <Text>Select a library to set its download quality.</Text>;
  if (query.isPending) return <Spinner aria-label="Loading download settings" />;
  if (query.isError) return <Text role="alert">Could not load download settings.</Text>;
  const settings = query.data.settings;
  return (
    <Box borderWidth="outline" borderColor="border.ink" borderRadius="md" px={{ base: 4, md: 5 }}>
      <SettingsRow
        label="Download quality"
        help="Lossless needs the opt-in wrapper and a signed-in session. Downloads are stored as FLAC; AAC remains the default."
      >
        <NativeSelect.Root disabled={save.isPending}>
          <NativeSelect.Field
            aria-label="Download quality"
            value={settings.audio_quality}
            onChange={(event) =>
              save.mutate({
                audio_quality: event.target.value as GamdlSettingsChanges["audio_quality"],
              })
            }
          >
            {AUDIO_QUALITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
      </SettingsRow>
      <SettingsRow
        divider
        label="Lossless sample-rate cap"
        help="Rates above this cap are downsampled during FLAC conversion. At or below the cap, the conversion is bit-exact."
      >
        <NativeSelect.Root disabled={save.isPending}>
          <NativeSelect.Field
            aria-label="Lossless sample-rate cap"
            value={settings.sample_rate_cap}
            onChange={(event) =>
              save.mutate({
                sample_rate_cap: Number(
                  event.target.value,
                ) as GamdlSettingsChanges["sample_rate_cap"],
              })
            }
          >
            <option value={44100}>44.1 kHz</option>
            <option value={48000}>48 kHz (default)</option>
            <option value={96000}>96 kHz</option>
            <option value={192000}>192 kHz</option>
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
      </SettingsRow>
      <SettingsRow
        divider
        label="Retry lossless failures as AAC"
        help="On by default. A failed lossless attempt retries once using browser cookies; the job log records the fallback."
      >
        <Checkbox.Root
          checked={settings.lossless_fallback}
          disabled={save.isPending}
          onCheckedChange={(event) => save.mutate({ lossless_fallback: event.checked === true })}
        >
          <Checkbox.HiddenInput />
          <Checkbox.Control />
          <Checkbox.Label>Allow AAC fallback</Checkbox.Label>
        </Checkbox.Root>
      </SettingsRow>
      {save.isError && <Text role="alert">Could not save download settings. Try again.</Text>}
      {save.isSuccess && <Text role="status">Download settings saved.</Text>}
    </Box>
  );
}
