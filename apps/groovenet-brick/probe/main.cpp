#include <SDL.h>
#include <curl/curl.h>
#include <png.h>

#include <csignal>
#include <fstream>
#include <iostream>
#include <string>
#include <vector>

namespace {
volatile std::sig_atomic_t stopped = 0;
void stop(int) { stopped = 1; }
Uint64 started;
void log(const std::string &message) {
  std::cout << SDL_GetTicks64() - started << "ms " << message << std::endl;
}
struct Stream {
  std::string line;
  std::string event;
  bool data = false;
};
// Deliberately only observe framing; application JSON/state belongs to #1097.
size_t receive(char *bytes, size_t size, size_t count, void *context) {
  auto &stream = *static_cast<Stream *>(context);
  for (size_t i = 0; i < size * count; ++i) {
    char c = bytes[i];
    if (c == '\r')
      continue;
    if (c != '\n') {
      if (stream.line.size() >= 262144)
        return 0;
      stream.line += c;
      continue;
    }
    if (stream.line.empty()) {
      if (stream.data)
        log("sse event=" + stream.event);
      stream.event.clear();
      stream.data = false;
    } else if (stream.line.rfind("event:", 0) == 0) {
      stream.event = stream.line.substr(6);
    } else if (stream.line.rfind("data:", 0) == 0) {
      stream.data = true;
    }
    stream.line.clear();
  }
  return size * count;
}
} // namespace

int main(int argc, char **argv) {
  // All paths explicit: no firmware-specific defaults or secret environment.
  if (argc != 7 || std::string(argv[1]).rfind("https://", 0) != 0) {
    std::cerr << "usage: brick-probe https://host/api/players/NAME/events "
                 "token-file ca.pem artwork.png launch-counter seconds\n";
    return 2;
  }
  unsigned seconds = 0;
  try {
    size_t end;
    const auto value = std::stoul(argv[6], &end);
    if (end != std::string(argv[6]).size() || value == 0 || value > 86400)
      return 2;
    seconds = static_cast<unsigned>(value);
  } catch (...) {
    return 2;
  }
  std::ifstream token_file(argv[2]);
  std::string token;
  std::getline(token_file, token);
  if (token.empty() || token.find_first_of("\r\n") != std::string::npos)
    return 2;
  std::signal(SIGINT, stop);
  std::signal(SIGTERM, stop);
  if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_JOYSTICK) != 0) {
    std::cerr << SDL_GetError() << '\n';
    return 1;
  }
  started = SDL_GetTicks64();
  int status = 0;
  SDL_Window *window = nullptr;
  SDL_Renderer *renderer = nullptr;
  SDL_Texture *art = nullptr;
  CURL *easy = nullptr;
  CURLM *multi = nullptr;
  curl_slist *headers = nullptr;
  std::vector<SDL_Joystick *> joysticks;
  do {
    unsigned launches = 0;
    std::ifstream(argv[5]) >> launches;
    std::ofstream state(argv[5], std::ios::trunc);
    state << launches + 1 << '\n';
    state.close();
    if (!state) {
      log("state write failed");
      status = 1;
      break;
    }
    log("launch_count=" + std::to_string(launches + 1));
    SDL_version version;
    SDL_GetVersion(&version);
    log("SDL=" + std::to_string(version.major) + "." +
        std::to_string(version.minor) + "." + std::to_string(version.patch) +
        " video=" + SDL_GetCurrentVideoDriver());
    for (int i = 0; i < SDL_NumJoysticks(); ++i) {
      auto *joystick = SDL_JoystickOpen(i);
      if (joystick)
        joysticks.push_back(joystick);
    }
    window = SDL_CreateWindow("Groovenet lifecycle probe", 0, 0, 640, 480,
                              SDL_WINDOW_SHOWN | SDL_WINDOW_FULLSCREEN_DESKTOP);
    if (window)
      renderer = SDL_CreateRenderer(window, -1, 0);
    if (!renderer) {
      log(SDL_GetError());
      status = 1;
      break;
    }
    SDL_RenderSetLogicalSize(renderer, 640, 480);
    png_image image{};
    image.version = PNG_IMAGE_VERSION;
    if (!png_image_begin_read_from_file(&image, argv[4])) {
      log("PNG open failed");
      png_image_free(&image);
      status = 1;
      break;
    }
    image.format = PNG_FORMAT_RGBA;
    if (image.width > 4096 || image.height > 4096) {
      log("PNG too large");
      png_image_free(&image);
      status = 1;
      break;
    }
    std::vector<unsigned char> pixels(PNG_IMAGE_SIZE(image));
    if (png_image_finish_read(&image, nullptr, pixels.data(), 0, nullptr)) {
      art = SDL_CreateTexture(renderer, SDL_PIXELFORMAT_RGBA32,
                              SDL_TEXTUREACCESS_STATIC, image.width,
                              image.height);
      if (art)
        SDL_UpdateTexture(art, nullptr, pixels.data(), image.width * 4);
    }
    png_image_free(&image);
    if (!art) {
      log("PNG decode/texture failed");
      status = 1;
      break;
    }
    log(std::string("curl=") + curl_version() +
        " png=" + PNG_LIBPNG_VER_STRING);
    if (curl_global_init(CURL_GLOBAL_DEFAULT) != CURLE_OK) {
      status = 1;
      break;
    }
    easy = curl_easy_init();
    multi = curl_multi_init();
    if (!easy || !multi) {
      status = 1;
      break;
    }
    headers =
        curl_slist_append(headers, ("Authorization: Bearer " + token).c_str());
    headers = curl_slist_append(headers, "Accept: text/event-stream");
    Stream stream;
    curl_easy_setopt(easy, CURLOPT_URL, argv[1]);
    curl_easy_setopt(easy, CURLOPT_HTTPHEADER, headers);
    curl_easy_setopt(easy, CURLOPT_CAINFO, argv[3]);
    curl_easy_setopt(easy, CURLOPT_FAILONERROR, 1L);
    curl_easy_setopt(easy, CURLOPT_CONNECTTIMEOUT, 5L);
    // A bounded stream gives a fresh snapshot even if firmware emits no wake
    // event.
    curl_easy_setopt(easy, CURLOPT_TIMEOUT, 30L);
    curl_easy_setopt(easy, CURLOPT_LOW_SPEED_LIMIT, 1L);
    curl_easy_setopt(easy, CURLOPT_LOW_SPEED_TIME, 15L);
    curl_easy_setopt(easy, CURLOPT_NOSIGNAL, 1L);
    curl_easy_setopt(easy, CURLOPT_WRITEFUNCTION, receive);
    curl_easy_setopt(easy, CURLOPT_WRITEDATA, &stream);
    bool connected = false;
    Uint64 retry = 0;
    bool first_frame = true;
    while (!stopped && SDL_GetTicks64() - started < seconds * 1000ULL) {
      SDL_Event event;
      while (SDL_PollEvent(&event)) {
        log("input type=" + std::to_string(event.type));
        if (event.type == SDL_KEYDOWN || event.type == SDL_KEYUP)
          log("key=" + std::to_string(event.key.keysym.sym));
        if (event.type == SDL_JOYBUTTONDOWN || event.type == SDL_JOYBUTTONUP)
          log("joystick_button=" + std::to_string(event.jbutton.button));
        if (event.type == SDL_QUIT ||
            (event.type == SDL_KEYDOWN && event.key.keysym.sym == SDLK_ESCAPE))
          stopped = 1;
      }
      if (!connected && SDL_GetTicks64() >= retry) {
        stream = {};
        curl_multi_add_handle(multi, easy);
        connected = true;
        log("connect");
      }
      int active;
      curl_multi_perform(multi, &active);
      int remaining;
      while (auto *message = curl_multi_info_read(multi, &remaining)) {
        log("connection ended curl_code=" +
            std::to_string(message->data.result));
        curl_multi_remove_handle(multi, easy);
        connected = false;
        retry = SDL_GetTicks64() + 1000;
      }
      SDL_SetRenderDrawColor(renderer, 0, 0, 0, 255);
      SDL_RenderClear(renderer);
      // Orientation markers: red top-left; green top-right; blue bottom-left.
      const SDL_Rect corners[] = {
          {0, 0, 80, 80}, {560, 0, 80, 80}, {0, 400, 80, 80}};
      for (int i = 0; i < 3; ++i) {
        SDL_SetRenderDrawColor(renderer, i == 0 ? 255 : 0, i == 1 ? 255 : 0,
                               i == 2 ? 255 : 0, 255);
        SDL_RenderFillRect(renderer, &corners[i]);
      }
      SDL_Rect destination{160, 80, 320, 320};
      SDL_RenderCopy(renderer, art, nullptr, &destination);
      SDL_RenderPresent(renderer);
      if (first_frame) {
        log("first_frame");
        first_frame = false;
      }
      SDL_Delay(50);
    }
    if (connected)
      curl_multi_remove_handle(multi, easy);
    log("clean_exit");
  } while (false);
  if (multi)
    curl_multi_cleanup(multi);
  if (easy)
    curl_easy_cleanup(easy);
  curl_slist_free_all(headers);
  curl_global_cleanup();
  if (art)
    SDL_DestroyTexture(art);
  if (renderer)
    SDL_DestroyRenderer(renderer);
  if (window)
    SDL_DestroyWindow(window);
  for (auto *joystick : joysticks)
    SDL_JoystickClose(joystick);
  SDL_Quit();
  return status;
}
