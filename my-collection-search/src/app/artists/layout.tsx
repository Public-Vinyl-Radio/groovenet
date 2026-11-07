import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Artists",
};

export default function ArtistsLayout({ children }: { children: ReactNode }) {
  return children;
}
