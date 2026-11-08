#include "live.hpp"
#include <csetjmp>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <jpeglib.h>
#include <png.h>

namespace brick {
namespace {
constexpr unsigned maxDimension = 1024;
struct JpegError {
  jpeg_error_mgr base;
  std::jmp_buf jump;
};
void jpegFailure(j_common_ptr decoder) {
  auto *error = reinterpret_cast<JpegError *>(decoder->err);
  std::longjmp(error->jump, 1);
}
} // namespace
std::shared_ptr<const Artwork> decodeArtwork(const std::string &bytes) {
  auto image = std::make_shared<Artwork>();
  if (bytes.size() >= 8 &&
      png_sig_cmp(reinterpret_cast<const unsigned char *>(bytes.data()), 0,
                  8) == 0) {
    png_image png{};
    png.version = PNG_IMAGE_VERSION;
    if (!png_image_begin_read_from_memory(&png, bytes.data(), bytes.size())) {
      png_image_free(&png);
      throw NetworkError("Invalid artwork image");
    }
    if (png.width > maxDimension || png.height > maxDimension) {
      png_image_free(&png);
      throw NetworkError("Artwork dimensions exceed limit");
    }
    png.format = PNG_FORMAT_RGBA;
    image->width = png.width;
    image->height = png.height;
    image->pixels.resize(PNG_IMAGE_SIZE(png));
    bool ok =
        png_image_finish_read(&png, nullptr, image->pixels.data(), 0, nullptr);
    png_image_free(&png);
    if (!ok)
      throw NetworkError("Invalid artwork image");
  } else {
    // No C++ object is constructed across libjpeg's longjmp boundary. Decoder
    // output goes directly into the already-owned bounded vector.
    auto decoder = std::make_unique<jpeg_decompress_struct>();
    auto error = std::make_unique<JpegError>();
    decoder->err = jpeg_std_error(&error->base);
    error->base.error_exit = jpegFailure;
    error->base.output_message = +[](j_common_ptr) {};
    if (setjmp(error->jump)) {
      jpeg_destroy_decompress(decoder.get());
      throw NetworkError("Invalid artwork image");
    }
    jpeg_create_decompress(decoder.get());
    jpeg_mem_src(decoder.get(),
                 reinterpret_cast<const unsigned char *>(bytes.data()),
                 bytes.size());
    jpeg_read_header(decoder.get(), TRUE);
    if (decoder->image_width > maxDimension ||
        decoder->image_height > maxDimension) {
      jpeg_destroy_decompress(decoder.get());
      throw NetworkError("Artwork dimensions exceed limit");
    }
    decoder->out_color_space = JCS_RGB;
    jpeg_start_decompress(decoder.get());
    image->width = decoder->output_width;
    image->height = decoder->output_height;
    image->pixels.resize(static_cast<size_t>(image->width) * image->height * 4);
    // Read RGB into each RGBA row then expand backwards in place.
    while (decoder->output_scanline < decoder->output_height) {
      auto *row =
          image->pixels.data() +
          static_cast<size_t>(decoder->output_scanline) * image->width * 4;
      jpeg_read_scanlines(decoder.get(), &row, 1);
      for (int x = image->width - 1; x >= 0; --x) {
        std::memmove(row + x * 4, row + x * 3, 3);
        row[x * 4 + 3] = 255;
      }
    }
    jpeg_finish_decompress(decoder.get());
    jpeg_destroy_decompress(decoder.get());
  }
  return image;
}
} // namespace brick
