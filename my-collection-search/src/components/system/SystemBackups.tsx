"use client";
import React from "react";
import {
  Box,
  Button,
  Checkbox,
  Flex,
  Grid,
  Input,
  NativeSelect,
  Spinner,
  Switch,
  Text,
} from "@chakra-ui/react";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { StatusTag } from "@/components/ui/RoleTags";
import DatabaseBackups from "@/components/settings/DatabaseBackups";
import {
  fetchBackupPolicy,
  updateBackupPolicy,
  fetchBackupStatus,
  runBackupNow,
  type BackupPolicy,
  type BackupStatus,
} from "@/services/internalApi/settings";
import { BACKUP_RETENTION_PRESETS } from "@/types/backup";
import SystemRow from "./SystemRow";
import { nextScheduledRun, schedulePreset, SCHEDULE_PRESETS } from "./backupSchedule";

const INCLUDES = [
  ["include_database", "Database dumps"],
  ["include_audio_files", "Audio files"],
  ["include_album_covers", "Album covers"],
  ["include_discogs_exports", "Discogs JSON exports"],
  ["include_essentia_files", "Essentia analysis files"],
  ["include_uploads", "Uploads directory"],
] as const;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
export default function SystemBackups() {
  const [policy, setPolicy] = React.useState<BackupPolicy | null>(null);
  const [status, setStatus] = React.useState<BackupStatus | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [error, setError] = React.useState("");
  const [statusError, setStatusError] = React.useState("");
  const [previous, setPrevious] = React.useState<BackupPolicy | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [custom, setCustom] = React.useState(false);
  const [cron, setCron] = React.useState("");
  React.useEffect(() => {
    let active = true;
    void fetchBackupPolicy()
      .then((data) => {
        if (!active) return;
        setPolicy(data.policy);
        setCron(data.policy.schedule_cron);
        setCustom(schedulePreset(data.policy.schedule_cron) === "custom");
      })
      .catch((e) => {
        if (active) setError(message(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    void fetchBackupStatus()
      .then((data) => {
        if (active) setStatus(data.status);
      })
      .catch((e) => {
        if (active) setStatusError(message(e));
      });
    return () => {
      active = false;
    };
  }, []);
  // Disable controls during the request so a slower response cannot overwrite a newer edit.
  const save = async (next: BackupPolicy, undo = false) => {
    const before = policy;
    setPolicy(next);
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const { provider: _provider, updated_at: _updatedAt, ...body } = next;
      const data = await updateBackupPolicy(body);
      setPolicy(data.policy);
      setCron(data.policy.schedule_cron);
      setCustom(schedulePreset(data.policy.schedule_cron) === "custom");
      setPrevious(undo ? null : before);
      setSaved(true);
    } catch (e) {
      setPolicy(before);
      setError(message(e));
    } finally {
      setSaving(false);
    }
  };
  const run = async () => {
    setRunning(true);
    setStatusError("");
    try {
      const data = await runBackupNow();
      setStatus(data.status);
    } catch (e) {
      setStatusError(message(e));
    } finally {
      setRunning(false);
    }
  };
  const next = React.useMemo(
    () => (policy ? nextScheduledRun(policy.schedule_cron) : null),
    [policy],
  );
  return (
    <Box as="section" aria-label="Backups" mt={8}>
      <SectionLabel
        variant="strip"
        mb={4}
        meta={
          <Text
            display={{ base: "none", md: "block" }}
            fontFamily="label"
            fontSize="xs"
            color="fg.muted"
          >
            CHANGES SAVE AS YOU MAKE THEM
          </Text>
        }
      >
        BACKUPS
      </SectionLabel>
      <Box borderWidth="outline" borderColor="border.ink" boxShadow="md" borderRadius="md">
        {loading ? (
          <Spinner m={4} aria-label="Loading backup policy" />
        ) : policy ? (
          <>
            <SystemRow
              label="Remote backups"
              help="Restic snapshots to B2. The password and keys stay on the server."
            >
              <Flex align="center" gap={3} flexWrap="wrap">
                <Switch.Root
                  checked={policy.enabled}
                  disabled={saving}
                  onCheckedChange={(d) => void save({ ...policy, enabled: d.checked })}
                  aria-label="Remote backups"
                  position={{ base: "absolute", md: "static" }}
                  top={4}
                  right={4}
                >
                  <Switch.HiddenInput checked={policy.enabled} readOnly />
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                </Switch.Root>
                <StatusTag tone={status?.status === "failed" ? "missing" : "neutral"}>
                  {status
                    ? `LAST RUN ${new Date(status.finished_at).toLocaleString()} · ${status.status === "success" ? "OK" : status.status.toUpperCase()}`
                    : "Never run"}
                </StatusTag>
                <Button
                  variant="solid"
                  h="44px"
                  ml={{ base: 0, md: "auto" }}
                  w={{ base: "full", md: "auto" }}
                  loading={running}
                  onClick={() => void run()}
                >
                  RUN BACKUP NOW
                </Button>
              </Flex>
              {statusError && (
                <Text role="alert" color="fg.error" mt={2}>
                  {statusError}
                </Text>
              )}
              {status?.error && (
                <Text role="alert" color="fg.error" mt={2}>
                  {status.error}
                </Text>
              )}
            </SystemRow>
            <SystemRow label="Schedule" help="How often a snapshot runs.">
              <Flex gap={4} align="center" flexWrap="wrap">
                <NativeSelect.Root w={{ base: "full", md: "240px" }} disabled={saving}>
                  <NativeSelect.Field
                    aria-label="Schedule"
                    value={custom ? "custom" : schedulePreset(policy.schedule_cron)}
                    onChange={(e) => {
                      if (e.target.value === "custom") setCustom(true);
                      else {
                        setCustom(false);
                        void save({ ...policy, schedule_cron: e.target.value });
                      }
                    }}
                  >
                    {SCHEDULE_PRESETS.map((p) => (
                      <option key={p.cron} value={p.cron}>
                        {p.label}
                      </option>
                    ))}
                    <option value="custom">Custom</option>
                  </NativeSelect.Field>
                  <NativeSelect.Indicator />
                </NativeSelect.Root>
                {custom && (
                  <Input
                    aria-label="Custom cron expression"
                    value={cron}
                    disabled={saving}
                    onChange={(e) => setCron(e.target.value)}
                    onBlur={() => {
                      if (cron !== policy.schedule_cron)
                        void save({ ...policy, schedule_cron: cron });
                    }}
                  />
                )}
                <Text fontFamily="mono" fontSize="xs" color="fg.muted">
                  {policy.schedule_cron} · NEXT{" "}
                  {next
                    ? next.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZoneName: "short",
                      })
                    : "No predicted run"}{" "}
                  (schedule in UTC)
                </Text>
              </Flex>
            </SystemRow>
            <SystemRow label="Keep" help="How many old snapshots to hold on to.">
              <Flex
                role="group"
                aria-label="Retention preset"
                borderWidth="outline"
                borderRadius="md"
                borderColor="border.ink"
                overflow="hidden"
              >
                {BACKUP_RETENTION_PRESETS.map((preset, index) => (
                  <Button
                    key={preset}
                    flex={{ base: 1, md: "initial" }}
                    fontSize="xs"
                    px={{ base: 2, md: 4 }}
                    variant="outline"
                    h="44px"
                    borderWidth="0"
                    borderRadius="0"
                    borderInlineStartWidth={index > 0 ? "outline" : "0"}
                    borderColor="border.ink"
                    bg={policy.retention_preset === preset ? "fg" : "bg"}
                    color={policy.retention_preset === preset ? "bg" : "fg"}
                    aria-pressed={policy.retention_preset === preset}
                    disabled={saving}
                    onClick={() => void save({ ...policy, retention_preset: preset })}
                  >
                    {preset.toUpperCase()}
                  </Button>
                ))}
              </Flex>
            </SystemRow>
            <SystemRow label="Include" help="What each snapshot contains.">
              <Grid
                templateColumns={{ base: "1fr", md: "1fr 1fr" }}
                gap={{ base: 5, md: 2 }}
                py={{ base: 2, md: 0 }}
              >
                {INCLUDES.map(([key, label]) => (
                  <Checkbox.Root
                    key={key}
                    checked={policy[key]}
                    disabled={saving}
                    onCheckedChange={(d) => void save({ ...policy, [key]: Boolean(d.checked) })}
                  >
                    <Checkbox.HiddenInput checked={policy[key]} readOnly />
                    <Checkbox.Control />
                    <Checkbox.Label>{label}</Checkbox.Label>
                  </Checkbox.Root>
                ))}
              </Grid>
            </SystemRow>
          </>
        ) : null}
        <SystemRow
          label="Local database backups"
          help="A database dump kept on this server."
          surface
        >
          <DatabaseBackups embedded />
        </SystemRow>
      </Box>
      <Flex aria-live="polite" align="center" gap={2} mt={3} fontFamily="mono" fontSize="xs">
        <Text display={{ base: "block", md: "none" }} color="fg.muted">
          CHANGES SAVE AS YOU MAKE THEM
        </Text>
        {saving ? <Text>Saving…</Text> : saved ? <Text>SAVED{previous ? " ·" : ""}</Text> : null}
        {previous && !saving && saved && (
          <Button size="xs" variant="ghost" onClick={() => void save(previous, true)}>
            UNDO
          </Button>
        )}
      </Flex>
      {error && (
        <Text role="alert" color="fg.error" mt={2}>
          {error}
        </Text>
      )}
    </Box>
  );
}
