#include "app.hpp"
#include "live.hpp"

#include <algorithm>
#include <iomanip>
#include <sstream>
#include <stdexcept>
#include <utility>

namespace brick {
const std::vector<std::string> &scenarios() {
  static const std::vector<std::string> names{
      "playing",  "paused",          "empty",
      "loading",  "disconnected",    "unavailable",
      "metadata", "missing-artwork", "unknown-timing"};
  return names;
}
const std::vector<std::string> &screenNames() {
  static const std::vector<std::string> names{"Now Playing", "Players",
                                              "Playlists", "Queue", "Outputs"};
  return names;
}
Action namedAction(const std::string &name) {
  static const std::vector<std::pair<std::string, Action>> names{
      {"up", Action::Up},
      {"down", Action::Down},
      {"left", Action::Left},
      {"right", Action::Right},
      {"select", Action::Select},
      {"back", Action::Back},
      {"menu", Action::Menu},
      {"play", Action::PlayPause},
      {"previous", Action::Previous},
      {"next", Action::Next},
      {"volume-down", Action::RemoteDown},
      {"volume-up", Action::RemoteUp},
      {"scenario", Action::Scenario},
      {"quit", Action::Quit},
      {"suspend", Action::Suspend},
      {"wake", Action::Wake}};
  for (const auto &entry : names)
    if (entry.first == name)
      return entry.second;
  throw std::invalid_argument("Unknown action: " + name);
}
MockData::MockData(const std::string &scenario) {
  if (std::find(scenarios().begin(), scenarios().end(), scenario) ==
      scenarios().end())
    throw std::invalid_argument("Unknown scenario: " + scenario);
  state_.player = "Lounge";
  state_.players = {"Lounge", "Studio", "Kitchen"};
  state_.playlists = {"After hours", "Warm-up selections", "Sunday records"};
  state_.outputs = {"Lounge speakers (selected)", "Studio speakers (available)",
                    "Kitchen speaker (offline)"};
  state_.queue = {{"Days To Come", "Bonobo", "Days To Come", 300, true},
                  {"Les Nuits", "Nightmares on Wax", "Carboot Soul", 380, true},
                  {"So Flute", "St Germain", "Tourist", 490, true}};
  state_.status = "Mock · " + scenario;
  state_.playing = scenario != "paused";
  state_.connected = scenario != "disconnected";
  state_.available = scenario != "unavailable";
  state_.loading = scenario == "loading";
  if (scenario == "empty")
    state_.queue.clear();
  if (scenario == "metadata")
    state_.queue[0] = {"Échos de São Paulo — an unusually long late-night "
                       "record title with no room to spare",
                       "Björk · Ólafur Arnalds", "Déjà vu / Música electrónica",
                       420, true};
  if (scenario == "missing-artwork")
    state_.queue[0].artwork = false;
  if (scenario == "unknown-timing")
    state_.queue[0].duration.reset();
}
void MockData::command(Action action) {
  if (!state_.connected || !state_.available || state_.loading)
    return;
  if (action == Action::RemoteDown)
    state_.volume = std::max(0, state_.volume - 5);
  if (action == Action::RemoteUp)
    state_.volume = std::min(100, state_.volume + 5);
  if (state_.queue.empty())
    return;
  if (action == Action::PlayPause)
    state_.playing = !state_.playing;
  if (action == Action::Next) {
    std::rotate(state_.queue.begin(), state_.queue.begin() + 1,
                state_.queue.end());
    state_.position = remainder_ = 0;
  }
  if (action == Action::Previous) {
    std::rotate(state_.queue.rbegin(), state_.queue.rbegin() + 1,
                state_.queue.rend());
    state_.position = remainder_ = 0;
  }
}
void MockData::selectPlayer(size_t index) {
  if (index < state_.players.size())
    state_.player = state_.players[index];
}
void MockData::advance(int milliseconds) {
  if (milliseconds <= 0 || !state_.playing || !state_.connected ||
      !state_.available || state_.loading || state_.queue.empty())
    return;
  remainder_ += milliseconds;
  state_.position += remainder_ / 1000;
  remainder_ %= 1000;
  if (state_.queue.front().duration &&
      state_.position >= *state_.queue.front().duration)
    command(Action::Next);
}
std::unique_ptr<DataAdapter> dataAdapter(const std::string &mode,
                                         const std::string &scenario) {
  if (mode == "mock")
    return std::make_unique<MockData>(scenario);
  if (mode == "live")
    return liveAdapter(LiveConfig::environment());
  throw std::invalid_argument("Mode must be mock or live");
}
App::App(std::string mode, std::string scenario)
    : mode_(std::move(mode)), scenario_(std::move(scenario)),
      data_(dataAdapter(mode_, scenario_)) {}
const std::string &App::scenario() const { return scenario_; }
void App::open(Screen screen) {
  history_.push_back(screen_);
  screen_ = screen;
  notice_.clear();
}
std::vector<std::string> App::rows() const {
  const auto &state = snapshot();
  switch (screen_) {
  case Screen::Menu:
    return screenNames();
  case Screen::Players:
    return state.players;
  case Screen::Playlists:
    return state.playlists;
  case Screen::Outputs:
    return state.outputs;
  case Screen::Queue: {
    std::vector<std::string> rows;
    for (const auto &track : state.queue)
      rows.push_back(track.title + " · " + track.artist);
    return rows;
  }
  case Screen::NowPlaying:
    return {};
  }
  return {};
}
void App::handle(Action action) {
  if (action == Action::Quit) {
    running_ = false;
    return;
  }
  if (action == Action::Suspend) {
    suspended_ = true;
    return;
  }
  if (action == Action::Wake) {
    suspended_ = false;
    data_->refresh();
    return;
  }
  if (suspended_)
    return;
  if (action == Action::Scenario && mode_ == "mock") {
    auto index = std::find(scenarios().begin(), scenarios().end(), scenario_) -
                 scenarios().begin();
    scenario_ = scenarios()[(index + 1) % scenarios().size()];
    data_ = dataAdapter(mode_, scenario_);
    focus_.fill(0);
    notice_.clear();
    return;
  }
  if (action == Action::Back ||
      (action == Action::Menu && screen_ == Screen::Menu)) {
    if (!history_.empty()) {
      screen_ = history_.back();
      history_.pop_back();
    }
    notice_.clear();
    return;
  }
  if (action == Action::Menu) {
    open(Screen::Menu);
    return;
  }
  auto &focus = focus_[static_cast<size_t>(screen_)];
  const auto items = rows();
  if (!items.empty()) {
    if (action == Action::Up)
      focus = (focus + items.size() - 1) % items.size();
    if (action == Action::Down)
      focus = (focus + 1) % items.size();
    if (action == Action::Select) {
      if (screen_ == Screen::Menu)
        open(static_cast<Screen>(focus));
      else if (screen_ == Screen::Players) {
        data_->selectPlayer(focus);
        notice_ = "Following " + snapshot().player + " · playback unchanged";
      } else
        notice_ = "Navigation preview · server controls follow in #1099–1101";
    }
  }
  if (action == Action::Left)
    action = Action::Previous;
  if (action == Action::Right)
    action = Action::Next;
  data_->command(action);
}
void App::advance(int milliseconds) {
  if (!suspended_)
    data_->advance(milliseconds);
}
std::string timing(const Snapshot &snapshot) {
  if (snapshot.currentIndex >= snapshot.queue.size() ||
      !snapshot.queue[snapshot.currentIndex].duration)
    return "--:-- / --:--";
  auto format = [](int seconds) {
    std::ostringstream out;
    out << seconds / 60 << ':' << std::setw(2) << std::setfill('0')
        << seconds % 60;
    return out.str();
  };
  return format(snapshot.position) + " / " +
         format(*snapshot.queue[snapshot.currentIndex].duration);
}
} // namespace brick
