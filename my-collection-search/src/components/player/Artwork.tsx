"use client";

import React, { useEffect, useState } from "react";
import { Box, Icon, Image } from "@chakra-ui/react";
import { FiMusic } from "react-icons/fi";

type Props = {
  src?: string | null;
  alt?: string;
  size?: string;
  /** The hard container shadow, for Now playing's large cover. */
  shadow?: boolean;
  /** Fill the parent's width as a square (Now playing) instead of a fixed `size`. */
  fill?: boolean;
};

const ArtworkPlaceholder: React.FC<{ size: string; shadow?: boolean; fill?: boolean }> = ({
  size,
  shadow,
  fill,
}) => (
  <Box
    width={fill ? "100%" : size}
    height={fill ? "auto" : size}
    aspectRatio={1}
    bg="bg.muted"
    borderWidth="outline"
    borderColor="border.ink"
    boxShadow={shadow ? "md" : undefined}
    display="flex"
    alignItems="center"
    justifyContent="center"
    flexShrink={0}
  >
    <Icon color="fg.muted" boxSize="40%">
      <FiMusic />
    </Icon>
  </Box>
);

/** Square cover with the 2px ink outline; an icon placeholder when there's none or it fails. */
const Artwork: React.FC<Props> = ({ src, alt, size = "48px", shadow = false, fill = false }) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return <ArtworkPlaceholder size={size} shadow={shadow} fill={fill} />;
  }

  return (
    <Image
      src={src}
      alt={alt ?? "Artwork"}
      width={fill ? "100%" : size}
      height={fill ? "auto" : size}
      aspectRatio={1}
      objectFit="cover"
      flexShrink={0}
      borderWidth="outline"
      borderColor="border.ink"
      boxShadow={shadow ? "md" : undefined}
      onError={() => setFailed(true)}
    />
  );
};

export default Artwork;
