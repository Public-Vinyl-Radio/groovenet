#include "live.hpp"
#include <algorithm>
#include <chrono>
#include <cmath>
#include <condition_variable>
#include <cstdlib>
#include <curl/curl.h>
#include <json-c/json.h>
#include <mutex>
#include <thread>

namespace brick {
namespace {
constexpr size_t limit = 2 * 1024 * 1024;
using Json = std::unique_ptr<json_object, decltype(&json_object_put)>;
Json parse(const std::string &text, json_type type = json_type_object) {
  if (text.size() > limit)
    throw NetworkError("Response exceeds size limit");
  json_tokener *tok = json_tokener_new();
  json_tokener_set_flags(tok, JSON_TOKENER_STRICT | JSON_TOKENER_VALIDATE_UTF8);
  auto *value =
      json_tokener_parse_ex(tok, text.c_str(), static_cast<int>(text.size()));
  bool ok = json_tokener_get_error(tok) == json_tokener_success &&
            json_tokener_get_parse_end(tok) == text.size();
  json_tokener_free(tok);
  Json result(value, json_object_put);
  if (!ok || !value || json_object_get_type(value) != type)
    throw NetworkError("Malformed server data");
  return result;
}
json_object *field(json_object *obj, const char *key, json_type type) {
  json_object *value = nullptr;
  if (!json_object_object_get_ex(obj, key, &value) ||
      json_object_get_type(value) != type)
    throw NetworkError("Malformed server data");
  return value;
}
std::string str(json_object *obj, const char *key) {
  auto *value = field(obj, key, json_type_string);
  std::string s(json_object_get_string(value),
                json_object_get_string_len(value));
  if (s.size() > 4096 || s.find('\0') != std::string::npos)
    throw NetworkError("Malformed server data");
  return s;
}
int64_t number(json_object *obj, const char *key) {
  auto n = json_object_get_int64(field(obj, key, json_type_int));
  if (n < 0 || n > 9007199254740991LL)
    throw NetworkError("Malformed server data");
  return n;
}
double seconds(json_object *obj, const char *key) {
  json_object *v = nullptr;
  if (!json_object_object_get_ex(obj, key, &v) ||
      !(json_object_get_type(v) == json_type_int ||
        json_object_get_type(v) == json_type_double))
    throw NetworkError("Malformed server data");
  double n = json_object_get_double(v);
  if (!std::isfinite(n) || n < 0 || n > 2147483647)
    throw NetworkError("Malformed server data");
  return n;
}
std::optional<int> duration(json_object *obj) {
  json_object *v = nullptr;
  if (!json_object_object_get_ex(obj, "duration", &v))
    throw NetworkError("Malformed server data");
  if (!v)
    return std::nullopt;
  return static_cast<int>(seconds(obj, "duration"));
}
std::string nullable(json_object *obj, const char *key) {
  json_object *v = nullptr;
  if (!json_object_object_get_ex(obj, key, &v))
    throw NetworkError("Malformed server data");
  return v ? str(obj, key) : "";
}
bool identifier(const std::string &s) {
  return !s.empty() && s.size() <= 63 && s.front() != '-' &&
         s.find_first_not_of("abcdefghijklmnopqrstuvwxyz0123456789-") ==
             std::string::npos;
}
std::string env(const char *key) {
  auto *v = std::getenv(key);
  return v ? v : "";
}
std::string errorState(long status, const std::string &body) {
  // Never echo server messages, URLs or credentials into UI/logs.
  if (status == 401 || status == 403)
    return "Unauthorized: check the credential for this API";
  if (status == 404)
    return "Not found: select another player or refresh collection";
  if (status == 409)
    return "Conflict: state changed or speaker needs explicit approval; "
           "refresh and retry";
  if (body.find("NO_AUDIO") != std::string::npos)
    return "No playable audio for this track";
  return "Service unavailable; refresh and retry";
}
} // namespace
LiveConfig LiveConfig::environment() {
  return {env("BRICK_URL"), env("BRICK_PLAYER_KEY"),
          env("BRICK_COLLECTION_KEY"), env("BRICK_CA_FILE"),
          env("BRICK_INSECURE_TLS") == "1"};
}
void LiveConfig::validate() const {
  CURLU *urlHandle = curl_url();
  bool ok = curl_url_set(urlHandle, CURLUPART_URL, url.c_str(), 0) == CURLUE_OK;
  char *part = nullptr;
  if (ok && curl_url_get(urlHandle, CURLUPART_SCHEME, &part, 0) == CURLUE_OK) {
    ok = std::string(part) == "https" || std::string(part) == "http";
    curl_free(part);
  }
  for (auto p : {CURLUPART_USER, CURLUPART_PASSWORD, CURLUPART_QUERY,
                 CURLUPART_FRAGMENT}) {
    if (curl_url_get(urlHandle, p, &part, 0) == CURLUE_OK) {
      ok = false;
      curl_free(part);
    }
  }
  curl_url_cleanup(urlHandle);
  if (!ok || playerKey.find_first_of("\r\n") != std::string::npos ||
      collectionKey.find_first_of("\r\n") != std::string::npos)
    throw NetworkError("Invalid live configuration");
  if (playerKey.empty())
    throw NetworkError(
        "Configure BRICK_URL and BRICK_PLAYER_KEY for live mode");
}
void EventDecoder::line() {
  if (line_.empty()) {
    if (!data_.empty()) {
      data_.pop_back();
      auto data = std::move(data_);
      data_.clear();
      event_(data);
    }
  } else if (line_.rfind("data:", 0) == 0) {
    size_t offset = line_.size() > 5 && line_[5] == ' ' ? 6 : 5;
    data_ += line_.substr(offset) + "\n";
  }
  line_.clear();
}
void EventDecoder::feed(const char *bytes, size_t count) {
  for (size_t i = 0; i < count; ++i) {
    char c = bytes[i];
    if (c == '\n' && cr_) {
      cr_ = false;
      continue;
    }
    cr_ = c == '\r';
    if (c == '\r' || c == '\n')
      line();
    else
      line_ += c;
    if (line_.size() + data_.size() > limit)
      throw NetworkError("Event exceeds size limit");
  }
}
RestClient::RestClient(LiveConfig config) : config_(std::move(config)) {
  static const int initialized = [] {
    return curl_global_init(CURL_GLOBAL_DEFAULT);
  }();
  if (initialized != 0)
    throw NetworkError("Network initialization failed");
  config_.validate();
}
std::string
RestClient::request(const std::string &path, const std::string &body,
                    bool player, const std::function<bool()> &cancel,
                    const std::function<void(const std::string &)> &event) {
  if (path.empty() || path[0] != '/' || path.find("..") != std::string::npos ||
      body.size() > limit)
    throw NetworkError("Invalid request");
  struct Transfer {
    std::string response;
    const std::function<bool()> &cancel;
    EventDecoder decoder;
    bool streaming;
    std::exception_ptr error;
  } transfer{{}, cancel, EventDecoder(event), static_cast<bool>(event), {}};
  std::unique_ptr<CURL, decltype(&curl_easy_cleanup)> curl(curl_easy_init(),
                                                           curl_easy_cleanup);
  std::string base = config_.url;
  while (!base.empty() && base.back() == '/')
    base.pop_back();
  std::string url = base + path;
  curl_easy_setopt(curl.get(), CURLOPT_URL, url.c_str());
  curl_easy_setopt(curl.get(), CURLOPT_NOSIGNAL, 1L);
  curl_easy_setopt(curl.get(), CURLOPT_CONNECTTIMEOUT_MS, 3000L);
  curl_easy_setopt(curl.get(), CURLOPT_TIMEOUT_MS, event ? 30000L : 8000L);
  curl_easy_setopt(curl.get(), CURLOPT_SSL_VERIFYPEER,
                   config_.insecure ? 0L : 1L);
  curl_easy_setopt(curl.get(), CURLOPT_SSL_VERIFYHOST,
                   config_.insecure ? 0L : 2L);
  if (!config_.caFile.empty())
    curl_easy_setopt(curl.get(), CURLOPT_CAINFO, config_.caFile.c_str());
  // Redirects intentionally disabled: credentials never cross an origin
  // boundary.
  curl_slist *headers = nullptr;
  std::string key = player ? config_.playerKey : config_.collectionKey;
  if (!key.empty())
    headers =
        curl_slist_append(headers, ("Authorization: Bearer " + key).c_str());
  headers = curl_slist_append(headers, "Content-Type: application/json");
  headers = curl_slist_append(headers, event ? "Accept: text/event-stream"
                                             : "Accept: application/json");
  std::unique_ptr<curl_slist, decltype(&curl_slist_free_all)> owned(
      headers, curl_slist_free_all);
  curl_easy_setopt(curl.get(), CURLOPT_HTTPHEADER, headers);
  if (!body.empty()) {
    curl_easy_setopt(curl.get(), CURLOPT_POSTFIELDS, body.c_str());
    curl_easy_setopt(curl.get(), CURLOPT_POSTFIELDSIZE,
                     static_cast<long>(body.size()));
  }
  curl_easy_setopt(
      curl.get(), CURLOPT_WRITEFUNCTION,
      +[](char *data, size_t size, size_t count, void *ctx) -> size_t {
        auto &t = *static_cast<Transfer *>(ctx);
        try {
          if (t.cancel())
            return 0;
          auto bytes = size * count;
          if (t.streaming)
            t.decoder.feed(data, bytes);
          else {
            if (t.response.size() + bytes > limit)
              throw NetworkError("Response exceeds size limit");
            t.response.append(data, bytes);
          }
          return bytes;
        } catch (...) {
          t.error = std::current_exception();
          return 0;
        }
      });
  curl_easy_setopt(curl.get(), CURLOPT_WRITEDATA, &transfer);
  curl_easy_setopt(curl.get(), CURLOPT_NOPROGRESS, 0L);
  curl_easy_setopt(
      curl.get(), CURLOPT_XFERINFOFUNCTION,
      +[](void *ctx, curl_off_t, curl_off_t, curl_off_t, curl_off_t) -> int {
        return static_cast<Transfer *>(ctx)->cancel() ? 1 : 0;
      });
  curl_easy_setopt(curl.get(), CURLOPT_XFERINFODATA, &transfer);
  auto result = curl_easy_perform(curl.get());
  if (transfer.error)
    std::rethrow_exception(transfer.error);
  long status = 0;
  curl_easy_getinfo(curl.get(), CURLINFO_RESPONSE_CODE, &status);
  if (status && (status < 200 || status >= 300))
    throw NetworkError(errorState(status, transfer.response));
  if (result != CURLE_OK)
    throw NetworkError("Connection lost or timed out; result may be unknown");
  return transfer.response;
}
void RestClient::enrich(Track &track, const std::function<bool()> &cancel) {
  Json root(json_object_new_object(), json_object_put);
  auto *refs = json_object_new_array();
  auto *ref = json_object_new_object();
  json_object_object_add(ref, "track_id",
                         json_object_new_string(track.trackId.c_str()));
  json_object_object_add(ref, "friend_id",
                         json_object_new_int64(track.friendId));
  json_object_array_add(refs, ref);
  json_object_object_add(root.get(), "tracks", refs);
  auto result = parse(request("/api/tracks/batch",
                              json_object_to_json_string_ext(
                                  root.get(), JSON_C_TO_STRING_PLAIN),
                              false, cancel),
                      json_type_array);
  if (json_object_array_length(result.get()) != 1)
    throw NetworkError("Collection track not found");
  auto *row = json_object_array_get_idx(result.get(), 0);
  if (str(row, "track_id") != track.trackId ||
      number(row, "friend_id") != track.friendId)
    throw NetworkError("Wrong collection track identity");
  track.album = nullable(row, "album");
  track.playable = !nullable(row, "local_audio_url").empty();
  track.artworkUrl = nullable(row, "album_thumbnail");
  // Metadata only. Image decode/display belongs to the artwork UI slice
  // (#1098). Do not treat a URL as a decoded image or render mock geometry for
  // live art.
}
std::string RestClient::playlists(const std::function<bool()> &cancel) {
  return request("/api/playlists", "", false, cancel);
}
std::string RestClient::playlist(int64_t id,
                                 const std::function<bool()> &cancel) {
  if (id <= 0)
    throw NetworkError("Invalid playlist identity");
  return request("/api/playlists/" + std::to_string(id) + "/tracks", "", false,
                 cancel);
}
void PlayerState::begin() {
  worker.clear();
  sequence = -1;
  revision = -1;
  current.clear();
  view.connected = false;
  view.loading = !view.refreshing;
}
void PlayerState::detail(const std::string &text) {
  auto root = parse(text);
  auto *p = root.get();
  auto newId = str(p, "id");
  if (!identifier(newId) || (!id.empty() && newId != id))
    throw NetworkError("Wrong player in response");
  auto rev = number(p, "revision");
  auto name = str(p, "name");
  auto *state = field(p, "state", json_type_object);
  auto entry = nullable(state, "current_entry_id");
  auto status = str(state, "status");
  if (status != "playing" && status != "paused" && status != "stopped" &&
      status != "loading" && status != "ended" && status != "error")
    throw NetworkError("Malformed player status");
  Snapshot next = view;
  next.player = name;
  next.playing = status == "playing";
  next.loading = status == "loading";
  next.position = static_cast<int>(seconds(state, "position"));
  auto dur = duration(state);
  auto vol = seconds(state, "volume");
  if (vol > 100)
    throw NetworkError("Malformed volume");
  next.volume = static_cast<int>(vol);
  next.queue.clear();
  next.currentIndex = 10000;
  auto *queue = field(state, "queue", json_type_array);
  if (json_object_array_length(queue) > 10000)
    throw NetworkError("Queue exceeds size limit");
  for (size_t i = 0; i < json_object_array_length(queue); ++i) {
    auto *q = json_object_array_get_idx(queue, i);
    Track track{str(q, "title"), str(q, "artist"), "", std::nullopt, false};
    track.trackId = str(q, "track_id");
    track.friendId = number(q, "friend_id");
    if (track.trackId.empty() || track.friendId == 0)
      throw NetworkError("Malformed track identity");
    auto queueId = str(q, "id");
    next.queue.push_back(track);
    if (queueId == entry) {
      next.queue.back().duration = dur;
      next.currentIndex = i;
    }
  }
  if (rev < revision)
    return;
  revision = rev;
  id = newId;
  current = entry;
  playback = status;
  next.available = true;
  next.status = "Live · " + status;
  view = std::move(next);
}
bool PlayerState::event(const std::string &text) {
  auto root = parse(text);
  auto *e = root.get();
  auto type = str(e, "type");
  auto instance = str(e, "worker_instance");
  auto seq = number(e, "sequence");
  if (instance.empty())
    throw NetworkError("Malformed worker identity");
  if (worker.empty()) {
    if (type != "snapshot")
      return false;
  } else if (instance != worker) {
    throw NetworkError("Player worker restarted; refreshing");
  }
  if (seq <= sequence)
    return false;
  if (type == "snapshot") {
    auto *p = field(e, "player", json_type_object);
    detail(json_object_to_json_string_ext(p, JSON_C_TO_STRING_PLAIN));
    worker = instance;
    sequence = seq;
    view.connected = true;
    view.refreshing = false;
    return true;
  }
  if (type != "position")
    throw NetworkError("Unknown player event");
  auto playerId = str(e, "player_id");
  auto rev = number(e, "revision");
  auto entry = nullable(e, "current_entry_id");
  auto pos = seconds(e, "position");
  auto dur = duration(e);
  sequence = seq;
  if (playerId != id || rev != revision || entry != current)
    return false;
  view.position = static_cast<int>(pos);
  if (view.currentIndex < view.queue.size())
    view.queue[view.currentIndex].duration = dur;
  return true;
}
std::string PlayerState::command(const std::string &text) const {
  if (!view.connected || view.loading || revision < 0)
    throw NetworkError("Wait for fresh player state");
  auto root = parse(text);
  str(root.get(), "type");
  json_object_object_add(root.get(), "expected_revision",
                         json_object_new_int64(revision));
  return json_object_to_json_string_ext(root.get(), JSON_C_TO_STRING_PLAIN);
}
namespace {
class LiveData final : public DataAdapter {
public:
  explicit LiveData(LiveConfig config) : config_(std::move(config)) {
    state_.connected = state_.available = state_.playing = false;
    state_.player = "No player selected";
    state_.status = "Connecting to Groovenet";
    published_.view = state_;
    thread_ = std::thread([this] { run(); });
  }
  ~LiveData() override {
    stop_ = true;
    ++generation_;
    wake_.notify_all();
    thread_.join();
  }
  const Snapshot &snapshot() const override { return state_; }
  void advance(int) override {
    std::lock_guard<std::mutex> lock(mutex_);
    state_ = published_.view;
  }
  void refresh() override {
    std::lock_guard<std::mutex> lock(mutex_);
    pending_.clear();
    published_.view.refreshing = published_.view.connected || published_.view.refreshing;
    published_.view.connected = false;
    published_.view.status = "Refreshing player state";
    ++generation_;
    wake_.notify_all();
  }
  void selectPlayer(size_t index) override {
    std::lock_guard<std::mutex> lock(mutex_);
    if (index >= state_.playerIds.size())
      return;
    selected_ = state_.playerIds[index];
    pending_.clear();
    published_.view.connected = false;
    published_.view.queue.clear();
    published_.view.refreshing = false;
    published_.view.loading = true;
    ++generation_;
    wake_.notify_all();
  }
  void command(Action action) override {
    std::lock_guard<std::mutex> lock(mutex_);
    if (!published_.view.connected || !pending_.empty())
      return;
    std::string type;
    if (action == Action::PlayPause)
      type = published_.view.playing
                 ? "pause"
                 : (published_.playback == "paused" ? "resume" : "play");
    if (action == Action::Next || action == Action::Right)
      type = "next";
    if (action == Action::Previous || action == Action::Left)
      type = "previous";
    bool volume = action == Action::RemoteUp || action == Action::RemoteDown;
    if (volume)
      type = "volume";
    if (type.empty())
      return;
    std::string body = "{\"type\":\"" + type + "\"";
    if (volume)
      body +=
          ",\"volume\":" +
          std::to_string(std::clamp(published_.view.volume +
                                        (action == Action::RemoteUp ? 5 : -5),
                                    0, 100));
    try {
      pending_ = published_.command(body + "}");
    } catch (const NetworkError &) {
      return;
    }
    published_.view.connected = false;
    published_.view.refreshing = true;
    published_.view.status = "Updating player state";
    ++generation_;
    wake_.notify_all();
  }

private:
  LiveConfig config_;
  Snapshot state_;
  PlayerState published_;
  std::mutex mutex_;
  std::condition_variable wake_;
  std::thread thread_;
  std::atomic<bool> stop_{false};
  std::atomic<unsigned> generation_{0};
  std::string selected_, pending_;
  void publish(const PlayerState &session, unsigned generation) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (!stop_ && generation == generation_)
      published_ = session;
  }
  void run() {
    try {
      RestClient api(config_);
      int backoff = 250;
      while (!stop_) {
        unsigned generation;
        PlayerState session;
        std::string write;
        {
          std::lock_guard<std::mutex> lock(mutex_);
          generation = generation_.load();
          session = published_;
          session.id = selected_;
          write = std::move(pending_);
          pending_.clear();
        }
        auto cancel = [this, generation] {
          return stop_ || generation != generation_;
        };
        std::string problem;
        try {
          // A write is attempted once, before refreshing. Never replay it on
          // any failure.
          if (!write.empty() && !session.id.empty()) {
            try {
              api.request("/api/players/" + session.id + "/commands", write,
                          true, cancel);
            } catch (const NetworkError &e) {
              problem =
                  std::string(e.what()) +
                  "; command not repeated. Review refreshed state before retry";
            }
          }
          if (cancel())
            continue;
          auto list = parse(api.request("/api/players", "", true, cancel));
          auto *players = field(list.get(), "players", json_type_array);
          if (json_object_array_length(players) > 1000)
            throw NetworkError("Player list exceeds size limit");
          std::vector<std::string> ids, names;
          for (size_t i = 0; i < json_object_array_length(players); ++i) {
            auto *p = json_object_array_get_idx(players, i);
            auto id = str(p, "id");
            if (!identifier(id))
              throw NetworkError("Malformed player identity");
            ids.push_back(id);
            names.push_back(str(p, "name"));
          }
          if (session.id.empty() && !ids.empty())
            session.id = ids.front();
          {
            std::lock_guard<std::mutex> lock(mutex_);
            if (cancel())
              continue;
            selected_ = session.id;
          }
          session.view.players = names;
          session.view.playerIds = ids;
          session.begin();
          if (session.id.empty())
            throw NetworkError("No players configured");
          session.detail(
              api.request("/api/players/" + session.id, "", true, cancel));
          // Keep the last enriched snapshot visible during command/wake refresh.
          // Detail alone omits album/artwork and is not authoritative SSE state.
          if (!session.view.refreshing)
            publish(session, generation);
          std::optional<Track> metadata;
          api.request(
              "/api/players/" + session.id + "/events", "", true, cancel,
              [&](const std::string &event) {
                if (session.event(event)) {
                  if (session.view.currentIndex < session.view.queue.size()) {
                    auto &track = session.view.queue[session.view.currentIndex];
                    if (!metadata || metadata->trackId != track.trackId ||
                        metadata->friendId != track.friendId) {
                      try {
                        api.enrich(track, cancel);
                        metadata = track;
                      } catch (const NetworkError &) {
                        session.view.status +=
                            " · Collection metadata unavailable";
                      }
                    } else {
                      track.album = metadata->album;
                      track.artworkUrl = metadata->artworkUrl;
                      track.playable = metadata->playable;
                    }
                  }
                  if (!problem.empty())
                    session.view.status = problem;
                  publish(session, generation);
                  backoff = 250;
                }
              });
          throw NetworkError("Disconnected; reconnecting for fresh state");
        } catch (const NetworkError &e) {
          if (cancel())
            continue;
          session.view.connected = false;
          session.view.loading = false;
          session.view.refreshing = false;
          session.view.status = problem.empty() ? e.what() : problem;
          publish(session, generation);
        }
        std::unique_lock<std::mutex> lock(mutex_);
        wake_.wait_for(lock, std::chrono::milliseconds(backoff), cancel);
        backoff = std::min(backoff * 2, 8000);
      }
    } catch (const NetworkError &e) {
      std::lock_guard<std::mutex> lock(mutex_);
      published_.view.status = e.what();
      published_.view.loading = false;
      published_.view.refreshing = false;
    }
  }
};
} // namespace
std::unique_ptr<DataAdapter> liveAdapter(LiveConfig config) {
  return std::make_unique<LiveData>(std::move(config));
}
} // namespace brick
