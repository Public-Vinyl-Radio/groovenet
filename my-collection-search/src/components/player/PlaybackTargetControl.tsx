"use client";

import { useEffect, useState } from "react";
import { Button, Dialog, Flex, Input, NativeSelect, Portal, Text } from "@chakra-ui/react";
import { useOptionalPlaybackTarget, usePlaybackTarget } from "@/providers/PlaybackTargetProvider";
import { usePlaybackTargetDialog } from "@/stores/playbackTargetDialogStore";
import { toaster } from "@/components/ui/toaster";
import { ServerPlayerPanel } from "./ServerPlayerPanel";

/** Short label for nav triggers: "Local browser" or "Server · Lounge". */
export function usePlaybackTargetLabel(): string | null {
  const target = useOptionalPlaybackTarget();
  if (!target) return null;
  if (target.target === "") return "Local browser";
  const selected = target.remote.player?.name ?? target.players.find(player => player.id === target.target)?.name ?? target.target;
  return `Server · ${selected}`;
}

export function PlaybackTargetControl() {
  const target = usePlaybackTarget();
  const [passphrase, setPassphrase] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const { open, setOpen } = usePlaybackTargetDialog();
  // The trigger lives in the nav now, so a server problem has no button to sit under: surface it as a toast.
  const problem = target.target !== "" ? target.remote.problem ?? target.problem ?? target.remote.player?.state.error?.message ?? null : null;
  useEffect(() => {
    if (problem) toaster.create({ id: "playback-target-problem", title: "Server playback", description: problem, type: "error" });
  }, [problem]);
  return <Dialog.Root size="lg" scrollBehavior="inside" open={open} onOpenChange={event => setOpen(event.open)}>
    <Portal><Dialog.Backdrop /><Dialog.Positioner><Dialog.Content bg="bg.panel" borderWidth="outline" borderColor="border.ink" boxShadow="md">
      <Dialog.Header><Dialog.Title>Playback target</Dialog.Title><Dialog.CloseTrigger asChild><Button variant="outline" size="sm" aria-label="Close playback panel">Close</Button></Dialog.CloseTrigger></Dialog.Header>
      <Dialog.Body>
        <Flex direction="column" gap={3}>
          <label>Control playback on<NativeSelect.Root><NativeSelect.Field value={target.target} onChange={event => target.select(event.target.value)}>
            <option value="">Local browser</option>
            {target.target !== "" && !target.players.some(player => player.id === target.target) && <option value={target.target}>Server · {target.target}</option>}
            {target.players.map(player => <option key={player.id} value={player.id}>Server · {player.name}</option>)}
          </NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root></label>
          {!target.authorized ? <form onSubmit={event => {
            event.preventDefault(); setUnlocking(true);
            const credential = passphrase; setPassphrase("");
            void target.unlock(credential).finally(() => setUnlocking(false));
          }}>
            <label>Household web passphrase<Input type="password" autoComplete="current-password" value={passphrase} onChange={event => setPassphrase(event.target.value)} required /></label>
            <Button variant="outline" size="sm" type="submit" disabled={unlocking}>Unlock server players</Button>
            <Text fontSize="sm">Use the separate web passphrase provided by your operator. Never enter the worker API key.</Text>
          </form> : <Flex gap={2} wrap="wrap">
            <Button variant="outline" size="sm" onClick={() => void target.loadPlayers()}>Refresh players</Button>
            <Button variant="outline" size="sm" onClick={() => void target.lock()}>Lock browser access</Button>
          </Flex>}
          {target.problem && <Text role="alert">{target.problem}</Text>}
          {target.authorized && target.players.length === 0 && <Text>No configured players found. Ask the operator to configure named players and engines.</Text>}
          {target.target === "" ? <Text>Local audio plays in this browser. Its queue is kept separately from every server queue.</Text> : target.authorized ? <ServerPlayerPanel key={target.target} /> : <Text>Unlock access to view this server player. Server audio continues independently.</Text>}
        </Flex>
      </Dialog.Body>
    </Dialog.Content></Dialog.Positioner></Portal>
  </Dialog.Root>;
}
