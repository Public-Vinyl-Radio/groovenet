// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "GroovenetNowPlaying",
  platforms: [.macOS(.v13)],
  products: [.executable(name: "groovenet-now-playing", targets: ["NowPlayingHelper"])],
  targets: [
    .target(name: "NowPlayingCore"),
    .executableTarget(name: "NowPlayingHelper", dependencies: ["NowPlayingCore"]),
    .testTarget(name: "NowPlayingCoreTests", dependencies: ["NowPlayingCore"]),
  ]
)
