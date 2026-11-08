#include "live.hpp"
#include <algorithm>
#include <chrono>
#include <cmath>
#include <condition_variable>
#include <cstdlib>
#include <curl/curl.h>
#include <filesystem>
#include <fstream>
#include <json-c/json.h>
#include <mutex>
#include <thread>
#include <unordered_set>

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
  LiveConfig config;
  config.url = env("BRICK_URL");
  config.playerKey = env("BRICK_PLAYER_KEY");
  config.collectionKey = env("BRICK_COLLECTION_KEY");
  config.caFile = env("BRICK_CA_FILE");
  config.insecure = env("BRICK_INSECURE_TLS") == "1";
  return config;
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
  if (status && (status < 200 || status >= 300)) {
    NetworkError error(errorState(status, transfer.response));
    if (status == 409 || status == 422) {
      std::string code;
      try {
        auto response = parse(transfer.response);
        code = str(response.get(), "code");
      } catch (const NetworkError &) {
      }
      if (code == "SPEAKER_OCCUPIED")
        error = NetworkError("Speaker busy: explicit takeover is required");
      else if (code == "AVAILABILITY_UNKNOWN")
        error =
            NetworkError("Speaker availability unknown: approval is required");
      else if (code == "DEVICE_BUSY")
        error = NetworkError("Engine takeover requires explicit approval");
      error.code = code;
      error.acknowledgment = status == 409 || code == "DEVICE_BUSY" ||
                             code == "SPEAKER_OCCUPIED" ||
                             code == "AVAILABILITY_UNKNOWN";
    }
    throw error;
  }
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
  json_object *metadata = nullptr;
  if (json_object_object_get_ex(row, "title", &metadata))
    track.title = nullable(row, "title");
  if (json_object_object_get_ex(row, "artist", &metadata))
    track.artist = nullable(row, "artist");
  track.album = nullable(row, "album");
  track.playable = !nullable(row, "local_audio_url").empty();
  track.artworkUrl = nullable(row, "album_thumbnail");
}
std::shared_ptr<const Artwork>
RestClient::artwork(const std::string &url,
                    const std::function<bool()> &cancel) {
  if (url.empty())
    return {};
  std::unique_ptr<CURLU, decltype(&curl_url_cleanup)> target(curl_url(),
                                                             curl_url_cleanup);
  curl_url_set(target.get(), CURLUPART_URL, config_.url.c_str(), 0);
  auto part = [&](CURLUPart key) {
    char *value = nullptr;
    if (curl_url_get(target.get(), key, &value, 0) != CURLUE_OK)
      return std::string{};
    std::string result(value);
    curl_free(value);
    return result;
  };
  auto originOf = [&] {
    std::string origin = part(CURLUPART_SCHEME) + "://" + part(CURLUPART_HOST);
    auto port = part(CURLUPART_PORT);
    if (!port.empty())
      origin += ":" + port;
    return origin;
  };
  auto configuredOrigin = originOf();
  if (curl_url_set(target.get(), CURLUPART_URL, url.c_str(), 0) != CURLUE_OK)
    throw NetworkError("Invalid artwork URL");
  if (!part(CURLUPART_USER).empty() || !part(CURLUPART_PASSWORD).empty())
    throw NetworkError("Invalid artwork URL");
  auto scheme = part(CURLUPART_SCHEME);
  if (scheme != "https" &&
      !(scheme == "http" && config_.url.rfind("http://", 0) == 0))
    throw NetworkError("Invalid artwork protocol");
  std::string origin = originOf();
  std::string path = part(CURLUPART_PATH);
  auto query = part(CURLUPART_QUERY);
  if (!query.empty())
    path += "?" + query;
  auto config = config_;
  config.url = origin;
  // Player credentials are never sent to image servers. Collection auth is
  // restricted to the exact configured origin; redirects remain disabled.
  if (origin != configuredOrigin)
    config.collectionKey.clear();
  RestClient images(config);
  auto bytes = images.request(path, "", false, cancel);
  if (cancel())
    return {};
  return decodeArtwork(bytes);
}
std::string rememberedPlayer(const LiveConfig &config) {
  if (config.selectionPath.empty())
    return "";
  std::ifstream file(config.selectionPath);
  std::string origin, id;
  std::getline(file, origin);
  std::getline(file, id);
  return origin == config.url && identifier(id) ? id : "";
}
void rememberPlayer(const LiveConfig &config, const std::string &id) {
  if (config.selectionPath.empty())
    return;
  if (!identifier(id))
    throw NetworkError("Invalid player identity");
  auto temporary = config.selectionPath + ".tmp";
  {
    std::ofstream file(temporary, std::ios::trunc);
    file << config.url << '\n' << id << '\n';
    file.close();
    if (!file)
      throw NetworkError("Cannot remember selected player");
  }
  std::error_code error;
  std::filesystem::rename(temporary, config.selectionPath, error);
  if (error)
    throw NetworkError("Cannot remember selected player");
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
void PlayerState::advance(int milliseconds) {
  if (milliseconds <= 0 || !view.connected || !view.available || view.loading ||
      view.refreshing || !view.playing ||
      view.currentIndex >= view.queue.size())
    return;
  auto duration = view.queue[view.currentIndex].duration;
  if (!duration || *duration <= 0)
    return;
  // Stop extrapolating after five seconds without authoritative timing.
  elapsed_ += std::min(milliseconds, 5000 - elapsed_);
  auto age = std::chrono::duration_cast<std::chrono::milliseconds>(
                 std::chrono::steady_clock::now() - observed_)
                 .count();
  elapsed_ = std::max(elapsed_, static_cast<int>(std::min<int64_t>(age, 5000)));
  view.position = static_cast<int>(
      std::min<double>(*duration, authoritativePosition_ + elapsed_ / 1000.0));
  if (elapsed_ == 5000 && view.status.find("Timing stale") == std::string::npos)
    view.status += " · Timing stale";
}
void PlayerState::retainProgress(const PlayerState &previous) {
  if (id == previous.id && worker == previous.worker &&
      current == previous.current && sequence == previous.sequence &&
      revision == previous.revision &&
      authoritativePosition_ == previous.authoritativePosition_ &&
      view.currentIndex < view.queue.size() &&
      previous.view.currentIndex < previous.view.queue.size() &&
      view.queue[view.currentIndex].duration ==
          previous.view.queue[previous.view.currentIndex].duration) {
    elapsed_ = previous.elapsed_;
    view.position = previous.view.position;
  }
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
  next.playerId = newId;
  next.playing = status == "playing";
  next.loading = status == "loading";
  auto position = seconds(state, "position");
  next.position = static_cast<int>(position);
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
  std::unordered_set<std::string> queueIds;
  for (size_t i = 0; i < json_object_array_length(queue); ++i) {
    auto *q = json_object_array_get_idx(queue, i);
    Track track{str(q, "title"), str(q, "artist"), "", std::nullopt, false};
    track.trackId = str(q, "track_id");
    track.friendId = number(q, "friend_id");
    if (track.trackId.empty() || track.friendId == 0)
      throw NetworkError("Malformed track identity");
    auto queueId = str(q, "id");
    if (queueId.empty() || !queueIds.insert(queueId).second)
      throw NetworkError("Invalid queue entry identity");
    track.entryId = queueId;
    next.queue.push_back(track);
    if (queueId == entry) {
      next.queue.back().duration = dur;
      next.currentIndex = i;
    }
  }
  if (rev < revision)
    return;
  elapsed_ = 0;
  authoritativePosition_ = position;
  observed_ = std::chrono::steady_clock::now();
  revision = rev;
  id = newId;
  current = entry;
  playback = status;
  next.available = true;
  next.playbackState = status;
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
    if (number(p, "revision") < revision)
      return false;
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
  elapsed_ = 0;
  authoritativePosition_ = pos;
  view.position = static_cast<int>(pos);
  observed_ = std::chrono::steady_clock::now();
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
Collection playlistList(const std::string &text) {
  auto root = parse(text, json_type_array);
  if (json_object_array_length(root.get()) > 1000)
    throw NetworkError(
        "Playlist list exceeds 1000; narrow collection in web controller");
  Collection c;
  for (size_t i = 0; i < json_object_array_length(root.get()); ++i) {
    auto *row = json_object_array_get_idx(root.get(), i);
    auto id = number(row, "id");
    if (!id || std::find(c.ids.begin(), c.ids.end(), id) != c.ids.end())
      throw NetworkError("Invalid playlist identity");
    c.ids.push_back(id);
    c.names.push_back(str(row, "name"));
  }
  c.status = c.ids.empty() ? "No saved playlists" : "Choose a saved playlist";
  return c;
}
Collection playlistTracks(const std::string &text) {
  auto root = parse(text);
  Collection c;
  c.id = number(root.get(), "playlist_id");
  if (!c.id)
    throw NetworkError("Invalid playlist identity");
  auto *rows = field(root.get(), "tracks", json_type_array);
  if (json_object_array_length(rows) > 1000)
    throw NetworkError("Playlist exceeds 1000 tracks; use web controller");
  std::vector<std::pair<int64_t, Track>> ordered;
  for (size_t i = 0; i < json_object_array_length(rows); ++i) {
    auto *row = json_object_array_get_idx(rows, i);
    Track t{"Unknown title", "Unknown artist", "", std::nullopt, false};
    t.trackId = str(row, "track_id");
    t.friendId = number(row, "friend_id");
    if (t.trackId.empty() || !t.friendId)
      throw NetworkError("Invalid collection track identity");
    ordered.emplace_back(number(row, "position"), std::move(t));
  }
  std::stable_sort(
      ordered.begin(), ordered.end(),
      [](const auto &a, const auto &b) { return a.first < b.first; });
  for (auto &entry : ordered)
    c.tracks.push_back(std::move(entry.second));
  c.status = c.tracks.empty()
                 ? "Empty playlist"
                 : "Saved order · server validates unchecked audio";
  return c;
}
std::string queueCommand(const std::vector<Track> &tracks, bool play,
                         std::optional<size_t> selected) {
  if (tracks.empty() || (selected && *selected >= tracks.size()))
    throw NetworkError("No tracks selected");
  Json root(json_object_new_object(), json_object_put);
  json_object_object_add(
      root.get(), "type",
      json_object_new_string(play ? "queue.replace" : "queue.add"));
  auto *refs = json_object_new_array();
  json_object_object_add(root.get(), play ? "entries" : "tracks", refs);
  for (size_t i = 0; i < tracks.size(); ++i) {
    if (selected && i != *selected)
      continue;
    const auto &t = tracks[i];
    if (t.playable == false)
      throw NetworkError("No local audio / unindexed track; queue unchanged");
    if (t.trackId.empty() || t.friendId <= 0)
      throw NetworkError("Invalid collection track identity");
    auto *ref = json_object_new_object();
    json_object_object_add(ref, "track_id",
                           json_object_new_string(t.trackId.c_str()));
    json_object_object_add(ref, "friend_id", json_object_new_int64(t.friendId));
    json_object_array_add(refs, ref);
  }
  if (play)
    json_object_object_add(root.get(), "play", json_object_new_boolean(true));
  return json_object_to_json_string_ext(root.get(), JSON_C_TO_STRING_PLAIN);
}
std::string queueEditCommand(const Snapshot &state, QueueEdit edit,
                             const std::string &entry) {
  Json root(json_object_new_object(), json_object_put);
  const char *type = edit == QueueEdit::Clear    ? "queue.clear"
                     : edit == QueueEdit::Play   ? "play"
                     : edit == QueueEdit::Remove ? "queue.remove"
                                                 : "queue.move";
  json_object_object_add(root.get(), "type", json_object_new_string(type));
  if (edit != QueueEdit::Clear) {
    auto it = std::find_if(state.queue.begin(), state.queue.end(),
                           [&](const Track &t) { return t.entryId == entry; });
    if (entry.empty() || it == state.queue.end())
      throw NetworkError("Queue entry changed; review queue and choose again");
    json_object_object_add(root.get(), "entry_id",
                           json_object_new_string(entry.c_str()));
    if (edit == QueueEdit::Up || edit == QueueEdit::Down) {
      auto index = static_cast<size_t>(it - state.queue.begin());
      if ((edit == QueueEdit::Up && index == 0) ||
          (edit == QueueEdit::Down && index + 1 == state.queue.size()))
        throw NetworkError("Entry is already at the queue boundary");
      json_object_object_add(
          root.get(), "to",
          json_object_new_int64(edit == QueueEdit::Up ? index - 1 : index + 1));
    }
  }
  return json_object_to_json_string_ext(root.get(), JSON_C_TO_STRING_PLAIN);
}
Outputs outputList(const std::string &devices, const std::string &players,
                   const std::string &selected) {
  auto root = parse(devices), list = parse(players);
  auto *rows = field(root.get(), "devices", json_type_array);
  auto *people = field(list.get(), "players", json_type_array);
  if (json_object_array_length(rows) > 1000 ||
      json_object_array_length(people) > 1000)
    throw NetworkError("Output discovery exceeds size limit");
  Outputs result;
  auto token = [&](const std::string &value) {
    result.token += std::to_string(value.size()) + ":" + value;
  };
  for (size_t i = 0; i < json_object_array_length(people); ++i) {
    auto *p = json_object_array_get_idx(people, i);
    if (str(p, "id") == selected) {
      result.assigned = nullable(p, "assigned_output");
      result.desired =
          nullable(field(p, "state", json_type_object), "desired_output");
    }
  }
  token(result.desired);
  token(result.assigned);
  std::unordered_set<std::string> ids;
  for (size_t i = 0; i < json_object_array_length(rows); ++i) {
    auto *row = json_object_array_get_idx(rows, i);
    Output d;
    d.id = str(row, "id");
    if (d.id.empty() || d.id.size() > 255 || !ids.insert(d.id).second)
      throw NetworkError("Malformed output identity");
    d.name = str(row, "name");
    d.assigned = nullable(row, "assigned_player_id");
    d.availability =
        str(field(row, "observed", json_type_object), "availability");
    if (d.availability != "idle" && d.availability != "occupied" &&
        d.availability != "unknown")
      throw NetworkError("Malformed speaker observation");
    auto *desired = field(row, "desired_by", json_type_array);
    if (json_object_array_length(desired) > 1000)
      throw NetworkError("Output discovery exceeds size limit");
    for (size_t j = 0; j < json_object_array_length(desired); ++j) {
      auto *v = json_object_array_get_idx(desired, j);
      if (!v || json_object_get_type(v) != json_type_string)
        throw NetworkError("Malformed desired assignment");
      d.desiredBy.push_back(json_object_get_string(v));
    }
    for (size_t j = 0; j < json_object_array_length(people); ++j) {
      auto *p = json_object_array_get_idx(people, j);
      if (str(p, "id") == d.assigned)
        d.sourceRevision = number(p, "revision");
    }
    token(d.id);
    token(d.name);
    token(d.assigned);
    token(d.availability);
    token(std::to_string(d.sourceRevision));
    token(std::to_string(d.desiredBy.size()));
    for (const auto &id : d.desiredBy)
      token(id);
    result.devices.push_back(std::move(d));
  }
  result.status =
      "Desired: " + (result.desired.empty() ? "none" : result.desired) +
      " · Assigned: " + (result.assigned.empty() ? "none" : result.assigned);
  if (!result.desired.empty() && !ids.count(result.desired))
    result.status += " · Desired output lost";
  return result;
}
std::string outputCommand(const Output &d, const std::string &player) {
  Json root(json_object_new_object(), json_object_put);
  bool transfer = !d.assigned.empty() && d.assigned != player;
  json_object_object_add(
      root.get(), "type",
      json_object_new_string(transfer ? "output.transfer" : "output.select"));
  json_object_object_add(root.get(), "output_id",
                         json_object_new_string(d.id.c_str()));
  if (transfer) {
    if (!identifier(d.assigned) || d.sourceRevision < 0)
      throw NetworkError("Source assignment changed; refresh Outputs");
    json_object_object_add(root.get(), "from_player_id",
                           json_object_new_string(d.assigned.c_str()));
    json_object_object_add(root.get(), "from_revision",
                           json_object_new_int64(d.sourceRevision));
    json_object_object_add(root.get(), "play", json_object_new_boolean(false));
  }
  return json_object_to_json_string_ext(root.get(), JSON_C_TO_STRING_PLAIN);
}
std::string outputResult(const std::string &json) {
  auto root = parse(json);
  json_object *transfer = nullptr;
  if (!json_object_object_get_ex(root.get(), "transfer", &transfer))
    return "Output request accepted; checking actual assignments";
  bool detached =
      json_object_get_boolean(field(transfer, "detached", json_type_boolean));
  bool attached =
      json_object_get_boolean(field(transfer, "attached", json_type_boolean));
  json_object *error = nullptr;
  if (!json_object_object_get_ex(transfer, "error", &error))
    throw NetworkError("Malformed transfer result");
  std::string reason;
  if (error) {
    auto code = str(error, "code");
    reason = code == "DEVICE_BUSY"        ? " · Engine conflict"
             : code == "SPEAKER_OCCUPIED" ? " · Speaker occupied"
             : code == "AVAILABILITY_UNKNOWN"
                 ? " · Availability unknown"
                 : " · Server could not complete transfer";
  }
  return std::string(error ? "Partial transfer failed" : "Transfer confirmed") +
         " · Source " + (detached ? "detached" : "retains assignment") +
         " · Target " + (attached ? "attached" : "not attached") + reason;
}
namespace {
class LiveData final : public DataAdapter {
public:
  explicit LiveData(LiveConfig config) : config_(std::move(config)) {
    state_.connected = state_.available = state_.playing = false;
    state_.player = "No player selected";
    state_.status = "Connecting to Groovenet";
    selected_ = rememberedPlayer(config_);
    if (!selected_.empty()) {
      state_.playerId = selected_;
      state_.player = selected_;
    }
    published_.view = state_;
    metadataThread_ = std::thread([this] { metadataLoop(); });
    thread_ = std::thread([this] { run(); });
    outputThread_ = std::thread([this] { outputLoop(); });
    collectionThread_ = std::thread([this] { collectionLoop(); });
  }
  ~LiveData() override {
    stop_ = true;
    ++generation_;
    wake_.notify_all();
    metadataWake_.notify_all();
    collectionWake_.notify_all();
    outputWake_.notify_all();
    outputThread_.join();
    thread_.join();
    collectionThread_.join();
    metadataThread_.join();
  }
  const Snapshot &snapshot() const override { return state_; }
  void advance(int milliseconds) override {
    std::lock_guard<std::mutex> lock(mutex_);
    if (seen_ != serial_) {
      auto previous = display_;
      display_ = published_;
      display_.retainProgress(previous);
      seen_ = serial_;
    } else
      display_.advance(milliseconds);
    state_ = display_.view;
  }
  void acknowledge() override {
    std::lock_guard<std::mutex> lock(mutex_);
    published_.view.acknowledgment.clear();
    ++serial_;
  }
  void refresh() override {
    std::lock_guard<std::mutex> lock(mutex_);
    pending_.clear();
    outputWrite_ = false;
    published_.view.outputApproval.clear();
    published_.view.outputUnknown = published_.view.outputTakeover = false;
    published_.view.routing.token.clear();
    published_.view.refreshing =
        published_.view.connected || published_.view.refreshing;
    published_.view.connected = false;
    published_.view.status = "Refreshing player state";
    ++generation_;
    ++serial_;
    wake_.notify_all();
  }
  void selectPlayer(size_t index) override {
    std::lock_guard<std::mutex> lock(mutex_);
    if (index >= state_.playerIds.size())
      return;
    selected_ = state_.playerIds[index];
    published_.view.routing = Outputs{};
    published_.view.outputApproval.clear();
    published_.view.outputUnknown = published_.view.outputTakeover = false;
    published_.view.player = state_.players[index];
    published_.view.playerId = selected_;
    published_.view.status = "Connecting to selected player";
    published_.view.acknowledgment.clear();
    persistenceWarning_.clear();
    try {
      rememberPlayer(config_, selected_);
    } catch (const NetworkError &e) {
      persistenceWarning_ = e.what();
    }
    pending_.clear();
    outputWrite_ = false;
    published_.view.outputApproval.clear();
    published_.view.outputUnknown = published_.view.outputTakeover = false;
    published_.view.routing.token.clear();
    published_.view.connected = false;
    published_.view.queue.clear();
    published_.view.refreshing = false;
    published_.view.loading = true;
    ++serial_;
    ++generation_;
    wake_.notify_all();
  }
  void browse(int64_t id, bool more) override {
    std::lock_guard<std::mutex> lock(mutex_);
    auto &c = published_.view.collection;
    if (more && (c.loading || c.id != id || c.loaded >= c.tracks.size()))
      return;
    if (!more) {
      c.tracks.clear();
      c.loaded = 0;
      c.id = id;
    }
    c.loading = true;
    c.status = "Loading collection…";
    state_.collection = c; // Invalidate old rows before another input event.
    collectionJob_ = std::make_pair(id, more);
    ++collectionVersion_;
    ++serial_;
    collectionWake_.notify_all();
  }
  void queueTracks(bool play, std::optional<size_t> track,
                   const std::string &token) override {
    std::lock_guard<std::mutex> lock(mutex_);
    if (!published_.view.acknowledgment.empty() || !pending_.empty())
      return;
    try {
      if (token.empty() || token != published_.view.commandToken ||
          !published_.view.connected)
        throw NetworkError(
            "Player state changed; review queue and choose action again");
      if (published_.view.collection.loading)
        throw NetworkError("Wait for collection loading");
      pending_ = published_.command(
          queueCommand(published_.view.collection.tracks, play, track));
      published_.view.connected = false;
      published_.view.refreshing = true;
      published_.view.collection.status =
          "Updating queue once; awaiting server state";
      ++generation_;
      wake_.notify_all();
    } catch (const NetworkError &e) {
      published_.view.acknowledgment = e.what();
    }
    ++serial_;
  }
  void editQueue(QueueEdit edit, const std::string &entry,
                 const std::string &token) override {
    std::lock_guard<std::mutex> lock(mutex_);
    if (!published_.view.acknowledgment.empty() || !pending_.empty())
      return;
    try {
      if (token.empty() || token != published_.view.commandToken ||
          !published_.view.connected)
        throw NetworkError(
            "Queue changed; review refreshed queue and choose again");
      pending_ =
          published_.command(queueEditCommand(published_.view, edit, entry));
      published_.view.connected = false;
      published_.view.refreshing = true;
      published_.view.status = "Queue edit pending; awaiting server state";
      ++generation_;
      wake_.notify_all();
    } catch (const NetworkError &e) {
      published_.view.acknowledgment = e.what();
    }
    ++serial_;
  }
  void browseOutputs() override {
    std::lock_guard<std::mutex> lock(mutex_);
    outputsOpen_ = true;
    ++outputVersion_;
    published_.view.routing.token.clear();
    published_.view.routing.status = "Discovering outputs…";
    ++serial_;
    outputWake_.notify_all();
  }
  void output(const std::string &body, const std::string &token,
              bool allowUnknown, bool takeover) override {
    std::lock_guard<std::mutex> lock(mutex_);
    if (!pending_.empty() || !published_.view.acknowledgment.empty())
      return;
    try {
      if (!published_.view.connected || token.empty() ||
          token != published_.view.commandToken + "|" +
                       published_.view.routing.token)
        throw NetworkError(
            "Outputs or player changed; review and choose again");
      auto root = parse(body);
      if (allowUnknown)
        json_object_object_add(root.get(), "allow_unknown",
                               json_object_new_boolean(true));
      if (takeover)
        json_object_object_add(root.get(), "takeover",
                               json_object_new_boolean(true));
      pending_ = published_.command(
          json_object_to_json_string_ext(root.get(), JSON_C_TO_STRING_PLAIN));
      outputWrite_ = true;
      requestedRouting_ = published_.view.routing.token;
      requestedUnknown_ = allowUnknown;
      requestedTakeover_ = takeover;
      published_.view.outputApproval.clear();
      published_.view.outputUnknown = published_.view.outputTakeover = false;
      published_.view.connected = false;
      published_.view.refreshing = true;
      published_.view.routing.token.clear();
      published_.view.routing.status =
          "Output request pending; awaiting server confirmation";
      ++generation_;
      wake_.notify_all();
    } catch (const NetworkError &e) {
      published_.view.acknowledgment = e.what();
    }
    ++serial_;
  }
  void command(Action action) override {
    std::lock_guard<std::mutex> lock(mutex_);
    if (!published_.view.connected || !published_.view.acknowledgment.empty() ||
        !pending_.empty())
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
    ++serial_;
    ++generation_;
    wake_.notify_all();
  }

private:
  std::thread outputThread_;
  std::condition_variable outputWake_;
  bool outputsOpen_ = false, outputWrite_ = false;
  unsigned outputVersion_ = 0;
  void outputLoop() {
    try {
      RestClient api(config_);
      while (!stop_) {
        std::string id;
        unsigned generation, version;
        {
          std::unique_lock<std::mutex> lock(mutex_);
          outputWake_.wait_for(lock, std::chrono::seconds(2));
          if (stop_)
            return;
          if (!outputsOpen_ || selected_.empty())
            continue;
          id = selected_;
          generation = generation_;
          version = outputVersion_;
        }
        auto cancel = [this, generation] {
          return stop_ || generation != generation_;
        };
        Outputs routing;
        try {
          auto devices =
              api.request("/api/players/" + id + "/devices", "", true, cancel);
          auto players = api.request("/api/players", "", true, cancel);
          routing = outputList(devices, players, id);
        } catch (const NetworkError &e) {
          routing.status = e.what();
        }
        std::lock_guard<std::mutex> lock(mutex_);
        if (cancel() || version != outputVersion_)
          continue;
        if (!published_.view.outputApproval.empty() &&
            routing.token != approvalRouting_) {
          published_.view.outputApproval.clear();
          published_.view.outputUnknown = published_.view.outputTakeover =
              false;
        }
        published_.view.routing = std::move(routing);
        ++serial_;
      }
    } catch (const NetworkError &) {
    }
  }
  LiveConfig config_;
  Snapshot state_;
  PlayerState published_, display_;
  uint64_t serial_ = 1, seen_ = 0, connection_ = 0;
  std::mutex mutex_;
  std::condition_variable wake_;
  std::thread thread_, metadataThread_, collectionThread_;
  std::condition_variable collectionWake_;
  std::atomic<unsigned> collectionVersion_{0};
  std::optional<std::pair<int64_t, bool>> collectionJob_;
  void collectionLoop() {
    try {
      RestClient api(config_);
      while (!stop_) {
        Collection c;
        unsigned version;
        std::pair<int64_t, bool> job;
        {
          std::unique_lock<std::mutex> lock(mutex_);
          collectionWake_.wait(
              lock, [this] { return stop_ || collectionJob_.has_value(); });
          if (stop_)
            return;
          job = *collectionJob_;
          collectionJob_.reset();
          version = collectionVersion_;
          c = published_.view.collection;
        }
        auto cancel = [this, version] {
          return stop_ || collectionVersion_ != version;
        };
        try {
          if (!job.first)
            c = playlistList(api.playlists(cancel));
          else {
            if (!job.second) {
              auto detail = playlistTracks(api.playlist(job.first, cancel));
              if (detail.id != job.first)
                throw NetworkError("Wrong playlist identity");
              detail.names = c.names;
              detail.ids = c.ids;
              c = std::move(detail);
            }
            const auto end = std::min(c.loaded + 25, c.tracks.size());
            // Each bounded HTTP request checks cancellation.
            for (; c.loaded < end; ++c.loaded) {
              try {
                api.enrich(c.tracks[c.loaded], cancel);
              } catch (const NetworkError &e) {
                if (std::string(e.what()) != "Collection track not found")
                  throw;
                c.tracks[c.loaded].playable = false;
              }
            }
            c.status =
                c.tracks.empty()
                    ? "Empty playlist"
                    : "Saved order · missing/unindexed audio cannot play";
          }
        } catch (const NetworkError &e) {
          c.status = e.what();
        }
        std::lock_guard<std::mutex> lock(mutex_);
        if (!cancel()) {
          c.loading = false;
          published_.view.collection = std::move(c);
          ++serial_;
        }
      }
    } catch (
        const NetworkError &) { /* State worker reports configuration errors. */
    }
  }
  std::condition_variable metadataWake_;
  std::atomic<unsigned> metadataVersion_{0};
  struct MetadataJob {
    Track track;
    unsigned generation, version;
  };
  std::optional<MetadataJob> metadataJob_;
  std::string metadataIdentity_;
  std::atomic<bool> stop_{false};
  std::atomic<unsigned> generation_{0};
  std::string selected_, pending_, persistenceWarning_;
  int64_t approvalRevision_ = -1;
  uint64_t approvalConnection_ = 0;
  std::string approvalPlayer_, approvalWorker_, requestedRouting_,
      approvalRouting_;
  bool requestedUnknown_ = false, requestedTakeover_ = false;
  void publish(const PlayerState &session, unsigned generation,
               const std::string &collectionStatus = "") {
    std::lock_guard<std::mutex> lock(mutex_);
    if (!stop_ && generation == generation_) {
      auto next = session;
      next.view.collection = published_.view.collection;
      next.view.routing = published_.view.routing;
      if (next.id == approvalPlayer_ && next.revision == approvalRevision_ &&
          next.worker == approvalWorker_ &&
          connection_ == approvalConnection_) {
        next.view.outputApproval = published_.view.outputApproval;
        next.view.outputUnknown = published_.view.outputUnknown;
        next.view.outputTakeover = published_.view.outputTakeover;
      } else {
        next.view.outputApproval.clear();
        next.view.outputUnknown = next.view.outputTakeover = false;
      }
      if (!collectionStatus.empty())
        next.view.collection.status = collectionStatus;
      next.view.commandToken = next.id + "/" + next.worker + "/" +
                               std::to_string(next.revision) + "/" +
                               std::to_string(connection_);
      next.view.acknowledgment = published_.view.acknowledgment;
      if (next.view.currentIndex < next.view.queue.size()) {
        auto &track = next.view.queue[next.view.currentIndex];
        std::string identity = next.id + "/" + next.current + "/" +
                               track.trackId + "/" +
                               std::to_string(track.friendId);
        if (published_.id == next.id && published_.current == next.current &&
            published_.view.currentIndex < published_.view.queue.size()) {
          auto &old = published_.view.queue[published_.view.currentIndex];
          if (old.trackId == track.trackId && old.friendId == track.friendId) {
            track.album = old.album;
            track.artworkUrl = old.artworkUrl;
            track.image = old.image;
            track.playable = old.playable;
          }
        }
        if (next.view.connected && (identity != metadataIdentity_ ||
                                    metadataGeneration_ != generation)) {
          metadataWarning_.clear();
          metadataIdentity_ = identity;
          metadataGeneration_ = generation;
          metadataJob_ = MetadataJob{track, generation, ++metadataVersion_};
          metadataWake_.notify_all();
        }
        if (identity == metadataIdentity_)
          next.view.status += metadataWarning_;
      } else {
        metadataIdentity_.clear();
        ++metadataVersion_;
      }
      if (!persistenceWarning_.empty())
        next.view.status += " · " + persistenceWarning_;
      published_ = std::move(next);
      ++serial_;
    }
  }
  unsigned metadataGeneration_ = 0;
  std::string metadataWarning_;
  void metadataLoop() {
    try {
      RestClient api(config_);
      while (!stop_) {
        std::optional<MetadataJob> job;
        {
          std::unique_lock<std::mutex> lock(mutex_);
          metadataWake_.wait(
              lock, [this] { return stop_ || metadataJob_.has_value(); });
          if (stop_)
            return;
          job = std::move(metadataJob_);
          metadataJob_.reset();
        }
        auto cancel = [this, &job] {
          return stop_ || generation_ != job->generation ||
                 metadataVersion_ != job->version;
        };
        std::string warning;
        try {
          api.enrich(job->track, cancel);
          if (!cancel()) {
            try {
              job->track.image.reset();
              job->track.image = api.artwork(job->track.artworkUrl, cancel);
            } catch (const NetworkError &) {
              warning = " · Artwork unavailable";
            }
          }
        } catch (const NetworkError &) {
          warning = " · Collection metadata unavailable";
        }
        std::lock_guard<std::mutex> lock(mutex_);
        if (cancel() ||
            published_.view.currentIndex >= published_.view.queue.size())
          continue;
        auto &track = published_.view.queue[published_.view.currentIndex];
        track.album = job->track.album;
        track.artworkUrl = job->track.artworkUrl;
        track.playable = job->track.playable;
        track.image = job->track.image;
        metadataWarning_ = warning;
        published_.view.status += warning;
        ++serial_;
      }
    } catch (const NetworkError &) { /* Configuration error is published by the
                                        state worker. */
    }
  }
  void run() {
    try {
      RestClient api(config_);
      int backoff = 250;
      while (!stop_) {
        unsigned generation;
        PlayerState session;
        std::string write;
        bool outputWrite;
        {
          std::lock_guard<std::mutex> lock(mutex_);
          generation = generation_.load();
          ++connection_;
          // A new subscription retries metadata that failed on the old
          // connection.
          metadataIdentity_.clear();
          metadataJob_.reset();
          ++metadataVersion_;
          session = published_;
          session.id = selected_;
          outputWrite = outputWrite_;
          outputWrite_ = false;
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
              auto response =
                  api.request("/api/players/" + session.id + "/commands", write,
                              true, cancel);
              problem = outputWrite ? outputResult(response)
                                    : "Player updated; review shared queue";
              if (outputWrite) {
                std::lock_guard<std::mutex> lock(mutex_);
                if (!cancel())
                  published_.view.acknowledgment = problem;
              }
            } catch (const NetworkError &e) {
              if (e.acknowledgment) {
                std::lock_guard<std::mutex> lock(mutex_);
                if (!cancel()) {
                  published_.view.acknowledgment = e.what();
                  if (outputWrite &&
                      write.find("\"type\":\"play\"") != std::string::npos &&
                      (e.code == "AVAILABILITY_UNKNOWN" ||
                       e.code == "SPEAKER_OCCUPIED" ||
                       e.code == "DEVICE_BUSY")) {
                    approvalRevision_ = session.revision;
                    approvalPlayer_ = session.id;
                    approvalWorker_ = session.worker;
                    approvalConnection_ = connection_;
                    approvalRouting_ = requestedRouting_;
                    published_.view.outputApproval = e.code;
                    published_.view.outputUnknown =
                        requestedUnknown_ || e.code == "AVAILABILITY_UNKNOWN";
                    published_.view.outputTakeover =
                        requestedTakeover_ || e.code == "SPEAKER_OCCUPIED" ||
                        e.code == "DEVICE_BUSY";
                  }
                  ++serial_;
                }
              }
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
          session.view.players = names;
          session.view.playerIds = ids;
          session.begin();
          if (session.id.empty())
            throw NetworkError(ids.empty()
                                   ? "No players configured"
                                   : "Choose a player in Browse > Players");
          if (std::find(ids.begin(), ids.end(), session.id) == ids.end()) {
            session.view.available = false;
            session.view.queue.clear();
            throw NetworkError("Remembered player missing; choose a player in "
                               "Browse > Players");
          }
          session.detail(
              api.request("/api/players/" + session.id, "", true, cancel));
          // Keep the last enriched snapshot visible during command/wake
          // refresh. Detail alone omits album/artwork and is not authoritative
          // SSE state.
          if (!session.view.refreshing)
            publish(session, generation);

          api.request("/api/players/" + session.id + "/events", "", true,
                      cancel, [&](const std::string &event) {
                        if (session.event(event)) {
                          if (!problem.empty())
                            session.view.status = problem;
                          publish(session, generation, problem);
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
      ++serial_;
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
