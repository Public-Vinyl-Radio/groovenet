import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SpinRecapPage from "@/components/spins/SpinRecapPage";
import { currentMonth, formatMonthTitle, isValidMonth } from "@/components/spins/spinMonth";
import { getDisplayTimeZone } from "@/server/config/timeZone";

type Props = { params: Promise<{ month: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { month } = await params;
  return { title: isValidMonth(month) ? `${formatMonthTitle(month)} recap` : "Recap" };
}

/** A month's recap. A malformed month, or one that hasn't started yet, is a 404. */
export default async function SpinRecapRoute({ params }: Props) {
  const { month } = await params;
  if (!isValidMonth(month) || month > currentMonth(getDisplayTimeZone())) notFound();
  return <SpinRecapPage month={month} />;
}
