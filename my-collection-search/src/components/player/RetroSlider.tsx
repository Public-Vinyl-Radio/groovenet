"use client";

import React from "react";
import { Slider } from "@chakra-ui/react";

type Props = {
  /** The thumb's accessible name: "Seek", "Volume". */
  label: string;
  value: number;
  max?: number;
  step?: number;
  /** Read out instead of the raw number, e.g. "0:36 of 4:02". */
  valueText?: string;
  onChange: (value: number) => void;
  /** Once a drag or key press settles: for a remote target that should get one command, not a stream. */
  onChangeEnd?: (value: number) => void;
  /** Thumb height; the track is always 10px. */
  thumbH?: string;
  width?: string;
  flex?: string;
};

/**
 * The design-system slider (#792): a 10px track with an ink outline, the
 * accent range and a square ink thumb. Arrow keys, Page Up/Down and Home/End
 * move it, as with any Chakra slider.
 */
export default function RetroSlider({
  label,
  value,
  max = 100,
  step = 1,
  valueText,
  onChange,
  onChangeEnd,
  thumbH = "22px",
  width,
  flex,
}: Props) {
  // The end event reports the controlled value, which a key press hasn't
  // re-rendered yet: commit the last value this slider reported instead.
  const last = React.useRef<number | null>(null);
  return (
    <Slider.Root
      width={width ?? "100%"}
      flex={flex}
      value={[value]}
      max={max}
      step={step}
      aria-label={[label]}
      getAriaValueText={valueText === undefined ? undefined : () => valueText}
      thumbAlignment="center"
      onValueChange={(e) => {
        last.current = e.value[0];
        onChange(e.value[0]);
      }}
      onValueChangeEnd={
        onChangeEnd
          ? (e) => {
              onChangeEnd(last.current ?? e.value[0]);
              last.current = null;
            }
          : undefined
      }
    >
      <Slider.Control h={thumbH}>
        <Slider.Track bg="bg.panel" height="10px" borderWidth="outline" borderColor="border.ink" rounded="none">
          <Slider.Range bg="accent.solid" />
        </Slider.Track>
        <Slider.Thumbs rounded="none" width="10px" height={thumbH} bg="neutral.solid" borderWidth="0" boxShadow="none" />
      </Slider.Control>
    </Slider.Root>
  );
}
