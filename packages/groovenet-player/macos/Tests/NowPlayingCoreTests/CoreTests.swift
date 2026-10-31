import Darwin
import Foundation
import MediaPlayer
import XCTest

@testable import NowPlayingCore

private func state(
  _ status: String = "playing", current: Bool = true, queue: Bool = true,
  position: Double = 12.5, duration: Any = 180.25
) -> [String: Any] {
  let entry: [String: Any] = [
    "id": "entry-1", "track": ["title": "Café 🌙", "artist": "Artist", "album": "Album"],
  ]
  return [
    "status": status, "current": current ? entry : NSNull(),
    "queue": queue ? [entry] : [], "position": position, "duration": duration,
  ]
}

private func playback(_ object: [String: Any]) throws -> Playback {
  try JSONDecoder().decode(Playback.self, from: JSONSerialization.data(withJSONObject: object))
}

private func line(_ object: [String: Any]) -> Data {
  var data = try! JSONSerialization.data(withJSONObject: object)
  data.append(10)
  return data
}

private final class FakeWire: Wire {
  var onData: ((Data) -> Void)?
  var onDisconnect: ((Error) -> Void)?
  var sent: [[String: Any]] = []
  var closeCount = 0
  var sendError = false
  func send(_ data: Data) throws {
    if sendError { throw BridgeError("send failed") }
    XCTAssertEqual(data.last, 10)
    sent.append(try JSONSerialization.jsonObject(with: data) as! [String: Any])
  }
  func close() { closeCount += 1 }
  func event(_ data: [String: Any]) {
    onData?(line(["jsonrpc": "2.0", "version": 1, "event": "state", "data": data]))
  }
  func reply(_ id: Int, result: Any) {
    onData?(line(["jsonrpc": "2.0", "version": 1, "id": id, "result": result]))
  }
}

final class PlaybackTests: XCTestCase {
  func testNativePresentationMapping() throws {
    let playing = try playback(state())
    let info = Presentation.information(playing)!
    XCTAssertEqual(info[MPMediaItemPropertyTitle] as? String, "Café 🌙")
    XCTAssertEqual(info[MPMediaItemPropertyArtist] as? String, "Artist")
    XCTAssertEqual(info[MPMediaItemPropertyAlbumTitle] as? String, "Album")
    XCTAssertEqual(info[MPNowPlayingInfoPropertyElapsedPlaybackTime] as? Double, 12.5)
    XCTAssertEqual(info[MPMediaItemPropertyPlaybackDuration] as? Double, 180.25)
    XCTAssertEqual(info[MPNowPlayingInfoPropertyPlaybackRate] as? Double, 1)
    XCTAssertEqual(info[MPNowPlayingInfoPropertyDefaultPlaybackRate] as? Double, 1)
    XCTAssertEqual(
      info[MPNowPlayingInfoPropertyMediaType] as? UInt, MPNowPlayingInfoMediaType.audio.rawValue)
    XCTAssertEqual(Presentation.playbackState(playing), .playing)
    XCTAssertEqual(Presentation.playbackState(try playback(state("paused"))), .paused)
    XCTAssertNil(
      Presentation.information(try playback(state(duration: NSNull())))?[
        MPMediaItemPropertyPlaybackDuration])
    XCTAssertNil(Presentation.information(nil))
    XCTAssertNil(Presentation.information(try playback(state("stopped"))))
    XCTAssertEqual(Presentation.playbackState(nil), .stopped)
  }
  func testMetadataUsesSecondsAndUnicode() throws {
    let value = try playback(state()).metadata!
    XCTAssertEqual(value.title, "Café 🌙")
    XCTAssertEqual(value.artist, "Artist")
    XCTAssertEqual(value.album, "Album")
    XCTAssertEqual(value.elapsed, 12.5)
    XCTAssertEqual(value.duration, 180.25)
    XCTAssertEqual(value.rate, 1)
    XCTAssertEqual(try playback(state("paused")).metadata?.rate, 0)
    XCTAssertEqual(try playback(state("loading")).metadata?.rate, 0)
  }

  func testUnknownAndInvalidDurationAndPosition() throws {
    XCTAssertNil(try playback(state(duration: NSNull())).metadata?.duration)
    XCTAssertNil(try playback(state(duration: -1)).metadata?.duration)
    XCTAssertEqual(try playback(state(position: -10)).metadata?.elapsed, 0)
    XCTAssertEqual(try playback(state(position: 900)).metadata?.elapsed, 180.25)
    XCTAssertEqual(try playback(state(position: 900, duration: NSNull())).metadata?.elapsed, 900)
  }

  func testTerminalStatesClearMetadata() throws {
    for status in ["stopped", "ended", "error"] {
      XCTAssertNil(try playback(state(status)).metadata)
    }
    XCTAssertNil(try playback(state(current: false)).metadata)
  }

  func testTransportMapping() throws {
    let playing = try playback(state())
    XCTAssertNil(playing.method(for: .play))
    XCTAssertEqual(playing.method(for: .pause), "pause")
    XCTAssertEqual(playing.method(for: .toggle), "pause")
    XCTAssertEqual(playing.method(for: .next), "next")
    XCTAssertEqual(playing.method(for: .previous), "prev")
    let paused = try playback(state("paused"))
    XCTAssertEqual(paused.method(for: .play), "resume")
    XCTAssertEqual(paused.method(for: .toggle), "resume")
    XCTAssertNil(paused.method(for: .pause))
    XCTAssertEqual(try playback(state("stopped")).method(for: .play), "play")
    XCTAssertEqual(try playback(state("paused", current: false)).method(for: .play), "play")
    XCTAssertNil(try playback(state("loading")).method(for: .play))
    for command in Command.allCases {
      XCTAssertNil(
        try playback(state("stopped", current: false, queue: false)).method(for: command))
    }
  }
}

final class SessionTests: XCTestCase {
  func testDeinitializingSessionClosesItsConnection() {
    let wire = FakeWire()
    var session: Session? = Session(wire: wire)
    session?.start()
    session = nil
    XCTAssertEqual(wire.closeCount, 1)
    XCTAssertNil(wire.onData)
    XCTAssertNil(wire.onDisconnect)
  }

  func testInitialStatusAndTransportAndCleanup() {
    let wire = FakeWire()
    let session = Session(wire: FakeWire())
    session.close()
    let active = Session(wire: wire)
    var updates: [Playback?] = []
    active.onState = { updates.append($0) }
    active.start()
    active.start()
    XCTAssertEqual(wire.sent.count, 1)
    XCTAssertEqual(wire.sent[0]["method"] as? String, "status")
    XCTAssertEqual(wire.sent[0]["version"] as? Int, 1)
    XCTAssertEqual(wire.sent[0]["jsonrpc"] as? String, "2.0")
    XCTAssertFalse(active.perform(.play))
    wire.reply(1, result: state())
    XCTAssertEqual(updates.count, 1)
    XCTAssertTrue(active.perform(.pause))
    wire.event(state("paused"))
    XCTAssertTrue(active.perform(.play))
    XCTAssertTrue(active.perform(.next))
    XCTAssertTrue(active.perform(.previous))
    XCTAssertEqual(
      wire.sent.compactMap { $0["method"] as? String },
      ["status", "pause", "resume", "next", "prev"])
    let sentCount = wire.sent.count
    active.close()
    active.close()
    active.start()
    XCTAssertTrue(active.closed)
    XCTAssertNil(active.snapshot)
    XCTAssertNil(updates.last!)
    XCTAssertFalse(active.perform(.play))
    XCTAssertEqual(wire.closeCount, 1)
    XCTAssertEqual(wire.sent.count, sentCount)  // Never shutdown or stop the daemon.
    XCTAssertNil(wire.onData)
    XCTAssertNil(wire.onDisconnect)
  }

  func testStateBeforeInitialResponseWins() {
    let wire = FakeWire()
    let session: Session
    session = Session(wire: wire)
    session.start()
    wire.event(state("paused", position: 40))
    wire.reply(1, result: state(position: 1))
    XCTAssertEqual(session.snapshot?.position, 40)
    XCTAssertEqual(session.snapshot?.status, .paused)
    session.close()
  }

  func testFragmentedAndCombinedUTF8Messages() {
    let wire = FakeWire()
    let session: Session
    session = Session(wire: wire)
    session.start()
    let message = line(["jsonrpc": "2.0", "version": 1, "event": "state", "data": state()])
    for byte in message { wire.onData?(Data([byte])) }
    XCTAssertEqual(session.snapshot?.metadata?.title, "Café 🌙")
    wire.onData?(
      line(["jsonrpc": "2.0", "version": 1, "event": "position", "data": [:]])
        + line(["jsonrpc": "2.0", "version": 1, "id": 999, "result": [:]])
        + line(["jsonrpc": "2.0", "version": 1, "event": "state", "data": state("paused")]))
    XCTAssertEqual(session.snapshot?.status, .paused)
    session.close()
  }

  func testMalformedAndUnsupportedMessagesFailClosed() {
    let messages = [
      Data("oops\n".utf8), line(["jsonrpc": "1.0", "version": 1]),
      line(["jsonrpc": "2.0", "version": 2]), line(["jsonrpc": "2.0", "version": true]),
      line(["jsonrpc": "2.0", "version": "1"]), line(["jsonrpc": "2.0"]),
      line(["jsonrpc": "2.0", "version": 1, "event": "state"]),
      line(["jsonrpc": "2.0", "version": 1, "event": "state", "data": ["status": "future"]]),
      line(["jsonrpc": "2.0", "version": 1, "id": 1]),
      line(["jsonrpc": "2.0", "version": 1, "id": 1, "result": 3]),
      line(["jsonrpc": "2.0", "version": 1, "event": "state", "data": NSNull()]),
      Data(repeating: 65, count: 8 * 1024 * 1024 + 1),
      Data(repeating: 65, count: 8 * 1024 * 1024 + 1) + Data([10]),
    ]
    for message in messages {
      let wire = FakeWire()
      let session: Session
      session = Session(wire: wire)
      var failures = 0
      session.onError = { _ in failures += 1 }
      session.start()
      wire.onData?(message)
      XCTAssertTrue(session.closed)
      XCTAssertEqual(failures, 1)
      XCTAssertEqual(wire.closeCount, 1)
    }
  }

  func testRPCErrorAndDisconnect() {
    let wire = FakeWire()
    let session: Session
    session = Session(wire: wire)
    var errors: [String] = []
    session.onError = { errors.append($0.localizedDescription) }
    session.start()
    wire.reply(1, result: state())
    XCTAssertTrue(session.perform(.next))
    wire.onData?(
      line([
        "jsonrpc": "2.0", "version": 1, "id": 2,
        "error": ["code": "ENGINE_UNAVAILABLE", "message": "mpv failed"],
      ]))
    XCTAssertFalse(session.closed)
    XCTAssertTrue(errors[0].contains("ENGINE_UNAVAILABLE"))
    XCTAssertEqual(session.snapshot?.status, .playing)
    wire.onDisconnect?(BridgeError("disconnected"))
    XCTAssertTrue(session.closed)
    XCTAssertNil(session.snapshot)
    XCTAssertEqual(errors.count, 2)
  }

  func testInitialRPCErrorAndSendFailure() {
    for sendFailure in [false, true] {
      let wire = FakeWire()
      let session: Session
      wire.sendError = sendFailure
      session = Session(wire: wire)
      session.start()
      if !sendFailure {
        wire.onData?(line(["jsonrpc": "2.0", "version": 1, "id": 1, "error": [:]]))
      }
      XCTAssertTrue(session.closed)
    }
  }

  func testTimeoutClearsState() {
    let wire = FakeWire()
    let session: Session
    session = Session(wire: wire, timeout: 0.01)
    let closed = expectation(description: "timeout")
    session.onClose = { closed.fulfill() }
    session.start()
    wait(for: [closed], timeout: 1)
    XCTAssertTrue(session.closed)
  }

  func testCloseCancelsTimersAndLateData() {
    let wire = FakeWire()
    let session: Session
    session = Session(wire: wire, timeout: 0.01)
    let lateData = expectation(description: "late data")
    session.onError = { _ in XCTFail("closed session reported an error") }
    session.start()
    let receive = wire.onData
    session.close()
    receive?(line(["jsonrpc": "2.0", "version": 1, "event": "state", "data": state()]))
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.03) { lateData.fulfill() }
    wait(for: [lateData], timeout: 1)
    XCTAssertNil(session.snapshot)
  }
}

final class SystemTests: XCTestCase {
  func testConnectToDaemonSocketPath() throws {
    let path = "/tmp/gn-\(UUID().uuidString).sock"
    let server = socket(AF_UNIX, SOCK_STREAM, 0)
    XCTAssertGreaterThanOrEqual(server, 0)
    defer {
      Darwin.close(server)
      unlink(path)
    }
    var address = sockaddr_un()
    address.sun_family = sa_family_t(AF_UNIX)
    address.sun_len = UInt8(MemoryLayout<sockaddr_un>.size)
    withUnsafeMutableBytes(of: &address.sun_path) { $0.copyBytes(from: Array(path.utf8) + [0]) }
    let bound = withUnsafePointer(to: &address) {
      $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
        Darwin.bind(server, $0, socklen_t(MemoryLayout<sockaddr_un>.size))
      }
    }
    guard bound == 0 else {
      XCTFail("Cannot bind test socket: \(String(cString: strerror(errno)))")
      return
    }
    XCTAssertEqual(listen(server, 1), 0)
    let wire = try UnixWire(path: path)
    defer { wire.close() }
    let peer = accept(server, nil, nil)
    XCTAssertGreaterThanOrEqual(peer, 0)
    defer { Darwin.close(peer) }
    try wire.send(Data("status\n".utf8))
    var bytes = [UInt8](repeating: 0, count: 7)
    XCTAssertEqual(read(peer, &bytes, bytes.count), 7)
    XCTAssertEqual(String(bytes: bytes, encoding: .utf8), "status\n")
  }

  func testLockRejectsDuplicatesAndReleases() throws {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: dir) }
    let path = dir.appendingPathComponent("lock").path
    var lock: InstanceLock? = try InstanceLock(path: path)
    XCTAssertNotNil(lock)
    XCTAssertThrowsError(try InstanceLock(path: path))
    lock = nil
    XCTAssertNoThrow(try InstanceLock(path: path))
    XCTAssertThrowsError(try InstanceLock(path: dir.appendingPathComponent("missing/lock").path))
    let symlink = dir.appendingPathComponent("symlink").path
    try FileManager.default.createSymbolicLink(atPath: symlink, withDestinationPath: path)
    XCTAssertThrowsError(try InstanceLock(path: symlink))
  }

  func testMissingAndLongSocketAndBadDescriptor() {
    XCTAssertThrowsError(try UnixWire(path: "/tmp/groovenet-nonexistent-\(UUID().uuidString).sock"))
    XCTAssertThrowsError(try UnixWire(path: String(repeating: "x", count: 200)))
    XCTAssertThrowsError(try UnixWire(connectedFD: -1))
  }

  func testRealSocketReadWriteAndDisconnect() throws {
    var pair: [Int32] = [0, 0]
    XCTAssertEqual(socketpair(AF_UNIX, SOCK_STREAM, 0, &pair), 0)
    let wire = try UnixWire(connectedFD: pair[0])
    let gotData = expectation(description: "read")
    let disconnected = expectation(description: "disconnect")
    wire.onData = {
      XCTAssertEqual($0, Data("state\n".utf8))
      gotData.fulfill()
    }
    wire.onDisconnect = { _ in disconnected.fulfill() }
    try wire.send(Data("status\n".utf8))
    var bytes = [UInt8](repeating: 0, count: 100)
    XCTAssertEqual(read(pair[1], &bytes, bytes.count), 7)
    XCTAssertEqual(String(bytes: bytes.prefix(7), encoding: .utf8), "status\n")
    _ = "state\n".withCString { write(pair[1], $0, 6) }
    wait(for: [gotData], timeout: 1)
    Darwin.close(pair[1])
    wait(for: [disconnected], timeout: 1)
    wire.close()
    XCTAssertThrowsError(try wire.send(Data([1])))
  }

  func testSocketSendFailureDoesNotRaiseSIGPIPE() throws {
    var pair: [Int32] = [0, 0]
    XCTAssertEqual(socketpair(AF_UNIX, SOCK_STREAM, 0, &pair), 0)
    let wire = try UnixWire(connectedFD: pair[0])
    Darwin.close(pair[1])
    XCTAssertThrowsError(try wire.send(Data([1])))
    wire.close()
  }
}
