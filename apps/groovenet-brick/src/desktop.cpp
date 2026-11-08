#include "entry.hpp"
#include "platform.hpp"
#include "renderer.hpp"
#include <SDL_ttf.h>
#include <algorithm>
#include <cmath>
#include <chrono>
#include <filesystem>
#include <iostream>
#include <memory>
#include <sstream>
#include <stdexcept>

namespace brick {
Action Desktop::input(const SDL_Event &event) {
  if (knulli_ && event.type == SDL_KEYDOWN &&
      event.key.keysym.sym == SDLK_POWER && !event.key.repeat)
    return Action::Wake; // Firmware owns Power; only invalidate remote state.
  if (event.type == SDL_QUIT)
    return Action::Quit;
  if (event.type == SDL_APP_WILLENTERBACKGROUND)
    return Action::Suspend;
  if (event.type == SDL_APP_DIDENTERFOREGROUND)
    return Action::Wake;
  if (event.type == SDL_WINDOWEVENT) {
    if (event.window.event == SDL_WINDOWEVENT_FOCUS_LOST)
      return Action::Suspend;
    if (event.window.event == SDL_WINDOWEVENT_FOCUS_GAINED)
      return Action::Wake;
  }
  if (event.type == SDL_KEYDOWN) {
    if (event.key.repeat)
      return Action::None;
    switch (event.key.keysym.sym) {
    case SDLK_UP:
      return Action::Up;
    case SDLK_DOWN:
      return Action::Down;
    case SDLK_LEFT:
      return Action::Left;
    case SDLK_RIGHT:
      return Action::Right;
    case SDLK_RETURN:
      return Action::Select;
    case SDLK_ESCAPE:
      return Action::Back;
    case SDLK_TAB:
      return Action::Menu;
    case SDLK_SPACE:
      return Action::PlayPause;
    case SDLK_z:
      return Action::Previous;
    case SDLK_x:
      return Action::Next;
    case SDLK_MINUS:
      return Action::RemoteDown;
    case SDLK_EQUALS:
    case SDLK_PLUS:
      return Action::RemoteUp;
    case SDLK_F1:
      return Action::Scenario;
    case SDLK_q:
      return Action::Quit;
    default:
      return Action::None;
    }
  }
  if (event.type == SDL_CONTROLLERBUTTONDOWN) {
    switch (event.cbutton.button) {
    case SDL_CONTROLLER_BUTTON_DPAD_UP:
      return Action::Up;
    case SDL_CONTROLLER_BUTTON_DPAD_DOWN:
      return Action::Down;
    case SDL_CONTROLLER_BUTTON_DPAD_LEFT:
      return Action::Left;
    case SDL_CONTROLLER_BUTTON_DPAD_RIGHT:
      return Action::Right;
    case SDL_CONTROLLER_BUTTON_A:
      return Action::Select;
    case SDL_CONTROLLER_BUTTON_B:
      return Action::Back;
    case SDL_CONTROLLER_BUTTON_START:
      return Action::Menu;
    case SDL_CONTROLLER_BUTTON_Y:
      return Action::PlayPause;
    case SDL_CONTROLLER_BUTTON_LEFTSHOULDER:
      return Action::Previous;
    case SDL_CONTROLLER_BUTTON_RIGHTSHOULDER:
      return Action::Next;
    case SDL_CONTROLLER_BUTTON_BACK:
      return Action::Quit;
    case SDL_CONTROLLER_BUTTON_LEFTSTICK:
      return Action::RemoteDown;
    case SDL_CONTROLLER_BUTTON_RIGHTSTICK:
      return Action::RemoteUp;
    default:
      return Action::None;
    }
  }
  return Action::None;
}
std::string Desktop::configDirectory() const {
  char *path = SDL_GetPrefPath("Groovenet", "Brick");
  if (!path)
    throw std::runtime_error(SDL_GetError());
  std::string result(path);
  SDL_free(path);
  return result;
}
Options parseOptions(const std::vector<std::string> &args) {
  Options options;
  for (size_t i = 0; i < args.size(); ++i) {
    const auto &key = args[i];
    if (++i == args.size())
      throw std::invalid_argument("Missing value for " + key);
    const auto &value = args[i];
    if (key == "--mode")
      options.mode = value;
    else if (key == "--platform") {
      if (value != "desktop" && value != "knulli")
        throw std::invalid_argument("Platform must be desktop or knulli");
      options.knulli = value == "knulli";
    } else if (key == "--scenario")
      options.scenario = value;
    else if (key == "--font")
      options.font = value;
    else if (key == "--screenshot")
      options.screenshot = value;
    else if (key == "--scale" || key == "--frames") {
      size_t end;
      double number = std::stod(value, &end);
      if (end != value.size() || !std::isfinite(number))
        throw std::invalid_argument("Invalid number: " + value);
      if (key == "--scale") {
        if (number < 0.5 || number > 3)
          throw std::invalid_argument("Scale must be 0.5–3");
        options.scale = number;
      } else {
        if (number < 1 || number > 100000 || number != std::floor(number))
          throw std::invalid_argument(
              "Frames must be an integer from 1–100000");
        options.frames = static_cast<int>(number);
      }
    } else if (key == "--actions") {
      std::istringstream list(value);
      std::string name;
      while (std::getline(list, name, ','))
        options.actions.push_back(namedAction(name));
    } else
      throw std::invalid_argument("Unknown option: " + key);
  }
  if (options.mode != "mock" && options.mode != "live")
    throw std::invalid_argument("Mode must be mock or live");
  if (std::find(scenarios().begin(), scenarios().end(), options.scenario) ==
      scenarios().end())
    throw std::invalid_argument("Unknown scenario: " + options.scenario);
  if (options.font.empty()) {
#ifdef __APPLE__
    options.font = "/System/Library/Fonts/Supplemental/Arial.ttf";
#else
    options.font = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
#endif
  }
  return options;
}
int desktopMain(const std::vector<std::string> &arguments) {
  return runDesktop(parseOptions(arguments));
}
int runDesktop(const Options &options) {
  // SDL may initialize some subsystems before reporting failure.
  struct Cleanup {
    ~Cleanup() {
      TTF_Quit();
      SDL_Quit();
    }
  } cleanup;
  // Ports exports a firmware-generated hat mapping. SDL gives environment maps
  // higher priority than AddMapping(), so override the hint before SDL loads it.
  if (options.knulli &&
      !SDL_SetHintWithPriority(SDL_HINT_GAMECONTROLLERCONFIG,
                               knulliControllerMapping, SDL_HINT_OVERRIDE))
    throw std::runtime_error("Cannot override firmware controller mapping");
  if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_GAMECONTROLLER) != 0)
    throw std::runtime_error(SDL_GetError());
  if (options.knulli) {
    if (SDL_GameControllerAddMapping(knulliControllerMapping) < 0)
      throw std::runtime_error("Cannot install Brick controller mapping");
  }
  if (TTF_Init() != 0)
    throw std::runtime_error(TTF_GetError());
  std::unique_ptr<SDL_Window, decltype(&SDL_DestroyWindow)> window(
      SDL_CreateWindow("Groovenet Brick · F1 scenarios · Q quit",
                       SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED,
                       static_cast<int>(width * options.scale),
                       static_cast<int>(height * options.scale),
                       (options.knulli ? SDL_WINDOW_FULLSCREEN_DESKTOP
                                       : SDL_WINDOW_RESIZABLE | SDL_WINDOW_ALLOW_HIGHDPI)),
      SDL_DestroyWindow);
  if (!window)
    throw std::runtime_error(SDL_GetError());
  std::unique_ptr<SDL_Renderer, decltype(&SDL_DestroyRenderer)> renderer(
      SDL_CreateRenderer(window.get(), -1, SDL_RENDERER_SOFTWARE),
      SDL_DestroyRenderer);
  if (!renderer)
    throw std::runtime_error(SDL_GetError());
  SDL_RenderSetLogicalSize(renderer.get(), width, height);
  // Render into a fixed logical canvas so captures are independent of host DPI.
  std::unique_ptr<SDL_Texture, decltype(&SDL_DestroyTexture)> canvas(
      SDL_CreateTexture(renderer.get(), SDL_PIXELFORMAT_ARGB8888,
                        SDL_TEXTUREACCESS_TARGET, width, height),
      SDL_DestroyTexture);
  if (!canvas)
    throw std::runtime_error(SDL_GetError());
  std::vector<
      std::unique_ptr<SDL_GameController, decltype(&SDL_GameControllerClose)>>
      controllers;
  auto connect = [&](int index) {
    if (SDL_IsGameController(index)) {
      auto id = SDL_JoystickGetDeviceInstanceID(index);
      if (std::any_of(controllers.begin(), controllers.end(),
                      [&](const auto &controller) {
                        return SDL_JoystickInstanceID(
                                   SDL_GameControllerGetJoystick(
                                       controller.get())) == id;
                      }))
        return;
      auto *controller = SDL_GameControllerOpen(index);
      if (controller)
        controllers.emplace_back(controller, SDL_GameControllerClose);
    }
  };
  for (int i = 0; i < SDL_NumJoysticks(); ++i)
    connect(i);
  Desktop platform(options.knulli);
  Renderer view(renderer.get(), options.font);
  App app(options.mode, options.scenario);
  Uint64 last = SDL_GetTicks64();
  auto lastWall = std::chrono::system_clock::now();
  int frame = 0;
  while (app.running()) {
    auto wall = std::chrono::system_clock::now();
    if (options.knulli && wall - lastWall > std::chrono::seconds(2)) {
      // Wall time includes Linux suspend. Cancel unsent writes before handling input.
      app.handle(Action::Suspend);
      app.handle(Action::Wake);
      app.advance(0);
      SDL_FlushEvents(SDL_CONTROLLERAXISMOTION, SDL_CONTROLLERBUTTONUP);
    }
    lastWall = wall;
    SDL_Event event;
    while (SDL_PollEvent(&event)) {
      if (event.type == SDL_CONTROLLERDEVICEADDED)
        connect(event.cdevice.which);
      if (event.type == SDL_CONTROLLERDEVICEREMOVED) {
        controllers.erase(
            std::remove_if(
                controllers.begin(), controllers.end(),
                [&](const auto &controller) {
                  return SDL_JoystickInstanceID(SDL_GameControllerGetJoystick(
                             controller.get())) == event.cdevice.which;
                }),
            controllers.end());
      }
      app.handle(platform.input(event));
      if (options.knulli)
        app.advance(0);
    }
    // The deterministic command driver goes through the same application
    // actions as real input; scripted runs use a fixed clock and do not depend
    // on focus.
    if (frame == 0 && !options.actions.empty()) {
      app.handle(Action::Wake);
      for (auto action : options.actions)
        app.handle(action);
    }
    auto now = SDL_GetTicks64();
    app.advance(options.frames
                    ? 0
                    : static_cast<int>(std::min<Uint64>(now - last, 1000)));
    last = now;
    SDL_SetRenderTarget(renderer.get(), canvas.get());
    view.draw(app, platform);
    bool finalFrame =
        !app.running() || (options.frames && frame + 1 >= options.frames);
    if (!options.screenshot.empty() &&
        (finalFrame || (!options.frames && frame == 0))) {
      std::unique_ptr<SDL_Surface, decltype(&SDL_FreeSurface)> surface(
          SDL_CreateRGBSurfaceWithFormat(0, width, height, 32,
                                         SDL_PIXELFORMAT_ARGB8888),
          SDL_FreeSurface);
      if (!surface ||
          SDL_RenderReadPixels(renderer.get(), nullptr,
                               SDL_PIXELFORMAT_ARGB8888, surface->pixels,
                               surface->pitch) != 0 ||
          SDL_SaveBMP(surface.get(), options.screenshot.c_str()) != 0)
        throw std::runtime_error("Screenshot failed: " +
                                 std::string(SDL_GetError()));
    }
    SDL_SetRenderTarget(renderer.get(), nullptr);
    SDL_RenderCopy(renderer.get(), canvas.get(), nullptr, nullptr);
    SDL_RenderPresent(renderer.get());
    ++frame;
    if (finalFrame)
      break;
    SDL_Delay(33);
  }
  return 0;
}
} // namespace brick
