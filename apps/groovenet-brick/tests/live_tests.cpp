#include "live.hpp"
#include <algorithm>
#include <chrono>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <jpeglib.h>
#include <json-c/json.h>
#include <png.h>
#include <thread>
using namespace brick;
namespace {
void check(bool ok) {
  if (!ok)
    throw std::runtime_error("Live client assertion failed");
}
template <class F> void rejects(F f) {
  bool rejected = false;
  try {
    f();
  } catch (const NetworkError &) {
    rejected = true;
  }
  check(rejected);
}
const std::string player =
    R"({"id":"a","name":"Room","revision":5,"state":{"queue":[{"id":"one","track_id":"same","friend_id":1,"title":"First","artist":"Artist"},{"id":"two","track_id":"same","friend_id":2,"title":"Second","artist":"Artist"}],"current_entry_id":"two","status":"playing","position":12.5,"duration":120,"volume":50}})";
std::string snapshot(const std::string &p = player, int seq = 1,
                     const std::string &worker = "worker-a") {
  return "{\"type\":\"snapshot\",\"worker_instance\":\"" + worker +
         "\",\"sequence\":" + std::to_string(seq) + ",\"player\":" + p + "}";
}
std::string replace(std::string s, const std::string &from,
                    const std::string &to) {
  auto pos = s.find(from);
  check(pos != std::string::npos);
  s.replace(pos, from.size(), to);
  return s;
}
void wait(DataAdapter &data,
          const std::function<bool(const Snapshot &)> &predicate) {
  auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(8);
  do {
    data.advance(10);
    if (predicate(data.snapshot()))
      return;
    std::this_thread::sleep_for(std::chrono::milliseconds(10));
  } while (std::chrono::steady_clock::now() < deadline);
  throw std::runtime_error("Timed out waiting for state: " +
                           data.snapshot().status);
}
} // namespace
void liveTests() {
  LiveConfig config{"https://localhost", "", "", "", false, ""};
  rejects([&] { config.validate(); });
  config.playerKey = "unused";
  config.validate();
  for (auto url : {"bad", "ftp://localhost", "https://user:pass@localhost",
                   "https://localhost?q=x", "https://localhost#x"}) {
    auto bad = config;
    bad.url = url;
    rejects([&] { bad.validate(); });
  }
  for (const auto &badId :
       {"", "-bad", "Upper", "bad/path",
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}) {
    PlayerState bad;
    rejects([&] {
      bad.detail(replace(player, "\"id\":\"a\"",
                         "\"id\":\"" + std::string(badId) + "\""));
    });
  }
  config.playerKey = "bad\nheader";
  rejects([&] { config.validate(); });
  config.playerKey = "unused";
  config.collectionKey = "bad\rheader";
  rejects([&] { config.validate(); });
  std::vector<std::string> frames;
  EventDecoder decoder([&](const std::string &s) { frames.push_back(s); });
  std::string wire =
      ":comment\r\nretry: 1\r\nevent: snapshot\r\ndata: "
      "{\r\ndata:\"x\":1}\r\n\r\ndata: {}\r\rdata: \n\ndata: incomplete";
  for (auto c : wire)
    decoder.feed(&c, 1);
  check(frames.size() == 3 && frames[0] == "{\n\"x\":1}" && frames[1] == "{}" &&
        frames[2].empty());
  EventDecoder big([](const std::string &) {});
  std::string huge(2 * 1024 * 1024 + 1, 'x');
  rejects([&] { big.feed(huge.data(), huge.size()); });
  PlayerState state;
  state.begin();
  rejects([&] { state.command("{\"type\":\"next\"}"); });
  check(state.event(snapshot()));
  state.view.refreshing = true;
  state.begin();
  check(state.view.refreshing && !state.view.connected && !state.view.loading);
  check(state.event(snapshot()) && !state.view.refreshing);
  check(state.view.queue[0].friendId == 1 && state.view.queue[1].friendId == 2);
  check(state.view.currentIndex == 1 && state.view.position == 12 &&
        state.revision == 5);
  check(state
            .command("{\"type\":\"queue.add\",\"tracks\":[{\"track_id\":"
                     "\"same\",\"friend_id\":2}]}")
            .find("\"expected_revision\":5") != std::string::npos);
  rejects([&] { state.command("garbage"); });
  rejects([&] { state.command("{}"); });
  check(!state.event(snapshot()));
  std::string pos =
      R"({"type":"position","player_id":"a","revision":5,"current_entry_id":"two","position":24,"duration":null,"worker_instance":"worker-a","sequence":2})";
  check(state.event(pos) && state.view.position == 24 &&
        !state.view.queue[1].duration);
  check(!state.event(pos));
  for (const auto &change : {std::make_pair("\"a\"", "\"b\""),
                             std::make_pair("\"revision\":5", "\"revision\":6"),
                             std::make_pair("\"two\"", "\"one\"")}) {
    check(!state.event(
        replace(replace(pos, change.first, change.second), "\"sequence\":2",
                "\"sequence\":" + std::to_string(++state.sequence + 1))));
  }
  rejects([&] { state.event(snapshot(player, 100, "worker-b")); });
  check(!state.event(snapshot(
            replace(player, "\"revision\":5", "\"revision\":4"), 100)) ||
        state.revision == 5);
  rejects(
      [&] { state.detail(replace(player, "\"id\":\"a\"", "\"id\":\"b\"")); });
  for (const auto &bad : {"{}", "null", "{}x", "[]", "invalid"})
    rejects([&] { state.detail(bad); });
  for (const auto &change : {
           std::make_pair("\"id\":\"a\"", "\"id\":\"../bad\""),
           std::make_pair("\"revision\":5", "\"revision\":-1"),
           std::make_pair("\"revision\":5", "\"revision\":9007199254740992"),
           std::make_pair("\"name\":\"Room\"", "\"name\":4"),
           std::make_pair("\"name\":\"Room\"", "\"name\":\"bad\\u0000value\""),
           std::make_pair("\"playing\"", "\"invalid\""),
           std::make_pair("\"position\":12.5", "\"position\":-1"),
           std::make_pair("\"position\":12.5", "\"position\":true"),
           std::make_pair("\"duration\":120,", ""),
           std::make_pair("\"volume\":50", "\"volume\":101"),
           std::make_pair("\"current_entry_id\":\"two\",", ""),
           std::make_pair("\"friend_id\":1", "\"friend_id\":0"),
           std::make_pair("\"track_id\":\"same\"", "\"track_id\":\"\""),
       })
    rejects(
        [&] { state.detail(replace(player, change.first, change.second)); });
  rejects(
      [&] { state.detail(replace(player, "Room", std::string(4097, 'x'))); });
  for (auto status : {"paused", "stopped", "loading", "ended", "error"}) {
    state.detail(replace(player, "playing", status));
    if (std::string(status) == "loading")
      rejects([&] { state.command("{\"type\":\"next\"}"); });
  }
  state.detail(replace(player, "\"revision\":5", "\"revision\":4"));
  check(state.revision == 5);
  rejects([&] { state.detail(replace(player, "12.5", "2147483648")); });
  rejects([&] { state.detail(replace(player, "12.5", "NaN")); });
  rejects([&] {
    state.detail(
        replace(player, "Room", std::string(1, static_cast<char>(0xff))));
  });
  rejects([&] { state.detail(std::string(2097153, 'x')); });
  auto *oversize = json_tokener_parse(player.c_str());
  auto *queue = json_object_new_array();
  for (int i = 0; i < 10001; ++i)
    json_object_array_add(queue, json_object_new_object());
  json_object *stateObject = nullptr;
  json_object_object_get_ex(oversize, "state", &stateObject);
  json_object_object_add(stateObject, "queue", queue);
  rejects([&] { state.detail(json_object_to_json_string(oversize)); });
  json_object_put(oversize);
  state.begin();
  check(!state.event(pos));
  check(state.event(snapshot(
      replace(player, "\"revision\":5", "\"revision\":0"), 1, "worker-b")));
  check(state.revision == 0);
  rejects([&] { state.event(replace(pos, "worker-a", "")); });
  rejects([&] {
    state.event(replace(replace(pos, "worker-a", "worker-b"), "position\"",
                        "unexpected\""));
  });
  state.detail(replace(player, "\"current_entry_id\":\"two\"",
                       "\"current_entry_id\":null"));
  check(state.view.currentIndex >= state.view.queue.size() &&
        timing(state.view) == "--:-- / --:--");
  PlayerState clock;
  check(clock.event(snapshot()));
  clock.advance(499);
  check(clock.view.position == 12);
  clock.advance(1);
  check(clock.view.position == 13);
  clock.advance(10000);
  check(clock.view.position == 17);
  clock.advance(10000);
  check(clock.view.position == 17); // Stale timing freezes after five seconds.
  check(clock.event(replace(pos, "null", "120")));
  clock.advance(1000);
  check(clock.view.position == 25); // Authoritative position reconciles.
  clock.view.connected = false;
  clock.advance(2000);
  check(clock.view.position == 25);
  clock.view.connected = true;
  clock.view.playing = false;
  clock.advance(2000);
  check(clock.view.position == 25);
  check(clock.event(snapshot(replace(player, "12.5", "119"), 3)));
  clock.advance(4000);
  check(clock.view.position == 120);
  clock.advance(-1);
  check(clock.event(
      replace(replace(pos, "null", "0"), "sequence\":2", "sequence\":4")));
  clock.advance(1000);
  check(clock.view.position == 24);
  auto presentation = clock;
  presentation.view.queue[1].duration = 120;
  presentation.advance(1000);
  auto metadataUpdate = clock;
  metadataUpdate.view.queue[1].duration = 120;
  metadataUpdate.retainProgress(presentation);
  check(metadataUpdate.view.position == presentation.view.position);
  for (auto flag : {0, 1, 2, 3}) {
    auto blocked = presentation;
    if (flag == 0)
      blocked.view.available = false;
    if (flag == 1)
      blocked.view.loading = true;
    if (flag == 2)
      blocked.view.refreshing = true;
    if (flag == 3)
      blocked.view.queue[1].duration.reset();
    auto position = blocked.view.position;
    blocked.advance(1000);
    check(blocked.view.position == position);
  }
  clock.view.queue.clear();
  clock.advance(1000);

  auto path =
      std::filesystem::temp_directory_path() /
      ("brick-selection-" +
       std::to_string(
           std::chrono::steady_clock::now().time_since_epoch().count()));
  config.collectionKey.clear();
  config.selectionPath = path.string();
  check(rememberedPlayer(config).empty());
  rememberPlayer(config, "a");
  check(rememberedPlayer(config) == "a");
  auto otherServer = config;
  otherServer.url = "https://other-server";
  check(rememberedPlayer(otherServer).empty());
  rejects([&] { rememberPlayer(config, "../bad"); });
  {
    std::ofstream file(path);
    file << config.url << "\n../bad\n";
  }
  check(rememberedPlayer(config).empty());
  std::filesystem::remove(path);
  config.selectionPath = (path / "missing" / "selected").string();
  rejects([&] { rememberPlayer(config, "a"); });
  config.selectionPath = path.string();
  std::filesystem::create_directory(path);
  rejects([&] {
    rememberPlayer(config, "a");
  }); // Atomic rename fails onto a directory.
  std::filesystem::remove_all(path);
  std::filesystem::remove(path.string() + ".tmp");
  config.selectionPath.clear();
  rememberPlayer(config, "a");
  check(rememberedPlayer(config).empty());

  png_image png{};
  png.version = PNG_IMAGE_VERSION;
  png.width = png.height = 2;
  png.format = PNG_FORMAT_RGBA;
  unsigned char pixels[16] = {255, 0, 0,   255, 0,   255, 0,   255,
                              0,   0, 255, 255, 255, 255, 255, 255};
  png_alloc_size_t size = 0;
  check(png_image_write_to_memory(&png, nullptr, &size, 0, pixels, 0, nullptr));
  std::string bytes(size, '\0');
  check(png_image_write_to_memory(&png, bytes.data(), &size, 0, pixels, 0,
                                  nullptr));
  auto image = decodeArtwork(bytes);
  check(image->width == 2 && image->height == 2 && image->pixels[0] == 255);
  rejects([&] { decodeArtwork(bytes.substr(0, 16)); });
  auto corrupt = bytes;
  corrupt[corrupt.size() / 2] ^= 0x7f;
  rejects([&] { decodeArtwork(corrupt); });
  for (bool tall : {false, true}) {
    png.width = tall ? 1 : 1025;
    png.height = tall ? 1025 : 1;
    std::vector<unsigned char> widePixels(1025 * 4, 255);
    size = 0;
    check(png_image_write_to_memory(&png, nullptr, &size, 0, widePixels.data(),
                                    0, nullptr));
    std::string wide(size, '\0');
    check(png_image_write_to_memory(&png, wide.data(), &size, 0,
                                    widePixels.data(), 0, nullptr));
    rejects([&] { decodeArtwork(wide); });
  }
  for (auto invalid : {"", "not an image",
                       "\xff\xd8"
                       "broken"})
    rejects([&] { decodeArtwork(invalid); });

  jpeg_compress_struct encoder{};
  jpeg_error_mgr errors{};
  encoder.err = jpeg_std_error(&errors);
  jpeg_create_compress(&encoder);
  unsigned char *encoded = nullptr;
  unsigned long length = 0;
  jpeg_mem_dest(&encoder, &encoded, &length);
  encoder.image_width = encoder.image_height = 2;
  encoder.input_components = 3;
  encoder.in_color_space = JCS_RGB;
  jpeg_set_defaults(&encoder);
  jpeg_start_compress(&encoder, TRUE);
  unsigned char row[6] = {255, 0, 0, 255, 0, 0};
  while (encoder.next_scanline < encoder.image_height) {
    auto *scanline = row;
    jpeg_write_scanlines(&encoder, &scanline, 1);
  }
  jpeg_finish_compress(&encoder);
  auto jpg =
      decodeArtwork(std::string(reinterpret_cast<char *>(encoded), length));
  check(jpg->width == 2 && jpg->height == 2 && jpg->pixels[3] == 255);
  std::free(encoded);
  jpeg_destroy_compress(&encoder);
  for (bool tall : {false, true}) {
    jpeg_create_compress(&encoder);
    encoded = nullptr;
    length = 0;
    jpeg_mem_dest(&encoder, &encoded, &length);
    encoder.image_width = tall ? 1 : 1025;
    encoder.image_height = tall ? 1025 : 1;
    encoder.input_components = 3;
    encoder.in_color_space = JCS_RGB;
    jpeg_set_defaults(&encoder);
    jpeg_start_compress(&encoder, TRUE);
    std::vector<unsigned char> wideRow(1025 * 3, 128);
    auto *scanline = wideRow.data();
    while (encoder.next_scanline < encoder.image_height)
      jpeg_write_scanlines(&encoder, &scanline, 1);
    jpeg_finish_compress(&encoder);
    rejects([&] {
      decodeArtwork(std::string(reinterpret_cast<char *>(encoded), length));
    });
    std::free(encoded);
    jpeg_destroy_compress(&encoder);
  }
}
int networkTests(const std::string &mode) {
  auto config = LiveConfig::environment();
  if (mode == "development") {
    config.selectionPath =
        std::string(std::getenv("BRICK_TEST_DIRECTORY")) + "/live-selected";
    auto data = liveAdapter(config);
    wait(*data, [](const Snapshot &s) { return !s.playerIds.empty(); });
    auto ids = data->snapshot().playerIds;
    auto row = std::find(ids.begin(), ids.end(), "brick-smoke");
    check(row != ids.end());
    data->selectPlayer(static_cast<size_t>(row - ids.begin()));
    wait(*data, [](const Snapshot &s) {
      return s.connected && s.playing && s.queue.size() == 2;
    });
    RestClient second(config);
    auto no = [] { return false; };
    auto control = [&](const std::string &command) {
      PlayerState session;
      session.detail(second.request("/api/players/brick-smoke", "", true, no));
      session.view.connected = true;
      second.request("/api/players/brick-smoke/commands",
                     session.command(command), true, no);
    };
    control("{\"type\":\"pause\"}");
    wait(*data, [](const Snapshot &s) { return s.connected && !s.playing; });
    data->command(Action::PlayPause);
    wait(*data, [](const Snapshot &s) { return s.connected && s.playing; });
    data->command(Action::RemoteUp);
    wait(*data,
         [](const Snapshot &s) { return s.connected && s.volume == 55; });
    data->command(Action::Next);
    wait(*data, [](const Snapshot &s) {
      return s.connected && s.currentIndex == 1 && s.playing;
    });
    control("{\"type\":\"rename\",\"name\":\"Second controller – verified\"}");
    wait(*data, [](const Snapshot &s) {
      return s.player == "Second controller – verified";
    });
    control("{\"type\":\"volume\",\"volume\":33}");
    wait(*data, [](const Snapshot &s) { return s.volume == 33; });
    data->refresh();
    wait(*data, [](const Snapshot &s) {
      return s.connected && s.currentIndex == 1 && s.volume == 33;
    });
    data.reset();
    data = liveAdapter(config);
    wait(*data, [](const Snapshot &s) {
      return s.connected && s.playerId == "brick-smoke" && s.currentIndex == 1;
    });
    data.reset();
    PlayerState remaining;
    remaining.detail(second.request("/api/players/brick-smoke", "", true, no));
    check(remaining.view.playing && remaining.view.queue.size() == 2 &&
          remaining.view.volume == 33);
    std::cout << "Development player: second-controller pause/name/volume, "
                 "Brick resume/next/volume, wake, remembered selection and "
                 "non-destructive exit passed\n";
  } else if (mode == "smoke") {
    RestClient api(config);
    auto no = [] { return false; };
    check(!api.request("/players", "", true, no).empty());
    PlayerState session;
    session.id = "brick-smoke";
    session.begin();
    session.detail(api.request("/players/brick-smoke", "", true, no));
    bool received = false;
    try {
      api.request("/players/brick-smoke/events", "", true, no,
                  [&](const std::string &e) {
                    if (session.event(e)) {
                      received = true;
                      throw NetworkError("Smoke snapshot complete");
                    }
                  });
    } catch (const NetworkError &) {
      check(received);
    }
    check(received && session.view.connected);
    auto previous = session.revision;
    api.request(
        "/players/brick-smoke/commands",
        session.command(
            "{\"type\":\"rename\",\"name\":\"Brick live smoke verified\"}"),
        true, no);
    session.detail(api.request("/players/brick-smoke", "", true, no));
    check(session.revision > previous &&
          session.view.player == "Brick live smoke verified");
    std::cout << "Live development worker read/command/SSE passed at revision "
              << session.revision << "\n";
  } else if (mode == "adapter-errors") {
    for (auto suffix :
         {"/empty", "/invalid-list", "/large-list", "/unavailable"}) {
      auto bad = config;
      bad.url += suffix;
      auto data = liveAdapter(bad);
      wait(*data, [](const Snapshot &s) {
        return s.status.find("No players") != std::string::npos ||
               s.status.find("Malformed") != std::string::npos ||
               s.status.find("unavailable") != std::string::npos ||
               s.status.find("size limit") != std::string::npos;
      });
      check(!data->snapshot().refreshing && !data->snapshot().connected);
      std::this_thread::sleep_for(std::chrono::milliseconds(300));
    }
  } else if (mode == "selection-failure") {
    config.selectionPath = std::string(std::getenv("BRICK_TEST_DIRECTORY")) +
                           "/missing-directory/selected";
    auto data = liveAdapter(config);
    wait(*data, [](const Snapshot &s) { return !s.players.empty(); });
    data->selectPlayer(0);
    wait(*data, [](const Snapshot &s) {
      return s.connected &&
             s.status.find("Cannot remember") != std::string::npos;
    });
  } else if (mode == "metadata-race") {
    config.url += "/race";
    auto data = liveAdapter(config);
    wait(*data, [](const Snapshot &s) { return !s.players.empty(); });
    data->selectPlayer(1); // Previous test reordered the list: row 1 is a.
    wait(*data, [](const Snapshot &s) {
      if (s.currentIndex < s.queue.size())
        check(s.queue[s.currentIndex].album != "Stale album");
      return s.connected && s.currentIndex == 0 &&
             s.queue[0].album == "Current album" && s.queue[0].image;
    });
  } else if (mode == "collection-unavailable") {
    auto data = liveAdapter(config);
    wait(*data, [](const Snapshot &s) { return !s.players.empty(); });
    data->selectPlayer(0);
    wait(*data, [](const Snapshot &s) {
      return s.connected && s.status.find("Collection metadata unavailable") !=
                                std::string::npos;
    });
  } else if (mode == "adapter") {
    auto data = liveAdapter(config);
    data->command(Action::None);
    data->selectPlayer(99);
    wait(*data, [](const Snapshot &s) { return s.players.size() == 2; });
    check(!data->snapshot().connected && data->snapshot().playerId.empty());
    config.selectionPath =
        std::string(std::getenv("BRICK_TEST_DIRECTORY")) + "/selected";
    data.reset();
    data = liveAdapter(config);
    wait(*data, [](const Snapshot &s) { return s.players.size() == 2; });
    data->selectPlayer(0);
    check(rememberedPlayer(config) == "a");
    wait(*data, [](const Snapshot &s) {
      return s.connected && s.position == 44 && s.queue[1].image;
    });
    check(data->snapshot().players.size() == 2 &&
          data->snapshot().queue[1].album == "Album");
    data->command(Action::None);
    RestClient control(config);
    auto no = [] { return false; };
    // The fixture holds the first command until the retained UI state is
    // checked. It then rejects that command, and loses the response to the
    // next.
    data->command(Action::Next);
    data->command(Action::Next);
    data->advance(0);
    check(!data->snapshot().connected && data->snapshot().refreshing &&
          data->snapshot().queue[1].album == "Album" &&
          data->snapshot().volume == 50);
    control.request("/release-command", "", true, no);
    wait(*data, [](const Snapshot &s) {
      return s.connected && !s.refreshing &&
             s.status.find("Conflict") != std::string::npos;
    });
    check(!data->snapshot().acknowledgment.empty());
    data->command(Action::PlayPause); // Blocked until explicit acknowledgment.
    data->acknowledge();
    data->command(Action::PlayPause);
    wait(*data, [](const Snapshot &s) {
      return s.connected && !s.refreshing &&
             s.status.find("not repeated") != std::string::npos;
    });
    data->refresh();
    wait(*data, [](const Snapshot &s) {
      return s.connected && s.status.find("not repeated") == std::string::npos;
    });
    data->selectPlayer(1);
    wait(*data, [](const Snapshot &s) {
      return s.connected && s.player == "Other room";
    });
    data->command(Action::RemoteDown);
    wait(*data, [](const Snapshot &s) { return s.connected; });
    data->command(Action::RemoteUp);
    wait(*data, [](const Snapshot &s) { return s.connected; });
    data->command(Action::Previous);
    wait(*data, [](const Snapshot &s) { return s.connected; });
    data->command(Action::PlayPause);
    wait(*data, [](const Snapshot &s) { return s.connected; });
    // A refreshed list can reorder while the old rows are still on screen.
    // Selection must use the IDs belonging to those displayed rows.
    control.request("/reorder", "", true, no);
    data->refresh();
    bool ready = false;
    for (int i = 0; i < 100 && !ready; ++i) {
      auto body = control.request("/order-ready", "", true, no);
      ready = body.find("true") != std::string::npos;
      std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }
    check(ready);
    data->selectPlayer(1);
    wait(*data, [](const Snapshot &s) {
      return s.connected && s.player == "Other room";
    });
    data->refresh();
    data->refresh(); // Repeated wake while already refreshing preserves
                     // retained state.
    data->advance(0);
    check(data->snapshot().refreshing && !data->snapshot().connected);
    data.reset();
    data = liveAdapter(
        config); // Remembered identity opens directly into Now Playing.
    wait(*data,
         [](const Snapshot &s) { return s.connected && s.playerId == "b"; });
    data.reset();
    rememberPlayer(config, "removed");
    data = liveAdapter(config);
    wait(*data, [](const Snapshot &s) {
      return s.status.find("missing") != std::string::npos;
    });
    check(!data->snapshot().connected && !data->snapshot().available &&
          data->snapshot().playerId == "removed");
    data->command(Action::Next);
    // Exit while a request is pending: bounded
    // cancellation/join.
  } else {
    config.url += "/";
    RestClient api(config);
    auto no = [] { return false; };
    if (mode == "untrusted") {
      rejects([&] { api.request("/api/players", "", true, no); });
      return 0;
    }
    check(api.request("/api/players", "", true, no).find("players") !=
          std::string::npos);
    check(!api.playlists(no).empty());
    check(!api.playlist(1, no).empty());
    rejects([&] { api.playlist(0, no); });
    for (auto path :
         {"/401", "/403", "/404", "/409", "/422", "/503", "/302", "/large"})
      rejects([&] { api.request(path, "", true, no); });
    rejects([&] { api.request("", "", true, no); });
    rejects([&] { api.request("bad", "", true, no); });
    rejects([&] { api.request("/../bad", "", true, no); });
    rejects([&] {
      api.request("/api/players", std::string(2 * 1024 * 1024 + 1, 'x'), true,
                  no);
    });
    rejects(
        [&] { api.request("/api/players", "", true, [] { return true; }); });
    rejects([&] {
      api.request("/large-events", "", true, no, [](const std::string &) {});
    });
    int events = 0;
    api.request("/events", "", true, no,
                [&](const std::string &) { ++events; });
    check(events == 2);
    check(!api.artwork("", no));
    for (const auto &url : {"https://[", "https://user:password@localhost/a",
                            "https://:password@localhost/a",
                            "ftp://localhost/a", "http://localhost/a"})
      rejects([&] { api.artwork(url, no); });
    check(api.artwork("/covers/album.jpg?v=1", no)->width == 1);
    check(api.artwork(std::getenv("BRICK_TEST_ART_URL"), no)->width == 1);
    auto trailing = config;
    trailing.url += "/";
    check(RestClient(trailing).artwork("/covers/album.jpg", no)->width == 1);
    for (auto code : {"SPEAKER_OCCUPIED", "AVAILABILITY_UNKNOWN", "DEVICE_BUSY",
                      "NO_AUDIO"}) {
      bool failed = false;
      try {
        api.request(std::string("/error/") + code, "", true, no);
      } catch (const NetworkError &e) {
        failed = true;
        check(e.acknowledgment == (std::string(code) != "NO_AUDIO"));
      }
      check(failed);
    }
    rejects([&] { api.request("/bad-error", "", true, no); });
    Track t{"", "", "", {}, false};
    t.trackId = "same";
    t.friendId = 2;
    api.enrich(t, no);
    check(t.album == "Album" && t.playable == true && !t.artworkUrl.empty());
    t.friendId = 3;
    rejects([&] { api.enrich(t, no); });
    t.friendId = 4;
    rejects([&] { api.enrich(t, no); });
    t.friendId = 5;
    api.enrich(t, no);
    check(t.playable == false);
  }
  return 0;
}
