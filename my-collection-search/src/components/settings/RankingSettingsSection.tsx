"use client";

import React, { useEffect, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  Flex,
  Grid,
  Input,
  NativeSelect,
  SegmentGroup,
  Spinner,
  Switch,
  Text,
  Textarea,
  useBreakpointValue,
  VisuallyHidden,
} from "@chakra-ui/react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  keyRuleMode,
  RANKING_SURFACES,
  rankingProfileDraftSchema,
  type RankingConfig,
  type RankingProfileDraft,
  type RankingProfileEntry,
  type RankingSurface,
} from "@groovenet/contracts";
import RetroSlider from "@/components/player/RetroSlider";
import RetroDialog from "@/components/ui/RetroDialog";
import { MetaTag, SourceTag, StatusTag } from "@/components/ui/RoleTags";
import { SectionHeading } from "@/components/ui/SectionHeading";
import {
  useRankingProfileMutations,
  useRankingProfilesQuery,
  useSetActiveRankingProfile,
} from "@/hooks/useRankingProfiles";
import {
  CONSTRAINT_DEFAULTS,
  previewRows,
  WEIGHT_SLIDERS,
  WEIGHT_STEP,
  withConstraint,
  withKeyRule,
  withWeight,
} from "@/lib/ranking/editor";
import { DEFAULT_PROFILE, profileToDraft } from "@/lib/ranking/profiles";
import { queryKeys } from "@/lib/queryKeys";
import { fetchRankingPreview } from "@/services/internalApi/ranking";
import { listTopSpinTracks } from "@/services/internalApi/spins";
import SettingsRow from "./SettingsRow";

export const RANKING_INTRO =
  "How suggestions and recommendations are ranked. Presets are read-only: copy one to tune it.";

const SURFACE_LABELS: Record<RankingSurface, string> = {
  suggestions: "Suggestions",
  related: "Related tracks",
  recommendations: "Recommendations",
};

const KEY_MODES = [
  { value: "same", label: "Same" },
  { value: "adjacent", label: "Adjacent" },
  { value: "any", label: "Any" },
];

const fixed = (value: number, digits = 2) => value.toFixed(digits);
const percent = (ratio: number) => `${Number((ratio * 100).toFixed(1))}%`;

/** The draft as the ranker reads it, for the preview. */
const previewConfig = (draft: RankingProfileDraft, id: string): RankingConfig => ({
  version: draft.version,
  id: id.slice(0, 64),
  weights: draft.weights,
  ...(draft.base ? { base: draft.base } : {}),
  usePrior: draft.usePrior,
  constraints: draft.constraints,
});

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/**
 * Settings → Ranking (#1192): the profiles, which one each surface uses, and
 * an editor with a slider per signal, the constraint controls and a preview
 * of the breakdown for a seed from the library's most played tracks.
 */
export default function RankingSettingsSection() {
  const { data, friendId, isPending, isError } = useRankingProfilesQuery();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const isPhone = useBreakpointValue({ base: true, md: false }) === true;
  const mutations = useRankingProfileMutations(friendId);
  const choose = useSetActiveRankingProfile();

  const selected =
    data.profiles.find((p) => p.id === selectedId) ??
    data.profiles.find((p) => p.id === data.active.suggestions) ??
    DEFAULT_PROFILE;
  const activeOn = (id: string) => RANKING_SURFACES.filter((s) => data.active[s] === id);

  const open = (id: string) => {
    setSelectedId(id);
    if (isPhone) setDialogOpen(true);
  };
  const copy = (id: string) =>
    mutations.copy.mutate(id, { onSuccess: (profile) => open(profile.id) });

  if (friendId > 0 && isPending) {
    return (
      <Flex align="center" gap={3} py={4}>
        <Spinner size="sm" />
        <Text fontSize="sm">Loading profiles…</Text>
      </Flex>
    );
  }

  const editor = (
    <ProfileEditor
      key={selected.id}
      profile={selected}
      friendId={friendId}
      saving={mutations.save.isPending}
      onCopy={() => copy(selected.id)}
      onSave={(profile) => mutations.save.mutate({ id: selected.id, profile })}
      onDelete={() =>
        mutations.remove.mutate(selected.id, {
          onSuccess: () => {
            setSelectedId(null);
            setDialogOpen(false);
          },
        })
      }
    />
  );

  return (
    <Flex direction="column" gap={6}>
      {isError ? (
        <Text color="fg.error" fontSize="sm">
          Could not load your profiles. Ranking uses Default.
        </Text>
      ) : null}
      <Box
        as="ul"
        listStyleType="none"
        borderWidth="outline"
        borderColor="border.ink"
        boxShadow="md"
        bg="bg.panel"
        aria-label="Ranking profiles"
      >
        {data.profiles.map((profile, index) => {
          const on = activeOn(profile.id);
          const isSelected = profile.id === selected.id;
          return (
            <Flex
              as="li"
              key={profile.id}
              align={{ base: "stretch", md: "center" }}
              direction={{ base: "column", md: "row" }}
              gap={{ base: 2, md: 4 }}
              px={4}
              py={3}
              borderTopWidth={index === 0 ? 0 : "rule"}
              borderColor="border"
              bg={isSelected && !isPhone ? "bg.subtle" : undefined}
            >
              <Box flex="1" minW={0}>
                <Flex align="center" gap={2} wrap="wrap">
                  <Button
                    variant="ghost"
                    size="sm"
                    fontFamily="body"
                    fontWeight="semibold"
                    px={0}
                    minH="44px"
                    aria-pressed={isSelected}
                    onClick={() => open(profile.id)}
                  >
                    {profile.name}
                  </Button>
                  <SourceTag stroke={profile.kind === "preset" ? "solid" : "dashed"} size="xs">
                    {profile.kind === "preset" ? "Preset" : "Custom"}
                  </SourceTag>
                  {profile.invalid ? (
                    <StatusTag tone="missing" size="xs">
                      Can’t be read
                    </StatusTag>
                  ) : null}
                </Flex>
                <Text fontSize="13px" color="fg.muted" lineClamp={2}>
                  {profile.invalid
                    ? "Ranks as Default until it is saved again."
                    : on.length > 0
                      ? `Used for ${on.map((s) => SURFACE_LABELS[s].toLowerCase()).join(", ")}`
                      : profile.description || "Not in use"}
                </Text>
              </Box>
              <Flex gap={2} flexShrink={0}>
                <Button
                  size="xs"
                  variant="outline"
                  minH={{ base: "44px", md: "auto" }}
                  disabled={profile.invalid || on.length === profile.surfaces.length}
                  onClick={() =>
                    friendId > 0 && choose.mutate({ friend_id: friendId, profile_id: profile.id })
                  }
                >
                  Use
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  minH={{ base: "44px", md: "auto" }}
                  disabled={friendId <= 0 || mutations.copy.isPending}
                  onClick={() => copy(profile.id)}
                >
                  Copy
                </Button>
              </Flex>
            </Flex>
          );
        })}
      </Box>

      {isPhone ? (
        <RetroDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          title={selected.name}
          fullScreenOnMobile
        >
          <Box p={4}>{editor}</Box>
        </RetroDialog>
      ) : (
        editor
      )}
    </Flex>
  );
}

type EditorProps = {
  profile: RankingProfileEntry;
  friendId: number;
  saving: boolean;
  onCopy: () => void;
  onSave: (profile: RankingProfileDraft) => void;
  onDelete: () => void;
};

/** One profile's weights and constraints. A preset shows read-only, with Copy to edit. */
export function ProfileEditor({
  profile,
  friendId,
  saving,
  onCopy,
  onSave,
  onDelete,
}: EditorProps) {
  const readOnly = profile.kind === "preset";
  const original = profileToDraft(profile);
  const [draft, setDraft] = useState<RankingProfileDraft>(original);
  const dirty = JSON.stringify(draft) !== JSON.stringify(original);
  const parsed = rankingProfileDraftSchema.safeParse(draft);
  const { bpm_window, key_rule, genre_floor, energy_range } = draft.constraints;
  const keyMode = keyRuleMode(key_rule);

  return (
    <Flex direction="column" gap={5} data-testid="ranking-editor">
      <Flex align="center" justify="space-between" gap={3} wrap="wrap">
        <SectionHeading level={3} display={{ base: "none", md: "block" }}>
          {profile.name}
        </SectionHeading>
        {readOnly ? (
          <Button size="sm" variant="solid" onClick={onCopy} disabled={friendId <= 0}>
            Copy to edit
          </Button>
        ) : (
          <Flex gap={2}>
            <Button size="sm" variant="ghost" disabled={!dirty} onClick={() => setDraft(original)}>
              Revert
            </Button>
            <Button
              size="sm"
              variant="solid"
              disabled={(!dirty && !profile.invalid) || !parsed.success || saving}
              onClick={() => parsed.success && onSave(parsed.data)}
            >
              Save
            </Button>
          </Flex>
        )}
      </Flex>

      {readOnly ? (
        <Text fontSize="sm" color="fg.muted">
          {profile.description}
        </Text>
      ) : (
        <Grid
          templateColumns={{ base: "minmax(0, 1fr)", md: "minmax(0, 1fr) minmax(0, 1fr)" }}
          gap={3}
        >
          <Box>
            <Text asChild fontSize="12px" color="fg.muted">
              <label htmlFor="ranking-profile-name">Name</label>
            </Text>
            <Input
              id="ranking-profile-name"
              size="sm"
              fontSize="16px"
              maxLength={80}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.currentTarget.value })}
            />
          </Box>
          <Box gridColumn={{ md: "1 / -1" }}>
            <Text asChild fontSize="12px" color="fg.muted">
              <label htmlFor="ranking-profile-description">Description</label>
            </Text>
            <Textarea
              id="ranking-profile-description"
              size="sm"
              fontSize="16px"
              rows={3}
              maxLength={500}
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.currentTarget.value })}
            />
          </Box>
          <Flex gap={4} wrap="wrap" role="group" aria-label="Used for">
            {RANKING_SURFACES.map((surface) => (
              <Checkbox.Root
                key={surface}
                size="sm"
                checked={draft.surfaces.includes(surface)}
                onCheckedChange={(details) =>
                  setDraft({
                    ...draft,
                    surfaces: details.checked
                      ? RANKING_SURFACES.filter((s) => s === surface || draft.surfaces.includes(s))
                      : draft.surfaces.filter((s) => s !== surface),
                  })
                }
              >
                <Checkbox.HiddenInput />
                <Checkbox.Control />
                <Checkbox.Label>{SURFACE_LABELS[surface]}</Checkbox.Label>
              </Checkbox.Root>
            ))}
          </Flex>
        </Grid>
      )}
      {!parsed.success ? (
        <Text fontSize="sm" color="fg.error" role="alert">
          {draft.surfaces.length === 0
            ? "Choose at least one place to use it."
            : draft.name.trim() === ""
              ? "Give it a name."
              : "Some values are out of range."}
        </Text>
      ) : null}

      <Grid
        templateColumns={{ base: "minmax(0, 1fr)", lg: "minmax(0, 1fr) minmax(0, 1fr)" }}
        gap={6}
      >
        <Box>
          <Text fontFamily="label" fontSize="12px" textTransform="uppercase" mb={2}>
            Weights
          </Text>
          <Flex direction="column" gap={3}>
            {WEIGHT_SLIDERS.map((slider) => {
              const value = draft.weights[slider.id] ?? 0;
              return (
                <Grid
                  key={slider.id}
                  templateColumns="96px minmax(0, 1fr) 44px"
                  alignItems="center"
                  gap={3}
                >
                  <Text fontSize="sm">{slider.label}</Text>
                  <RetroSlider
                    label={`${slider.label} weight`}
                    value={Math.min(Math.max(value, 0), slider.max)}
                    max={slider.max}
                    step={WEIGHT_STEP}
                    disabled={readOnly}
                    valueText={fixed(value)}
                    onChange={(next) => setDraft((d) => withWeight(d, slider.id, next))}
                  />
                  <Text fontFamily="mono" fontSize="13px" textAlign="right">
                    {fixed(value)}
                  </Text>
                </Grid>
              );
            })}
          </Flex>

          <Text fontFamily="label" fontSize="12px" textTransform="uppercase" mt={6} mb={1}>
            Constraints
          </Text>
          <Box>
            <SettingsRow label="BPM window" help="Hide tracks further off the seed's tempo.">
              <ConstraintSwitch
                label="BPM window"
                checked={!!bpm_window}
                disabled={readOnly}
                onChange={(on) =>
                  setDraft(
                    withConstraint(draft, "bpm_window", on ? CONSTRAINT_DEFAULTS.bpm_window : null),
                  )
                }
              />
            </SettingsRow>
            {bpm_window ? (
              <Flex direction="column" gap={3} pb={3}>
                <Grid templateColumns="96px minmax(0, 1fr) 56px" alignItems="center" gap={3}>
                  <Text fontSize="sm">Window</Text>
                  <RetroSlider
                    label="BPM window"
                    value={bpm_window.unit === "ratio" ? bpm_window.max * 100 : bpm_window.max}
                    min={1}
                    max={bpm_window.unit === "ratio" ? 20 : 30}
                    step={bpm_window.unit === "ratio" ? 0.5 : 1}
                    disabled={readOnly}
                    onChange={(next) =>
                      setDraft(
                        withConstraint(draft, "bpm_window", {
                          ...bpm_window,
                          max: bpm_window.unit === "ratio" ? next / 100 : next,
                        }),
                      )
                    }
                  />
                  <Text fontFamily="mono" fontSize="13px" textAlign="right">
                    ±{bpm_window.unit === "ratio" ? percent(bpm_window.max) : bpm_window.max}
                  </Text>
                </Grid>
                <ConstraintSwitch
                  label="Half and double time"
                  text="Half and double time"
                  checked={!!bpm_window.half_double}
                  disabled={readOnly}
                  onChange={(on) =>
                    setDraft(
                      withConstraint(draft, "bpm_window", { ...bpm_window, half_double: on }),
                    )
                  }
                />
              </Flex>
            ) : null}
            <SettingsRow label="Key" help="Same key, a step round the wheel, or any key." divider>
              {keyMode === "custom" ? (
                <MetaTag>{`${key_rule!.metric} ≤ ${key_rule!.max}`}</MetaTag>
              ) : (
                <SegmentGroup.Root
                  size="xs"
                  value={keyMode}
                  aria-label="Key rule"
                  disabled={readOnly}
                  onValueChange={(details) =>
                    setDraft(withKeyRule(draft, details.value as "same" | "adjacent" | "any"))
                  }
                >
                  <SegmentGroup.Indicator />
                  <SegmentGroup.Items items={KEY_MODES} />
                </SegmentGroup.Root>
              )}
            </SettingsRow>
            <SettingsRow
              label="Genre floor"
              help="Hide tracks with too little genre overlap."
              divider
            >
              <ConstraintSwitch
                label="Genre floor"
                checked={!!genre_floor}
                disabled={readOnly}
                onChange={(on) =>
                  setDraft(
                    withConstraint(
                      draft,
                      "genre_floor",
                      on ? CONSTRAINT_DEFAULTS.genre_floor : null,
                    ),
                  )
                }
              />
            </SettingsRow>
            {genre_floor ? (
              <ConstraintSlider
                label="Minimum overlap"
                value={genre_floor.min}
                disabled={readOnly}
                onChange={(min) => setDraft(withConstraint(draft, "genre_floor", { min }))}
              />
            ) : null}
            <SettingsRow
              label="Energy range"
              help="How far energy may drop or rise from the seed."
              divider
            >
              <ConstraintSwitch
                label="Energy range"
                checked={!!energy_range}
                disabled={readOnly}
                onChange={(on) =>
                  setDraft(
                    withConstraint(
                      draft,
                      "energy_range",
                      on ? CONSTRAINT_DEFAULTS.energy_range : null,
                    ),
                  )
                }
              />
            </SettingsRow>
            {energy_range ? (
              <>
                <ConstraintSlider
                  label="Max drop"
                  value={energy_range.max_drop}
                  disabled={readOnly}
                  onChange={(max_drop) =>
                    setDraft(withConstraint(draft, "energy_range", { ...energy_range, max_drop }))
                  }
                />
                <ConstraintSlider
                  label="Max rise"
                  value={energy_range.max_rise}
                  disabled={readOnly}
                  onChange={(max_rise) =>
                    setDraft(withConstraint(draft, "energy_range", { ...energy_range, max_rise }))
                  }
                />
              </>
            ) : null}
          </Box>
          {!readOnly ? (
            <Button size="sm" variant="outline" colorPalette="danger" mt={4} onClick={onDelete}>
              Delete profile
            </Button>
          ) : null}
        </Box>

        <RankingPreview friendId={friendId} config={previewConfig(draft, profile.id)} />
      </Grid>
    </Flex>
  );
}

function ConstraintSwitch({
  label,
  checked,
  disabled,
  onChange,
  text,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
  /** Shown beside the switch; omitted, it reads On or Off and the row names it. */
  text?: string;
}) {
  return (
    <Switch.Root
      size="sm"
      checked={checked}
      disabled={disabled}
      onCheckedChange={(details) => onChange(details.checked)}
    >
      <Switch.HiddenInput />
      <Switch.Control />
      <Switch.Label fontSize="sm">
        {text ?? (
          <>
            <VisuallyHidden>{label} </VisuallyHidden>
            {checked ? "On" : "Off"}
          </>
        )}
      </Switch.Label>
    </Switch.Root>
  );
}

function ConstraintSlider({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <Grid templateColumns="96px minmax(0, 1fr) 56px" alignItems="center" gap={3} pb={3}>
      <Text fontSize="sm">{label}</Text>
      <RetroSlider
        label={label}
        value={value}
        max={1}
        step={0.01}
        disabled={disabled}
        onChange={onChange}
      />
      <Text fontFamily="mono" fontSize="13px" textAlign="right">
        {fixed(value)}
      </Text>
    </Grid>
  );
}

/**
 * The draft scored on a seed from the library's most played tracks, through
 * the breakdown API (`ranking_config`), so it reads exactly as the server ranks.
 */
export function RankingPreview({ friendId, config }: { friendId: number; config: RankingConfig }) {
  const seeds = useQuery({
    queryKey: ["ranking", "preview-seeds", friendId],
    queryFn: () => listTopSpinTracks({ friend_id: friendId, limit: 12, offset: 0 }),
    enabled: friendId > 0,
    staleTime: 5 * 60 * 1000,
  });
  const options = (seeds.data?.items ?? []).filter((item) => item.hasVectors !== false);
  const [seedKey, setSeedKey] = useState<string | null>(null);
  const seed =
    options.find((item) => `${item.track_id}:${item.friend_id}` === seedKey) ?? options[0];
  const debounced = useDebounced(config, 350);
  const preview = useQuery({
    queryKey: queryKeys.rankingPreview(
      seed ? `${seed.track_id}:${seed.friend_id}` : "",
      friendId,
      debounced,
    ),
    queryFn: () =>
      fetchRankingPreview({ track_id: seed!.track_id, friend_id: seed!.friend_id }, debounced),
    enabled: !!seed,
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000,
  });
  const rows = preview.data ? previewRows(preview.data, 8) : [];

  return (
    <Box aria-label="Preview" as="section">
      <Text fontFamily="label" fontSize="12px" textTransform="uppercase" mb={2}>
        Preview
      </Text>
      {seeds.isPending && friendId > 0 ? (
        <Spinner size="sm" />
      ) : !seed ? (
        <Text fontSize="sm" color="fg.muted">
          Log a few spins to preview against the tracks you play.
        </Text>
      ) : (
        <>
          <NativeSelect.Root size="sm" mb={3}>
            <NativeSelect.Field
              aria-label="Preview seed"
              fontSize={{ base: "16px", md: "14px" }}
              value={`${seed.track_id}:${seed.friend_id}`}
              onChange={(e) => setSeedKey(e.currentTarget.value)}
            >
              {options.map((item) => (
                <option
                  key={`${item.track_id}:${item.friend_id}`}
                  value={`${item.track_id}:${item.friend_id}`}
                >
                  {item.title_snapshot} — {item.artist_snapshot}
                  {item.bpm ? ` · ${item.bpm} BPM` : ""}
                  {item.key ? ` · ${item.key}` : ""}
                </option>
              ))}
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
          {preview.isError ? (
            <Text fontSize="sm" color="fg.error">
              Could not load the preview.
            </Text>
          ) : rows.length === 0 && !preview.isFetching ? (
            <Text fontSize="sm" color="fg.muted">
              No suggestions for this seed.
            </Text>
          ) : (
            <Box
              as="ol"
              listStyleType="none"
              borderWidth="outline"
              borderColor="border.ink"
              boxShadow="md"
              opacity={preview.isFetching ? 0.6 : 1}
              aria-busy={preview.isFetching}
            >
              {rows.map((row, index) => (
                <Box
                  as="li"
                  key={row.key}
                  px={3}
                  py={2}
                  borderTopWidth={index === 0 ? 0 : "rule"}
                  borderColor="border"
                  color={row.passed ? undefined : "fg.muted"}
                >
                  <Flex justify="space-between" gap={3}>
                    <Text fontSize="sm" truncate title={`${row.title} — ${row.artist}`}>
                      {row.title}{" "}
                      <Text as="span" color="fg.muted">
                        — {row.artist}
                      </Text>
                    </Text>
                    <Text fontFamily="mono" fontSize="13px" flexShrink={0}>
                      {fixed(row.score)}
                    </Text>
                  </Flex>
                  <Flex gap={2} align="center" wrap="wrap">
                    <Text fontFamily="mono" fontSize="12px" color="fg.muted">
                      {row.why}
                    </Text>
                    {row.failed.map((label) => (
                      <StatusTag key={label} tone="missing" size="xs">
                        {label}
                      </StatusTag>
                    ))}
                  </Flex>
                </Box>
              ))}
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
