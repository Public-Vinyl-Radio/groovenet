import Foundation

public struct Playback: Decodable, Equatable {
  public enum Status: String, Decodable {
    case stopped, loading, playing, paused, ended, error
  }
  public struct Entry: Decodable, Equatable {
    public struct Track: Decodable, Equatable {
      public let title: String
      public let artist: String
      public let album: String
    }
    public let id: String
    public let track: Track
  }
  public let status: Status
  public let current: Entry?
  public let queue: [Entry]
  public let position: Double
  public let duration: Double?

  public var metadata: Metadata? {
    guard let current, [.loading, .playing, .paused].contains(status) else { return nil }
    let duration = duration.flatMap { $0.isFinite && $0 >= 0 ? $0 : nil }
    let elapsed = position.isFinite ? max(0, position) : 0
    return Metadata(
      title: current.track.title, artist: current.track.artist, album: current.track.album,
      elapsed: duration.map { min(elapsed, $0) } ?? elapsed,
      duration: duration, rate: status == .playing ? 1 : 0
    )
  }

  public func method(for command: Command) -> String? {
    switch command {
    case .play:
      if status == .playing || status == .loading || queue.isEmpty { return nil }
      return status == .paused && current != nil ? "resume" : "play"
    case .pause: return status == .playing ? "pause" : nil
    case .toggle: return method(for: status == .playing ? .pause : .play)
    case .next: return queue.isEmpty ? nil : "next"
    case .previous: return queue.isEmpty ? nil : "prev"
    }
  }
}

public enum Command: CaseIterable { case play, pause, toggle, next, previous }

public struct Metadata: Equatable {
  public let title: String
  public let artist: String
  public let album: String
  /// Both the daemon and MediaPlayer use seconds, never MPRIS microseconds.
  public let elapsed: Double
  public let duration: Double?
  public let rate: Double
}
