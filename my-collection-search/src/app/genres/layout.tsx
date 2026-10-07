import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Genres",
};

export default function GenresLayout({ children }: { children: ReactNode }) {
  return children;
}
