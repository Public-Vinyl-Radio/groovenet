# Changelog

## [1.14.0](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-contracts-v1.13.0...groovenet-contracts-v1.14.0) (2026-11-28)


### Features

* **backup:** keep lossless out of the remote, add an optional local backup disk ([#1320](https://github.com/Public-Vinyl-Radio/groovenet/issues/1320)) ([4c5f38d](https://github.com/Public-Vinyl-Radio/groovenet/commit/4c5f38d98a9bbeace20517770d7d6a8935fe8d89))
* **settings:** contextual guidance for missing optional API keys ([#1319](https://github.com/Public-Vinyl-Radio/groovenet/issues/1319)) ([f3f0a2e](https://github.com/Public-Vinyl-Radio/groovenet/commit/f3f0a2e94acc389dcb786a0220f8bdb780965bd0))

## [1.13.0](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-contracts-v1.12.0...groovenet-contracts-v1.13.0) (2026-11-26)


### Features

* **audio:** keep the AAC file alongside the lossless FLAC ([#1312](https://github.com/Public-Vinyl-Radio/groovenet/issues/1312)) ([fe7463e](https://github.com/Public-Vinyl-Radio/groovenet/commit/fe7463e427a2747262e86073921af6b61643ba32))
* **playlists:** playlist owners and private playlists ([#1313](https://github.com/Public-Vinyl-Radio/groovenet/issues/1313)) ([18d5ac6](https://github.com/Public-Vinyl-Radio/groovenet/commit/18d5ac6e83851efd99955528b4ddf68569be9051))

## [1.12.0](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-contracts-v1.11.0...groovenet-contracts-v1.12.0) (2026-11-26)


### Features

* **appearance:** Maple Mono, a compact font picker, and fonts installed on this device ([#1296](https://github.com/Public-Vinyl-Radio/groovenet/issues/1296)) ([a9da1c7](https://github.com/Public-Vinyl-Radio/groovenet/commit/a9da1c7b3f54e2a2a04e112a60a18ae84b03602d))
* **appearance:** separate outline colour from ink in custom palettes ([#1297](https://github.com/Public-Vinyl-Radio/groovenet/issues/1297)) ([90b2966](https://github.com/Public-Vinyl-Radio/groovenet/commit/90b296626b227e85d0e773b4cabef12ab4e48d97))
* **auth:** household profiles with a profile picker and API tokens ([#1286](https://github.com/Public-Vinyl-Radio/groovenet/issues/1286)) ([2f3f674](https://github.com/Public-Vinyl-Radio/groovenet/commit/2f3f674f7be954473227d4074fb7cd9f6cc93417))
* **download-worker:** scaffold opt-in lossless wrapper and settings ([#1300](https://github.com/Public-Vinyl-Radio/groovenet/issues/1300)) ([a106e97](https://github.com/Public-Vinyl-Radio/groovenet/commit/a106e97572400a5d78e632a419e645d392d20469))
* **ratings:** per-profile star ratings ([#1303](https://github.com/Public-Vinyl-Radio/groovenet/issues/1303)) ([5ddc3f5](https://github.com/Public-Vinyl-Radio/groovenet/commit/5ddc3f50740cc53221a7eca0c6d8b65ce1b95e38))

## [1.11.0](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-contracts-v1.10.1...groovenet-contracts-v1.11.0) (2026-11-25)


### Features

* **import:** run the Discogs import as a background job ([#1278](https://github.com/Public-Vinyl-Radio/groovenet/issues/1278)) ([83b4e87](https://github.com/Public-Vinyl-Radio/groovenet/commit/83b4e8714661fc3cb6cdd5be359d0f099542aa45))
* **onboarding:** empty states and first-import guidance for an empty library ([#1275](https://github.com/Public-Vinyl-Radio/groovenet/issues/1275)) ([91dd393](https://github.com/Public-Vinyl-Radio/groovenet/commit/91dd39340c06c2a81a58f8150ce838d35a67f9e0))


### Bug Fixes

* **player:** explain a lost speaker, say when it's back, and reclaim it on play ([#1277](https://github.com/Public-Vinyl-Radio/groovenet/issues/1277)) ([7996797](https://github.com/Public-Vinyl-Radio/groovenet/commit/799679767cdd544901a4fff796fe7615168990fd))

## [1.10.1](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-contracts-v1.10.0...groovenet-contracts-v1.10.1) (2026-11-22)


### Bug Fixes

* **ui:** UX polish batch 10 — album row tags, home layout, more font choices ([#1250](https://github.com/Public-Vinyl-Radio/groovenet/issues/1250)) ([5003b15](https://github.com/Public-Vinyl-Radio/groovenet/commit/5003b15fddc884b72968cd7626a341676b7657f1))

## [1.10.0](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-contracts-v1.9.0...groovenet-contracts-v1.10.0) (2026-11-19)


### Features

* **ga-service:** order playlists by the active ranking profile ([#1207](https://github.com/Public-Vinyl-Radio/groovenet/issues/1207)) ([32e2e3a](https://github.com/Public-Vinyl-Radio/groovenet/commit/32e2e3af4c46bc82d674001bf495242864c1c872))
* **ranking:** export, import and share ranking profiles ([#1208](https://github.com/Public-Vinyl-Radio/groovenet/issues/1208)) ([2e71761](https://github.com/Public-Vinyl-Radio/groovenet/commit/2e71761d05f53a626cb884d51a8d9d1d95aef28d))
* **ranking:** normalise similarity signals within the candidate pool ([#1221](https://github.com/Public-Vinyl-Radio/groovenet/issues/1221)) ([ec2e50a](https://github.com/Public-Vinyl-Radio/groovenet/commit/ec2e50a91906e6a1f5545b0a20b7bd082f0338bf))
* **ranking:** one ranker contract with per-signal score breakdown ([#1198](https://github.com/Public-Vinyl-Radio/groovenet/issues/1198)) ([ac5132a](https://github.com/Public-Vinyl-Radio/groovenet/commit/ac5132a6e6cf683ccf245e2f3e59b6a5af480518))
* **ranking:** ranking profiles with Beatmatcher and Selector presets ([#1199](https://github.com/Public-Vinyl-Radio/groovenet/issues/1199)) ([81b68f5](https://github.com/Public-Vinyl-Radio/groovenet/commit/81b68f541f40fa0e6b82ce8897ccbdd0749a098b))
* **tracks:** show file genre and an owner-only lyrics panel ([#1176](https://github.com/Public-Vinyl-Radio/groovenet/issues/1176)) ([b305cd6](https://github.com/Public-Vinyl-Radio/groovenet/commit/b305cd6addc2e8028416ce6f2d882a43183cff3a))


### Bug Fixes

* **ingest:** retryable response for an incomplete upload ([#1227](https://github.com/Public-Vinyl-Radio/groovenet/issues/1227)) ([17901aa](https://github.com/Public-Vinyl-Radio/groovenet/commit/17901aadcf3e5383da4e941c75f3a43251f38468))
* **ranking:** Camelot key rule reads stored key spellings ([#1220](https://github.com/Public-Vinyl-Radio/groovenet/issues/1220)) ([29534d1](https://github.com/Public-Vinyl-Radio/groovenet/commit/29534d1e3e894f6a8f253fe985abec9f2d7b00b7))

## [1.9.0](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-contracts-v1.8.0...groovenet-contracts-v1.9.0) (2026-11-11)


### Features

* **artists:** grouped A–Z list with a jump index ([#1158](https://github.com/Public-Vinyl-Radio/groovenet/issues/1158)) ([7bb6682](https://github.com/Public-Vinyl-Radio/groovenet/commit/7bb66823848887bef63f10ffe203293c22cb755a))
* **cli:** guided split in artists review ([#1159](https://github.com/Public-Vinyl-Radio/groovenet/issues/1159)) ([a03ed77](https://github.com/Public-Vinyl-Radio/groovenet/commit/a03ed77ca65215b82447f60d0c60ed2f49f922f7))
* **settings:** offer mono fonts for body text ([#1165](https://github.com/Public-Vinyl-Radio/groovenet/issues/1165)) ([3146679](https://github.com/Public-Vinyl-Radio/groovenet/commit/3146679d21d1ef7115c65ddb264fb1cf454adaa8))
* **tracks:** backfill and store ISRC for tracks with an Apple Music link ([#1166](https://github.com/Public-Vinyl-Radio/groovenet/issues/1166)) ([43e83ec](https://github.com/Public-Vinyl-Radio/groovenet/commit/43e83ec22e1a7e9df9ee4385d5b7c3aea51fadec))
* **tracks:** import composer, genre and lyrics from embedded tags ([#1164](https://github.com/Public-Vinyl-Radio/groovenet/issues/1164)) ([0b6d57c](https://github.com/Public-Vinyl-Radio/groovenet/commit/0b6d57c982026d39276913d3c3594395f5a1f956))

## [1.8.0](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-contracts-v1.7.0...groovenet-contracts-v1.8.0) (2026-11-09)


### Features

* **artists:** artist filter on search and an artists index ([#1077](https://github.com/Public-Vinyl-Radio/groovenet/issues/1077)) ([72a22a1](https://github.com/Public-Vinyl-Radio/groovenet/commit/72a22a1c825db8f76d9a8c5cb4fefbcdf017d8fb))
* **artists:** artist page at /artists/[slug] ([#1068](https://github.com/Public-Vinyl-Radio/groovenet/issues/1068)) ([365cb9d](https://github.com/Public-Vinyl-Radio/groovenet/commit/365cb9d547b5e5e591e6de20a4cfcbb136e91cf2))
* **artists:** artists in the API, client, CLI and MCP ([#1071](https://github.com/Public-Vinyl-Radio/groovenet/issues/1071)) ([3464d5c](https://github.com/Public-Vinyl-Radio/groovenet/commit/3464d5cfc0f39b1f4128bc06f3c59d2a0ea754f5))
* **artists:** capture Discogs artist credits on import ([#1065](https://github.com/Public-Vinyl-Radio/groovenet/issues/1065)) ([fe0a5e8](https://github.com/Public-Vinyl-Radio/groovenet/commit/fe0a5e8813b4d6252135f330e17b0a93cd345312))
* **artists:** reconcile and backfill existing albums and tracks ([#1067](https://github.com/Public-Vinyl-Radio/groovenet/issues/1067)) ([8290241](https://github.com/Public-Vinyl-Radio/groovenet/commit/8290241e27abb5833f8c97e083b6d0a51b52425f))
* **artists:** review, merge and split artists from the CLI ([#1069](https://github.com/Public-Vinyl-Radio/groovenet/issues/1069)) ([08a30bc](https://github.com/Public-Vinyl-Radio/groovenet/commit/08a30bc63abba387b3ca37ddfad44aba56422b43))
* **chores:** show shelf codes and a card view for the pulled stack ([#1011](https://github.com/Public-Vinyl-Radio/groovenet/issues/1011)) ([3294504](https://github.com/Public-Vinyl-Radio/groovenet/commit/32945041cd86375051e101841f12992ab8ce34b8))
* **system:** orphan scan for audio files without tracks and tracks with missing files ([#1055](https://github.com/Public-Vinyl-Radio/groovenet/issues/1055)) ([440321e](https://github.com/Public-Vinyl-Radio/groovenet/commit/440321e3a5586ac93661f34c14f4f58903ade6da))
* **system:** Storage section with file totals, breakdown by source and codec, and free space ([#1060](https://github.com/Public-Vinyl-Radio/groovenet/issues/1060)) ([2a4a0ae](https://github.com/Public-Vinyl-Radio/groovenet/commit/2a4a0ae6c6924e1a89695bcd3cc21d5f0a10d20b))
* **tracks:** backfill audio file metadata and source for existing files ([#1058](https://github.com/Public-Vinyl-Radio/groovenet/issues/1058)) ([f4f2ecf](https://github.com/Public-Vinyl-Radio/groovenet/commit/f4f2ecf88214174caec2436c6deaa2fb733ca63b))
* **tracks:** persist local audio metadata and source ([#1056](https://github.com/Public-Vinyl-Radio/groovenet/issues/1056)) ([6d30191](https://github.com/Public-Vinyl-Radio/groovenet/commit/6d30191f592b3a4a45653b9e0b93c790756d8c2e))


### Bug Fixes

* **artists:** keep the inverted sort name for X, The artists ([#1085](https://github.com/Public-Vinyl-Radio/groovenet/issues/1085)) ([1dfcea1](https://github.com/Public-Vinyl-Radio/groovenet/commit/1dfcea1124454894972a773b1703a7aea60a8e17))
* **artists:** link credited artists when the display string differs from the credit name ([#1081](https://github.com/Public-Vinyl-Radio/groovenet/issues/1081)) ([6057149](https://github.com/Public-Vinyl-Radio/groovenet/commit/6057149a032b27c7739c5cfedbcc744e6499cafb))

## [1.7.0](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-contracts-v1.6.0...groovenet-contracts-v1.7.0) (2026-11-05)


### Features

* **settings:** Libraries section with add-library modal and default library ([#975](https://github.com/Public-Vinyl-Radio/groovenet/issues/975)) ([ce8dda9](https://github.com/Public-Vinyl-Radio/groovenet/commit/ce8dda991ebd38b8611ce5ad23086419e1da44ef))

## [1.6.0](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-contracts-v1.5.0...groovenet-contracts-v1.6.0) (2026-11-03)


### Features

* **record-care:** care stacks, batch logging, source and undo ([#947](https://github.com/Public-Vinyl-Radio/groovenet/issues/947)) ([f758153](https://github.com/Public-Vinyl-Radio/groovenet/commit/f7581536fc6afc856dc58c86a384564a50d8dea1))
* **record-care:** chores queue and cleaning progress API ([#949](https://github.com/Public-Vinyl-Radio/groovenet/issues/949)) ([2b88b05](https://github.com/Public-Vinyl-Radio/groovenet/commit/2b88b052e4ba6ee82118b10a0c5f1ef3f1b1a979))


### Bug Fixes

* **player:** re-adopt Groovenet's own OwnTone sessions after a restart or lost output ([#927](https://github.com/Public-Vinyl-Radio/groovenet/issues/927)) ([4db958b](https://github.com/Public-Vinyl-Radio/groovenet/commit/4db958bb9cf0a70d223f4ccfcaff0fdeab084d48))

## [1.5.0](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-contracts-v1.4.1...groovenet-contracts-v1.5.0) (2026-10-31)


### Features

* **api:** home summary endpoint ([#886](https://github.com/Public-Vinyl-Radio/groovenet/issues/886)) ([9db0b84](https://github.com/Public-Vinyl-Radio/groovenet/commit/9db0b84143463be75640c7ef850fdcac7b1a3d27))
* **spins:** medium filter and cursor paging on the spin list API ([#872](https://github.com/Public-Vinyl-Radio/groovenet/issues/872)) ([c108156](https://github.com/Public-Vinyl-Radio/groovenet/commit/c108156cfcc5dc0e46cc8157c34f84da25a89289))
* **spins:** monthly recap endpoint ([#873](https://github.com/Public-Vinyl-Radio/groovenet/issues/873)) ([3a3c2ef](https://github.com/Public-Vinyl-Radio/groovenet/commit/3a3c2ef35bc88c40b841eb6146cb63e382156361))
* **spins:** record the player output on digital spins ([#876](https://github.com/Public-Vinyl-Radio/groovenet/issues/876)) ([b438bc4](https://github.com/Public-Vinyl-Radio/groovenet/commit/b438bc453a27a6462c55fafa3d6e0315c0d2f2d1))
* **spins:** spin detail panel (desktop) and modal (phone) ([#875](https://github.com/Public-Vinyl-Radio/groovenet/issues/875)) ([f7529da](https://github.com/Public-Vinyl-Radio/groovenet/commit/f7529da3b487c5d7c522388cae5795d044282aff))

## [1.4.1](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-contracts-v1.4.0...groovenet-contracts-v1.4.1) (2026-10-30)


### Bug Fixes

* **dev:** single TypeScript version and a clean bootstrap ([#857](https://github.com/Public-Vinyl-Radio/groovenet/issues/857)) ([4d2f63f](https://github.com/Public-Vinyl-Radio/groovenet/commit/4d2f63f5715b57b19f5e0250ea832196586ed917))

## [1.4.0](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-contracts-v1.3.0...groovenet-contracts-v1.4.0) (2026-10-28)


### Features

* **genres:** build albums-first genre detail pages ([#831](https://github.com/Public-Vinyl-Radio/groovenet/issues/831)) ([955598a](https://github.com/Public-Vinyl-Radio/groovenet/commit/955598afdce11fdf1836514dedbc741c84d44632))
* **player:** add atomic session joins and all-player events ([#836](https://github.com/Public-Vinyl-Radio/groovenet/issues/836)) ([156f0eb](https://github.com/Public-Vinyl-Radio/groovenet/commit/156f0eb5ab542145f0a90c40a9565d22e1d70771))

## [1.3.0](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-contracts-v1.2.0...groovenet-contracts-v1.3.0) (2026-10-26)


### Features

* **api:** playlist list returns covers, set data and collaborator ([#778](https://github.com/Public-Vinyl-Radio/groovenet/issues/778)) ([db8a07f](https://github.com/Public-Vinyl-Radio/groovenet/commit/db8a07fcdf3779b7517a9bdb7d4b3d5029472629))
* **player:** allow commands without expected revision ([#810](https://github.com/Public-Vinyl-Radio/groovenet/issues/810)) ([f2fe8ef](https://github.com/Public-Vinyl-Radio/groovenet/commit/f2fe8ef5b59a0b27b08d5969b4d67c2a35126679))
* **player:** atomic queue replacement and HA sender recognition ([#807](https://github.com/Public-Vinyl-Radio/groovenet/issues/807)) ([2e20762](https://github.com/Public-Vinyl-Radio/groovenet/commit/2e20762575314edccc73adb0a93182b0d901c00b))
* **player:** log server player plays per queue entry ([#814](https://github.com/Public-Vinyl-Radio/groovenet/issues/814)) ([facd807](https://github.com/Public-Vinyl-Radio/groovenet/commit/facd807989d20046c17716cec4c6dbe295521cd3))
* **player:** persist per-player availability policy ([#813](https://github.com/Public-Vinyl-Radio/groovenet/issues/813)) ([fe91b34](https://github.com/Public-Vinyl-Radio/groovenet/commit/fe91b347d6ee25ee78878d97e367ab3241bda98a))

## [1.2.0](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-contracts-v1.1.0...groovenet-contracts-v1.2.0) (2026-10-25)


### Features

* **player:** control persistent server players from the web ([#743](https://github.com/Public-Vinyl-Radio/groovenet/issues/743)) ([ef2cd93](https://github.com/Public-Vinyl-Radio/groovenet/commit/ef2cd93113599a3b59643a0bdd0353b4cfeb93d9))
* **player:** persist named server players and independent queues ([#725](https://github.com/Public-Vinyl-Radio/groovenet/issues/725)) ([9f82664](https://github.com/Public-Vinyl-Radio/groovenet/commit/9f82664b2450a71747427593007906facabf9949))
* **settings:** appearance — palette and light/dark/system picker ([#677](https://github.com/Public-Vinyl-Radio/groovenet/issues/677)) ([3c43663](https://github.com/Public-Vinyl-Radio/groovenet/commit/3c436631b761ed362d5eabfa94ca283b8b3eb0fd))

## [1.1.0](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-contracts-v1.0.1...groovenet-contracts-v1.1.0) (2026-10-23)


### Features

* **player:** log plays from track-change events ([#658](https://github.com/Public-Vinyl-Radio/groovenet/issues/658)) ([df14f14](https://github.com/Public-Vinyl-Radio/groovenet/commit/df14f1422d0884f7a176304583adcb0064a9f572))


### Bug Fixes

* **contracts:** add repository field so npm provenance publishing succeeds ([#636](https://github.com/Public-Vinyl-Radio/groovenet/issues/636)) ([cc3838a](https://github.com/Public-Vinyl-Radio/groovenet/commit/cc3838a85b4780fafed4d6bb675510260df3e70e))

## [1.0.1](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-contracts-v1.0.0...groovenet-contracts-v1.0.1) (2026-10-21)


### Bug Fixes

* **essentia:** store BPM confidence from the beat histogram ([#607](https://github.com/Public-Vinyl-Radio/groovenet/issues/607)) ([356ba4b](https://github.com/Public-Vinyl-Radio/groovenet/commit/356ba4b8ef369253272290bed33e913c1538156d))

## 1.0.0 (2026-10-18)


### Bug Fixes

* **contracts:** set publishConfig.access to public ([#568](https://github.com/Public-Vinyl-Radio/groovenet/issues/568)) ([efac33e](https://github.com/Public-Vinyl-Radio/groovenet/commit/efac33e359d81378b69d534c769e6c60f49a3950))
