"use client";
import React from "react";
import NextLink from "next/link";
import { Link } from "@chakra-ui/react";

export type AlbumLinkProps = {
  releaseId?: string | null;
  friendId?: number | null;
  stopPropagation?: boolean;
  children: React.ReactNode;
  className?: string;
};

export default function AlbumLink({
  releaseId,
  friendId,
  stopPropagation = false,
  children,
  className,
}: AlbumLinkProps) {
  if (!releaseId) {
    // No release id: just render children (e.g., plain text or image wrapper)
    return <>{children}</>;
  }

  const href = `/albums/${releaseId}${friendId ? `?friend_id=${friendId}` : ""}`;

  return (
    <Link asChild _hover={{ textDecoration: "underline" }} className={className}>
      <NextLink
        href={href}
        onClick={(e) => {
          if (stopPropagation) e.stopPropagation();
        }}
      >
        {children}
      </NextLink>
    </Link>
  );
}
