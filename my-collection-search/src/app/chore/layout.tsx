import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Chores",
};

export default function ChoreLayout({ children }: { children: ReactNode }) {
  return children;
}
