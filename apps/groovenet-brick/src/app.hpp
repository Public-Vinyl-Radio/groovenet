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
enum class Screen { NowPlaying, Players, Playlists, Queue, Outputs, Menu };
const std::vector<std::string> &scenarios();
const std::vector<std::string> &screenNames();
Action namedAction(const std::string &name);
struct Track {
  Track(std::string title, std::string artist, std::string album,
        std::optional<int> duration, bool artwork)
      : title(std::move(title)), artist(std::move(artist)),
        album(std::move(album)), duration(duration), artwork(artwork) {}
  std::string title, artist, album;
  std::optional<int> duration;
  bool artwork = true;
  std::string trackId, artworkUrl;
  int64_t friendId = 0;
  std::optional<bool> playable;
};
struct Snapshot {
  std::string status, player;
  bool connected = true, available = true, loading = false, playing = true;
  int volume = 55, position = 42;
  std::vector<Track> queue;
  size_t currentIndex = 0;
  std::vector<std::string> players, playlists, outputs;
};
// Shared by the deterministic mock and asynchronous REST/SSE adapter.
class DataAdapter {
public:
  virtual ~DataAdapter() = default;
  virtual const Snapshot &snapshot() const = 0;
  virtual void command(Action action) = 0;
  virtual void selectPlayer(size_t index) = 0;
  virtual void advance(int milliseconds) = 0;
  virtual void refresh() = 0;
};
class MockData final : public DataAdapter {
public:
  explicit MockData(const std::string &scenario);
  const Snapshot &snapshot() const override { return state_; }
  void command(Action action) override;
  void selectPlayer(size_t index) override;
  void advance(int milliseconds) override;
  void refresh() override {} // Mock state is already authoritative.
private:
  Snapshot state_;
  int remainder_ = 0;
};
std::unique_ptr<DataAdapter> dataAdapter(const std::string &mode,
                                         const std::string &scenario);
class App {
public:
  App(std::string mode, std::string scenario);
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
  std::array<size_t, 6> focus_{};
  bool running_ = true, suspended_ = false;
};
std::string timing(const Snapshot &snapshot);
} // namespace brick
