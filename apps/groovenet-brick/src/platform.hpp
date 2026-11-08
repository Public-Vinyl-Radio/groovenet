#pragma once
#include "app.hpp"
#include <SDL.h>
#include <optional>
#include <string>

namespace brick {
// Physical presses captured on Scarab: D-pad uses axes, despite es_input.cfg's hat.
inline constexpr char knulliControllerMapping[] =
    "030000005e0400008e02000014010000,TRIMUI Brick Controller,"
    "a:b5,b:b4,x:b6,y:b7,leftshoulder:b8,rightshoulder:b9,"
    "back:b12,start:b13,guide:b14,dpup:-a1,dpdown:+a1,"
    "dpleft:-a0,dpright:+a0,platform:Linux,";
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
  explicit Desktop(bool knulli = false) : knulli_(knulli) {}
  Action input(const SDL_Event &event) override;
  std::string configDirectory() const override;
  std::optional<int> batteryPercent() const override;
private:
  bool knulli_;
};
struct Options {
  std::string mode = "mock", scenario = "playing", font, screenshot;
  bool knulli = false;
  double scale = 1;
  int frames = 0;
  std::vector<Action> actions;
};
Options parseOptions(const std::vector<std::string> &args);
int runDesktop(const Options &options);
} // namespace brick
