import AppKit
import CoreGraphics
import MediaPlayer
import NowPlayingCore

func log(_ message: String) {
  FileHandle.standardError.write(Data("Groovenet Now Playing: \(message)\n".utf8))
}

// stop() alone waits for the next AppKit event, which a windowless helper may
// never receive. Post an event so disconnects and signals exit promptly.
func stopApplication() {
  let app = NSApplication.shared
  app.stop(nil)
  if let event = NSEvent.otherEvent(
    with: .applicationDefined, location: .zero,
    modifierFlags: [], timestamp: 0, windowNumber: 0,
    context: nil, subtype: 0, data1: 0, data2: 0)
  {
    app.postEvent(event, atStart: true)
  }
}

final class Application: NSObject, NSApplicationDelegate {
  private var session: Session?
  private var instance: InstanceLock?
  private var targets: [(MPRemoteCommand, Any)] = []
  private var signals: [DispatchSourceSignal] = []
  private var failed = false

  func applicationDidFinishLaunching(_ notification: Notification) {
    do {
      let args = Array(CommandLine.arguments.dropFirst())
      guard args.isEmpty || (args.count == 2 && args[0] == "--socket") else {
        throw BridgeError("Usage: groovenet-now-playing [--socket PATH]")
      }
      guard Bundle.main.bundleIdentifier == "radio.publicvinyl.groovenet.nowplaying" else {
        throw BridgeError(
          "Run the bundled companion using the groovenet-now-playing launcher (build it with --build first)."
        )
      }
      let directory = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(
        ".groovenet/player")
      // One media identity per user, even with multiple daemon socket paths.
      try FileManager.default.createDirectory(
        at: directory, withIntermediateDirectories: true,
        attributes: [.posixPermissions: 0o700])
      instance = try InstanceLock(path: directory.appendingPathComponent("now-playing.lock").path)
      let path = args.isEmpty ? directory.appendingPathComponent("player.sock").path : args[1]
      let session = Session(wire: try UnixWire(path: path))
      self.session = session
      session.onState = { [weak self] in self?.publish($0) }
      session.onError = { [weak self] error in
        self?.failed = true
        log(error.localizedDescription)
      }
      session.onClose = { stopApplication() }
      let center = MPRemoteCommandCenter.shared()
      for (command, native) in [
        (Command.play, center.playCommand), (.pause, center.pauseCommand),
        (.toggle, center.togglePlayPauseCommand), (.next, center.nextTrackCommand),
        (.previous, center.previousTrackCommand),
      ] {
        let target = native.addTarget { [weak self] _ in
          let action = { self?.session?.perform(command) ?? false }
          let accepted = Thread.isMainThread ? action() : DispatchQueue.main.sync(execute: action)
          return accepted ? .success : .commandFailed
        }
        native.isEnabled = false
        targets.append((native, target))
      }
      center.changePlaybackPositionCommand.isEnabled = false
      center.skipForwardCommand.isEnabled = false
      center.skipBackwardCommand.isEnabled = false
      center.seekForwardCommand.isEnabled = false
      center.seekBackwardCommand.isEnabled = false
      for number in [SIGINT, SIGTERM] {
        signal(number, SIG_IGN)
        let source = DispatchSource.makeSignalSource(signal: number, queue: .main)
        source.setEventHandler { [weak self] in self?.session?.close() }
        source.resume()
        signals.append(source)
      }
      session.start()
      log("connected to \(path); Ctrl-C stops the companion and leaves playback running.")
    } catch {
      failed = true
      log(error.localizedDescription)
      stopApplication()
    }
  }

  private func publish(_ playback: Playback?) {
    let center = MPNowPlayingInfoCenter.default()
    center.nowPlayingInfo = Presentation.information(playback)
    center.playbackState = Presentation.playbackState(playback)
    let commands = MPRemoteCommandCenter.shared()
    for (command, native) in [
      (Command.play, commands.playCommand), (.pause, commands.pauseCommand),
      (.toggle, commands.togglePlayPauseCommand), (.next, commands.nextTrackCommand),
      (.previous, commands.previousTrackCommand),
    ] { native.isEnabled = playback?.method(for: command) != nil }
  }

  func finish() -> Int32 {
    session?.close()
    targets.forEach {
      $0.0.removeTarget($0.1)
      $0.0.isEnabled = false
    }
    signals.forEach { $0.cancel() }
    instance = nil
    return failed ? 1 : 0
  }
}

// Check before initializing AppKit: a headless launch must not attempt a
// WindowServer connection or interfere with the headless daemon.
guard let login = CGSessionCopyCurrentDictionary() as? [String: Any],
  login[kCGSessionOnConsoleKey as String] as? Bool == true,
  login[kCGSessionUserIDKey as String] as? UInt32 == getuid()
else {
  log(
    "A local macOS graphical login session is required. Run this command from a terminal in your desktop session."
  )
  exit(1)
}
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let delegate = Application()
app.delegate = delegate
app.run()
exit(delegate.finish())
