"use client";

import React from "react";
import {
  Box,
  Button,
  chakra,
  Field,
  Flex,
  Grid,
  Input,
  NativeSelectField,
  NativeSelectRoot,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";
import Artwork from "@/components/player/Artwork";
import RetroDialog from "@/components/ui/RetroDialog";
import {
  ACTION_OPTIONS,
  CLEANING_METHOD_OPTIONS,
  SLEEVE_OPTIONS,
} from "@/components/records/recordCareFormat";
import type { CleaningMethod, SleeveType } from "@/lib/recordCare";
import type { RecordCareSessionCreate } from "@/services/internalApi/recordCare";
import {
  buildLogCareBody,
  initialLogCareState,
  logCareBodyError,
  logCareFormErrors,
  logCareTitle,
  toggleCareType,
  type LogCareErrors,
  type LogCareFormState,
  type LogCareTarget,
} from "./careLog";

export type LogCareRecord = { key: string; title: string; thumbnail: string | null };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The pulled stack's number when logging it; null for an ad-hoc selection. */
  stackNo: number | null;
  /** What the body names: the stack, or the selected copies. */
  target: LogCareTarget;
  /** The selection, for the covers and names; `count` may exceed it. */
  records: LogCareRecord[];
  count: number;
  /** The summary's `needs_sleeve_type`, the sleeve a change starts on. */
  defaultSleeve: SleeveType;
  /** Saves the body; a rejection is shown inline and keeps the dialog open. */
  onSave: (body: Omit<RecordCareSessionCreate, "friend_id">) => Promise<void>;
};

const MAX_COVERS = 10;

const ToggleButton = chakra("button");

const label = {
  fontFamily: "mono",
  fontSize: "11px",
  fontWeight: "semibold",
  letterSpacing: "0.08em",
  color: "fg.muted",
} as const;

const control = { h: "44px", fontSize: "16px" } as const;

function Covers({ records, count }: { records: LogCareRecord[]; count: number }) {
  const overflow = count > MAX_COVERS;
  const shown = records.slice(0, overflow ? MAX_COVERS - 1 : MAX_COVERS);
  return (
    <Grid
      aria-hidden="true"
      templateColumns="repeat(10, minmax(0, 1fr))"
      gap={{ base: "3px", md: 1 }}
    >
      {shown.map((record) => (
        <Box key={record.key} minW={0}>
          <Artwork src={record.thumbnail} alt="" fill />
        </Box>
      ))}
      {overflow && (
        <Flex
          data-testid="log-care-more"
          aspectRatio={1}
          align="center"
          justify="center"
          borderWidth="outline"
          borderColor="border.ink"
          fontFamily="mono"
          fontSize="11px"
          fontWeight="semibold"
        >
          +{count - shown.length}
        </Flex>
      )}
    </Grid>
  );
}

function FieldError({ id, children }: { id: string; children?: string }) {
  if (!children) return null;
  return (
    <Text id={id} fontSize="13px" color="fg.error" mt="6px">
      {children}
    </Text>
  );
}

/**
 * The log care modal (#944): the selection's covers and names, CARE as
 * toggles (one save can be a cleaning and a sleeve change), WHEN, the sleeve
 * for a sleeve change, the method for a cleaning, and a note. A centred
 * `RetroDialog` on desktop and phone; focus returns to LOG CARE on close.
 */
export default function LogCareDialog({
  open,
  onOpenChange,
  stackNo,
  target,
  records,
  count,
  defaultSleeve,
  onSave,
}: Props) {
  const [form, setForm] = React.useState<LogCareFormState>(() =>
    initialLogCareState(defaultSleeve),
  );
  const [errors, setErrors] = React.useState<LogCareErrors>({});
  const [apiError, setApiError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  // The form resets each time it opens, as RecordActionDialog's does.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(initialLogCareState(defaultSleeve));
      setErrors({});
      setApiError(null);
    }
  }
  const update = (patch: Partial<LogCareFormState>) => {
    setForm((current) => ({ ...current, ...patch }));
    setApiError(null);
  };

  const cleaned = form.types.includes("cleaned");
  const sleeved = form.types.includes("sleeved");

  const save = async () => {
    const found = logCareFormErrors(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const body = buildLogCareBody(form, target);
    const invalid = logCareBodyError(body);
    if (invalid) {
      setApiError(invalid);
      return;
    }
    setSaving(true);
    try {
      await onSave(body);
      onOpenChange(false);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const n = count.toLocaleString("en-US");
  const footer = (
    <Grid
      templateColumns="1fr 2fr"
      gap="10px"
      px={{ base: "12px", md: 4 }}
      pt="12px"
      pb={{ base: "14px", md: 4 }}
    >
      <Button variant="outline" h="48px" onClick={() => onOpenChange(false)} disabled={saving}>
        CANCEL
      </Button>
      <Button variant="solid" h="48px" onClick={() => void save()} loading={saving}>
        SAVE FOR {n}
        <Box as="span" display={{ base: "none", md: "inline" }}>
          {count === 1 ? " RECORD" : " RECORDS"}
        </Box>
      </Button>
    </Grid>
  );

  return (
    <RetroDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`LOG CARE · ${logCareTitle(stackNo, count)}`}
      maxW="560px"
      dismissible={!saving}
      footer={footer}
    >
      <Stack gap={{ base: "14px", md: 4 }} p={{ base: "14px", md: 4 }} pl={{ base: "12px", md: 4 }}>
        <Stack gap={{ base: "6px", md: 2 }}>
          <Covers records={records} count={count} />
          <Text
            fontSize={{ base: "12px", md: "13px" }}
            lineHeight={{ base: "16px", md: "18px" }}
            color="fg.muted"
            lineClamp={2}
          >
            {records.map((record) => record.title).join(" · ")}
          </Text>
        </Stack>

        <Box
          as="fieldset"
          m={0}
          p={0}
          border={0}
          aria-describedby={errors.care ? "log-care-care-error" : undefined}
        >
          <Box as="legend" p={0} mb={{ base: "6px", md: 2 }} {...label}>
            CARE
          </Box>
          <Grid
            templateColumns={{ base: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" }}
            borderWidth="outline"
            borderColor={errors.care ? "border.error" : "border.ink"}
          >
            {ACTION_OPTIONS.map((option, i) => {
              const on = form.types.includes(option.value);
              // Between two ticked cells the ink rule would vanish into the
              // fill, so it takes the ground colour instead.
              const isOn = (j: number) => form.types.includes(ACTION_OPTIONS[j].value);
              const edge = (neighbour: boolean) => (on && neighbour ? "bg" : "border.ink");
              return (
                <ToggleButton
                  key={option.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    update({ types: toggleCareType(form.types, option.value) });
                    setErrors((current) => ({ ...current, care: undefined }));
                  }}
                  h="44px"
                  px={1}
                  borderLeftWidth={{ base: i % 2 ? "outline" : 0, md: i ? "outline" : 0 }}
                  borderTopWidth={{ base: i > 1 ? "outline" : 0, md: 0 }}
                  borderLeftColor={{
                    base: edge(i % 2 === 1 && isOn(i - 1)),
                    md: edge(i > 0 && isOn(i - 1)),
                  }}
                  borderTopColor={edge(i > 1 && isOn(i - 2))}
                  bg={on ? "fg" : "transparent"}
                  color={on ? "bg" : "fg"}
                  fontFamily="mono"
                  fontSize="12px"
                  fontWeight="semibold"
                  letterSpacing="0.04em"
                  cursor="pointer"
                  _hover={{ bg: on ? "fg" : "bg.muted" }}
                >
                  {option.label.toUpperCase()}
                </ToggleButton>
              );
            })}
          </Grid>
          <FieldError id="log-care-care-error">{errors.care}</FieldError>
        </Box>

        <Grid
          templateColumns={{ base: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))" }}
          gap={{ base: "14px", md: 3 }}
        >
          <Field.Root invalid={!!errors.when}>
            <Field.Label {...label}>WHEN</Field.Label>
            <Input
              type="datetime-local"
              {...control}
              value={form.occurredAtInput}
              onChange={(event) => {
                update({ occurredAtInput: event.target.value });
                setErrors((current) => ({ ...current, when: undefined }));
              }}
            />
            <Field.ErrorText>{errors.when}</Field.ErrorText>
          </Field.Root>

          {sleeved && (
            <Field.Root invalid={!!errors.sleeve}>
              <Field.Label {...label}>SLEEVE</Field.Label>
              <NativeSelectRoot>
                <NativeSelectField
                  {...control}
                  value={form.sleeveType}
                  onChange={(event) => {
                    update({ sleeveType: event.target.value as SleeveType | "" });
                    setErrors((current) => ({ ...current, sleeve: undefined }));
                  }}
                >
                  <option value="">Choose a sleeve</option>
                  {SLEEVE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </NativeSelectField>
              </NativeSelectRoot>
              <Field.ErrorText>{errors.sleeve}</Field.ErrorText>
            </Field.Root>
          )}

          {cleaned && (
            <Field.Root>
              <Field.Label {...label}>METHOD</Field.Label>
              <NativeSelectRoot>
                <NativeSelectField
                  {...control}
                  value={form.method}
                  onChange={(event) =>
                    update({ method: event.target.value as CleaningMethod | "" })
                  }
                >
                  <option value="">Not recorded</option>
                  {CLEANING_METHOD_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </NativeSelectField>
              </NativeSelectRoot>
            </Field.Root>
          )}
        </Grid>

        <Field.Root>
          <Field.Label {...label}>NOTE</Field.Label>
          <Textarea
            fontSize="16px"
            rows={2}
            resize="none"
            placeholder="Optional"
            value={form.notes}
            onChange={(event) => update({ notes: event.target.value })}
          />
        </Field.Root>

        {apiError && (
          <Text
            role="alert"
            px={3}
            py={2}
            borderWidth="outline"
            borderStyle="dashed"
            borderColor="border.error"
            color="fg.error"
            fontSize="13px"
          >
            Couldn&apos;t save: {apiError}
          </Text>
        )}
      </Stack>
    </RetroDialog>
  );
}
