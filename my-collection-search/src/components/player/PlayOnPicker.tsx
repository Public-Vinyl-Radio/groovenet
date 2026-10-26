"use client";

import React, { useEffect, useState } from "react";
import { Box, Button, chakra, Flex, Input, Text, VisuallyHidden } from "@chakra-ui/react";
import { FiArrowUpRight, FiCast } from "react-icons/fi";
import type { ServerPlayer } from "@groovenet/contracts";
import RetroDialog, { RetroDialogTitle } from "@/components/ui/RetroDialog";
import { overline } from "@/components/ui/RetroModalParts";
import { focusRing } from "@/app/houseStyle";
import { upcomingLocalTracks, usePlaybackTarget } from "@/providers/PlaybackTargetProvider";
import { usePlaylistPlayer } from "@/providers/PlaylistPlayerProvider";
import { isLive } from "@/providers/server-player/controller";
import { usePlaybackTargetDialog } from "@/stores/playbackTargetDialogStore";
import { useDeviceLabel } from "@/lib/deviceLabel";
import { formatSeconds } from "@/lib/trackUtils";
import { useServerQueueTracks } from "@/hooks/useServerQueueTracks";
import Artwork from "@/components/player/Artwork";
import ServerNotice from "@/components/player/ServerNotice";
import SpeakerDetails from "@/components/player/SpeakerDetails";
import { artworkAlt, artworkOf } from "@/components/player/trackMeta";

const LOCAL = "";
const tracks = (n: number) => `${n} ${n === 1 ? "track" : "tracks"}`;

function Rule({ label }: { label: string }) {
  return (
    <Flex align="center" gap="10px" mt="4px">
      <Text as="span" {...overline} fontSize="11px" letterSpacing="0.08em" fontWeight="semibold" color="fg.muted">
        {label}
      </Text>
      <Box flex="1" h="1px" bg="border" />
    </Flex>
  );
}

/** One radio row: a real radio input (arrow keys move between rows), drawn as the board's square-dot row. */
function OptionRow({
  value,
  checked,
  name,
  description,
  status,
  onSelect,
}: {
  value: string;
  checked: boolean;
  name: string;
  description: string;
  status?: string;
  onSelect: (value: string) => void;
}) {
  return (
    <chakra.label
      minH="64px"
      px="12px"
      py="10px"
      display="flex"
      alignItems="center"
      gap="12px"
      borderWidth="outline"
      borderColor={checked ? "border.ink" : "border"}
      bg={checked ? "bg.panel" : "transparent"}
      boxShadow={checked ? "sm" : "none"}
      cursor="pointer"
      _hover={{ bg: checked ? "bg.panel" : "bg.muted" }}
      css={{ "&:has(input:focus-visible)": { outline: `${focusRing.width} solid ${focusRing.color}`, outlineOffset: focusRing.offset } }}
    >
      <VisuallyHidden asChild>
        <input type="radio" name="play-on" value={value} checked={checked} onChange={() => onSelect(value)} />
      </VisuallyHidden>
      <Box aria-hidden w="14px" h="14px" flexShrink={0} borderWidth="outline" borderColor="border.ink" bg={checked ? "border.ink" : "transparent"} />
      <Flex direction="column" gap="2px" flex="1" minW={0}>
        <Text fontSize="16px" lineHeight="22px" fontWeight="semibold" truncate>
          {name}
        </Text>
        <Text fontSize="13px" lineHeight="18px" color="fg.muted">
          {description}
        </Text>
      </Flex>
      {status && (
        <Text as="span" fontFamily="mono" fontSize="10px" fontWeight="semibold" letterSpacing="0.08em" color="fg.muted">
          {status}
        </Text>
      )}
    </chakra.label>
  );
}

function Preview({ dashed, label, children }: { dashed?: "ink" | "rule"; label: string; children: React.ReactNode }) {
  return (
    <Flex
      as="section"
      aria-label={label}
      direction="column"
      gap="6px"
      mx="14px"
      ml="12px"
      mb="8px"
      mt="4px"
      px="12px"
      py="10px"
      borderWidth="outline"
      borderStyle="dashed"
      borderColor={dashed === "ink" ? "border.ink" : "border"}
      fontSize="13px"
      lineHeight="18px"
    >
      {children}
    </Flex>
  );
}

/** A live session: what's playing, where, how much is queued, and what joining does. */
function LivePreview({ server, joinLine }: { server: ServerPlayer; joinLine: string }) {
  const queue = server.state.queue;
  const index = queue.findIndex((entry) => entry.id === server.state.current_entry_id);
  const [current] = useServerQueueTracks(index < 0 ? [] : [queue[index]!]);
  const upNext = index < 0 ? queue.length : queue.length - index - 1;
  const duration = server.state.duration;
  return (
    <Preview dashed="ink" label="Active session on the server">
      <Text as="span" fontFamily="mono" fontSize="10px" fontWeight="semibold" letterSpacing="0.08em" color="fg.muted">
        ACTIVE SESSION · {server.name.toUpperCase()}
      </Text>
      {current && (
        <Flex align="center" gap="10px">
          <Artwork src={artworkOf(current)} alt={artworkAlt(current)} size="36px" />
          <Flex direction="column" flex="1" minW={0}>
            <Text fontSize="14px" fontWeight="semibold" truncate>
              {current.title}
            </Text>
            <Text fontSize="12px" lineHeight="16px" color="fg.muted" truncate>
              {current.artist} · {formatSeconds(server.state.position)}
              {duration ? ` / ${formatSeconds(duration)}` : ""}
            </Text>
          </Flex>
        </Flex>
      )}
      <Text as="span" fontFamily="mono" fontSize="11px" color="fg.muted">
        {upNext} up next
      </Text>
      <Text pt="6px" borderTopWidth="rule" borderColor="border">
        {joinLine}
      </Text>
    </Preview>
  );
}

function UnlockForm() {
  const target = usePlaybackTarget();
  const [passphrase, setPassphrase] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  return (
    <chakra.form
      display="flex"
      flexDirection="column"
      gap="8px"
      onSubmit={(event) => {
        event.preventDefault();
        setUnlocking(true);
        const credential = passphrase;
        setPassphrase("");
        void target.unlock(credential).finally(() => setUnlocking(false));
      }}
    >
      <Text fontSize="13px" lineHeight="18px">
        Unlock to see the music servers in this house.
      </Text>
      <chakra.label display="flex" flexDirection="column" gap="4px">
        <Text as="span" {...overline} fontSize="11px" color="fg.muted">
          Household web passphrase
        </Text>
        <Input type="password" autoComplete="current-password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} required fontSize="16px" />
      </chakra.label>
      <Button type="submit" variant="outline" minH="44px" disabled={unlocking}>
        Unlock music servers
      </Button>
      <Text fontSize="12px" lineHeight="16px" color="fg.muted">
        Use the web passphrase from your operator, never the worker API key.
      </Text>
    </chakra.form>
  );
}

/**
 * Play on (#793): where audio plays. This device, or any music server in the
 * house. Joining a server merges this device's upcoming tracks onto the end of
 * its queue; Play here comes back without touching the server. Closing the
 * picker never sends a command.
 */
export default function PlayOnPicker() {
  const target = usePlaybackTarget();
  const local = usePlaylistPlayer();
  const device = useDeviceLabel();
  const { open, setOpen } = usePlaybackTargetDialog();
  const [selected, setSelected] = useState(target.target);
  const [details, setDetails] = useState(false);
  const { authorized, loadPlayers } = target;

  useEffect(() => {
    if (!open) return;
    setSelected(target.target);
    setDetails(false);
    // Fetched each time it opens, so LIVE / IDLE is current; no all-players stream.
    if (authorized) void loadPlayers();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset per open, not per target change
  }, [open, authorized, loadPlayers]);

  const close = () => setOpen(false);
  // The connected server's own snapshot is fresher than the list's.
  const players = target.players.map((p) => (p.id === target.remote.player?.id ? target.remote.player : p));
  if (target.remote.player && !players.some((p) => p.id === target.remote.player!.id)) players.push(target.remote.player);
  const chosen = players.find((p) => p.id === selected) ?? null;
  const fromLocal = target.target === LOCAL;
  const upcoming = fromLocal ? upcomingLocalTracks(local).length : 0;
  const isCurrent = selected === target.target;

  const joinLine = (() => {
    if (isCurrent) return "You're controlling this server's queue.";
    if (!fromLocal) return "Switch to control this server's queue.";
    if (upcoming > 0) return `Your queue (${tracks(upcoming)}) joins the end of this one.`;
    return "Join to control its queue from here.";
  })();

  const airPlay = () => {
    // AirPlay only carries this device's audio.
    if (!fromLocal) target.playHere();
    close();
    local.showAirPlayPicker();
  };

  const confirm = () => {
    if (!isCurrent) {
      if (selected === LOCAL) target.playHere();
      else target.join(selected);
    }
    close();
  };

  const header = (
    <Box flex="1" minW={0}>
      <Text {...overline} fontSize="11px" lineHeight="14px" opacity={0.8}>
        PLAY ON
      </Text>
      <RetroDialogTitle m={0} fontSize="16px" lineHeight="22px" fontWeight="semibold">
        Choose where audio plays
      </RetroDialogTitle>
    </Box>
  );

  const footer = details ? null : (
    <Box p="12px 14px 12px 12px">
      <Button variant="solid" minH="44px" w="100%" onClick={confirm} disabled={selected !== LOCAL && !chosen}>
        {isCurrent ? "Done" : selected === LOCAL ? "Play here" : `Join ${chosen?.name ?? "server"}`}
      </Button>
    </Box>
  );

  return (
    <RetroDialog open={open} onOpenChange={setOpen} header={header} footer={footer}>
      {details ? (
        <>
          <Box px="14px" pl="12px" pt="12px">
            <ServerNotice />
          </Box>
          <SpeakerDetails onBack={() => setDetails(false)} />
        </>
      ) : (
        <>
          <Flex role="radiogroup" aria-label="Output" direction="column" gap="10px" p="14px 14px 6px 12px">
            <OptionRow
              value={LOCAL}
              checked={selected === LOCAL}
              name={device}
              description={local.isAirPlayAvailable ? "Plays here, through this device or AirPlay" : "Plays here, through this device"}
              onSelect={setSelected}
            />
            <Rule label="MUSIC SERVERS" />
            {authorized ? (
              <>
                {players.map((p) => {
                  const live = isLive(p);
                  return (
                    <OptionRow
                      key={p.id}
                      value={p.id}
                      checked={selected === p.id}
                      name={p.name}
                      description={
                        p.id === target.target ? "Connected · shared queue" : live ? "Session live · join to share its queue" : "Idle · start a session"
                      }
                      status={live ? "LIVE" : "IDLE"}
                      onSelect={setSelected}
                    />
                  );
                })}
                {target.problem ? (
                  <Flex role="alert" align="center" gap="8px" fontSize="13px">
                    <Text flex="1">{target.problem}</Text>
                    <Button size="xs" variant="outline" onClick={() => void loadPlayers()}>
                      Retry
                    </Button>
                  </Flex>
                ) : (
                  players.length === 0 && <Text fontSize="13px">No music servers are configured yet.</Text>
                )}
              </>
            ) : (
              <>
                <UnlockForm />
                {target.problem && (
                  <Text role="alert" fontSize="13px">
                    {target.problem}
                  </Text>
                )}
              </>
            )}
          </Flex>

          {selected === LOCAL && players.length > 0 && (
            <Preview label="Local playback">Playing here never stops a server. It keeps playing its queue.</Preview>
          )}
          {chosen && (isLive(chosen) ? <LivePreview server={chosen} joinLine={joinLine} /> : (
            <Preview label="Idle server">
              {fromLocal && upcoming > 0 && !isCurrent
                ? `Nothing playing on ${chosen.name}. Joining starts a new session with your queue (${tracks(upcoming)}).`
                : `Nothing playing on ${chosen.name}. ${joinLine}`}
            </Preview>
          ))}
          {chosen && isCurrent && (
            <Flex direction="column" gap="8px" mx="14px" ml="12px" mb="8px">
              <ServerNotice />
              <Button size="xs" variant="ghost" alignSelf="flex-start" onClick={() => setDetails(true)}>
                Speaker details
              </Button>
            </Flex>
          )}

          {local.isAirPlayAvailable && (
            <Flex direction="column" gap="8px" p="6px 14px 14px 12px">
              <Rule label="FROM THIS DEVICE" />
              <chakra.button
                type="button"
                onClick={airPlay}
                minH="52px"
                px="12px"
                py="8px"
                display="flex"
                alignItems="center"
                gap="12px"
                borderWidth="outline"
                borderColor="border"
                textAlign="left"
                cursor="pointer"
                _hover={{ bg: "bg.muted" }}
              >
                <FiCast size={20} aria-hidden />
                <Flex direction="column" flex="1">
                  <Text fontSize="15px" lineHeight="20px" fontWeight="semibold">
                    AirPlay…
                  </Text>
                  <Text fontSize="12px" lineHeight="16px" color="fg.muted">
                    Opens the system speaker picker
                  </Text>
                </Flex>
                <FiArrowUpRight size={14} aria-hidden />
              </chakra.button>
            </Flex>
          )}

          {authorized && (
            <Box px="14px" pl="12px" pb="12px">
              <Button size="xs" variant="ghost" color="fg.muted" onClick={() => void target.lock()}>
                Lock server access
              </Button>
            </Box>
          )}
        </>
      )}
    </RetroDialog>
  );
}
