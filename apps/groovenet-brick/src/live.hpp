#pragma once
#include "app.hpp"
#include <atomic>
#include <functional>
#include <stdexcept>
#include <string>

namespace brick {
struct LiveConfig {
  std::string url, playerKey, collectionKey, caFile;
  bool insecure = false;
  static LiveConfig environment();
  void validate() const;
};
struct NetworkError : std::runtime_error {
  using std::runtime_error::runtime_error;
};
// Incremental bounded SSE framing. No replay IDs are retained or sent.
class EventDecoder {
public:
  explicit EventDecoder(std::function<void(const std::string &)> event)
      : event_(std::move(event)) {}
  void feed(const char *bytes, size_t count);

private:
  std::string line_, data_;
  bool cr_ = false;
  std::function<void(const std::string &)> event_;
  void line();
};
// All methods block: call from a worker, never the rendering/input thread.
class RestClient {
public:
  explicit RestClient(LiveConfig config);
  std::string
  request(const std::string &path, const std::string &body, bool player,
          const std::function<bool()> &cancel,
          const std::function<void(const std::string &)> &event = {});
  // Collection reads preserve composite identity; the UI receives metadata
  // only.
  void enrich(Track &track, const std::function<bool()> &cancel);
  std::string playlists(const std::function<bool()> &cancel);
  std::string playlist(int64_t id, const std::function<bool()> &cancel);

private:
  LiveConfig config_;
};
// Validates wire state and enforces worker/sequence/revision ordering.
class PlayerState {
public:
  Snapshot view;
  std::string id, worker, current, playback;
  int64_t revision = -1, sequence = -1;
  void begin();
  bool event(const std::string &json);
  void detail(const std::string &json);
  std::string command(const std::string &json) const;
};
std::unique_ptr<DataAdapter> liveAdapter(LiveConfig config);
} // namespace brick
