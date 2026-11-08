// Exercise the real entry point with software events and deterministic resource
// failures. These tests make no claims about firmware mappings or memory
// limits.
#include <SDL.h>
#include <curl/curl.h>
#include <string>

namespace {
std::string failure;
SDL_Window *create_window(const char *title, int x, int y, int w, int h,
                          Uint32 flags) {
  return failure == "window" ? nullptr
                             : SDL_CreateWindow(title, x, y, w, h, flags);
}
SDL_Renderer *create_renderer(SDL_Window *window, int index, Uint32 flags) {
  return failure == "renderer" ? nullptr
                               : SDL_CreateRenderer(window, index, flags);
}
SDL_Texture *create_texture(SDL_Renderer *renderer, Uint32 format, int access,
                            int w, int h) {
  return failure == "texture"
             ? nullptr
             : SDL_CreateTexture(renderer, format, access, w, h);
}
SDL_Joystick *open_joystick(int index) {
  return failure == "joystick" ? nullptr : SDL_JoystickOpen(index);
}
CURLcode global_init(long flags) {
  return failure == "curl-global" ? CURLE_FAILED_INIT : curl_global_init(flags);
}
CURL *easy_init() {
  return failure == "curl-easy" ? nullptr : curl_easy_init();
}
CURLM *multi_init() {
  return failure == "curl-multi" ? nullptr : curl_multi_init();
}
} // namespace
#define SDL_CreateWindow create_window
#define SDL_CreateRenderer create_renderer
#define SDL_CreateTexture create_texture
#define SDL_JoystickOpen open_joystick
#define curl_global_init global_init
#define curl_easy_init easy_init
#define curl_multi_init multi_init
#define main probe_entry
#include "main.cpp"
#undef main
#undef SDL_CreateWindow
#undef SDL_CreateRenderer
#undef SDL_CreateTexture
#undef SDL_JoystickOpen
#undef curl_global_init
#undef curl_easy_init
#undef curl_multi_init

int main(int argc, char **argv) {
  if (argc > 2 && std::string(argv[1]) == "--fail") {
    failure = argv[2];
    argc -= 2;
    argv += 2;
  }
  if (argc > 1 && std::string(argv[1]) == "--input") {
    if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_JOYSTICK) != 0)
      return 3;
    if (SDL_JoystickAttachVirtual(SDL_JOYSTICK_TYPE_GAMECONTROLLER, 0, 2, 0) <
        0)
      return 3;
    for (auto type : {SDL_JOYBUTTONDOWN, SDL_JOYBUTTONUP}) {
      SDL_Event button{};
      button.type = type;
      button.jbutton.button = 1;
      SDL_PushEvent(&button);
    }
    for (auto type : {SDL_KEYDOWN, SDL_KEYUP}) {
      SDL_Event key{};
      key.type = type;
      key.key.keysym.sym = SDLK_a;
      SDL_PushEvent(&key);
    }
    SDL_Event quit{};
    quit.type = SDL_QUIT;
    SDL_PushEvent(&quit);
    SDL_Event escape{};
    escape.type = SDL_KEYDOWN;
    escape.key.keysym.sym = SDLK_ESCAPE;
    SDL_PushEvent(&escape);
    --argc;
    ++argv;
  }
  return probe_entry(argc, argv);
}
