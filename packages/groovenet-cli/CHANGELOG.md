# Changelog

## [3.1.1](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-cli-v3.1.0...groovenet-cli-v3.1.1) (2026-10-10)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @groovenet/client bumped from ^3.1.0 to ^3.1.1

## [3.1.0](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-cli-v3.0.0...groovenet-cli-v3.1.0) (2026-10-06)


### Features

* **cli:** groovenet genres review for fast reconciliation decisions ([#442](https://github.com/Public-Vinyl-Radio/groovenet/issues/442)) ([4c2205b](https://github.com/Public-Vinyl-Radio/groovenet/commit/4c2205b1d5ff5eb34281d470299912c5777d1760))
* **embeddings:** add a context embedding for natural-language retrieval ([#411](https://github.com/Public-Vinyl-Radio/groovenet/issues/411)) ([805820b](https://github.com/Public-Vinyl-Radio/groovenet/commit/805820b4aa6b91cf4717e05727dcbe2ee248b4bd))
* **embeddings:** evaluate AI track notes for semantic retrieval ([#404](https://github.com/Public-Vinyl-Radio/groovenet/issues/404)) ([4b4ba62](https://github.com/Public-Vinyl-Radio/groovenet/commit/4b4ba62b21f1fd5a0b32883d60b26ddb829fde93))
* **genres:** reconcile local_tags onto the taxonomy via reviewed proposals ([#438](https://github.com/Public-Vinyl-Radio/groovenet/issues/438)) ([a8e658f](https://github.com/Public-Vinyl-Radio/groovenet/commit/a8e658f356b780bb4514c46301d3de849e7eff33))
* **genres:** scope local_tags reconciliation to one friend ([#439](https://github.com/Public-Vinyl-Radio/groovenet/issues/439)) ([dd19ee6](https://github.com/Public-Vinyl-Radio/groovenet/commit/dd19ee6627e3472cc74d29ea11a4e6d9c440078b))
* **search:** filter tracks and albums by genre, including subgenres ([#375](https://github.com/Public-Vinyl-Radio/groovenet/issues/375)) ([#444](https://github.com/Public-Vinyl-Radio/groovenet/issues/444)) ([1f18c6f](https://github.com/Public-Vinyl-Radio/groovenet/commit/1f18c6f926627374fe89b555be3f6b1ddec7fc51))
* **search:** natural-language track search over context embeddings ([#413](https://github.com/Public-Vinyl-Radio/groovenet/issues/413)) ([11eaa54](https://github.com/Public-Vinyl-Radio/groovenet/commit/11eaa54d5f5110ee4ccbfcbeef391e222d06fa31))


### Bug Fixes

* **search:** apply BPM, key and rating filters in every search mode ([#422](https://github.com/Public-Vinyl-Radio/groovenet/issues/422)) ([96a05e3](https://github.com/Public-Vinyl-Radio/groovenet/commit/96a05e3db201d0a12c839d71eb6a28d11b49f86e))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @groovenet/client bumped from ^3.0.0 to ^3.1.0

## [3.0.0](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-cli-v2.5.1...groovenet-cli-v3.0.0) (2026-10-04)


### ⚠ BREAKING CHANGES

* **embeddings:** remove the legacy tracks.embedding prompt embedding ([#402](https://github.com/Public-Vinyl-Radio/groovenet/issues/402))

### Features

* **embeddings:** backfill API, CLI and status ([#392](https://github.com/Public-Vinyl-Radio/groovenet/issues/392)) ([a7ff8f9](https://github.com/Public-Vinyl-Radio/groovenet/commit/a7ff8f9094f51b3677d1c57f0128830cded0c7be))
* **embeddings:** remove the legacy tracks.embedding prompt embedding ([#402](https://github.com/Public-Vinyl-Radio/groovenet/issues/402)) ([079dc1b](https://github.com/Public-Vinyl-Radio/groovenet/commit/079dc1bf6973e1be7a65301689e461533327d868))
* **records:** add CLI commands and MCP tools ([#391](https://github.com/Public-Vinyl-Radio/groovenet/issues/391)) ([a43a647](https://github.com/Public-Vinyl-Radio/groovenet/commit/a43a6475ef80b0001a235cd51cbee0d81e31aee5))
* **spins:** log a playlist as spins ([#395](https://github.com/Public-Vinyl-Radio/groovenet/issues/395)) ([db091a1](https://github.com/Public-Vinyl-Radio/groovenet/commit/db091a184ffa4e453926a4753db1c44dd7f1e3bd))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @groovenet/client bumped from ^2.7.0 to ^3.0.0

## [2.5.1](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-cli-v2.5.0...groovenet-cli-v2.5.1) (2026-10-02)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @groovenet/client bumped from ^2.6.0 to ^2.7.0

## [2.5.0](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-cli-v2.4.1...groovenet-cli-v2.5.0) (2026-09-30)


### Features

* **analytics:** instrument spins, sets, recommendations and sync; IDs-only events ([#347](https://github.com/Public-Vinyl-Radio/groovenet/issues/347)) ([66ae6ca](https://github.com/Public-Vinyl-Radio/groovenet/commit/66ae6ca9a99cd774bb4c74efec7f59d6f3d6a22d))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @groovenet/client bumped from ^2.5.0 to ^2.6.0

## [2.4.1](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-cli-v2.4.0...groovenet-cli-v2.4.1) (2026-09-28)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @groovenet/client bumped from ^2.4.0 to ^2.5.0

## [2.4.0](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-cli-v2.3.0...groovenet-cli-v2.4.0) (2026-09-26)


### Features

* **cli:** derive a set's tracklist with groovenet sets ([#321](https://github.com/Public-Vinyl-Radio/groovenet/issues/321)) ([976db63](https://github.com/Public-Vinyl-Radio/groovenet/commit/976db63c4dfe91d62995f3fc3342842b9186ef4a))
* **cli:** review a set's differences and correct the playlist ([#326](https://github.com/Public-Vinyl-Radio/groovenet/issues/326)) ([61a0ca5](https://github.com/Public-Vinyl-Radio/groovenet/commit/61a0ca5cfb6d8ee07ae79fe6c4e52ee3056c485c))
* **obs:** structured logging and counters for the audio ingest pipeline ([#329](https://github.com/Public-Vinyl-Radio/groovenet/issues/329)) ([689ec77](https://github.com/Public-Vinyl-Radio/groovenet/commit/689ec77bbd726a86cf4e1cd90d533fe2c837b62f))


### Bug Fixes

* **vinyl:** fewer false plays, and spins from buffered audio ([#328](https://github.com/Public-Vinyl-Radio/groovenet/issues/328)) ([52eeb1d](https://github.com/Public-Vinyl-Radio/groovenet/commit/52eeb1d6d6fbfe1f12ae29f4b69c5856281be0b7))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @groovenet/client bumped from ^2.3.0 to ^2.4.0

## [2.3.0](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-cli-v2.2.0...groovenet-cli-v2.3.0) (2026-09-22)


### Features

* **fingerprints:** index new audio automatically instead of by hand ([#305](https://github.com/Public-Vinyl-Radio/groovenet/issues/305)) ([299e42b](https://github.com/Public-Vinyl-Radio/groovenet/commit/299e42b561e169e827a1061e358bf11b3de64da6))


### Bug Fixes

* **ingest:** make the audio-ingest volume writable by the app ([#301](https://github.com/Public-Vinyl-Radio/groovenet/issues/301)) ([6ee2225](https://github.com/Public-Vinyl-Radio/groovenet/commit/6ee2225fb6699738558b4406a01c2ab2994c2739))
* **spins:** wire play aggregation into a trigger and a scheduler ([#308](https://github.com/Public-Vinyl-Radio/groovenet/issues/308)) ([d18bda6](https://github.com/Public-Vinyl-Radio/groovenet/commit/d18bda605fc0d56d5da4403ff0b273d7f9b26ccc))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @groovenet/client bumped from ^2.2.0 to ^2.3.0

## [2.2.0](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-cli-v2.1.0...groovenet-cli-v2.2.0) (2026-09-21)


### Features

* **obs:** read APIs and CLI for the vinyl ingest pipeline ([#300](https://github.com/Public-Vinyl-Radio/groovenet/issues/300)) ([7dc74cc](https://github.com/Public-Vinyl-Radio/groovenet/commit/7dc74cc8360cc341f604c0008b861d77ca1be846))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @groovenet/client bumped from ^2.1.0 to ^2.2.0

## [2.1.0](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-cli-v2.0.0...groovenet-cli-v2.1.0) (2026-09-21)


### Features

* **cli:** groovenet fingerprint-library reference indexing command ([#288](https://github.com/Public-Vinyl-Radio/groovenet/issues/288)) ([a16cf63](https://github.com/Public-Vinyl-Radio/groovenet/commit/a16cf6351f8c70c4d37c47ff22dc62173133168d))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @groovenet/client bumped from ^2.0.0 to ^2.1.0

## [2.0.0](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-cli-v1.0.3...groovenet-cli-v2.0.0) (2026-09-20)


### ⚠ BREAKING CHANGES

* **cli:** remove the playback commands that never worked ([#261](https://github.com/Public-Vinyl-Radio/groovenet/issues/261))

### Features

* **cli:** remove the playback commands that never worked ([#261](https://github.com/Public-Vinyl-Radio/groovenet/issues/261)) ([75e5770](https://github.com/Public-Vinyl-Radio/groovenet/commit/75e5770dedd2f7f456ffaa5be940231800ffb5c3))
* **playlists:** add set metadata and history ([#257](https://github.com/Public-Vinyl-Radio/groovenet/issues/257)) ([f0e822c](https://github.com/Public-Vinyl-Radio/groovenet/commit/f0e822cce8abfb2aeb876f3c9e3225e5f914475b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @groovenet/client bumped from ^1.0.2 to ^2.0.0

## [1.0.3](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-cli-v1.0.2...groovenet-cli-v1.0.3) (2026-09-13)


### Bug Fixes

* **client:** align track search with API ([#207](https://github.com/Public-Vinyl-Radio/groovenet/issues/207)) ([596d8c5](https://github.com/Public-Vinyl-Radio/groovenet/commit/596d8c5df7987559be50d2e5bbd2c8c8a3e5c5e7))

## [1.0.2](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-cli-v1.0.1...groovenet-cli-v1.0.2) (2026-09-13)


### Bug Fixes

* **cli:** publish from app releases only ([#205](https://github.com/Public-Vinyl-Radio/groovenet/issues/205)) ([db3225d](https://github.com/Public-Vinyl-Radio/groovenet/commit/db3225d4d7d1c24829428c59a19a641d6a3606f8))

## [1.0.1](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-cli-v1.0.0...groovenet-cli-v1.0.1) (2026-09-12)


### Bug Fixes

* **albums:** sort recently added by Groovenet import time ([#196](https://github.com/Public-Vinyl-Radio/groovenet/issues/196)) ([d0bd652](https://github.com/Public-Vinyl-Radio/groovenet/commit/d0bd652e926b747d0ac8d8a3c3916f8a40e4055a))
* **build:** configure Node types for TypeScript 7 ([#194](https://github.com/Public-Vinyl-Radio/groovenet/issues/194)) ([79fd18f](https://github.com/Public-Vinyl-Radio/groovenet/commit/79fd18f89b61ae7474cc422c281e749f56c1c6fe))
