"use client";

import { useState } from "react";
import { Box, Button, Flex, Input, NativeSelect, Text } from "@chakra-ui/react";
import type { ServerPlayer } from "@groovenet/contracts";
import { usePlaybackTarget } from "@/providers/PlaybackTargetProvider";
import { toaster } from "@/components/ui/toaster";
import { playerApi } from "@/services/internalApi/players";

export function ServerPlayerPanel() {
  const { remote, controller, target } = usePlaybackTarget();
  const { player, devices, connected, busy, acknowledgement } = remote;
  const [output, setOutput] = useState("");
  const [source, setSource] = useState<ServerPlayer | null>(null);
  const [transferPlay, setTransferPlay] = useState(false);
  const [allowUnknown, setAllowUnknown] = useState(false);
  const [takeover, setTakeover] = useState(false);
  const [transferProblem, setTransferProblem] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const disabled = !connected || busy;
  const current = player?.state.queue.find(entry => entry.id === player.state.current_entry_id);
  const device = devices.find(item => item.id === output);
  const sourceId = device?.assigned_player_id;
  const prepareTransfer = async (sourceId: string) => {
    setPreparing(true); setTransferProblem(null);
    try { setSource(await playerApi.get(sourceId)); }
    catch { setTransferProblem("Unable to read the source player. Refresh outputs and try again."); }
    finally { setPreparing(false); }
  };
  return <Flex direction="column" gap={3} css={{ "& button, & input:not([type=checkbox]), & select": { minHeight: "44px" } }}>
    <Text fontWeight="bold">Server: {player?.name ?? target} · {connected ? player?.state.status : "Disconnected"}</Text>
    <Text>{current ? `${current.title} — ${current.artist}` : "No current track"}</Text>
    <Text>{Math.floor(player?.state.position ?? 0)} / {player?.state.duration == null ? "unknown" : Math.floor(player.state.duration)} seconds{player?.state.checkpoint ? " · Saved checkpoint" : ""}</Text>
    {remote.problem && <Text role="alert">{remote.problem}</Text>}
    {player?.state.error && <Text role="alert">Playback error · {player.state.error.code}: {player.state.error.message}</Text>}
    <Flex gap={2} wrap="wrap">
      <Button variant="outline" size="sm" disabled={disabled} onClick={() => void controller?.command({ type: "previous" })}>Previous</Button>
      <Button variant="solid" colorPalette="accent" size="sm" disabled={disabled} onClick={() => void controller?.command({ type: player?.state.status === "paused" ? "resume" : "play" })}>Play</Button>
      <Button variant="outline" size="sm" disabled={disabled} onClick={() => void controller?.command({ type: "pause" })}>Pause</Button>
      <Button variant="outline" size="sm" disabled={disabled} onClick={() => void controller?.command({ type: "stop" })}>Stop</Button>
      <Button variant="outline" size="sm" disabled={disabled} onClick={() => void controller?.command({ type: "next" })}>Next</Button>
      <Button variant="outline" size="sm" disabled={busy} onClick={() => void controller?.refresh()}>Refresh state and outputs</Button>
    </Flex>
    <form onSubmit={event => {
      event.preventDefault();
      const seconds = Number(new FormData(event.currentTarget).get("seconds"));
      void controller?.command({ type: "seek", seconds });
    }}>
      <label>Seek to seconds<Input name="seconds" type="number" min={0} max={player?.state.duration ?? undefined} step="any" required disabled={disabled} /></label>
      <Button variant="outline" size="sm" type="submit" disabled={disabled}>Seek</Button>
    </form>
    <form onSubmit={event => {
      event.preventDefault();
      void controller?.command({ type: "volume", volume: Number(new FormData(event.currentTarget).get("volume")) });
    }}>
      <label>Requested sender volume (%)<Input name="volume" type="number" min={0} max={100} required defaultValue={player?.state.volume ?? 0} key={`${target}:${player?.state.volume}`} disabled={disabled} /></label>
      <Button variant="outline" size="sm" type="submit" disabled={disabled}>Set volume</Button>
    </form>
    <Text fontSize="sm" color="fg.muted">Some receivers, including Lounge, ignore sender volume.</Text>
    <Text>Desired output: {player?.state.desired_output ?? "None"}</Text>
    <Text>Actual assignment: {player?.assigned_output ?? "None"}</Text>
    <Box borderWidth="outline" borderColor="border.ink" p={3}>
      <label>Output<NativeSelect.Root><NativeSelect.Field value={output} onChange={event => { setOutput(event.target.value); setSource(null); setAllowUnknown(false); setTakeover(false); setTransferProblem(null); }}>
        <option value="">Choose an output</option>
        {devices.map(item => <option key={item.id} value={item.id}>{item.name} · {item.observed.availability}{item.assigned_player_id ? ` · Claimed by ${item.assigned_player_id}` : ""}</option>)}
      </NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root></label>
      {device && <Text fontSize="sm">Observed: {device.observed.availability} · {device.observed.source} · {device.observed.observed_at ?? "No observation time"}. Sender identity unknown.</Text>}
      <Button variant="outline" size="sm" disabled={disabled || !output} onClick={() => void controller?.command({ type: "output.select", output_id: output })}>Remember desired output</Button>
      <Text fontSize="sm">Selecting an output does not connect it or start playback.</Text>
      {sourceId && sourceId !== target && <Button variant="outline" size="sm" disabled={disabled || preparing} onClick={() => void prepareTransfer(sourceId)}>Review transfer from {device.assigned_player_id}</Button>}
      {source && <Box borderTopWidth="rule" mt={3} pt={3}>
        <Text>Transfer {device?.name} from {source.name} to {player?.name}. This detaches the source; each player keeps its own queue and checkpoint.</Text>
        <label><input type="checkbox" checked={transferPlay} onChange={event => setTransferPlay(event.target.checked)} /> Start destination playback as part of this transfer</label>
        {transferPlay && device?.observed.availability === "unknown" && <label><input type="checkbox" checked={allowUnknown} onChange={event => setAllowUnknown(event.target.checked)} /> I acknowledge unknown speaker activity; connecting may interrupt another sender</label>}
        {transferPlay && device?.observed.availability === "occupied" && <label><input type="checkbox" checked={takeover} onChange={event => setTakeover(event.target.checked)} /> Take over occupied output and interrupt its current sender</label>}
        <Flex gap={2} wrap="wrap">
          <Button variant="outline" size="sm" disabled={disabled || (transferPlay && ((device?.observed.availability === "unknown" && !allowUnknown) || (device?.observed.availability === "occupied" && !takeover)))} onClick={() => { void controller?.command({ type: "output.transfer", from_player_id: source.id, from_revision: source.revision, output_id: output, play: transferPlay, allow_unknown: allowUnknown, takeover }); setSource(null); }}>Confirm transfer{transferPlay ? " and play" : " without playback"}</Button>
          <Button variant="outline" size="sm" onClick={() => setSource(null)}>Cancel transfer</Button>
        </Flex>
      </Box>}
      {transferProblem && <Text role="alert">{transferProblem}</Text>}
    </Box>
    {acknowledgement && <Box role="alert" borderWidth="outline" borderColor="border.ink" p={3}>
      <Text>{acknowledgement.code === "AVAILABILITY_UNKNOWN" ? "Speaker activity is unknown. Connecting may interrupt another sender." : "The output is occupied. Taking over may interrupt its current sender."}</Text>
      <Button variant="outline" size="sm" disabled={disabled} onClick={() => void controller?.acknowledge()}>{acknowledgement.code === "AVAILABILITY_UNKNOWN" ? "Acknowledge unknown activity and continue" : "Take over occupied output"}</Button>
      <Button variant="outline" size="sm" onClick={() => controller?.dismissAcknowledgement()}>Cancel</Button>
    </Box>}
    <Flex justify="space-between" align="center" gap={2}>
      <Text fontWeight="bold">Queue · {player?.state.queue.length ?? 0}</Text>
      <Button variant="outline" size="sm" disabled={disabled || !player?.state.queue.length} onClick={async () => {
        if (!player || !controller) return;
        const snapshot = structuredClone(player.state);
        const cleared = await controller.command({ type: "queue.clear" });
        if (!cleared) return;
        const clearedRevision = cleared.revision;
        toaster.create({ title: "Queue cleared", type: "info", action: { label: "Undo", onClick: () => {
          // Do not overwrite edits made by another controller after the clear.
          if (controller.getSnapshot().player?.revision !== clearedRevision) {
            toaster.create({ title: "Queue changed since it was cleared", description: "Undo is no longer available.", type: "warning" });
            return;
          }
          void controller.command({ type: "queue.replace", entries: snapshot.queue.map(({ id, track_id, friend_id }) => ({ id, track_id, friend_id })), current_entry_id: snapshot.current_entry_id, position: snapshot.position, play: snapshot.status === "playing" }, clearedRevision);
        } } });
      }}>Clear server queue</Button>
    </Flex>
    <Text fontSize="sm">Add music with the collection’s play and enqueue actions. In server mode, Play now replaces the queue with your selection.</Text>
    <Box as="ol" listStyleType="none" borderWidth="outline" borderColor="border.ink" boxShadow="sm">
      {player?.state.queue.map((entry, index) => <Box as="li" key={entry.id} p={2} borderBottomWidth="rule" aria-current={entry.id === player.state.current_entry_id ? "true" : undefined}>
        <Text>{index + 1}. {entry.title} — {entry.artist}{entry.id === player.state.current_entry_id ? " · Current" : ""}</Text>
        <Flex gap={2} wrap="wrap">
          <Button variant="outline" size="sm" disabled={disabled} onClick={() => void controller?.command({ type: "play", entry_id: entry.id })} aria-label={`Play queue entry ${index + 1}`}>Play</Button>
          <Button variant="outline" size="sm" disabled={disabled || index === 0} onClick={() => void controller?.command({ type: "queue.move", entry_id: entry.id, to: index - 1 })} aria-label={`Move queue entry ${index + 1} up`}>Up</Button>
          <Button variant="outline" size="sm" disabled={disabled || index === player.state.queue.length - 1} onClick={() => void controller?.command({ type: "queue.move", entry_id: entry.id, to: index + 1 })} aria-label={`Move queue entry ${index + 1} down`}>Down</Button>
          <Button variant="outline" size="sm" disabled={disabled} onClick={() => void controller?.command({ type: "queue.remove", entry_id: entry.id })} aria-label={`Remove queue entry ${index + 1}`}>Remove</Button>
        </Flex>
      </Box>)}
    </Box>
    <Text fontSize="sm" color="fg.muted">Closing this panel, switching players or losing the connection leaves server audio running.</Text>
  </Flex>;
}
