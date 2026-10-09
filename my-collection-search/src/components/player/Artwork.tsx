"use client";

import React, { useEffect, useState } from "react";
import { Box, Icon, Image } from "@chakra-ui/react";
import { FiMusic } from "react-icons/fi";

const ArtworkPlaceholder: React.FC<{ size: string }> = ({ size }) => (
  <Box
    width={size}
    height={size}
    bg="bg.muted"
    borderRadius="md"
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

const Artwork: React.FC<{ src?: string | null; alt?: string; size?: string }> = ({
  src,
  alt,
  size = "48px",
}) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return <ArtworkPlaceholder size={size} />;
  }

  return (
    <Image
      src={src}
      alt={alt || "Artwork"}
      boxSize={size}
      objectFit="cover"
      borderRadius="md"
      borderWidth="1px"
      onError={() => setFailed(true)}
    />
  );
};

export default Artwork;
