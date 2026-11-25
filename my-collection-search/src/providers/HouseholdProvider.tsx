"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ProfilePicker, shouldShowPicker } from "@/components/ProfilePicker";
import { profilesApi, type ProfilesResponse } from "@/services/internalApi/profiles";
import { queryKeys } from "@/lib/queryKeys";

type HouseholdContext = { data?: ProfilesResponse; switchProfile: () => void };
const Context = createContext<HouseholdContext>({ switchProfile: () => {} });
export const useHousehold = () => useContext(Context);
export function HouseholdProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const profiles = useQuery({
    queryKey: queryKeys.household(),
    queryFn: profilesApi.list,
    staleTime: 60_000,
  });
  const [switching, setSwitching] = useState(false);
  const selection = useMutation({
    mutationFn: profilesApi.select,
    onSuccess: async () => {
      setSwitching(false);
      await client.invalidateQueries();
    },
  });
  const attempted = useRef<string | null>(null);
  const data = profiles.data;
  // Persist the sole or automatically mapped profile too, allowing opt-in API enforcement on LAN browsers.
  useEffect(() => {
    if (data?.current && !data.selected && attempted.current !== data.current.id) {
      attempted.current = data.current.id;
      selection.mutate(data.current.id);
    }
  }, [data, selection]);
  return (
    <Context.Provider value={{ data, switchProfile: () => setSwitching(true) }}>
      {children}
      <ProfilePicker
        profiles={data?.users ?? []}
        open={switching || (!!data && shouldShowPicker(data.users, data.current))}
        dismissible={switching && !!data?.current}
        pending={selection.isPending}
        error={selection.error?.message}
        onSelect={(id) => selection.mutate(id)}
        onClose={() => setSwitching(false)}
      />
    </Context.Provider>
  );
}
