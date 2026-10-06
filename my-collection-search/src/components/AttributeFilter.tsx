"use client";

import React, { useEffect, useState } from "react";
import {
  Badge,
  Button,
  Field,
  HStack,
  IconButton,
  Input,
  NativeSelect,
  Popover,
  Portal,
  Stack,
  Text,
} from "@chakra-ui/react";
import { LuChevronDown, LuStar } from "react-icons/lu";
import {
  KEY_FILTER_OPTIONS,
  attributeFilterChips,
  type TrackAttributeFilters,
} from "@/lib/trackFilters";

type AttributeFilterProps = {
  value: TrackAttributeFilters;
  onChange: (next: TrackAttributeFilters) => void;
};

function parseBpm(text: string): number | undefined {
  const n = Number(text);
  return text.trim() !== "" && Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * BPM range, key and minimum rating for track search (#412, #447), behind a
 * button. On phones the same fields sit in the filter sheet instead.
 */
export default function AttributeFilter({ value, onChange }: AttributeFilterProps) {
  const count = attributeFilterChips(value).length;

  return (
    <Popover.Root positioning={{ placement: "bottom-start" }}>
      <Popover.Trigger asChild>
        <Button
          size="sm"
          variant="outline"
          borderRadius="full"
          flexShrink={0}
          aria-label={count > 0 ? `BPM, key and rating filters, ${count} on` : "BPM, key and rating filters"}
        >
          BPM / Key
          {count > 0 && (
            <Badge size="xs" colorPalette="blue" variant="solid" borderRadius="full">
              {count}
            </Badge>
          )}
          <LuChevronDown />
        </Button>
      </Popover.Trigger>
      <Portal>
        <Popover.Positioner>
          <Popover.Content width="260px">
            <Popover.Body>
              <AttributeFields value={value} onChange={onChange} />
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}

/**
 * The fields themselves. The key and rating apply as they're picked; the BPM
 * range applies on Enter or when a box loses focus, so typing 126 doesn't
 * search for 1 and 12 on the way.
 */
export function AttributeFields({ value, onChange }: AttributeFilterProps) {
  const [bpmMin, setBpmMin] = useState(value.bpm_min?.toString() ?? "");
  const [bpmMax, setBpmMax] = useState(value.bpm_max?.toString() ?? "");

  // Follow the applied range when a chip or Clear all changes it.
  useEffect(() => setBpmMin(value.bpm_min?.toString() ?? ""), [value.bpm_min]);
  useEffect(() => setBpmMax(value.bpm_max?.toString() ?? ""), [value.bpm_max]);

  const min = parseBpm(bpmMin);
  const max = parseBpm(bpmMax);
  const inverted = min !== undefined && max !== undefined && min > max;

  const applyBpm = () => {
    if (inverted || (min === value.bpm_min && max === value.bpm_max)) return;
    onChange({ ...value, bpm_min: min, bpm_max: max });
  };
  const onBpmKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") applyBpm();
  };

  const setRating = (stars: number) =>
    onChange({ ...value, star_rating: value.star_rating === stars ? undefined : stars });

  return (
    <Stack gap={4}>
      <Field.Root invalid={inverted}>
        <Field.Label>BPM</Field.Label>
        <HStack gap={2}>
          <Input
            aria-label="Minimum BPM"
            placeholder="Min"
            type="number"
            inputMode="decimal"
            min={0}
            size="sm"
            fontSize="16px"
            value={bpmMin}
            onChange={(e) => setBpmMin(e.target.value)}
            onBlur={applyBpm}
            onKeyDown={onBpmKeyDown}
          />
          <Text color="fg.muted">–</Text>
          <Input
            aria-label="Maximum BPM"
            placeholder="Max"
            type="number"
            inputMode="decimal"
            min={0}
            size="sm"
            fontSize="16px"
            value={bpmMax}
            onChange={(e) => setBpmMax(e.target.value)}
            onBlur={applyBpm}
            onKeyDown={onBpmKeyDown}
          />
        </HStack>
        <Field.ErrorText>Min must not be above max</Field.ErrorText>
      </Field.Root>

      <Field.Root>
        <Field.Label>Key</Field.Label>
        <NativeSelect.Root size="sm">
          <NativeSelect.Field
            aria-label="Key"
            fontSize="16px"
            value={value.key ?? ""}
            onChange={(e) =>
              onChange({ ...value, key: e.currentTarget.value || undefined })
            }
          >
            <option value="">Any key</option>
            {KEY_FILTER_OPTIONS.map((key) => (
              <option key={key.value} value={key.value}>
                {key.label}
              </option>
            ))}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
      </Field.Root>

      <Field.Root>
        <Field.Label>Minimum rating</Field.Label>
        <HStack gap={0}>
          {[1, 2, 3, 4, 5].map((stars) => {
            const lit = (value.star_rating ?? 0) >= stars;
            return (
              <IconButton
                key={stars}
                aria-label={`${stars} star${stars > 1 ? "s" : ""} and up`}
                aria-pressed={value.star_rating === stars}
                size="sm"
                variant="ghost"
                color={lit ? "yellow.500" : "fg.muted"}
                onClick={() => setRating(stars)}
              >
                <LuStar fill={lit ? "currentColor" : "none"} />
              </IconButton>
            );
          })}
        </HStack>
      </Field.Root>
    </Stack>
  );
}
