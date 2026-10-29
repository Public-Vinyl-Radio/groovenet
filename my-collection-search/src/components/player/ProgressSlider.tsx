"use client";

import React from "react";
import { Box, Flex, Text } from "@chakra-ui/react";
import { usePlayerTime } from "@/components/player/usePlayerTime";
import { formatSeconds } from "@/lib/trackUtils";
import RetroSlider from "@/components/player/RetroSlider";

type Props = {
  seek: (time: number) => void;
  /**
   * `inline` (the desktop bar): elapsed, slider, duration on one row.
   * `stacked` (Now playing): the slider over elapsed and time remaining.
   */
  layout?: "inline" | "stacked";
  /** Seek once on release (a server player) instead of scrubbing while dragging. */
  seekOnRelease?: boolean;
};

const timeCss = {
  fontFamily: "mono",
  fontSize: "12px",
  color: "fg.muted",
  fontVariantNumeric: "tabular-nums",
} as const;

const ProgressSlider: React.FC<Props> = React.memo(
  ({ seek, layout = "inline", seekOnRelease = false }) => {
    const { currentTime, duration } = usePlayerTime();
    const [dragPct, setDragPct] = React.useState<number | null>(null);
    const total = duration || 0;
    const toSeconds = (next: number) => (Math.max(0, Math.min(100, next)) / 100) * total;
    const elapsed = dragPct === null ? currentTime || 0 : toSeconds(dragPct);
    const pct = total > 0 ? Math.max(0, Math.min(100, (elapsed / total) * 100)) : 0;

    const slider = (
      <RetroSlider
        label="Seek"
        value={pct}
        step={0.1}
        valueText={`${formatSeconds(elapsed)} of ${formatSeconds(total)}`}
        thumbH={layout === "inline" ? "18px" : "22px"}
        flex="1"
        onChange={(next) => {
          if (seekOnRelease) return setDragPct(next);
          const target = toSeconds(next);
          if (Number.isFinite(target)) seek(target);
        }}
        onChangeEnd={
          seekOnRelease
            ? (next) => {
                setDragPct(null);
                const target = toSeconds(next);
                if (Number.isFinite(target) && total > 0) seek(target);
              }
            : undefined
        }
      />
    );

    if (layout === "stacked") {
      return (
        <Box>
          {slider}
          <Flex justify="space-between" mt="6px">
            <Text {...timeCss}>{formatSeconds(elapsed)}</Text>
            <Text {...timeCss}>−{formatSeconds(Math.max(total - elapsed, 0))}</Text>
          </Flex>
        </Box>
      );
    }

    return (
      <Flex align="center" gap="10px" w="100%">
        <Text {...timeCss} minW="36px" textAlign="right">
          {formatSeconds(elapsed)}
        </Text>
        {slider}
        <Text {...timeCss} minW="36px">
          {formatSeconds(total)}
        </Text>
      </Flex>
    );
  },
);
ProgressSlider.displayName = "ProgressSlider";

export default ProgressSlider;
