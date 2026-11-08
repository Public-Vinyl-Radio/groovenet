#pragma once
#include "app.hpp"
#include "platform.hpp"
#include <SDL.h>
#include <SDL_ttf.h>

namespace brick {
class Renderer {
public:
  Renderer(SDL_Renderer *renderer, const std::string &font);
  ~Renderer();
  Renderer(const Renderer &) = delete;
  Renderer &operator=(const Renderer &) = delete;
  void draw(const App &app, const Platform &platform);

private:
  void text(const std::string &value, int x, int y, int maxWidth,
            SDL_Color color, bool large = false);
  void box(int x, int y, int w, int h, SDL_Color color);
  SDL_Renderer *renderer_;
  TTF_Font *font_, *large_;
  std::shared_ptr<const Artwork> artwork_;
  SDL_Texture *artworkTexture_ = nullptr;
};
} // namespace brick
