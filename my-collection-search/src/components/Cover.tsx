"use client";

import React, { useEffect, useState } from "react";
import { Box, Icon, Image, type BoxProps } from "@chakra-ui/react";
import { FiMusic } from "react-icons/fi";
import { coverTokens } from "@/app/houseStyle";
import { innerRadius } from "@/app/corners";

export type CoverProps = Omit<BoxProps, "children"> & {
  src?: string | null;
  alt?: string;
  size?: BoxProps["width"];
  fill?: boolean;
  inverse?: boolean;
  stacked?: boolean;
  shadow?: boolean;
  inspect?: boolean;
  playing?: boolean;
  /** A tile inside an outlined parent follows that parent's inner curve. */
  inset?: boolean;
  children?: React.ReactNode;
};

/** One square sleeve, including its fallback and overlays. */
export default function Cover({
  src,
  alt = "Artwork",
  size = "48px",
  fill = false,
  inverse = false,
  stacked = false,
  shadow = false,
  inspect = false,
  playing = false,
  inset = false,
  children,
  ...props
}: CoverProps) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <Box
      position="relative"
      width={fill ? "100%" : size}
      height={fill ? "auto" : size}
      aspectRatio={1}
      flexShrink={0}
      overflow="hidden"
      bg="bg.muted"
      borderWidth={coverTokens.borderWidth}
      borderColor={inverse ? "bg" : coverTokens.borderColor}
      borderRadius={inset ? innerRadius : coverTokens.radius}
      boxShadow={shadow ? "md" : stacked ? "sm" : undefined}
      css={{
        "& > img": {
          filter: inspect || playing ? "none" : `grayscale(${coverTokens.monochrome})`,
          "@media (prefers-reduced-motion: no-preference)": { transition: coverTokens.transition },
        },
        "&:hover > img, &:focus-within > img, :focus-visible & > img": { filter: "none" },
      }}
      {...props}
    >
      {!src || failed ? (
        <Box
          data-cover-placeholder=""
          width="100%"
          height="100%"
          position="absolute"
          inset={0}
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <Icon color="fg.muted" boxSize="40%">
            <FiMusic />
          </Icon>
        </Box>
      ) : (
        <Image
          src={src}
          alt={alt}
          width="100%"
          height="100%"
          position="absolute"
          inset={0}
          objectFit={inspect ? "contain" : "cover"}
          draggable={false}
          onError={() => setFailed(true)}
        />
      )}
      {children}
    </Box>
  );
}
