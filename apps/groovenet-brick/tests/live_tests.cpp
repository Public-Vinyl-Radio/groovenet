#include "live.hpp"
#include <chrono>
#include <cstdlib>
#include <iostream>
#include <json-c/json.h>
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
  LiveConfig config{"https://localhost", "", "", "", false};
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
}
int networkTests(const std::string &mode) {
  auto config = LiveConfig::environment();
  if (mode == "smoke") {
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
      std::this_thread::sleep_for(std::chrono::milliseconds(300));
    }
  } else if (mode == "collection-unavailable") {
    auto data = liveAdapter(config);
    wait(*data, [](const Snapshot &s) {
      return s.connected && s.status.find("Collection metadata unavailable") !=
                                std::string::npos;
    });
  } else if (mode == "adapter") {
    auto data = liveAdapter(config);
    data->command(Action::None);
    data->selectPlayer(99);
    wait(*data,
         [](const Snapshot &s) { return s.connected && s.position == 44; });
    check(data->snapshot().players.size() == 2 &&
          data->snapshot().queue[1].album == "Album");
    data->command(Action::None);
    // The fixture rejects one command, then loses the response to the next.
    data->command(Action::Next);
    data->command(Action::Next);
    wait(*data, [](const Snapshot &s) {
      return s.connected && s.status.find("Conflict") != std::string::npos;
    });
    data->command(Action::PlayPause);
    wait(*data, [](const Snapshot &s) {
      return s.connected && s.status.find("not repeated") != std::string::npos;
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
    RestClient control(config);
    auto no = [] { return false; };
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
    data->refresh(); // Exit while a request is pending: bounded
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
