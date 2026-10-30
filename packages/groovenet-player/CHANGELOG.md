# Changelog

## [0.1.8](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-player-v0.1.7...groovenet-player-v0.1.8) (2026-10-30)


### Bug Fixes

* **dev:** single TypeScript version and a clean bootstrap ([#857](https://github.com/Public-Vinyl-Radio/groovenet/issues/857)) ([4d2f63f](https://github.com/Public-Vinyl-Radio/groovenet/commit/4d2f63f5715b57b19f5e0250ea832196586ed917))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @groovenet/client bumped from ^3.8.0 to ^3.8.1
    * @groovenet/contracts bumped from 1.4.0 to 1.4.1

## [0.1.7](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-player-v0.1.6...groovenet-player-v0.1.7) (2026-10-29)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @groovenet/client bumped from ^3.7.0 to ^3.8.0

## [0.1.6](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-player-v0.1.5...groovenet-player-v0.1.6) (2026-10-28)


### Features

* **cli:** player TUI queue view, Now Playing card and bottom strip ([#840](https://github.com/Public-Vinyl-Radio/groovenet/issues/840)) ([a4aadcf](https://github.com/Public-Vinyl-Radio/groovenet/commit/a4aadcf42caa937b5f68ecb64042c553a3bce08e))
* **player:** add a third OwnTone engine for a Bedroom server player ([#843](https://github.com/Public-Vinyl-Radio/groovenet/issues/843)) ([96b1318](https://github.com/Public-Vinyl-Radio/groovenet/commit/96b13181ff4cf419c12555476c70f506588fbcff))
* **player:** add atomic session joins and all-player events ([#836](https://github.com/Public-Vinyl-Radio/groovenet/issues/836)) ([156f0eb](https://github.com/Public-Vinyl-Radio/groovenet/commit/156f0eb5ab542145f0a90c40a9565d22e1d70771))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @groovenet/client bumped from ^3.6.0 to ^3.7.0
    * @groovenet/contracts bumped from 1.3.0 to 1.4.0

## [0.1.5](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-player-v0.1.4...groovenet-player-v0.1.5) (2026-10-26)


### Features

* **player:** allow commands without expected revision ([#810](https://github.com/Public-Vinyl-Radio/groovenet/issues/810)) ([f2fe8ef](https://github.com/Public-Vinyl-Radio/groovenet/commit/f2fe8ef5b59a0b27b08d5969b4d67c2a35126679))
* **player:** atomic queue replacement and HA sender recognition ([#807](https://github.com/Public-Vinyl-Radio/groovenet/issues/807)) ([2e20762](https://github.com/Public-Vinyl-Radio/groovenet/commit/2e20762575314edccc73adb0a93182b0d901c00b))
* **player:** log server player plays per queue entry ([#814](https://github.com/Public-Vinyl-Radio/groovenet/issues/814)) ([facd807](https://github.com/Public-Vinyl-Radio/groovenet/commit/facd807989d20046c17716cec4c6dbe295521cd3))
* **player:** persist per-player availability policy ([#813](https://github.com/Public-Vinyl-Radio/groovenet/issues/813)) ([fe91b34](https://github.com/Public-Vinyl-Radio/groovenet/commit/fe91b347d6ee25ee78878d97e367ab3241bda98a))
* **player:** provision web credentials from 1Password ([#755](https://github.com/Public-Vinyl-Radio/groovenet/issues/755)) ([427983b](https://github.com/Public-Vinyl-Radio/groovenet/commit/427983b44c19d4b76138dc08f05a457dce6349f9))


### Bug Fixes

* **player:** reject ambiguous HA output name mappings ([#812](https://github.com/Public-Vinyl-Radio/groovenet/issues/812)) ([c73f338](https://github.com/Public-Vinyl-Radio/groovenet/commit/c73f3382dfd431d4ad4607f5577fa889e64f540f))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @groovenet/client bumped from ^3.5.0 to ^3.6.0
    * @groovenet/contracts bumped from 1.2.0 to 1.3.0

## [0.1.4](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-player-v0.1.3...groovenet-player-v0.1.4) (2026-10-25)


### Features

* **player:** add opt-in OwnTone backend with explicit EOF events ([#701](https://github.com/Public-Vinyl-Radio/groovenet/issues/701)) ([12b6b0a](https://github.com/Public-Vinyl-Radio/groovenet/commit/12b6b0a31016e7c9b67a7d559e9dcd9e6267934a))
* **player:** add optional MPRIS desktop controls ([#679](https://github.com/Public-Vinyl-Radio/groovenet/issues/679)) ([b9a3bf2](https://github.com/Public-Vinyl-Radio/groovenet/commit/b9a3bf2a66ea3ba790ed291cf7755a5f72024858))
* **player:** control persistent server players from the web ([#743](https://github.com/Public-Vinyl-Radio/groovenet/issues/743)) ([ef2cd93](https://github.com/Public-Vinyl-Radio/groovenet/commit/ef2cd93113599a3b59643a0bdd0353b4cfeb93d9))
* **player:** persist named server players and independent queues ([#725](https://github.com/Public-Vinyl-Radio/groovenet/issues/725)) ([9f82664](https://github.com/Public-Vinyl-Radio/groovenet/commit/9f82664b2450a71747427593007906facabf9949))


### Bug Fixes

* **deploy:** preserve server players and resolve credentials from 1Password ([#729](https://github.com/Public-Vinyl-Radio/groovenet/issues/729)) ([1716439](https://github.com/Public-Vinyl-Radio/groovenet/commit/1716439d3a79abe717fd296ebe90fe57589e05f0))
* **player:** recover verified failed sessions and preserve errors ([#732](https://github.com/Public-Vinyl-Radio/groovenet/issues/732)) ([437ac38](https://github.com/Public-Vinyl-Radio/groovenet/commit/437ac38763defcdc3b9c5773fcfae7e598634fa8))
* **player:** scroll long TUI lists and harden cover-art hiding ([#659](https://github.com/Public-Vinyl-Radio/groovenet/issues/659)) ([e67145d](https://github.com/Public-Vinyl-Radio/groovenet/commit/e67145da3dd8df9cb041580bd0aa6e25d6da972d))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @groovenet/client bumped from ^3.4.0 to ^3.5.0
    * @groovenet/contracts bumped from 1.1.0 to 1.2.0

## [0.1.3](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-player-v0.1.2...groovenet-player-v0.1.3) (2026-10-23)


### Features

* **mcp:** add player tools for status, transport, queue and devices ([#654](https://github.com/Public-Vinyl-Radio/groovenet/issues/654)) ([370668d](https://github.com/Public-Vinyl-Radio/groovenet/commit/370668dbcab5c0f9dc379bbda2c078da99eb80dc))
* **player:** complete daemon controls for [#610](https://github.com/Public-Vinyl-Radio/groovenet/issues/610) ([#635](https://github.com/Public-Vinyl-Radio/groovenet/issues/635)) ([b7b1ca3](https://github.com/Public-Vinyl-Radio/groovenet/commit/b7b1ca3b69a6ac5f7fbd981d34433ee86303553a))
* **player:** hide the cover-art window by default, add player_artwork option ([#648](https://github.com/Public-Vinyl-Radio/groovenet/issues/648)) ([acb2a4c](https://github.com/Public-Vinyl-Radio/groovenet/commit/acb2a4c7312c437809b3b67d8c83651cf39a0dfe))
* **player:** log plays from track-change events ([#658](https://github.com/Public-Vinyl-Radio/groovenet/issues/658)) ([df14f14](https://github.com/Public-Vinyl-Radio/groovenet/commit/df14f1422d0884f7a176304583adcb0064a9f572))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @groovenet/client bumped from ^3.3.0 to ^3.4.0

## [0.1.2](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-player-v0.1.1...groovenet-player-v0.1.2) (2026-10-22)


### Bug Fixes

* **player:** handle optional playlist ref positions and publish publicly ([#632](https://github.com/Public-Vinyl-Radio/groovenet/issues/632)) ([c81c0e0](https://github.com/Public-Vinyl-Radio/groovenet/commit/c81c0e09db8f63605fcdd3254459d8299145e01a))

## [0.1.1](https://github.com/Public-Vinyl-Radio/groovenet/compare/groovenet-player-v0.1.0...groovenet-player-v0.1.1) (2026-10-21)


### Features

* **cli:** add local player daemon and TUI ([#628](https://github.com/Public-Vinyl-Radio/groovenet/issues/628)) ([2adaaa2](https://github.com/Public-Vinyl-Radio/groovenet/commit/2adaaa28c0ee6493be255f8068a2cef42251db7d))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @groovenet/client bumped from ^3.2.1 to ^3.3.0

## 0.1.0 (unreleased)

Initial implementation of the headless playback core and mpv backend.
