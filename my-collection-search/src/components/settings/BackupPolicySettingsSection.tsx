"use client";

import React from "react";
import {
  Box,
  Button,
  Checkbox,
  Flex,
  Heading,
  Spinner,
  Text,
} from "@chakra-ui/react";
import { toaster } from "@/components/ui/toaster";
import {
  fetchBackupPolicy,
  updateBackupPolicy,
  type BackupPolicy,
} from "@/services/internalApi/settings";

export default function BackupPolicySettingsSection(): React.JSX.Element {
  const [policy, setPolicy] = React.useState<BackupPolicy | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchBackupPolicy();
      setPolicy(data.policy);
    } catch (err) {
      toaster.create({
        title: "Failed to load backup policy",
        description: err instanceof Error ? err.message : String(err),
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!policy) return;
    setSaving(true);
    try {
      const data = await updateBackupPolicy({
        enabled: policy.enabled,
        schedule_cron: policy.schedule_cron,
        retention_preset: policy.retention_preset,
        include_database: policy.include_database,
        include_audio_files: policy.include_audio_files,
        include_album_covers: policy.include_album_covers,
        include_discogs_exports: policy.include_discogs_exports,
        include_essentia_files: policy.include_essentia_files,
        include_uploads: policy.include_uploads,
      });
      setPolicy(data.policy);
      toaster.create({ title: "Backup policy saved", type: "success" });
    } catch (err) {
      toaster.create({
        title: "Failed to save backup policy",
        description: err instanceof Error ? err.message : String(err),
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box mt={{ base: 4, md: 8 }} p={{ base: 4, md: 4 }} borderWidth={1} borderRadius="md">
      <Heading size="md" mb={2}>
        Remote Backup Policy
      </Heading>
      <Text color="fg.muted" mb={4}>
        Configures file-based backup policy in <code>config/backup-policy.yml</code>.
        Secrets such as restic password and B2 keys remain server-side.
      </Text>

      {loading ? (
        <Spinner size="sm" />
      ) : !policy ? (
        <Text color="red.500">Policy unavailable.</Text>
      ) : (
        <>
          <Flex direction="column" gap={3}>
            <label>
              <Text fontSize="sm" mb={1}>
                Schedule (cron)
              </Text>
              <input
                value={policy.schedule_cron}
                onChange={(e) =>
                  setPolicy((prev) =>
                    prev ? { ...prev, schedule_cron: e.target.value } : prev
                  )
                }
                style={{
                  width: "100%",
                  height: "var(--chakra-sizes-10)",
                  padding: "0 var(--chakra-spacing-3)",
                  borderRadius: "var(--chakra-radii-md)",
                  borderWidth: "1px",
                  borderStyle: "solid",
                  borderColor: "var(--chakra-colors-border)",
                  backgroundColor: "var(--chakra-colors-bg)",
                  color: "inherit",
                }}
              />
            </label>

            <label>
              <Text fontSize="sm" mb={1}>
                Retention preset
              </Text>
              <select
                value={policy.retention_preset}
                onChange={(e) =>
                  setPolicy((prev) =>
                    prev
                      ? {
                          ...prev,
                          retention_preset: e.target.value as BackupPolicy["retention_preset"],
                        }
                      : prev
                  )
                }
                style={{
                  width: "100%",
                  height: "var(--chakra-sizes-10)",
                  padding: "0 var(--chakra-spacing-3)",
                  borderRadius: "var(--chakra-radii-md)",
                  borderWidth: "1px",
                  borderStyle: "solid",
                  borderColor: "var(--chakra-colors-border)",
                  backgroundColor: "var(--chakra-colors-bg)",
                  color: "inherit",
                }}
              >
                <option value="aggressive">Aggressive (short retention)</option>
                <option value="balanced">Balanced</option>
                <option value="archive">Archive (long retention)</option>
              </select>
            </label>

            <Checkbox.Root
              checked={policy.enabled}
              onCheckedChange={(details) =>
                setPolicy((prev) =>
                  prev ? { ...prev, enabled: Boolean(details.checked) } : prev
                )
              }
            >
              <Checkbox.HiddenInput />
              <Checkbox.Control />
              <Checkbox.Label>Enable remote backups</Checkbox.Label>
            </Checkbox.Root>

            <Checkbox.Root
              checked={policy.include_database}
              onCheckedChange={(details) =>
                setPolicy((prev) =>
                  prev
                    ? { ...prev, include_database: Boolean(details.checked) }
                    : prev
                )
              }
            >
              <Checkbox.HiddenInput />
              <Checkbox.Control />
              <Checkbox.Label>Include database dumps</Checkbox.Label>
            </Checkbox.Root>

            <Checkbox.Root
              checked={policy.include_audio_files}
              onCheckedChange={(details) =>
                setPolicy((prev) =>
                  prev
                    ? { ...prev, include_audio_files: Boolean(details.checked) }
                    : prev
                )
              }
            >
              <Checkbox.HiddenInput />
              <Checkbox.Control />
              <Checkbox.Label>Include audio files</Checkbox.Label>
            </Checkbox.Root>

            <Checkbox.Root
              checked={policy.include_album_covers}
              onCheckedChange={(details) =>
                setPolicy((prev) =>
                  prev
                    ? { ...prev, include_album_covers: Boolean(details.checked) }
                    : prev
                )
              }
            >
              <Checkbox.HiddenInput />
              <Checkbox.Control />
              <Checkbox.Label>Include album covers</Checkbox.Label>
            </Checkbox.Root>

            <Checkbox.Root
              checked={policy.include_discogs_exports}
              onCheckedChange={(details) =>
                setPolicy((prev) =>
                  prev
                    ? { ...prev, include_discogs_exports: Boolean(details.checked) }
                    : prev
                )
              }
            >
              <Checkbox.HiddenInput />
              <Checkbox.Control />
              <Checkbox.Label>Include Discogs JSON exports</Checkbox.Label>
            </Checkbox.Root>

            <Checkbox.Root
              checked={policy.include_essentia_files}
              onCheckedChange={(details) =>
                setPolicy((prev) =>
                  prev
                    ? { ...prev, include_essentia_files: Boolean(details.checked) }
                    : prev
                )
              }
            >
              <Checkbox.HiddenInput />
              <Checkbox.Control />
              <Checkbox.Label>Include Essentia analysis files</Checkbox.Label>
            </Checkbox.Root>

            <Checkbox.Root
              checked={policy.include_uploads}
              onCheckedChange={(details) =>
                setPolicy((prev) =>
                  prev
                    ? { ...prev, include_uploads: Boolean(details.checked) }
                    : prev
                )
              }
            >
              <Checkbox.HiddenInput />
              <Checkbox.Control />
              <Checkbox.Label>Include uploads directory</Checkbox.Label>
            </Checkbox.Root>
          </Flex>

          <Flex mt={4} gap={2} align={{ base: "stretch", md: "center" }} direction={{ base: "column", md: "row" }}>
            <Button colorPalette="blue" onClick={save} loading={saving}>
              Save Policy
            </Button>
            <Button variant="outline" onClick={() => void load()} disabled={saving}>
              Reload
            </Button>
            <Text fontSize="xs" color="fg.muted" ml={{ base: 0, md: 1 }}>
              Updated: {new Date(policy.updated_at).toLocaleString()}
            </Text>
          </Flex>
        </>
      )}
    </Box>
  );
}
