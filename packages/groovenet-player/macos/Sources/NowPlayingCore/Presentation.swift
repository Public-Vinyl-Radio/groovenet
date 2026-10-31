import MediaPlayer

/// Native key mapping has no global side effects and is reusable by a desktop UI.
public enum Presentation {
  public static func information(_ playback: Playback?) -> [String: Any]? {
    guard let metadata = playback?.metadata else { return nil }
    var info: [String: Any] = [
      MPMediaItemPropertyTitle: metadata.title,
      MPMediaItemPropertyArtist: metadata.artist,
      MPMediaItemPropertyAlbumTitle: metadata.album,
      MPNowPlayingInfoPropertyElapsedPlaybackTime: metadata.elapsed,
      MPNowPlayingInfoPropertyPlaybackRate: metadata.rate,
      MPNowPlayingInfoPropertyDefaultPlaybackRate: 1.0,
      MPNowPlayingInfoPropertyMediaType: MPNowPlayingInfoMediaType.audio.rawValue,
    ]
    if let duration = metadata.duration { info[MPMediaItemPropertyPlaybackDuration] = duration }
    return info
  }

  public static func playbackState(_ playback: Playback?) -> MPNowPlayingPlaybackState {
    guard playback?.metadata != nil else { return .stopped }
    return playback?.status == .playing ? .playing : .paused
  }
}
