#pragma once
#include "app.hpp"
#include <SDL.h>
#include <optional>
#include <string>

namespace brick {
// Device adapters own firmware mappings, storage, battery and power events.
// They must never translate Power/local volume into server playback commands.
class Platform {
public:
  virtual ~Platform() = default;
  virtual Action input(const SDL_Event &event) = 0;
  virtual std::string configDirectory() const = 0;
  virtual std::optional<int> batteryPercent() const = 0;
};
class Desktop final : public Platform {
public:
  Action input(const SDL_Event &event) override;
  std::string configDirectory() const override;
  std::optional<int> batteryPercent() const override { return std::nullopt; }
};
struct Options {
  std::string mode = "mock", scenario = "playing", font, screenshot;
  double scale = 1;
  int frames = 0;
  std::vector<Action> actions;
};
Options parseOptions(const std::vector<std::string> &args);
int runDesktop(const Options &options);
} // namespace brick
