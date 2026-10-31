"use client";

import { createContext, useContext, type ReactNode } from "react";

const DEFAULT_TIME_ZONE = "UTC";

const DisplayTimeZoneContext = createContext<string>(DEFAULT_TIME_ZONE);

/** Carries the server-configured display time zone to client components. */
export function DisplayTimeZoneProvider({
  timeZone,
  children,
}: {
  timeZone: string;
  children: ReactNode;
}) {
  return (
    <DisplayTimeZoneContext.Provider value={timeZone}>{children}</DisplayTimeZoneContext.Provider>
  );
}

/** The IANA zone for day/month/hour bucketing; UTC outside a provider. */
export function useDisplayTimeZone(): string {
  return useContext(DisplayTimeZoneContext);
}
