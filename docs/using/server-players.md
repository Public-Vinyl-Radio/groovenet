---
title: Server players and Play on
description: Play on a named music server that keeps its queue when your browser closes, and send it to AirPlay speakers.
sidebar:
  order: 6
---

A **music server** is a named player that owns its queue and its playback. Your browser, or any other, connects to it as a remote. Close the tab and the music keeps playing; the queue stays on the server.

## Named players

Each player has a name, such as "Lounge", its own queue and one output. Several players can play at the same time, each to its own speaker. Players are created by whoever runs the server: you can't add or rename one from the web app. Synchronised groups of speakers aren't supported.

Without a music server, **This device** plays the audio in your browser, and it stops when you close the tab. Everything below is about the other mode.

## Play on

**Play on** chooses where audio plays. Open it from the output button in the desktop player bar, from the **Play on** row in Now playing on a phone, or from **Playback** in the navigation. The picker lists this device, then every music server under **MUSIC SERVERS**. A server that is playing, paused or loading reads **LIVE**; any other is **IDLE**.

![The Play on picker on desktop, with a live server selected](../../site/src/assets/screenshots/play-on-desktop-light.png)

Choosing a row only previews it. The button at the bottom confirms. Your choice is remembered on this device, and choosing a server doesn't start playback by itself.

If the picker asks for a household passphrase first, enter the one your operator set for web access. It unlocks the players on this browser; **Lock server access** clears it again without touching the audio.

![The Play on picker on a phone](../../site/src/assets/screenshots/play-on-phone-light.png)

## Join, and hand off

- **Join a server** and the tracks left in your local queue, from the current one onward, are added to the end of the server's queue. If the server was idle, the first of them starts. Your device stops playing and its own queue is cleared, so there's one queue in view. If adding fails, your local queue is left alone.
- **Play here** switches back to this device. The server isn't stopped: it keeps playing its queue.
- Moving from one server to another carries nothing over.

Closing the picker, reloading the page or losing the connection never pauses or clears a server.

## The shared queue

Once you're joined, the player, Now playing and the queue are the same screens as local playback, reading the server's queue. The queue shows a **SERVER SESSION** strip with the server's name, "shared queue" and **Play here**.

Anyone connected can add, remove and reorder entries, and the last change wins. Play now replaces the server's queue; Enqueue adds to the end without starting anything. **Clear** shows a **Queue cleared · Undo** toast, as it does locally, but Undo is refused once anyone else has changed the queue.

Volume reads **SERVER VOL** and is sent when you let go of the slider. Some receivers ignore it.

## When the speaker is in use

If the server can't tell whether the speaker is free, or something else is using it, the player asks before it plays: **Speaker status unknown · Play anyway** or **Speaker in use · Take over**. Nothing is confirmed for you. If the engine itself is busy with something else, **Stop engine and take over** names the player and asks you to confirm.

**Speaker details**, from the connected server's preview in the picker, shows which speaker the player wants against which it has, and lets you move a speaker from another player.

## AirPlay

There are two kinds, and they differ in where the audio comes from.

- **From a server.** A server plays through its own engine, [OwnTone](https://github.com/Public-Vinyl-Radio/groovenet/blob/main/packages/groovenet-player/OWNTONE.md), which can send audio to an AirPlay speaker on your network. Your phone is just the remote, so locking it doesn't stop the music.
- **From a device.** Where your browser has an AirPlay picker (Safari), **AirPlay…** under **From this device** sends this device's own audio to a speaker. The audio still comes from the browser, so it stops when the tab does.

## Set up players (operator)

Setting up players is an operator task and is kept out of the way of everyday use:

- The `players` Compose profile (`docker-compose.players.yml`) adds a shared clock, one OwnTone engine per player and a player worker. The ordinary stack starts none of them.
- Engines need host networking for speaker discovery, and a read-only mount of your audio library. OwnTone must finish indexing before it can play a track.
- Browser access is off until you set a household passphrase and signing secret in `.env.player-web`. Missing or invalid settings leave it disabled; local playback and the CLI are unaffected.

The details are in [server players](https://github.com/Public-Vinyl-Radio/groovenet/blob/main/packages/groovenet-player/SERVER_PLAYERS.md) (Compose, credentials, adding a player) and [web controls](https://github.com/Public-Vinyl-Radio/groovenet/blob/main/my-collection-search/docs/server-player-web.md) (the passphrase and sessions).

## From the terminal

The CLI controls a server player with `--remote`: `groovenet player list` shows the players, and `groovenet player --remote lounge` opens the player on one. See [named server players](/docs/cli/#named-server-players) in the CLI guide.
