#include "entry.hpp"
#include <iostream>

int main(int argc, char **argv) {
  try {
    return brick::desktopMain({argv + 1, argv + argc});
  } catch (const std::exception &error) {
    std::cerr
        << error.what()
        << "\nUsage: groovenet-brick [--mode mock|live] [--platform desktop|knulli] [--scenario NAME] "
           "[--scale 0.5–3] [--font path.ttf] [--frames N] "
           "[--actions menu,down,select,…] [--screenshot path.bmp]\n";
    return 1;
  }
}
