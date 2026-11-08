// Compile the real desktop/renderer under fault wrappers, as the probe does.
// This exercises SDL allocation-error cleanup without adding test hooks to app
// code.
#include "app.hpp"
#include <SDL.h>
#include <SDL_ttf.h>
#include <filesystem>
#include <stdexcept>

namespace {
enum class Fault {
  None,
  Resume,
  Mapping,
  Hint,
  Init,
  Ttf,
  Window,
  RenderDevice,
  Canvas,
  Texture,
  FirstFont,
  SecondFont,
  Text,
  Surface,
  Pixels,
  Controller,
  PrefPath
};
Fault fault = Fault::None;
int fontCalls = 0;
bool fail(Fault stage) {
  if (fault != stage)
    return false;
  SDL_SetError("Injected SDL resource failure");
  return true;
}
int faultInit(Uint32 flags) { return fail(Fault::Init) ? -1 : SDL_Init(flags); }
int faultTtf() { return fail(Fault::Ttf) ? -1 : TTF_Init(); }
SDL_Window *faultWindow(const char *title, int x, int y, int w, int h,
                        Uint32 flags) {
  return fail(Fault::Window) ? nullptr
                             : SDL_CreateWindow(title, x, y, w, h, flags);
}
SDL_Renderer *faultRenderer(SDL_Window *window, int index, Uint32 flags) {
  return fail(Fault::RenderDevice) ? nullptr
                                   : SDL_CreateRenderer(window, index, flags);
}
SDL_Texture *faultCanvas(SDL_Renderer *renderer, Uint32 format, int access,
                         int w, int h) {
  return fail(Fault::Canvas)
             ? nullptr
             : SDL_CreateTexture(renderer, format, access, w, h);
}
SDL_Texture *faultTexture(SDL_Renderer *renderer, SDL_Surface *surface) {
  return fail(Fault::Texture) ? nullptr
                              : SDL_CreateTextureFromSurface(renderer, surface);
}
TTF_Font *faultFont(const char *path, int size) {
  ++fontCalls;
  if ((fontCalls == 1 && fail(Fault::FirstFont)) ||
      (fontCalls == 2 && fail(Fault::SecondFont)))
    return nullptr;
  return TTF_OpenFont(path, size);
}
SDL_Surface *faultText(TTF_Font *font, const char *text, SDL_Color color) {
  return fail(Fault::Text) ? nullptr
                           : TTF_RenderUTF8_Blended(font, text, color);
}
SDL_Surface *faultSurface(Uint32 flags, int w, int h, int depth,
                          Uint32 format) {
  return fail(Fault::Surface)
             ? nullptr
             : SDL_CreateRGBSurfaceWithFormat(flags, w, h, depth, format);
}
int faultPixels(SDL_Renderer *renderer, const SDL_Rect *rect, Uint32 format,
                void *pixels, int pitch) {
  return fail(Fault::Pixels)
             ? -1
             : SDL_RenderReadPixels(renderer, rect, format, pixels, pitch);
}
SDL_GameController *faultController(int index) {
  return fail(Fault::Controller) ? nullptr : SDL_GameControllerOpen(index);
}
char *faultPrefPath(const char *org, const char *app) {
  return fail(Fault::PrefPath) ? nullptr : SDL_GetPrefPath(org, app);
}
} // namespace

int faultMapping(const char *mapping) {
  if (fail(Fault::Mapping))
    return -1;
  int result = SDL_GameControllerAddMapping(mapping);
  auto *effective = SDL_GameControllerMappingForGUID(
      SDL_JoystickGetGUIDFromString("030000005e0400008e02000014010000"));
  bool correct = effective && std::string(effective).find("dpup:-a1") != std::string::npos;
  SDL_free(effective);
  if (!correct)
    throw std::runtime_error("Inherited firmware mapping overrode device profile");
  return result;
}
SDL_bool faultHint(const char *name, const char *value, SDL_HintPriority priority) {
  return fail(Fault::Hint) ? SDL_FALSE : SDL_SetHintWithPriority(name, value, priority);
}
#define SDL_SetHintWithPriority faultHint
#define SDL_GameControllerAddMapping faultMapping
void faultDelay(Uint32 ms) {
  if (fault == Fault::Resume) {
    fault = Fault::None;
    SDL_Delay(2100);
  } else
    SDL_Delay(ms);
}
#define SDL_Delay faultDelay
#define SDL_Init faultInit
#define TTF_Init faultTtf
#define SDL_CreateWindow faultWindow
#define SDL_CreateRenderer faultRenderer
#define SDL_CreateTexture faultCanvas
#define SDL_CreateTextureFromSurface faultTexture
#define TTF_OpenFont faultFont
#define TTF_RenderUTF8_Blended faultText
#define SDL_CreateRGBSurfaceWithFormat faultSurface
#define SDL_RenderReadPixels faultPixels
#define SDL_GameControllerOpen faultController
#define SDL_GetPrefPath faultPrefPath
#include "../src/desktop.cpp"
#include "../src/renderer.cpp"
#undef SDL_Init

void failureTests() {
  auto options = brick::parseOptions(
      {"--frames", "1", "--screenshot",
       (std::filesystem::temp_directory_path() / "brick-failure-test.bmp")
           .string()});
  for (auto stage :
       {Fault::Init, Fault::Mapping, Fault::Hint, Fault::Ttf, Fault::Window, Fault::RenderDevice,
        Fault::Canvas, Fault::Texture, Fault::FirstFont, Fault::SecondFont,
        Fault::Text, Fault::Surface, Fault::Pixels}) {
    fault = stage;
    options.knulli = stage == Fault::Mapping || stage == Fault::Hint;
    fontCalls = 0;
    bool rejected = false;
    try {
      brick::runDesktop(options);
    } catch (const std::runtime_error &) {
      rejected = true;
    }
    if (!rejected || SDL_WasInit(0) != 0 || TTF_WasInit() != 0)
      throw std::runtime_error(
          "Resource failure did not unwind cleanly at stage " +
          std::to_string(static_cast<int>(stage)));
  }
  fault = Fault::PrefPath;
  bool rejected = false;
  try {
    brick::Desktop().configDirectory();
  } catch (const std::runtime_error &) {
    rejected = true;
  }
  if (!rejected)
    throw std::runtime_error("Config path error not reported");
  fault = Fault::Controller;
  fontCalls = 0;
  if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_GAMECONTROLLER) != 0)
    throw std::runtime_error(SDL_GetError());
  if (SDL_JoystickAttachVirtual(SDL_JOYSTICK_TYPE_GAMECONTROLLER, 6, 16, 0) < 0)
    throw std::runtime_error(SDL_GetError());
  if (brick::runDesktop(options) != 0)
    throw std::runtime_error("Controller failure prevented keyboard preview");
  std::filesystem::remove(options.screenshot);
  SDL_setenv("SDL_GAMECONTROLLERCONFIG",
             "030000005e0400008e02000014010000,Firmware Wrong Hat,dpup:h0.1,platform:Linux,", 1);
  fault = Fault::Resume;
  options.knulli = true;
  options.frames = 2;
  options.screenshot.clear();
  if (brick::runDesktop(options) != 0)
    throw std::runtime_error("Resume gap prevented rendering");
  SDL_setenv("SDL_GAMECONTROLLERCONFIG", "", 1);
  fault = Fault::None;
}
