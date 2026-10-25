"use client";

import { useState } from "react";
import { Box, Button, Dialog, Flex, Input, NativeSelect, Portal, Text } from "@chakra-ui/react";
import { usePlaybackTarget } from "@/providers/PlaybackTargetProvider";
import { ServerPlayerPanel } from "./ServerPlayerPanel";

export function PlaybackTargetControl() {
  const target = usePlaybackTarget();
  const [passphrase, setPassphrase] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const selected = target.remote.player?.name ?? target.players.find(player => player.id === target.target)?.name ?? target.target;
  return <Dialog.Root size="lg" scrollBehavior="inside">
    <Box position="fixed" top="calc(var(--safe-top, 0px) + 8px)" right={3} zIndex={101}>
      <Dialog.Trigger asChild><Button variant="outline" size="sm" bg="bg.panel" minH="44px" maxW="calc(100vw - 24px)" overflow="hidden" textOverflow="ellipsis">Playback: {target.target === "" ? "Local browser" : `Server · ${selected}`}</Button></Dialog.Trigger>
      {target.target !== "" && (target.remote.problem || target.remote.player?.state.error) && <Text role="alert" bg="bg.panel" borderWidth="outline" borderColor="border.ink" p={2} maxW="min(380px, calc(100vw - 24px))" fontSize="sm">{target.remote.problem ?? target.remote.player?.state.error?.message}</Text>}
    </Box>
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
