#include "app.hpp"
#include "platform.hpp"
#include "renderer.hpp"
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
  for (const auto &name : {"loading", "disconnected", "unavailable"}) {
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
  app.handle(Action::Menu);
  app.handle(Action::Up);
  check(app.focus() == 4);
  app.handle(Action::Select);
  check(app.screen() == Screen::Outputs && app.rows().size() == 3);
  app.handle(Action::Select);
  check(!app.notice().empty());
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
  app.handle(Action::Select);
  check(app.snapshot().player == "Studio" && app.snapshot().playing);
  check(app.notice().find("playback unchanged") != std::string::npos);
  app.handle(Action::Back);
  app.handle(Action::Down);
  app.handle(Action::Select);
  check(app.screen() == Screen::Playlists && app.rows().size() == 3);
  app.handle(Action::Select);
  check(!app.notice().empty());
  app.handle(Action::Back);
  app.handle(Action::Down);
  app.handle(Action::Select);
  check(app.screen() == Screen::Queue && app.rows().size() == 3);
  app.handle(Action::Select);
  check(!app.notice().empty());
  app.handle(Action::Suspend);
  app.handle(Action::Next);
  app.advance(2000);
  check(app.suspended() && app.snapshot().position == 0);
  app.handle(Action::Wake);
  app.advance(1000);
  check(app.snapshot().position == 1);
  app.handle(Action::Menu);
  app.handle(Action::Menu);
  check(app.screen() == Screen::Queue);
  for (const auto &name : scenarios()) {
    check(app.scenario() == name);
    app.handle(Action::Scenario);
  }
  check(app.scenario() == "playing");
  app.handle(Action::Quit);
  check(!app.running());
  App live("live", "playing");
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
  for (const auto &args :
       std::vector<std::vector<std::string>>{{"--bad"},
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
