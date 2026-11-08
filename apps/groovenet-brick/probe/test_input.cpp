// Run the real entry point with SDL's virtual joystick/event queue. This is
// software input coverage, not a test of firmware button mappings.
#define main probe_entry
#include "main.cpp"
#undef main

int main(int argc, char **argv) {
  if (argc > 1 && std::string(argv[1]) == "--input") {
    if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_JOYSTICK) != 0)
      return 3;
    if (SDL_JoystickAttachVirtual(SDL_JOYSTICK_TYPE_GAMECONTROLLER, 0, 2, 0) <
        0)
      return 3;
    SDL_Event key{};
    key.type = SDL_KEYDOWN;
    key.key.keysym.sym = SDLK_ESCAPE;
    SDL_Event button{};
    button.type = SDL_JOYBUTTONDOWN;
    button.jbutton.button = 1;
    SDL_PushEvent(&button);
    SDL_PushEvent(&key);
    --argc;
    ++argv;
  }
  return probe_entry(argc, argv);
}
