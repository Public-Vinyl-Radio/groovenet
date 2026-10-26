"use client";

import { useState } from "react";
import { Box, Button, Flex, NativeSelect, Text } from "@chakra-ui/react";
import { FiChevronLeft } from "react-icons/fi";
import type { ServerPlayer } from "@groovenet/contracts";
import { usePlaybackTarget } from "@/providers/PlaybackTargetProvider";
import { playerApi } from "@/services/internalApi/players";
import { overline } from "@/components/ui/RetroModalParts";

/**
 * Output routing for the connected server, out of the everyday player: the
 * desired output against the actual assignment, each speaker's observed
 * activity, remembering an output and a reviewed transfer from the player
 * that holds it. Nothing here starts playback unless the transfer asks to.
 */
export default function SpeakerDetails({ onBack }: { onBack: () => void }) {
  const { remote, controller, target } = usePlaybackTarget();
  const { player, devices, connected, busy } = remote;
  const [output, setOutput] = useState("");
  const [source, setSource] = useState<ServerPlayer | null>(null);
  const [transferPlay, setTransferPlay] = useState(false);
  const [allowUnknown, setAllowUnknown] = useState(false);
  const [takeover, setTakeover] = useState(false);
  const [transferProblem, setTransferProblem] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const disabled = !connected || busy;
  const device = devices.find((item) => item.id === output);
  const sourceId = device?.assigned_player_id;
  const availability = device?.observed.availability;
  const prepareTransfer = async (id: string) => {
    setPreparing(true);
    setTransferProblem(null);
    try {
      setSource(await playerApi.get(id));
    } catch {
      setTransferProblem("Unable to read the source player. Refresh outputs and try again.");
    } finally {
      setPreparing(false);
    }
  };
  const label = (text: string) => (
    <Text {...overline} fontSize="11px" color="fg.muted">
      {text}
    </Text>
  );
  return (
    <Flex direction="column" gap="12px" p="12px 14px 14px 12px" fontSize="13px" lineHeight="18px">
      <Flex align="center" gap="8px">
        <Button size="xs" variant="ghost" onClick={onBack}>
          <FiChevronLeft />
          Back
        </Button>
        <Text flex="1" fontWeight="semibold" fontSize="15px">
          Speaker details · {player?.name ?? target}
        </Text>
      </Flex>
      <Box>
        {label("Output")}
        <Text>Desired: {player?.state.desired_output ?? "None"}</Text>
        <Text>Assigned: {player?.assigned_output ?? "None"}</Text>
        <Text color="fg.muted">Requested sender volume {player?.state.volume ?? 0}%. Some receivers ignore sender volume.</Text>
      </Box>
      <Box>
        {label("Speakers")}
        <Box as="ul" listStyleType="none" m={0} p={0}>
          {devices.length === 0 && <Text as="li">No outputs reported.</Text>}
          {devices.map((item) => (
            <Text as="li" key={item.id}>
              {item.name} · {item.observed.availability}
              {item.assigned_player_id ? ` · Claimed by ${item.assigned_player_id}` : ""}
            </Text>
          ))}
        </Box>
      </Box>
      <Box borderWidth="outline" borderColor="border.ink" p="10px" display="flex" flexDirection="column" gap="8px">
        <label>
          {label("Choose an output")}
          <NativeSelect.Root size="sm">
            <NativeSelect.Field
              aria-label="Output"
              value={output}
              onChange={(event) => {
                setOutput(event.target.value);
                setSource(null);
                setAllowUnknown(false);
                setTakeover(false);
                setTransferProblem(null);
              }}
            >
              <option value="">Choose an output</option>
              {devices.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
        </label>
        {device && (
          <Text color="fg.muted">
            Observed {device.observed.availability} via {device.observed.source} · {device.observed.observed_at ?? "no observation time"}.
          </Text>
        )}
        <Flex gap="8px" wrap="wrap">
          <Button size="xs" variant="outline" disabled={disabled || !output} onClick={() => void controller?.command({ type: "output.select", output_id: output })}>
            Remember desired output
          </Button>
          {sourceId && sourceId !== target && (
            <Button size="xs" variant="outline" disabled={disabled || preparing} onClick={() => void prepareTransfer(sourceId)}>
              Review transfer from {sourceId}
            </Button>
          )}
          <Button size="xs" variant="ghost" disabled={busy} onClick={() => void controller?.refresh()}>
            Refresh outputs
          </Button>
        </Flex>
        <Text color="fg.muted">Remembering an output doesn&apos;t connect it or start playback.</Text>
        {source && device && (
          <Box borderTopWidth="rule" borderColor="border" pt="8px" display="flex" flexDirection="column" gap="6px">
            <Text>
              Transfer {device.name} from {source.name} to {player?.name}. This detaches the source; each player keeps its own queue.
            </Text>
            <label>
              <input type="checkbox" checked={transferPlay} onChange={(event) => setTransferPlay(event.target.checked)} /> Start playback on {player?.name} as part of the transfer
            </label>
            {transferPlay && availability === "unknown" && (
              <label>
                <input type="checkbox" checked={allowUnknown} onChange={(event) => setAllowUnknown(event.target.checked)} /> Speaker status unknown: play anyway
              </label>
            )}
            {transferPlay && availability === "occupied" && (
              <label>
                <input type="checkbox" checked={takeover} onChange={(event) => setTakeover(event.target.checked)} /> Take over the speaker from its current sender
              </label>
            )}
            <Flex gap="8px" wrap="wrap">
              <Button
                size="xs"
                variant="outline"
                disabled={disabled || (transferPlay && ((availability === "unknown" && !allowUnknown) || (availability === "occupied" && !takeover)))}
                onClick={() => {
                  void controller?.command({ type: "output.transfer", from_player_id: source.id, from_revision: source.revision, output_id: output, play: transferPlay, allow_unknown: allowUnknown, takeover });
                  setSource(null);
                }}
              >
                Confirm transfer{transferPlay ? " and play" : " without playback"}
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setSource(null)}>
                Cancel transfer
              </Button>
            </Flex>
          </Box>
        )}
        {transferProblem && <Text role="alert">{transferProblem}</Text>}
      </Box>
    </Flex>
  );
}
