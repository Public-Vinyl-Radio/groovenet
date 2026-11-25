"use client";
import { useState } from "react";
import { Box, Button, HStack, Input, NativeSelect, Text, VStack } from "@chakra-ui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useHousehold } from "@/providers/HouseholdProvider";
import { profilesApi } from "@/services/internalApi/profiles";
import { queryKeys } from "@/lib/queryKeys";
import type { User, TokenScope } from "@/types/user";
import { SectionHeading } from "@/components/ui/SectionHeading";

function ProfileForm({ user, onSaved }: { user?: User; onSaved: () => void }) {
  const [name, setName] = useState(user?.name ?? "");
  const [login, setLogin] = useState(user?.tailscale_login ?? "");
  const mutation = useMutation({
    mutationFn: () =>
      user
        ? profilesApi.rename(user.id, name, login || null)
        : profilesApi.create(name, login || null),
    onSuccess: () => {
      if (!user) {
        setName("");
        setLogin("");
      }
      onSaved();
    },
  });
  return (
    <Box
      as="form"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
      borderWidth="outline"
      borderColor="border.ink"
      p={4}
    >
      <VStack align="stretch" gap={3}>
        <label>
          {user ? "Profile name" : "New profile name"}
          <Input
            aria-label={user ? `Name for ${user.name}` : "New profile name"}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={100}
          />
        </label>
        <label>
          Tailscale login (optional)
          <Input
            aria-label={user ? `Tailscale login for ${user.name}` : "New Tailscale login"}
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            maxLength={320}
          />
        </label>
        <Button
          type="submit"
          alignSelf="start"
          colorPalette={user ? "neutral" : "accent"}
          disabled={!name.trim() || mutation.isPending}
        >
          {user ? "Save profile" : "Add profile"}
        </Button>
        {mutation.error && <Text role="alert">{mutation.error.message}</Text>}
        {mutation.isSuccess && <Text role="status">Saved</Text>}
      </VStack>
    </Box>
  );
}
export default function HouseholdSettingsSection({ tokens = false }: { tokens?: boolean }) {
  const { data } = useHousehold();
  const client = useQueryClient();
  const details = useQuery({
    queryKey: queryKeys.householdTokens(),
    queryFn: profilesApi.tokens,
    enabled: !!data?.current?.is_owner,
  });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: queryKeys.household() });
    void client.invalidateQueries({ queryKey: queryKeys.householdTokens() });
  };
  const [name, setName] = useState("");
  const [userId, setUserId] = useState("");
  const [scope, setScope] = useState<TokenScope>("read");
  const [secret, setSecret] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => profilesApi.createToken(name, userId || data!.current!.id, scope),
    onSuccess: (result) => {
      setSecret(result.token);
      setName("");
      refresh();
    },
  });
  const revoke = useMutation({ mutationFn: profilesApi.revoke, onSuccess: refresh });
  if (!data?.current?.is_owner)
    return <Text>Only the owner profile can manage {tokens ? "API tokens" : "profiles"}.</Text>;
  if (!details.data)
    return (
      <Text role={details.error ? "alert" : "status"}>{details.error?.message ?? "Loading…"}</Text>
    );
  if (!tokens)
    return (
      <VStack align="stretch" gap={5}>
        {details.data.users.map((user) => (
          <ProfileForm key={user.id} user={user} onSaved={refresh} />
        ))}
        <SectionHeading>Add profile</SectionHeading>
        <ProfileForm onSaved={refresh} />
      </VStack>
    );
  return (
    <VStack align="stretch" gap={5}>
      <Box
        as="form"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
        borderWidth="outline"
        borderColor="border.ink"
        p={4}
      >
        <VStack align="stretch" gap={3}>
          <label>
            Token name
            <Input
              aria-label="Token name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={100}
            />
          </label>
          <label>
            Profile
            <NativeSelect.Root>
              <NativeSelect.Field
                aria-label="Token profile"
                value={userId || data.current.id}
                onChange={(e) => setUserId(e.target.value)}
              >
                {details.data.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </label>
          <label>
            Scope
            <NativeSelect.Root>
              <NativeSelect.Field
                aria-label="Token scope"
                value={scope}
                onChange={(e) => setScope(e.target.value as TokenScope)}
              >
                {["read", "write", "ingest"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </label>
          <Text color="fg.muted">
            Read views the library. Write can change it. Ingest reports audio and fingerprints.
          </Text>
          <Button
            type="submit"
            alignSelf="start"
            colorPalette="accent"
            disabled={!name.trim() || create.isPending}
          >
            Create token
          </Button>
          {create.error && <Text role="alert">{create.error.message}</Text>}
        </VStack>
      </Box>
      {secret && (
        <Box borderWidth="outline" borderColor="border.ink" p={4}>
          <Text>Copy this token now. It is shown only once.</Text>
          <Input
            aria-label="New API token"
            readOnly
            value={secret}
            onFocus={(e) => e.target.select()}
          />
          <Button mt={3} variant="outline" onClick={() => setSecret(null)}>
            Done
          </Button>
        </Box>
      )}
      {revoke.error && <Text role="alert">{revoke.error.message}</Text>}
      {details.data.tokens.map((token) => (
        <Box key={token.id} borderWidth="outline" borderColor="border.ink" p={4}>
          <HStack justify="space-between">
            <Text fontWeight="semibold">{token.name}</Text>
            <Text>{token.scope}</Text>
          </HStack>
          <Text color="fg.muted">
            {details.data.users.find((u) => u.id === token.user_id)?.name} · Last used:{" "}
            {token.last_used_at ? new Date(token.last_used_at).toLocaleString() : "Never"}
          </Text>
          {token.revoked_at ? (
            <Text>Revoked</Text>
          ) : (
            <Button
              mt={3}
              variant="outline"
              disabled={revoke.isPending}
              onClick={() => revoke.mutate(token.id)}
            >
              Revoke {token.name}
            </Button>
          )}
        </Box>
      ))}
    </VStack>
  );
}
