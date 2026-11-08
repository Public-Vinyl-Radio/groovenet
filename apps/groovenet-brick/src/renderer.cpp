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
  if (artworkTexture_)
    SDL_DestroyTexture(artworkTexture_);
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
  // Live refreshes can briefly have no album/artist. Newer SDL_ttf rejects
  // empty text with "Text has zero width" rather than producing a surface.
  if (value.empty())
    return;
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
  text(app.screen() == Screen::Menu             ? "Browse"
       : app.screen() == Screen::PlaylistTracks ? "Playlist tracks"
       : app.screen() == Screen::TrackActions   ? "Choose action"
       : app.screen() == Screen::QueueActions   ? "Queue entry actions"
       : app.screen() == Screen::OutputConfirm  ? "Confirm output action"
       : app.screen() == Screen::ClearConfirm   ? "Clear shared queue?"
       : app.screen() == Screen::Confirm
           ? "Replace existing shared queue?"
           : screenNames()[static_cast<size_t>(app.screen())],
       40, 100, 940, ink, true);
  text(state.player +
           (state.playerId.empty() ? "" : " [" + state.playerId + "]"),
       40, 158, 680, muted);
  text("Server volume " + std::to_string(state.volume) + "%", 750, 158, 240,
       muted);
  if (app.screen() == Screen::NowPlaying) {
    box(40, 224, 304, 304, panel);
    auto image = state.currentIndex < state.queue.size()
                     ? state.queue[state.currentIndex].image
                     : nullptr;
    if (image != artwork_) {
      if (artworkTexture_)
        SDL_DestroyTexture(artworkTexture_);
      artworkTexture_ = nullptr;
      artwork_ = image;
      if (image) {
        artworkTexture_ = SDL_CreateTexture(renderer_, SDL_PIXELFORMAT_RGBA32,
                                            SDL_TEXTUREACCESS_STATIC,
                                            image->width, image->height);
        if (artworkTexture_ &&
            SDL_UpdateTexture(artworkTexture_, nullptr, image->pixels.data(),
                              image->width * 4) != 0) {
          SDL_DestroyTexture(artworkTexture_);
          artworkTexture_ = nullptr;
        }
      }
    }
    if (artworkTexture_) {
      SDL_Rect destination{40, 224, 304, 304};
      SDL_RenderCopy(renderer_, artworkTexture_, nullptr, &destination);
    } else if (state.currentIndex < state.queue.size() &&
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
    else if (!state.connected && !state.refreshing)
      title = state.playerId.empty() ? "Choose a player" : "Disconnected";
    else if (!state.available)
      title = "Player unavailable";
    else if (state.currentIndex < state.queue.size())
      title = state.queue[state.currentIndex].title.empty()
                  ? "Unknown title"
                  : state.queue[state.currentIndex].title;
    text(title, 384, 236, 600, ink, true);
    if (state.currentIndex < state.queue.size()) {
      text(state.queue[state.currentIndex].artist.empty()
               ? "Unknown artist"
               : state.queue[state.currentIndex].artist,
           384, 300, 600, ink);
      text(state.queue[state.currentIndex].album.empty()
               ? "Unknown album"
               : state.queue[state.currentIndex].album,
           384, 346, 600, muted);
    }
    text(state.refreshing ? "UPDATING"
         : !state.connected || !state.available || state.loading ||
                 state.currentIndex >= state.queue.size()
             ? "NO PLAYBACK STATE"
             : state.playbackState,
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
    const bool outputs = app.screen() == Screen::Outputs;
    const size_t page = outputs ? 3 : 5;
    const size_t start = app.focus() / page * page;
    if (rows.empty())
      text("Nothing available", 60, 240, 880, muted);
    for (size_t i = start; i < std::min(start + page, rows.size()); ++i) {
      int y = 224 + static_cast<int>(i - start) * (outputs ? 112 : 68);
      bool focused = i == app.focus();
      if (focused)
        box(40, y, 944, outputs ? 102 : 58, panel);
      if (outputs && i > 0) {
        const auto &d = state.routing.devices.at(i - 1);
        text((focused ? ">  " : "   ") + d.name + " [" + d.id + "]", 60, y + 4,
             900, focused ? accent : ink);
        text("Observed: " + d.availability +
                 " · Assigned: " + (d.assigned.empty() ? "none" : d.assigned),
             85, y + 34, 860, muted);
        std::string desired = "Desired by:";
        for (const auto &id : d.desiredBy)
          desired += " " + id;
        if (d.desiredBy.empty())
          desired += " none";
        text(desired, 85, y + 64, 860, muted);
      } else
        text((focused ? ">  " : "   ") + rows[i], 60, y + 12, 900,
             focused ? accent : ink);
    }
  }
  bool collection = app.screen() == Screen::Playlists ||
                    app.screen() == Screen::PlaylistTracks ||
                    app.screen() == Screen::TrackActions;
  if (app.screen() == Screen::OutputConfirm) {
    std::string remaining = app.notice();
    for (int line = 0; line < 4 && !remaining.empty(); ++line) {
      auto split =
          remaining.size() <= 70 ? remaining.size() : remaining.rfind(' ', 70);
      if (split == std::string::npos)
        split = remaining.size();
      text(remaining.substr(0, split), 40, 484 + line * 34, 944, muted);
      remaining.erase(0, std::min(split + 1, remaining.size()));
    }
  } else
    text(app.notice().empty()
             ? (app.screen() == Screen::Outputs ? state.routing.status
                : collection                    ? state.collection.status
                : (app.screen() == Screen::Confirm ||
                   app.screen() == Screen::ClearConfirm)
                    ? "This removes the selected player's queue. B/Esc cancels."
                    : state.status)
             : app.notice(),
         40, 606, 944, muted);
  box(0, 656, width, 112, panel);
  text(app.screen() == Screen::NowPlaying
           ? "Up/down: server volume   A/Enter: select   B/Esc: back"
           : "Up/down: focus   A/Enter: select   B/Esc: back",
       40, 672, 944, ink);
  text(app.screen() == Screen::Queue ? "Left/right: page   Start/Tab: menu"
       : (app.screen() == Screen::Outputs ||
          app.screen() == Screen::OutputConfirm)
           ? "Start/Tab: menu   Playback requires a confirmed action"
           : "Start/Tab: menu   Y/Space: play   L/R or Z/X: prev/next",
       40, 704, 944, muted);
  text("+/-: server volume   Select/Q: quit", 40, 736, 944, muted);
  if (!state.acknowledgment.empty()) {
    box(40, 224, 944, 350, panel);
    text("Player action needs attention", 80, 254, 860, accent, true);
    std::string remaining = state.acknowledgment;
    for (int line = 0; line < 3 && !remaining.empty(); ++line) {
      auto split =
          remaining.size() <= 58 ? remaining.size() : remaining.rfind(' ', 58);
      if (split == std::string::npos)
        split = remaining.size();
      text(remaining.substr(0, split), 80, 310 + line * 34, 860, ink);
      remaining.erase(0, std::min(split + 1, remaining.size()));
    }
    const bool approval = !state.approvalAction.empty();
    text(approval ? state.approvalAction : "Review actual assignments in Browse > Outputs.", 80, 426, 860, muted);
    text(approval ? "May interrupt speaker playback; this action only."
                  : "No action was retried. Review state before trying again.", 80, 460, 860, muted);
    text(approval ? "A/Enter: approve and retry   B/Esc: cancel"
                  : "A/Enter: dismiss   B/Esc: dismiss", 80, 502, 860, accent);
  }
  if (app.suspended()) {
    box(40, 224, 944, 350, panel);
    text("Preview suspended · focus window to resume", 80, 350, 860, accent);
  }
}
} // namespace brick
