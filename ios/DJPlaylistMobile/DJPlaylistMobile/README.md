# DJPlaylistMobile (iOS SwiftUI Skeleton)

Internal-first iOS app scaffold for your Tailscale-hosted DJ Playlist API.

## Scope in this scaffold

- Runtime server URL configuration (no auth)
- Connection test (`/api/openapi.mobile.json`)
- Playlist listing (`/api/playlists`)
- Track loading per playlist (`/api/playlists/{id}/tracks`)
- Genetic playlist generation (`/api/playlists/genetic`)
- Basic track file downloads to local storage (`/api/audio?filename=...`)

## Project setup (Xcode)

1. Create a new iOS App in Xcode:
   - Name: `DJPlaylistMobile`
   - Interface: `SwiftUI`
   - Language: `Swift`
2. Add all files from this folder into the project ("Create groups").
3. Set deployment target to iOS 17+.
4. Build and run.

## Runtime notes

- First launch goes to Server Setup.
- Enter your Tailscale URL, e.g. `http://100.x.y.z:3000` or `http://hostname.tailnet.ts.net:3000`.
- The app warns if you use plain HTTP.

## Next production steps

- Replace `UserDefaults` URL storage with stronger config handling.
- Add background download tasks.
- Add `AVPlayer` playback + offline queue.
- Generate typed client from your OpenAPI document.
