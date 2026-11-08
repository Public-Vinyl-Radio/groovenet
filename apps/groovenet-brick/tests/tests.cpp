#include "app.hpp"
#include "platform.hpp"
#include "renderer.hpp"
#include <algorithm>
#include <SDL_ttf.h>
#include <filesystem>
#include <iostream>
#include <stdexcept>

void failureTests();
void liveTests();
int networkTests(const std::string &mode);

namespace {
int checks = 0;
void checkAt(bool condition, int line) {
  ++checks;
  if (!condition)
    throw std::runtime_error("Check failed: " + std::to_string(checks) +
                             " at line " + std::to_string(line));
}
#define check(condition) checkAt((condition), __LINE__)
template <typename F> void rejects(F work) {
  bool rejected = false;
  try {
    work();
  } catch (const std::exception &) {
    rejected = true;
  }
  check(rejected);
}
using namespace brick;
void queueTests() {
  App app("mock", "playing");
  app.handle(Action::Menu);
  for (int i = 0; i < 3; ++i)
    app.handle(Action::Down);
  app.handle(Action::Select);
  app.handle(Action::Left);
  check(app.focus() == 0);
  check(app.rows()[1].find("[current]") != std::string::npos);
  app.handle(Action::RemoteUp);
  check(app.snapshot().volume == 60);
  app.handle(Action::PlayPause);
  check(!app.snapshot().playing);
  app.handle(Action::PlayPause);
  check(app.snapshot().playing);
  app.handle(Action::Select);
  check(app.screen() == Screen::ClearConfirm && app.focus() == 0);
  app.handle(Action::Select); // Cancel is the default.
  check(app.snapshot().queue.size() == 3);
  app.handle(Action::Down);
  auto first = app.snapshot().queue[0].entryId;
  app.handle(Action::Select);
  app.handle(Action::Down);
  app.handle(Action::Down);
  app.handle(Action::Down);
  app.handle(Action::Select); // Move focused current entry down.
  app.advance(0);
  check(app.screen() == Screen::Queue && app.focus() == 2);
  check(app.snapshot().queue[1].entryId == first &&
        app.snapshot().currentIndex == 1);
  app.handle(Action::Select);
  app.handle(Action::Down);
  app.handle(Action::Select); // Remove current entry, focus successor.
  app.advance(0);
  check(app.snapshot().queue.size() == 2 && !app.snapshot().playing &&
        app.focus() == 2);
  app.handle(Action::Select);
  app.handle(Action::Select); // Play selected UUID.
  check(app.snapshot().playing && app.snapshot().currentIndex == 1);
  app.handle(Action::Up);
  app.handle(Action::Up);
  app.handle(Action::Select);
  app.handle(Action::Down);
  app.handle(Action::Select);
  app.advance(0);
  check(app.snapshot().queue.empty() && !app.snapshot().playing &&
        app.focus() == 0);
  App cancelClear("mock", "playing");
  for (auto action : {Action::Menu, Action::Down, Action::Down, Action::Down,
                      Action::Select, Action::Select})
    cancelClear.handle(action);
  check(cancelClear.screen() == Screen::ClearConfirm);
  cancelClear.handle(Action::Menu);
  check(cancelClear.screen() == Screen::Menu &&
        cancelClear.snapshot().queue.size() == 3);
  App move("mock", "playing");
  for (auto action :
       {Action::Menu, Action::Down, Action::Down, Action::Down, Action::Select,
        Action::Down, Action::Down, Action::Select, Action::Down, Action::Down,
        Action::Select})
    move.handle(action);
  check(move.snapshot().queue[0].title == "Les Nuits");
  move.handle(Action::Select);
  move.handle(Action::Menu);
  check(move.screen() == Screen::Menu);
  MockData navigation("playing");
  navigation.editQueue(QueueEdit::Play, "entry-1", "");
  navigation.command(Action::Next);
  check(navigation.snapshot().currentIndex == 0 &&
        navigation.snapshot().queue[0].entryId == "entry-2");
  navigation.command(Action::Previous);
  check(navigation.snapshot().queue[0].entryId == "entry-1");
  MockData duplicate("playing");
  duplicate.browse(1);
  duplicate.queueTracks(false, 0, "");
  auto original = duplicate.snapshot().queue[0].entryId;
  auto added = duplicate.snapshot().queue.back().entryId;
  check(original != added);
  duplicate.editQueue(QueueEdit::Up, added, "");
  duplicate.editQueue(QueueEdit::Play, added, "");
  check(duplicate.snapshot().currentIndex == 2);
  duplicate.editQueue(QueueEdit::Remove, original, "");
  check(duplicate.snapshot().queue[1].entryId == added &&
        duplicate.snapshot().playing);
  duplicate.editQueue(QueueEdit::Down, added, "");
  check(duplicate.snapshot().currentIndex == 2);
  duplicate.editQueue(QueueEdit::Down, added, "");
  check(!duplicate.snapshot().acknowledgment.empty());
  duplicate.acknowledge();
  duplicate.editQueue(QueueEdit::Remove, "missing", "");
  check(!duplicate.snapshot().acknowledgment.empty());
  for (const auto &scenario :
       {"disconnected", "loading", "unavailable", "speaker-busy"}) {
    MockData blocked(scenario);
    blocked.editQueue(QueueEdit::Clear, "", "");
    check(blocked.snapshot().queue.size() == 3);
  }
}
class ScriptedData final : public DataAdapter {
public:
  int outputWrites = 0, outputBrowses = 0;
  bool unknown = false, takeover = false;
  std::string body, token;
  void browseOutputs() override { ++outputBrowses; }
  void output(const std::string &b, const std::string &t, bool u,
              bool o) override {
    ++outputWrites;
    body = b;
    token = t;
    unknown = u;
    takeover = o;
  }
  Snapshot state = MockData("playing").snapshot();
  const Snapshot &snapshot() const override { return state; }
  void command(Action) override {}
  void selectPlayer(size_t) override {}
  void advance(int) override {}
  void refresh() override {}
  void browse(int64_t, bool) override {}
  void queueTracks(bool, std::optional<size_t>, const std::string &) override {}
  void editQueue(QueueEdit, const std::string &, const std::string &) override {
  }
};
void outputUiTests() {
  auto data = std::make_unique<ScriptedData>();
  auto *remote = data.get();
  App app(std::move(data));
  for (auto a : {Action::Menu, Action::Up, Action::Select})
    app.handle(a);
  check(remote->outputBrowses == 1 && remote->outputWrites == 0);
  for (const auto &code :
       {"", "AVAILABILITY_UNKNOWN", "SPEAKER_OCCUPIED", "DEVICE_BUSY"}) {
    remote->state.outputApproval = code;
    remote->state.outputUnknown = std::string(code) == "AVAILABILITY_UNKNOWN";
    remote->state.outputTakeover = std::string(code) == "SPEAKER_OCCUPIED" ||
                                   std::string(code) == "DEVICE_BUSY";
    app.handle(Action::Select);
    check(app.screen() == Screen::OutputConfirm && app.focus() == 0);
    check(app.rows().size() == 2);
    auto label = app.rows()[1];
    check(label.find(std::string(code) == "AVAILABILITY_UNKNOWN" ? "unknown"
                     : std::string(code) == "SPEAKER_OCCUPIED"   ? "occupied"
                     : std::string(code) == "DEVICE_BUSY"
                         ? "engine"
                         : "server policy") != std::string::npos);
    app.handle(Action::Select); // Decline every prompt.
    check(remote->outputWrites == 0);
  }
  app.handle(Action::Select);
  app.handle(Action::Down);
  app.handle(Action::Select);
  check(remote->outputWrites == 1 && remote->takeover && !remote->unknown);
  app.handle(Action::Down);
  app.handle(Action::Down); // speaker assigned to studio
  app.handle(Action::Select);
  check(app.notice().find("detach source studio") != std::string::npos);
  app.handle(Action::Down);
  app.handle(Action::PlayPause); // No transport on confirmations.
  app.handle(Action::Select);
  check(remote->outputWrites == 2 &&
        remote->body.find("output.transfer") != std::string::npos);
  check(!remote->unknown && !remote->takeover);
  app.advance(0);
  app.handle(Action::Down); // Last output.
  app.advance(0);
  auto selected = remote->state.routing.devices.back();
  std::reverse(remote->state.routing.devices.begin(),
               remote->state.routing.devices.end());
  app.advance(0);
  check(app.focus() == 1 &&
        remote->state.routing.devices[app.focus() - 1].id == selected.id);
  remote->state.routing.devices.erase(remote->state.routing.devices.begin());
  app.advance(0);
  check(app.focus() == 0);
  remote->state.playerId = "other";
  app.advance(0);
  remote->state.routing.desired.clear();
  app.handle(Action::Select);
  check(app.notice().find("missing") != std::string::npos);
  remote->state.routing.desired = "lost";
  app.handle(Action::Select);
  check(app.notice().find("missing") != std::string::npos);
  remote->state.routing.token.clear();
  app.handle(Action::Select);
  check(app.screen() == Screen::Outputs &&
        app.notice().find("fresh") != std::string::npos);
}
void queueFocusTests() {
  auto data = std::make_unique<ScriptedData>();
  auto *remote = data.get();
  for (int i = 3; i < 27; ++i) {
    auto t = remote->state.queue.front();
    t.entryId = "duplicate-" + std::to_string(i);
    remote->state.queue.push_back(t);
  }
  App app(std::move(data));
  app.handle(Action::Menu);
  for (int i = 0; i < 3; ++i)
    app.handle(Action::Down);
  app.handle(Action::Select);
  for (int i = 0; i < 26; ++i)
    app.handle(Action::Down);
  check(app.focus() == 26);
  app.handle(Action::Right);
  check(app.focus() == 27);
  app.handle(Action::Left);
  check(app.focus() == 22);
  for (int i = 0; i < 4; ++i)
    app.handle(Action::Down);
  auto entry = remote->state.queue[25];
  remote->state.queue.erase(remote->state.queue.begin() + 25);
  remote->state.queue.insert(remote->state.queue.begin(), entry);
  app.advance(0);
  check(app.focus() == 1);
  app.handle(Action::Select); // Remote edit while actions are open.
  remote->state.queue.erase(remote->state.queue.begin());
  app.advance(0);
  app.handle(Action::Back);
  check(app.screen() == Screen::Queue && app.focus() == 1);
  remote->state.queue[0].title.clear();
  remote->state.queue[0].playable = false;
  check(app.rows()[1].find("Unknown title") != std::string::npos);
  check(app.rows()[1].find("Unavailable") != std::string::npos);
  remote->state.queue.clear();
  app.advance(0);
  check(app.focus() == 0);
  remote->state.playerId = "other";
  app.advance(0);
  check(app.focus() == 0);
}
void stateTests() {
  rejects([] { MockData bad("bad"); });
  rejects([] { dataAdapter("invalid", "playing"); });
  rejects([] { namedAction("invalid"); });
  for (const auto &name : {"up", "down", "left", "right", "select", "back",
                           "menu", "play", "previous", "next", "volume-down",
                           "volume-up", "scenario", "quit", "suspend", "wake"})
    check(namedAction(name) != Action::None);
  MockData mock("playing");
  check(timing(mock.snapshot()) == "0:42 / 5:00");
  mock.advance(499);
  check(mock.snapshot().position == 42);
  mock.advance(501);
  check(mock.snapshot().position == 43);
  mock.advance(0);
  mock.advance(-1000);
  check(mock.snapshot().position == 43);
  mock.command(Action::PlayPause);
  mock.advance(2000);
  check(mock.snapshot().position == 43);
  mock.command(Action::PlayPause);
  mock.advance(257000);
  check(mock.snapshot().queue.front().title == "Les Nuits" &&
        mock.snapshot().position == 0);
  mock.command(Action::Previous);
  check(mock.snapshot().queue.front().title == "Days To Come");
  mock.command(Action::Next);
  check(mock.snapshot().queue.front().title == "Les Nuits");
  for (int i = 0; i < 30; ++i)
    mock.command(Action::RemoteUp);
  check(mock.snapshot().volume == 100);
  for (int i = 0; i < 30; ++i)
    mock.command(Action::RemoteDown);
  check(mock.snapshot().volume == 0);
  mock.selectPlayer(2);
  check(mock.snapshot().player == "Kitchen");
  mock.selectPlayer(99);
  check(mock.snapshot().player == "Kitchen");
  mock.refresh();
  for (const auto &name :
       {"loading", "disconnected", "unavailable", "refreshing"}) {
    MockData blocked(name);
    blocked.command(Action::Next);
    blocked.command(Action::RemoteUp);
    blocked.command(Action::PlayPause);
    blocked.advance(100000);
    check(blocked.snapshot().position == 42 && blocked.snapshot().volume == 55);
    check(blocked.snapshot().queue.front().title == "Days To Come");
  }
  MockData empty("empty");
  empty.command(Action::Next);
  empty.command(Action::PlayPause);
  empty.advance(1000);
  check(empty.snapshot().queue.empty() &&
        timing(empty.snapshot()) == "--:-- / --:--");
  MockData unknown("unknown-timing");
  unknown.advance(1000);
  check(unknown.snapshot().position == 43 &&
        timing(unknown.snapshot()) == "--:-- / --:--");
  App app("mock", "playing");
  check(app.rows().empty() && app.focus() == 0);
  app.handle(Action::Back);
  check(app.screen() == Screen::NowPlaying && app.running());
  app.handle(Action::Up);
  check(app.snapshot().volume == 60);
  app.handle(Action::Down);
  check(app.snapshot().volume == 55);
  app.handle(Action::Menu);
  app.handle(Action::Up);
  check(app.focus() == 4 && app.snapshot().volume == 55);
  app.handle(Action::Select);
  check(app.screen() == Screen::Outputs && app.rows().size() == 4);
  app.handle(Action::Select);
  check(!app.notice().empty());
  app.handle(Action::Back);
  check(app.screen() == Screen::Outputs);
  app.handle(Action::Back);
  check(app.screen() == Screen::Menu && app.focus() == 4);
  app.handle(Action::Down);
  check(app.focus() == 0);
  app.handle(Action::Select);
  check(app.screen() == Screen::NowPlaying);
  app.handle(Action::Left);
  check(app.snapshot().queue.front().title == "So Flute");
  app.handle(Action::Right);
  check(app.snapshot().queue.front().title == "Days To Come");
  app.handle(Action::Back);
  app.handle(Action::Down);
  app.handle(Action::Select);
  check(app.screen() == Screen::Players);
  app.handle(Action::Down);
  check(app.snapshot().volume == 55);
  app.handle(Action::Select);
  check(app.snapshot().player == "Studio" && app.snapshot().playing);
  check(app.notice().find("playback unchanged") != std::string::npos);
  app.handle(Action::Back);
  app.handle(Action::Down);
  app.handle(Action::Select);
  check(app.screen() == Screen::Playlists && app.rows().size() == 3);
  app.handle(Action::Select);
  check(app.screen() == Screen::PlaylistTracks && app.rows().size() == 4);
  app.handle(Action::Back);
  app.handle(Action::Back);
  app.handle(Action::Down);
  app.handle(Action::Select);
  check(app.screen() == Screen::Queue && app.rows().size() == 4);
  app.handle(Action::Select);
  check(app.screen() == Screen::ClearConfirm);
  app.handle(Action::Back);
  app.handle(Action::Suspend);
  app.handle(Action::Next);
  app.handle(Action::Up);
  check(app.snapshot().volume == 55);
  app.advance(2000);
  check(app.suspended() && app.snapshot().position == 0);
  app.handle(Action::Wake);
  app.advance(1000);
  check(app.snapshot().position == 1);
  app.handle(Action::Menu);
  app.handle(Action::Menu);
  check(app.screen() == Screen::Queue);
  App playlists("mock", "paused");
  for (auto action : {Action::Menu, Action::Down, Action::Down, Action::Select,
                      Action::Select, Action::Down, Action::Select})
    playlists.handle(action);
  check(playlists.screen() == Screen::TrackActions);
  playlists.handle(Action::Down);
  playlists.handle(Action::Select);
  check(playlists.snapshot().queue.size() == 4 &&
        !playlists.snapshot().playing);
  playlists.handle(Action::Up);
  playlists.handle(Action::Select);
  check(playlists.screen() == Screen::Confirm);
  playlists.handle(Action::Next);
  playlists.handle(Action::PlayPause);
  check(!playlists.snapshot().playing);
  playlists.handle(Action::Select); // Cancel is the default.
  check(playlists.snapshot().queue.size() == 4);
  playlists.handle(Action::Select);
  playlists.handle(Action::Down);
  playlists.handle(Action::Select);
  check(playlists.snapshot().queue.size() == 1 && playlists.snapshot().playing);
  playlists.handle(Action::Back);
  check(playlists.screen() == Screen::PlaylistTracks && playlists.focus() == 1);
  playlists.handle(Action::Back);
  playlists.handle(Action::Down); // Known missing audio fixture.
  playlists.handle(Action::Select);
  playlists.handle(Action::Select);
  playlists.handle(Action::Down);
  playlists.handle(Action::Select);
  check(!playlists.snapshot().acknowledgment.empty() &&
        playlists.snapshot().queue.size() == 1);
  playlists.handle(Action::Back);
  playlists.handle(Action::Back);
  playlists.handle(Action::Back);
  playlists.handle(Action::Down);
  playlists.handle(Action::Select);
  check(playlists.snapshot().collection.status == "Empty playlist");
  for (const auto &name : scenarios()) {
    check(app.scenario() == name);
    app.handle(Action::Scenario);
  }
  check(app.scenario() == "playing");
  app.handle(Action::Quit);
  check(!app.running());
  for (const auto &name : {"loading", "disconnected", "unavailable"}) {
    App blocked("mock", name);
    blocked.handle(Action::Up);
    blocked.handle(Action::Down);
    check(blocked.snapshot().volume == 55);
  }
  for (const auto &name :
       {"disconnected", "unavailable", "loading", "speaker-busy"}) {
    MockData blocked(name);
    blocked.browse(1);
    blocked.queueTracks(false, {}, "");
    check(blocked.snapshot().queue.size() == 3);
  }
  for (auto acknowledgment : {Action::Select, Action::Back}) {
    App busy("mock", "speaker-busy");
    busy.handle(Action::Next);
    busy.handle(Action::RemoteUp);
    check(busy.snapshot().queue.front().title == "Days To Come" &&
          busy.snapshot().volume == 55);
    busy.handle(acknowledgment);
    check(busy.snapshot().acknowledgment.empty());
    check(busy.snapshot().queue.front().title == "Days To Come" &&
          busy.snapshot().playing);
  }
  App live("live", "playing", "/no/such/brick-config");
  live.handle(Action::Scenario);
  live.handle(Action::PlayPause);
  live.advance(1000);
  live.handle(Action::Wake);
  check(!live.snapshot().connected && live.scenario() == "playing");
  auto adapter = dataAdapter("live", "playing");
  adapter->selectPlayer(0);
  check(adapter->snapshot().players.empty());
}
void inputTests() {
  Desktop desktop;
  SDL_Event event{};
  check(desktop.input(event) == Action::None);
  const std::vector<std::pair<SDL_Keycode, Action>> keys{
      {SDLK_UP, Action::Up},
      {SDLK_DOWN, Action::Down},
      {SDLK_LEFT, Action::Left},
      {SDLK_RIGHT, Action::Right},
      {SDLK_RETURN, Action::Select},
      {SDLK_ESCAPE, Action::Back},
      {SDLK_TAB, Action::Menu},
      {SDLK_SPACE, Action::PlayPause},
      {SDLK_z, Action::Previous},
      {SDLK_x, Action::Next},
      {SDLK_MINUS, Action::RemoteDown},
      {SDLK_EQUALS, Action::RemoteUp},
      {SDLK_PLUS, Action::RemoteUp},
      {SDLK_F1, Action::Scenario},
      {SDLK_q, Action::Quit},
      {SDLK_POWER, Action::None},
      {SDLK_VOLUMEUP, Action::None}};
  for (const auto &[key, action] : keys) {
    event.type = SDL_KEYDOWN;
    event.key.keysym.sym = key;
    event.key.repeat = 0;
    check(desktop.input(event) == action);
    event.key.repeat = 1;
    check(desktop.input(event) == Action::None);
    event.type = SDL_KEYUP;
    check(desktop.input(event) == Action::None);
  }
  const std::vector<std::pair<Uint8, Action>> buttons{
      {SDL_CONTROLLER_BUTTON_DPAD_UP, Action::Up},
      {SDL_CONTROLLER_BUTTON_DPAD_DOWN, Action::Down},
      {SDL_CONTROLLER_BUTTON_DPAD_LEFT, Action::Left},
      {SDL_CONTROLLER_BUTTON_DPAD_RIGHT, Action::Right},
      {SDL_CONTROLLER_BUTTON_A, Action::Select},
      {SDL_CONTROLLER_BUTTON_B, Action::Back},
      {SDL_CONTROLLER_BUTTON_START, Action::Menu},
      {SDL_CONTROLLER_BUTTON_Y, Action::PlayPause},
      {SDL_CONTROLLER_BUTTON_LEFTSHOULDER, Action::Previous},
      {SDL_CONTROLLER_BUTTON_RIGHTSHOULDER, Action::Next},
      {SDL_CONTROLLER_BUTTON_BACK, Action::Quit},
      {SDL_CONTROLLER_BUTTON_LEFTSTICK, Action::RemoteDown},
      {SDL_CONTROLLER_BUTTON_RIGHTSTICK, Action::RemoteUp},
      {SDL_CONTROLLER_BUTTON_GUIDE, Action::None}};
  for (const auto &[button, action] : buttons) {
    event.type = SDL_CONTROLLERBUTTONDOWN;
    event.cbutton.button = button;
    check(desktop.input(event) == action);
    event.type = SDL_CONTROLLERBUTTONUP;
    check(desktop.input(event) == Action::None);
  }
  event.type = SDL_WINDOWEVENT;
  event.window.event = SDL_WINDOWEVENT_FOCUS_LOST;
  check(desktop.input(event) == Action::Suspend);
  event.window.event = SDL_WINDOWEVENT_FOCUS_GAINED;
  check(desktop.input(event) == Action::Wake);
  event.window.event = SDL_WINDOWEVENT_EXPOSED;
  check(desktop.input(event) == Action::None);
  event.type = SDL_APP_WILLENTERBACKGROUND;
  check(desktop.input(event) == Action::Suspend);
  event.type = SDL_APP_DIDENTERFOREGROUND;
  check(desktop.input(event) == Action::Wake);
  event.type = SDL_QUIT;
  check(desktop.input(event) == Action::Quit);
  Desktop device(true);
  event.type = SDL_KEYDOWN;
  event.key.keysym.sym = SDLK_POWER;
  event.key.repeat = 0;
  check(device.input(event) == Action::Wake);
  event.key.repeat = 1;
  check(device.input(event) == Action::None);
  event.key.repeat = 0;
  event.key.keysym.sym = SDLK_VOLUMEDOWN;
  check(device.input(event) == Action::None);
  event.type = SDL_CONTROLLERBUTTONDOWN;
  event.cbutton.button = SDL_CONTROLLER_BUTTON_X;
  check(device.input(event) == Action::None);
  event.cbutton.button = SDL_CONTROLLER_BUTTON_LEFTSHOULDER;
  check(device.input(event) == Action::Previous);
  event.cbutton.button = SDL_CONTROLLER_BUTTON_RIGHTSHOULDER;
  check(device.input(event) == Action::Next);
}
void optionTests() {
  auto options =
      parseOptions({"--mode", "live", "--scenario", "metadata", "--scale",
                    "0.75", "--font", "font.ttf", "--screenshot", "capture.bmp",
                    "--frames", "2", "--actions", "menu,down,select"});
  check(options.mode == "live" && options.scenario == "metadata" &&
        options.scale == .75);
  check(options.font == "font.ttf" && options.screenshot == "capture.bmp" &&
        options.frames == 2);
  check(options.actions.size() == 3);
  check(!parseOptions({}).font.empty());
  check(parseOptions({"--platform", "knulli"}).knulli);
  check(!parseOptions({"--platform", "desktop"}).knulli);
  for (const auto &args :
       std::vector<std::vector<std::string>>{{"--bad"},
                                             {"--platform", "unknown"},
                                             {"--bad", "value"},
                                             {"--scale", "NaN"},
                                             {"--scale", "inf"},
                                             {"--scale", "x"},
                                             {"--scale", "1px"},
                                             {"--scale", "0"},
                                             {"--scale", "4"},
                                             {"--frames", "0"},
                                             {"--frames", "100001"},
                                             {"--frames", "1.5"},
                                             {"--scenario", "bad"},
                                             {"--mode", "bad"},
                                             {"--actions", "bogus"}})
    rejects([&] { parseOptions(args); });
}
class BatteryPlatform : public Platform {
public:
  Action input(const SDL_Event &) override { return Action::None; }
  std::string configDirectory() const override { return "/tmp"; }
  std::optional<int> batteryPercent() const override { return 73; }
};
void renderTests() {
  check(SDL_Init(SDL_INIT_VIDEO | SDL_INIT_GAMECONTROLLER) == 0);
  check(TTF_Init() == 0);
  auto *surface = SDL_CreateRGBSurfaceWithFormat(0, width, height, 32,
                                                 SDL_PIXELFORMAT_ARGB8888);
  auto *renderer = SDL_CreateSoftwareRenderer(surface);
  check(renderer != nullptr);
  {
    rejects([&] { Renderer invalid(renderer, "/no/such/font.ttf"); });
    Renderer view(renderer, parseOptions({}).font);
    BatteryPlatform platform;
    for (const auto &name : scenarios()) {
      App app("mock", name);
      view.draw(app, platform);
      // Render actual mock states and all shells. State assertions live above;
      // here we ensure UTF-8, missing art and timing never break SDL rendering.
      app.handle(Action::Menu);
      view.draw(app, platform);
      for (int i = 0; i < 5; ++i) {
        app.handle(Action::Select);
        view.draw(app, platform);
        app.handle(Action::Select);
        view.draw(app, platform);
        app.handle(Action::Back);
        app.handle(Action::Down);
      }
      app.handle(Action::Suspend);
      view.draw(app, platform);
    }
    auto outputData = std::make_unique<ScriptedData>();
    auto *outputRemote = outputData.get();
    App output(std::move(outputData));
    for (auto a : {Action::Menu, Action::Up, Action::Select})
      output.handle(a);
    view.draw(output, platform);
    output.handle(Action::Up);
    view.draw(output, platform); // Last output: unassigned, desired by none.
    output.handle(Action::Select);
    view.draw(output, platform);
    outputRemote->state.acknowledgment =
        "Partial transfer failed · Source detached · Target not attached · "
        "Engine conflict";
    view.draw(output, platform);
    outputRemote->state.acknowledgment = std::string(90, 'x');
    view.draw(output, platform);
    outputRemote->state.acknowledgment.clear();
    output.handle(Action::Menu);
    view.draw(output, platform);
    check(output.screen() == Screen::Menu);
    auto longData = std::make_unique<ScriptedData>();
    longData->state.routing.desired = std::string(255, 'x');
    longData->state.routing.devices[0].id = longData->state.routing.desired;
    App longOutput(std::move(longData));
    for (auto a : {Action::Menu, Action::Up, Action::Select, Action::Select}) longOutput.handle(a);
    view.draw(longOutput, platform);


    App playlist("mock", "paused");
    for (auto action :
         {Action::Menu, Action::Down, Action::Down, Action::Select,
          Action::Select, Action::Select, Action::Select}) {
      playlist.handle(action);
      view.draw(playlist, platform);
    }
    check(playlist.screen() == Screen::Confirm);
    playlist.handle(Action::Menu);
    check(playlist.screen() == Screen::Menu);
    App queue("mock", "playing");
    for (auto action : {Action::Menu, Action::Down, Action::Down, Action::Down,
                        Action::Select, Action::Select, Action::Back,
                        Action::Down, Action::Select}) {
      queue.handle(action);
      view.draw(queue, platform);
    }
    check(queue.screen() == Screen::QueueActions);
    queue.handle(Action::Menu);
    check(queue.screen() == Screen::Menu);
    queue.handle(Action::Down);
    queue.handle(Action::Down);
    queue.handle(Action::Down);
    queue.handle(Action::Select);
    queue.handle(Action::Up);
    queue.handle(Action::Select);
    queue.handle(Action::Menu);
    check(queue.screen() == Screen::Menu);
    App missing("mock", "missing-metadata");
    check(missing.snapshot().queue[0].title.empty());
    check(missing.snapshot().queue[0].artist.empty());
    check(missing.snapshot().queue[0].album.empty());
    view.draw(missing, platform);
    missing.handle(Action::PlayPause);
    view.draw(missing, platform);
    check(!missing.snapshot().playing);
    missing.handle(Action::PlayPause);
    view.draw(missing, platform);
    check(missing.snapshot().playing);
    Desktop desktop;
    App live("live", "playing");
    view.draw(live, desktop);
    live.handle(Action::Menu);
    live.handle(Action::Down);
    live.handle(Action::Select);
    view.draw(live, desktop);
    check(!desktop.batteryPercent());
    check(!desktop.configDirectory().empty());
  }
  SDL_DestroyRenderer(renderer);
  SDL_FreeSurface(surface);
  TTF_Quit();
  SDL_Quit();
  const auto capture =
      (std::filesystem::temp_directory_path() / "groovenet-brick-test.bmp")
          .string();
  auto options = parseOptions({"--frames", "2", "--actions",
                               "menu,down,select,down,select,back",
                               "--screenshot", capture});
  check(runDesktop(options) == 0);
  auto deviceOptions = options;
  deviceOptions.knulli = true;
  check(runDesktop(deviceOptions) == 0);
  auto *image = SDL_LoadBMP(capture.c_str());
  check(image && image->w == width && image->h == height);
  SDL_FreeSurface(image);
  std::filesystem::remove(capture);
  options.screenshot = "/no/such/directory/capture.bmp";
  rejects([&] { runDesktop(options); });
  options.screenshot.clear();
  options.font = "/missing.ttf";
  rejects([&] { runDesktop(options); });
  options = parseOptions({"--frames", "1", "--actions", "quit"});
  check(runDesktop(options) == 0);
  // Drive actual SDL axis-to-D-pad translation using the production Brick map.
  check(SDL_Init(SDL_INIT_VIDEO | SDL_INIT_GAMECONTROLLER) == 0);
  int brickDevice =
      SDL_JoystickAttachVirtual(SDL_JOYSTICK_TYPE_GAMECONTROLLER, 2, 17, 1);
  check(brickDevice >= 0);
  char guid[33];
  SDL_JoystickGetGUIDString(SDL_JoystickGetDeviceGUID(brickDevice), guid,
                            sizeof(guid));
  std::string mapping = knulliControllerMapping;
  mapping.replace(0, 32, guid);
  check(SDL_GameControllerAddMapping(mapping.c_str()) >= 0);
  auto *controller = SDL_GameControllerOpen(brickDevice);
  check(controller);
  auto *raw = SDL_GameControllerGetJoystick(controller);
  for (auto button :
       {SDL_CONTROLLER_BUTTON_DPAD_UP, SDL_CONTROLLER_BUTTON_DPAD_DOWN,
        SDL_CONTROLLER_BUTTON_DPAD_LEFT, SDL_CONTROLLER_BUTTON_DPAD_RIGHT}) {
    bool vertical = button == SDL_CONTROLLER_BUTTON_DPAD_UP ||
                    button == SDL_CONTROLLER_BUTTON_DPAD_DOWN;
    bool negative = button == SDL_CONTROLLER_BUTTON_DPAD_UP ||
                    button == SDL_CONTROLLER_BUTTON_DPAD_LEFT;
    check(SDL_JoystickSetVirtualAxis(raw, vertical ? 1 : 0,
                                     negative ? -32768 : 32767) == 0);
    SDL_GameControllerUpdate();
    check(SDL_GameControllerGetButton(controller, button) == 1);
    check(SDL_JoystickSetVirtualAxis(raw, vertical ? 1 : 0, -1) == 0);
    SDL_GameControllerUpdate();
    check(SDL_GameControllerGetButton(controller, button) == 0);
  }
  SDL_GameControllerClose(controller);
  SDL_Quit();
  // Startup and hotplug both go through SDL's actual game-controller API.
  check(SDL_Init(SDL_INIT_VIDEO | SDL_INIT_GAMECONTROLLER) == 0);
  int device =
      SDL_JoystickAttachVirtual(SDL_JOYSTICK_TYPE_GAMECONTROLLER, 6, 16, 0);
  check(device >= 0);
  SDL_Event added{};
  added.type = SDL_CONTROLLERDEVICEADDED;
  added.cdevice.which = device;
  SDL_PushEvent(&added);
  SDL_Event removed{};
  removed.type = SDL_CONTROLLERDEVICEREMOVED;
  removed.cdevice.which = SDL_JoystickGetDeviceInstanceID(device);
  SDL_PushEvent(&removed);
  check(runDesktop(parseOptions({"--frames", "2"})) == 0);
  SDL_Quit();
  check(SDL_Init(SDL_INIT_VIDEO | SDL_INIT_GAMECONTROLLER) == 0);
  int joystick =
      SDL_JoystickAttachVirtual(SDL_JOYSTICK_TYPE_FLIGHT_STICK, 2, 2, 0);
  check(joystick >= 0);
  SDL_AddTimer(
      100,
      [](Uint32, void *) -> Uint32 {
        SDL_Event quit{};
        quit.type = SDL_QUIT;
        SDL_PushEvent(&quit);
        return 0;
      },
      nullptr);
  auto realtime = parseOptions({"--screenshot", capture});
  check(runDesktop(realtime) == 0);
  std::filesystem::remove(capture);
  SDL_setenv("SDL_VIDEODRIVER", "groovenet-invalid-driver", 1);
  rejects([&] { runDesktop(options); });
  check(SDL_WasInit(0) == 0 && TTF_WasInit() == 0);
  SDL_setenv("SDL_VIDEODRIVER", "dummy", 1);
}
} // namespace
int main(int argc, char **argv) {
  try {
    if (argc == 2)
      return networkTests(argv[1]);
    liveTests();
    stateTests();
    queueTests();
    outputUiTests();
    queueFocusTests();
    inputTests();
    optionTests();
    renderTests();
    failureTests();
    std::cout << checks << " checks passed\n";
    return 0;
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
