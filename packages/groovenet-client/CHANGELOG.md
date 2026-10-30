# Changelog

## [3.8.1](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-client-v3.8.0...groovenet-client-v3.8.1) (2026-10-30)


### Bug Fixes

* **dev:** single TypeScript version and a clean bootstrap ([#857](https://github.com/Public-Vinyl-Radio/groovenet/issues/857)) ([4d2f63f](https://github.com/Public-Vinyl-Radio/groovenet/commit/4d2f63f5715b57b19f5e0250ea832196586ed917))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @groovenet/contracts bumped from 1.4.0 to 1.4.1

## [3.8.0](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-client-v3.7.0...groovenet-client-v3.8.0) (2026-10-29)


### Features

* **cli:** show album art in the player TUI ([#851](https://github.com/Public-Vinyl-Radio/groovenet/issues/851)) ([85aa553](https://github.com/Public-Vinyl-Radio/groovenet/commit/85aa5532ad16d8e0cbc28652ff53fdef122790ca))

## [3.7.0](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-client-v3.6.0...groovenet-client-v3.7.0) (2026-10-28)


### Features

* **cli:** configurable keymap for the player TUI ([#835](https://github.com/Public-Vinyl-Radio/groovenet/issues/835)) ([972a865](https://github.com/Public-Vinyl-Radio/groovenet/commit/972a865b15cceef85bcf547a6ad9fd1e63498f08))
* **player:** add atomic session joins and all-player events ([#836](https://github.com/Public-Vinyl-Radio/groovenet/issues/836)) ([156f0eb](https://github.com/Public-Vinyl-Radio/groovenet/commit/156f0eb5ab542145f0a90c40a9565d22e1d70771))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @groovenet/contracts bumped from 1.3.0 to 1.4.0

## [3.6.0](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-client-v3.5.0...groovenet-client-v3.6.0) (2026-10-26)


### Features

* **player:** allow commands without expected revision ([#810](https://github.com/Public-Vinyl-Radio/groovenet/issues/810)) ([f2fe8ef](https://github.com/Public-Vinyl-Radio/groovenet/commit/f2fe8ef5b59a0b27b08d5969b4d67c2a35126679))
* **player:** atomic queue replacement and HA sender recognition ([#807](https://github.com/Public-Vinyl-Radio/groovenet/issues/807)) ([2e20762](https://github.com/Public-Vinyl-Radio/groovenet/commit/2e20762575314edccc73adb0a93182b0d901c00b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @groovenet/contracts bumped from 1.2.0 to 1.3.0

## [3.5.0](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-client-v3.4.0...groovenet-client-v3.5.0) (2026-10-25)


### Features

* **cli:** control persistent named server players ([#726](https://github.com/Public-Vinyl-Radio/groovenet/issues/726)) ([657c93f](https://github.com/Public-Vinyl-Radio/groovenet/commit/657c93fca77eb8079e50c123e46389258731aea3))
* **player:** add opt-in OwnTone backend with explicit EOF events ([#701](https://github.com/Public-Vinyl-Radio/groovenet/issues/701)) ([12b6b0a](https://github.com/Public-Vinyl-Radio/groovenet/commit/12b6b0a31016e7c9b67a7d559e9dcd9e6267934a))
* **player:** persist named server players and independent queues ([#725](https://github.com/Public-Vinyl-Radio/groovenet/issues/725)) ([9f82664](https://github.com/Public-Vinyl-Radio/groovenet/commit/9f82664b2450a71747427593007906facabf9949))
* **settings:** appearance — palette and light/dark/system picker ([#677](https://github.com/Public-Vinyl-Radio/groovenet/issues/677)) ([3c43663](https://github.com/Public-Vinyl-Radio/groovenet/commit/3c436631b761ed362d5eabfa94ca283b8b3eb0fd))
* **settings:** choose display, body and label fonts ([#686](https://github.com/Public-Vinyl-Radio/groovenet/issues/686)) ([c3ac994](https://github.com/Public-Vinyl-Radio/groovenet/commit/c3ac99409b6e042ab3fa07b22d92d9b850d32255))
* **settings:** custom colour palette with contrast checks ([#696](https://github.com/Public-Vinyl-Radio/groovenet/issues/696)) ([ad232ba](https://github.com/Public-Vinyl-Radio/groovenet/commit/ad232bac162881250e815d21f1457af22ab667b2))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @groovenet/contracts bumped from 1.1.0 to 1.2.0

## [3.4.0](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-client-v3.3.0...groovenet-client-v3.4.0) (2026-10-23)


### Features

* **player:** hide the cover-art window by default, add player_artwork option ([#648](https://github.com/Public-Vinyl-Radio/groovenet/issues/648)) ([acb2a4c](https://github.com/Public-Vinyl-Radio/groovenet/commit/acb2a4c7312c437809b3b67d8c83651cf39a0dfe))
* **player:** log plays from track-change events ([#658](https://github.com/Public-Vinyl-Radio/groovenet/issues/658)) ([df14f14](https://github.com/Public-Vinyl-Radio/groovenet/commit/df14f1422d0884f7a176304583adcb0064a9f572))


### Bug Fixes

* **mcp:** document and validate generate_ai_playlist payload ([#638](https://github.com/Public-Vinyl-Radio/groovenet/issues/638)) ([bea4942](https://github.com/Public-Vinyl-Radio/groovenet/commit/bea4942e5ad2caefca0f6d5635fbc966d66a1069))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @groovenet/contracts bumped from 1.0.1 to 1.1.0

## [3.3.0](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-client-v3.2.1...groovenet-client-v3.3.0) (2026-10-21)


### Features

* **cli:** add local player daemon and TUI ([#628](https://github.com/Public-Vinyl-Radio/groovenet/issues/628)) ([2adaaa2](https://github.com/Public-Vinyl-Radio/groovenet/commit/2adaaa28c0ee6493be255f8068a2cef42251db7d))


### Bug Fixes

* **mcp:** send track objects when creating a playlist ([#629](https://github.com/Public-Vinyl-Radio/groovenet/issues/629)) ([ae4003f](https://github.com/Public-Vinyl-Radio/groovenet/commit/ae4003f40144c216a125cd1010f519efdea91f19))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @groovenet/contracts bumped from 1.0.0 to 1.0.1

## [3.2.1](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-client-v3.2.0...groovenet-client-v3.2.1) (2026-10-18)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @groovenet/contracts bumped from * to 1.0.0

## [3.2.0](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-client-v3.1.1...groovenet-client-v3.2.0) (2026-10-17)


### Features

* **albums:** add ability to delete an album ([#542](https://github.com/Public-Vinyl-Radio/groovenet/issues/542)) ([414c9b6](https://github.com/Public-Vinyl-Radio/groovenet/commit/414c9b6f04ec30c4ab0579cfbc821779ba2e4a33))
* **albums:** preserve taxonomy overrides through Discogs sync ([#516](https://github.com/Public-Vinyl-Radio/groovenet/issues/516)) ([5da280a](https://github.com/Public-Vinyl-Radio/groovenet/commit/5da280affa665e8293ee8feb0f25928a4be0c39d))
* **cli,mcp:** expose similar genres with scores and signals ([#543](https://github.com/Public-Vinyl-Radio/groovenet/issues/543)) ([63a27b7](https://github.com/Public-Vinyl-Radio/groovenet/commit/63a27b7c967c8b6de7d0d0a7da45edec5f9fc271))


### Bug Fixes

* **essentia:** surface key confidence and profile disagreement ([#527](https://github.com/Public-Vinyl-Radio/groovenet/issues/527)) ([a41e9dd](https://github.com/Public-Vinyl-Radio/groovenet/commit/a41e9dd2cc4ad6e6bc105c3d52c4bd1a4fab496c))

## [3.1.1](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-client-v3.1.0...groovenet-client-v3.1.1) (2026-10-10)


### Bug Fixes

* **genres:** accept nullable album metadata ([#479](https://github.com/Public-Vinyl-Radio/groovenet/issues/479)) ([86c9a3b](https://github.com/Public-Vinyl-Radio/groovenet/commit/86c9a3b468cf01dd0060083d28fc2441e87465db))

## [3.1.0](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-client-v3.0.0...groovenet-client-v3.1.0) (2026-10-06)


### Features

* **cli:** groovenet genres review for fast reconciliation decisions ([#442](https://github.com/Public-Vinyl-Radio/groovenet/issues/442)) ([4c2205b](https://github.com/Public-Vinyl-Radio/groovenet/commit/4c2205b1d5ff5eb34281d470299912c5777d1760))
* **embeddings:** add a context embedding for natural-language retrieval ([#411](https://github.com/Public-Vinyl-Radio/groovenet/issues/411)) ([805820b](https://github.com/Public-Vinyl-Radio/groovenet/commit/805820b4aa6b91cf4717e05727dcbe2ee248b4bd))
* **genres:** add canonical taxonomy and admin API ([#414](https://github.com/Public-Vinyl-Radio/groovenet/issues/414)) ([2a72ae6](https://github.com/Public-Vinyl-Radio/groovenet/commit/2a72ae6f9a3f1fa7ff75b0d31b55d6a26d5bde43))
* **genres:** clickable genre badges ([#376](https://github.com/Public-Vinyl-Radio/groovenet/issues/376)) ([#453](https://github.com/Public-Vinyl-Radio/groovenet/issues/453)) ([fc4c2c2](https://github.com/Public-Vinyl-Radio/groovenet/commit/fc4c2c2e557ecf87842f6859a9c6e4fc6e759fd2))
* **genres:** reconcile local_tags onto the taxonomy via reviewed proposals ([#438](https://github.com/Public-Vinyl-Radio/groovenet/issues/438)) ([a8e658f](https://github.com/Public-Vinyl-Radio/groovenet/commit/a8e658f356b780bb4514c46301d3de849e7eff33))
* **genres:** scope local_tags reconciliation to one friend ([#439](https://github.com/Public-Vinyl-Radio/groovenet/issues/439)) ([dd19ee6](https://github.com/Public-Vinyl-Radio/groovenet/commit/dd19ee6627e3472cc74d29ea11a4e6d9c440078b))
* **genres:** store track genres as taxonomy links, with descriptors ([#431](https://github.com/Public-Vinyl-Radio/groovenet/issues/431)) ([1454744](https://github.com/Public-Vinyl-Radio/groovenet/commit/14547442fbbe130d7b757efdcb15fdeb1555cefb))
* **search:** filter tracks and albums by genre, including subgenres ([#375](https://github.com/Public-Vinyl-Radio/groovenet/issues/375)) ([#444](https://github.com/Public-Vinyl-Radio/groovenet/issues/444)) ([1f18c6f](https://github.com/Public-Vinyl-Radio/groovenet/commit/1f18c6f926627374fe89b555be3f6b1ddec7fc51))
* **search:** natural-language track search over context embeddings ([#413](https://github.com/Public-Vinyl-Radio/groovenet/issues/413)) ([11eaa54](https://github.com/Public-Vinyl-Radio/groovenet/commit/11eaa54d5f5110ee4ccbfcbeef391e222d06fa31))


### Bug Fixes

* **genres:** fewer new-genre proposals, and skip empty array local_tags ([#441](https://github.com/Public-Vinyl-Radio/groovenet/issues/441)) ([3d8db71](https://github.com/Public-Vinyl-Radio/groovenet/commit/3d8db7187713cb7f908c06c8ea65db45f6613bb6))
* **search:** apply BPM, key and rating filters in every search mode ([#422](https://github.com/Public-Vinyl-Radio/groovenet/issues/422)) ([96a05e3](https://github.com/Public-Vinyl-Radio/groovenet/commit/96a05e3db201d0a12c839d71eb6a28d11b49f86e))

## [3.0.0](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-client-v2.7.0...groovenet-client-v3.0.0) (2026-10-04)


### ⚠ BREAKING CHANGES

* **embeddings:** remove the legacy tracks.embedding prompt embedding ([#402](https://github.com/Public-Vinyl-Radio/groovenet/issues/402))

### Features

* **embeddings:** backfill API, CLI and status ([#392](https://github.com/Public-Vinyl-Radio/groovenet/issues/392)) ([a7ff8f9](https://github.com/Public-Vinyl-Radio/groovenet/commit/a7ff8f9094f51b3677d1c57f0128830cded0c7be))
* **embeddings:** remove the legacy tracks.embedding prompt embedding ([#402](https://github.com/Public-Vinyl-Radio/groovenet/issues/402)) ([079dc1b](https://github.com/Public-Vinyl-Radio/groovenet/commit/079dc1bf6973e1be7a65301689e461533327d868))
* **spins:** log a playlist as spins ([#395](https://github.com/Public-Vinyl-Radio/groovenet/issues/395)) ([db091a1](https://github.com/Public-Vinyl-Radio/groovenet/commit/db091a184ffa4e453926a4753db1c44dd7f1e3bd))

## [2.7.0](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-client-v2.6.0...groovenet-client-v2.7.0) (2026-10-02)


### Features

* **records:** record care UI — log care, copies on album detail, chores view ([#367](https://github.com/Public-Vinyl-Radio/groovenet/issues/367)) ([0909d8f](https://github.com/Public-Vinyl-Radio/groovenet/commit/0909d8fc8a13848caf4297b98b7cdc805242ca8d))
* **records:** track physical copies and care actions ([#358](https://github.com/Public-Vinyl-Radio/groovenet/issues/358)) ([52f32fc](https://github.com/Public-Vinyl-Radio/groovenet/commit/52f32fcdd409c8a30c54392a1befb2df201af1a4))

## [2.6.0](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-client-v2.5.0...groovenet-client-v2.6.0) (2026-09-30)


### Features

* **analytics:** instrument spins, sets, recommendations and sync; IDs-only events ([#347](https://github.com/Public-Vinyl-Radio/groovenet/issues/347)) ([66ae6ca](https://github.com/Public-Vinyl-Radio/groovenet/commit/66ae6ca9a99cd774bb4c74efec7f59d6f3d6a22d))

## [2.5.0](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-client-v2.4.0...groovenet-client-v2.5.0) (2026-09-28)


### Features

* **spins:** edit spins and move delete into an actions menu ([#341](https://github.com/Public-Vinyl-Radio/groovenet/issues/341)) ([8a1057d](https://github.com/Public-Vinyl-Radio/groovenet/commit/8a1057d29f256ba73cc6ec0b5e257830c68b486f))
* **spins:** show what was played on recent spin cards ([#340](https://github.com/Public-Vinyl-Radio/groovenet/issues/340)) ([abb90de](https://github.com/Public-Vinyl-Radio/groovenet/commit/abb90de1b1f36c79946b28d0318a5a7016756775))

## [2.4.0](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-client-v2.3.0...groovenet-client-v2.4.0) (2026-09-26)


### Features

* **cli:** derive a set's tracklist with groovenet sets ([#321](https://github.com/Public-Vinyl-Radio/groovenet/issues/321)) ([976db63](https://github.com/Public-Vinyl-Radio/groovenet/commit/976db63c4dfe91d62995f3fc3342842b9186ef4a))
* **cli:** review a set's differences and correct the playlist ([#326](https://github.com/Public-Vinyl-Radio/groovenet/issues/326)) ([61a0ca5](https://github.com/Public-Vinyl-Radio/groovenet/commit/61a0ca5cfb6d8ee07ae79fe6c4e52ee3056c485c))
* **obs:** structured logging and counters for the audio ingest pipeline ([#329](https://github.com/Public-Vinyl-Radio/groovenet/issues/329)) ([689ec77](https://github.com/Public-Vinyl-Radio/groovenet/commit/689ec77bbd726a86cf4e1cd90d533fe2c837b62f))


### Bug Fixes

* **vinyl:** fewer false plays, and spins from buffered audio ([#328](https://github.com/Public-Vinyl-Radio/groovenet/issues/328)) ([52eeb1d](https://github.com/Public-Vinyl-Radio/groovenet/commit/52eeb1d6d6fbfe1f12ae29f4b69c5856281be0b7))

## [2.3.0](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-client-v2.2.0...groovenet-client-v2.3.0) (2026-09-22)


### Features

* **fingerprints:** index new audio automatically instead of by hand ([#305](https://github.com/Public-Vinyl-Radio/groovenet/issues/305)) ([299e42b](https://github.com/Public-Vinyl-Radio/groovenet/commit/299e42b561e169e827a1061e358bf11b3de64da6))


### Bug Fixes

* **ingest:** make the audio-ingest volume writable by the app ([#301](https://github.com/Public-Vinyl-Radio/groovenet/issues/301)) ([6ee2225](https://github.com/Public-Vinyl-Radio/groovenet/commit/6ee2225fb6699738558b4406a01c2ab2994c2739))
* **spins:** wire play aggregation into a trigger and a scheduler ([#308](https://github.com/Public-Vinyl-Radio/groovenet/issues/308)) ([d18bda6](https://github.com/Public-Vinyl-Radio/groovenet/commit/d18bda605fc0d56d5da4403ff0b273d7f9b26ccc))

## [2.2.0](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-client-v2.1.0...groovenet-client-v2.2.0) (2026-09-21)


### Features

* **obs:** read APIs and CLI for the vinyl ingest pipeline ([#300](https://github.com/Public-Vinyl-Radio/groovenet/issues/300)) ([7dc74cc](https://github.com/Public-Vinyl-Radio/groovenet/commit/7dc74cc8360cc341f604c0008b861d77ca1be846))

## [2.1.0](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-client-v2.0.0...groovenet-client-v2.1.0) (2026-09-21)


### Features

* **cli:** groovenet fingerprint-library reference indexing command ([#288](https://github.com/Public-Vinyl-Radio/groovenet/issues/288)) ([a16cf63](https://github.com/Public-Vinyl-Radio/groovenet/commit/a16cf6351f8c70c4d37c47ff22dc62173133168d))

## [2.0.0](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-client-v1.0.3...groovenet-client-v2.0.0) (2026-09-20)


### ⚠ BREAKING CHANGES

* **cli:** remove the playback commands that never worked ([#261](https://github.com/Public-Vinyl-Radio/groovenet/issues/261))

### Features

* **cli:** remove the playback commands that never worked ([#261](https://github.com/Public-Vinyl-Radio/groovenet/issues/261)) ([75e5770](https://github.com/Public-Vinyl-Radio/groovenet/commit/75e5770dedd2f7f456ffaa5be940231800ffb5c3))
* **playlists:** add set metadata and history ([#257](https://github.com/Public-Vinyl-Radio/groovenet/issues/257)) ([f0e822c](https://github.com/Public-Vinyl-Radio/groovenet/commit/f0e822cce8abfb2aeb876f3c9e3225e5f914475b))


### Bug Fixes

* **db:** keep the original error when a transaction rollback fails ([#243](https://github.com/Public-Vinyl-Radio/groovenet/issues/243)) ([58ad074](https://github.com/Public-Vinyl-Radio/groovenet/commit/58ad074c494e86f9ec5bed55cb00b3a0fa39526e))

## [1.0.3](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-client-v1.0.2...groovenet-client-v1.0.3) (2026-09-13)


### Bug Fixes

* **client:** align track search with API ([#207](https://github.com/Public-Vinyl-Radio/groovenet/issues/207)) ([596d8c5](https://github.com/Public-Vinyl-Radio/groovenet/commit/596d8c5df7987559be50d2e5bbd2c8c8a3e5c5e7))

## [1.0.2](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-client-v1.0.1...groovenet-client-v1.0.2) (2026-09-12)


### Bug Fixes

* **albums:** sort recently added by Groovenet import time ([#196](https://github.com/Public-Vinyl-Radio/groovenet/issues/196)) ([d0bd652](https://github.com/Public-Vinyl-Radio/groovenet/commit/d0bd652e926b747d0ac8d8a3c3916f8a40e4055a))
* **build:** configure Node types for TypeScript 7 ([#194](https://github.com/Public-Vinyl-Radio/groovenet/issues/194)) ([79fd18f](https://github.com/Public-Vinyl-Radio/groovenet/commit/79fd18f89b61ae7474cc422c281e749f56c1c6fe))
