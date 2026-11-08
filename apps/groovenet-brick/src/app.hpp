#pragma once

#include <array>
#include <cstdint>
#include <memory>
#include <optional>
#include <string>
#include <utility>
#include <vector>

namespace brick {
// The panel is 1024x768; the lifecycle probe's 640x480 was only a test canvas.
constexpr int width = 1024, height = 768;
enum class Action {
  None,
  Up,
  Down,
  Left,
  Right,
  Select,
  Back,
  Menu,
  PlayPause,
  Previous,
  Next,
  RemoteDown,
  RemoteUp,
  Scenario,
  Quit,
  Suspend,
  Wake
};
enum class Screen {
  NowPlaying,
  Players,
  Playlists,
  Queue,
  Outputs,
  Menu,
  PlaylistTracks,
  TrackActions,
  Confirm,
  QueueActions,
  ClearConfirm
};
const std::vector<std::string> &scenarios();
const std::vector<std::string> &screenNames();
Action namedAction(const std::string &name);
struct Artwork {
  int width = 0, height = 0;
  std::vector<unsigned char>
      pixels; // Bounded RGBA, decoded on the network worker.
};
struct Track {
  Track(std::string title, std::string artist, std::string album,
        std::optional<int> duration, bool artwork)
      : title(std::move(title)), artist(std::move(artist)),
        album(std::move(album)), duration(duration), artwork(artwork) {}
  std::string title, artist, album;
  std::optional<int> duration;
  bool artwork = true;
  std::string trackId, artworkUrl, entryId;
  std::shared_ptr<const Artwork> image;
  int64_t friendId = 0;
  std::optional<bool> playable;
};
struct Collection {
  std::vector<std::string> names;
  std::vector<int64_t> ids;
  std::vector<Track> tracks;
  std::string status = "Open Playlists to load saved music";
  int64_t id = 0;
  size_t loaded = 0;
  bool loading = false;
};
struct Snapshot {
  Collection collection;
  std::string commandToken;
  std::string status, player, playerId, acknowledgment,
      playbackState = "playing";
  bool connected = true, available = true, loading = false, playing = true;
  bool refreshing =
      false; // Retained read-only state while awaiting a fresh snapshot.
  int volume = 55, position = 42;
  std::vector<Track> queue;
  size_t currentIndex = 0;
  std::vector<std::string> players, playlists, outputs;
  std::vector<std::string> playerIds;
};
// Shared by the deterministic mock and asynchronous REST/SSE adapter.
enum class QueueEdit { Play, Remove, Up, Down, Clear };
class DataAdapter {
public:
  virtual ~DataAdapter() = default;
  virtual const Snapshot &snapshot() const = 0;
  virtual void command(Action action) = 0;
  virtual void selectPlayer(size_t index) = 0;
  virtual void advance(int milliseconds) = 0;
  virtual void refresh() = 0;
  virtual void acknowledge() {}
  virtual void editQueue(QueueEdit edit, const std::string &entry,
                         const std::string &token) = 0;
  virtual void browse(int64_t id = 0, bool more = false) = 0;
  virtual void queueTracks(bool play, std::optional<size_t> track,
                           const std::string &token) = 0;
};
class MockData final : public DataAdapter {
public:
  explicit MockData(const std::string &scenario);
  const Snapshot &snapshot() const override { return state_; }
  void command(Action action) override;
  void selectPlayer(size_t index) override;
  void advance(int milliseconds) override;
  void acknowledge() override { state_.acknowledgment.clear(); }
  void browse(int64_t id = 0, bool more = false) override;
  void queueTracks(bool play, std::optional<size_t> track,
                   const std::string &token) override;
  void editQueue(QueueEdit edit, const std::string &entry,
                 const std::string &token) override;
  void refresh() override {} // Mock state is already authoritative.
private:
  Snapshot state_;
  std::vector<Track> saved_;
  int remainder_ = 0;
  size_t nextEntry_ = 100;
};
std::unique_ptr<DataAdapter>
dataAdapter(const std::string &mode, const std::string &scenario,
            const std::string &configDirectory = "");
class App {
public:
  App(std::string mode, std::string scenario,
      const std::string &configDirectory = "");
  explicit App(std::unique_ptr<DataAdapter> data);
  void handle(Action action);
  void advance(int milliseconds);
  const Snapshot &snapshot() const { return data_->snapshot(); }
  std::vector<std::string> rows() const;
  Screen screen() const { return screen_; }
  size_t focus() const { return focus_[static_cast<size_t>(screen_)]; }
  const std::string &scenario() const;
  const std::string &notice() const { return notice_; }
  bool running() const { return running_; }
  bool suspended() const { return suspended_; }

private:
  void open(Screen screen);
  std::string mode_, scenario_, notice_;
  std::unique_ptr<DataAdapter> data_;
  Screen screen_ = Screen::NowPlaying;
  std::vector<Screen> history_;
  std::array<size_t, 11> focus_{};
  std::optional<size_t> selectedTrack_;
  std::string queueToken_, selectedEntry_, focusedEntry_, focusedPlayer_;
  void rememberQueueFocus();
  bool running_ = true, suspended_ = false;
};
std::string timing(const Snapshot &snapshot);
} // namespace brick
