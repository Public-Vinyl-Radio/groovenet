// app/providers/UsernameProvider.tsx
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFriendsQuery } from "@/hooks/useFriendsQuery";
import { queryKeys } from "@/lib/queryKeys";
import {
  fetchDefaultLibrarySettings,
  updateDefaultLibrarySettings,
} from "@/services/internalApi/settings";
import { Friend } from "@/types/track";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type UsernameContextValue = {
  friend: Friend | null;
  setFriend: (u: Friend | null) => void;
  clearFriend: () => void;
  isHydrated: boolean;
  isSaving: boolean;
};

const UsernameContext = createContext<UsernameContextValue | null>(null);

export function UsernameProvider({
  children,
  initialFriend = null,
}: {
  children: React.ReactNode;
  initialFriend?: Friend | null;
}) {
  const STORAGE_KEY = "mcs:selectedFriend";
  const queryClient = useQueryClient();
  const { friends, friendsLoading } = useFriendsQuery({
    showCurrentUser: true,
  });
  const { data: defaultLibrary, isLoading: defaultLibraryLoading } = useQuery({
    queryKey: queryKeys.defaultLibrary(),
    queryFn: fetchDefaultLibrarySettings,
    staleTime: 60_000,
  });
  const [friend, _setFriend] = useState<Friend | null>(initialFriend);
  const [storedFriend, setStoredFriend] = useState<Friend | null>(initialFriend);
  const [isHydrated, setIsHydrated] = useState(false);
  const autoPersistedFriendIdRef = useRef<number | null>(null);

  const persist = useCallback((f: Friend | null) => {
    try {
      if (f) localStorage.setItem(STORAGE_KEY, JSON.stringify(f));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore storage errors (private mode, quota, etc.)
    }
  }, []);

  const saveDefaultLibrary = useMutation({
    mutationFn: updateDefaultLibrarySettings,
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.defaultLibrary(), data);
      autoPersistedFriendIdRef.current = data.friend_id;
    },
    onError: () => {
      autoPersistedFriendIdRef.current = null;
    },
  });

  const applyFriend = useCallback(
    (f: Friend | null) => {
      setStoredFriend(f);
      _setFriend(f);
      persist(f);
    },
    [persist],
  );

  const setFriend = useCallback(
    (f: Friend | null) => {
      applyFriend(f);
      if (f?.id) {
        autoPersistedFriendIdRef.current = f.id;
        saveDefaultLibrary.mutate({ friend_id: f.id });
      }
    },
    [applyFriend, saveDefaultLibrary],
  );

  const clearFriend = useCallback(() => setFriend(null), [setFriend]);

  useEffect(() => {
    if (initialFriend) {
      applyFriend(initialFriend);
      setStoredFriend(initialFriend);
      persist(initialFriend);
      return;
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === "object" && "id" in parsed && "username" in parsed) {
          setStoredFriend(parsed as Friend);
        }
      }
    } catch {
      // ignore parse errors
    }
  }, [applyFriend, initialFriend, persist]);

  useEffect(() => {
    if (initialFriend) {
      setIsHydrated(true);
      return;
    }
    if (friendsLoading || defaultLibraryLoading) return;

    if (friends.length === 0) {
      applyFriend(null);
      setIsHydrated(true);
      return;
    }

    const savedFriendId = defaultLibrary?.friend_id ?? null;
    const savedFriend =
      typeof savedFriendId === "number"
        ? (friends.find((item) => item.id === savedFriendId) ?? null)
        : null;
    const fallbackStoredFriend = storedFriend
      ? (friends.find(
          (item) =>
            item.id === storedFriend.id ||
            item.username.trim().toLowerCase() === storedFriend.username.trim().toLowerCase(),
        ) ?? null)
      : null;
    const nextFriend = savedFriend ?? fallbackStoredFriend ?? friends[0] ?? null;

    if (nextFriend) {
      const hasValidSavedFriend =
        typeof savedFriendId === "number" && friends.some((item) => item.id === savedFriendId);
      if (!friend || friend.id !== nextFriend.id) {
        applyFriend(nextFriend);
      }
      if (
        !hasValidSavedFriend &&
        autoPersistedFriendIdRef.current !== nextFriend.id &&
        !saveDefaultLibrary.isPending
      ) {
        autoPersistedFriendIdRef.current = nextFriend.id;
        saveDefaultLibrary.mutate({ friend_id: nextFriend.id });
      }
    } else {
      applyFriend(null);
    }

    setIsHydrated(true);
  }, [
    applyFriend,
    defaultLibrary?.friend_id,
    defaultLibraryLoading,
    friend,
    friends,
    friendsLoading,
    initialFriend,
    saveDefaultLibrary,
    storedFriend,
  ]);

  // Sync across tabs via the storage event
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      try {
        if (e.newValue) {
          const parsed = JSON.parse(e.newValue) as unknown;
          if (parsed && typeof parsed === "object" && "id" in parsed && "username" in parsed) {
            setStoredFriend(parsed as Friend);
            _setFriend(parsed as Friend);
          } else {
            setStoredFriend(null);
            _setFriend(null);
          }
        } else {
          setStoredFriend(null);
          _setFriend(null);
        }
      } catch {
        setStoredFriend(null);
        _setFriend(null);
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const value = useMemo(
    () => ({
      friend,
      setFriend,
      clearFriend,
      isHydrated,
      isSaving: saveDefaultLibrary.isPending,
    }),
    [clearFriend, friend, isHydrated, saveDefaultLibrary.isPending, setFriend],
  );

  return <UsernameContext.Provider value={value}>{children}</UsernameContext.Provider>;
}

export function useUsername() {
  const ctx = useContext(UsernameContext);
  if (!ctx) {
    throw new Error("useUsername must be used within a UsernameProvider");
  }
  return ctx;
}
