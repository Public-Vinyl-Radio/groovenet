#include "renderer.hpp"
#include <algorithm>
#include <stdexcept>

namespace brick {
namespace {
constexpr SDL_Color ink{235, 231, 220, 255}, muted{157, 167, 163, 255},
    accent{194, 235, 120, 255}, panel{32, 42, 40, 255};
}
Renderer::Renderer(SDL_Renderer *renderer, const std::string &font)
    : renderer_(renderer), font_(TTF_OpenFont(font.c_str(), 24)),
      large_(TTF_OpenFont(font.c_str(), 38)) {
  if (!font_ || !large_) {
    if (font_)
      TTF_CloseFont(font_);
    if (large_)
      TTF_CloseFont(large_);
    throw std::runtime_error("Cannot open font: " + font + " · " +
                             TTF_GetError());
  }
}
Renderer::~Renderer() {
  TTF_CloseFont(font_);
  TTF_CloseFont(large_);
}
void Renderer::box(int x, int y, int w, int h, SDL_Color color) {
  SDL_SetRenderDrawColor(renderer_, color.r, color.g, color.b, color.a);
  SDL_Rect rect{x, y, w, h};
  SDL_RenderFillRect(renderer_, &rect);
}
void Renderer::text(const std::string &value, int x, int y, int maxWidth,
                    SDL_Color color, bool large) {
  auto *surface =
      TTF_RenderUTF8_Blended(large ? large_ : font_, value.c_str(), color);
  if (!surface)
    throw std::runtime_error(TTF_GetError());
  auto *texture = SDL_CreateTextureFromSurface(renderer_, surface);
  if (!texture) {
    SDL_FreeSurface(surface);
    throw std::runtime_error(SDL_GetError());
  }
  // Clip whole UTF-8 rendered surfaces, never slice multibyte strings or shrink
  // long metadata to unreadable type. A fade/ellipsis signals the overflow.
  int drawn = std::min(surface->w, maxWidth);
  SDL_Rect source{0, 0, drawn, surface->h}, dest{x, y, drawn, surface->h};
  SDL_RenderCopy(renderer_, texture, &source, &dest);
  if (surface->w > maxWidth) {
    box(x + maxWidth - 36, y, 36, surface->h, panel);
    // Fixed continuation mark, intentionally independent of input encoding.
    box(x + maxWidth - 26, y + surface->h / 2, 20, 3, accent);
  }
  SDL_DestroyTexture(texture);
  SDL_FreeSurface(surface);
}
void Renderer::draw(const App &app, const Platform &platform) {
  box(0, 0, width, height, {16, 24, 23, 255});
  text("GROOVENET", 40, 28, 640, accent);
  const auto battery = platform.batteryPercent();
  text(battery ? "Battery " + std::to_string(*battery) + "%"
               : "Desktop preview",
       750, 28, 240, muted);
  box(40, 78, 944, 2, panel);
  const auto &state = app.snapshot();
  text(app.screen() == Screen::Menu
           ? "Browse"
           : screenNames()[static_cast<size_t>(app.screen())],
       40, 100, 940, ink, true);
  text(state.player + " · remote volume " + std::to_string(state.volume) + "%",
       40, 158, 940, muted);
  if (app.screen() == Screen::NowPlaying) {
    box(40, 224, 304, 304, panel);
    if (state.currentIndex < state.queue.size() &&
        state.queue[state.currentIndex].artwork) {
      // Deterministic mock cover, shared SDL primitives; no downloaded asset.
      box(64, 248, 256, 256, {71, 96, 74, 255});
      for (int i = 0; i < 6; ++i)
        box(84 + i * 34, 270 + i * 20, 15, 200 - i * 20, accent);
      text("GN / 001", 80, 456, 220, ink);
    } else
      text("No artwork", 104, 360, 230, muted);
    std::string title = "Queue is empty";
    if (state.loading)
      title = "Loading player…";
    else if (!state.connected)
      title = "Disconnected";
    else if (!state.available)
      title = "Player unavailable";
    else if (state.currentIndex < state.queue.size())
      title = state.queue[state.currentIndex].title;
    text(title, 384, 236, 600, ink, true);
    if (state.currentIndex < state.queue.size()) {
      text(state.queue[state.currentIndex].artist, 384, 300, 600, ink);
      text(state.queue[state.currentIndex].album, 384, 346, 600, muted);
    }
    text(!state.connected || !state.available || state.loading ||
                 state.currentIndex >= state.queue.size()
             ? "NO PLAYBACK STATE"
             : (state.playing ? "PLAYING" : "PAUSED"),
         384, 418, 600, accent);
    text(timing(state), 384, 466, 600, muted);
    box(40, 564, 944, 6, panel);
    if (state.currentIndex < state.queue.size() &&
        state.queue[state.currentIndex].duration) {
      int progress = int64_t{944} *
                     std::clamp(state.position, 0,
                                *state.queue[state.currentIndex].duration) /
                     std::max(1, *state.queue[state.currentIndex].duration);
      box(40, 564, progress, 6, accent);
    }
  } else {
    const auto rows = app.rows();
    const size_t start = app.focus() / 5 * 5;
    if (rows.empty())
      text("Nothing available", 60, 240, 880, muted);
    for (size_t i = start; i < std::min(start + 5, rows.size()); ++i) {
      int y = 224 + static_cast<int>(i - start) * 68;
      bool focused = i == app.focus();
      if (focused)
        box(40, y, 944, 58, panel);
      text((focused ? ">  " : "   ") + rows[i], 60, y + 12, 900,
           focused ? accent : ink);
    }
  }
  text(app.notice().empty() ? state.status : app.notice(), 40, 606, 944, muted);
  box(0, 656, width, 112, panel);
  text("D-pad / Arrows: focus   A / Enter: select   B / Esc: back", 40, 672,
       944, ink);
  text("Start/Tab: menu   Y/Space: play   L/R or Z/X: prev/next", 40, 704, 944,
       muted);
  text("L3/R3 or +/-: remote volume   F1: scenario   Back/Q: quit", 40, 736,
       944, muted);
  if (app.suspended()) {
    box(40, 224, 944, 350, panel);
    text("Preview suspended · focus window to resume", 80, 350, 860, accent);
  }
}
} // namespace brick
