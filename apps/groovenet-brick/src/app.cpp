#include "app.hpp"
#include "live.hpp"

#include <algorithm>
#include <iomanip>
#include <json-c/json.h>
#include <sstream>
#include <stdexcept>
#include <utility>

namespace brick {
const std::vector<std::string> &scenarios() {
  static const std::vector<std::string> names{
      "playing",        "paused",           "empty",      "loading",
      "disconnected",   "unavailable",      "metadata",   "missing-artwork",
      "unknown-timing", "missing-metadata", "refreshing", "artwork",
      "speaker-busy"};
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
  state_.playerId = "lounge";
  state_.playerIds = {"lounge", "studio", "kitchen"};
  state_.players = {"Lounge", "Studio", "Kitchen"};
  state_.playlists = {"After hours", "Warm-up selections", "Sunday records"};
  state_.routing.devices = {
      {"lounge-speaker", "Lounge speakers", "lounge", "idle", {"lounge"}, 1},
      {"studio-speaker",
       "Studio speakers",
       "studio",
       "occupied",
       {"studio"},
       1},
      {"kitchen-speaker", "Kitchen speaker", "", "unknown", {}, -1}};
  state_.routing.desired = state_.routing.assigned = "lounge-speaker";
  state_.routing.token = "mock";
  state_.routing.status = "Desired: lounge-speaker · Assigned: lounge-speaker";
  state_.queue = {{"Days To Come", "Bonobo", "Days To Come", 300, true},
                  {"Les Nuits", "Nightmares on Wax", "Carboot Soul", 380, true},
                  {"So Flute", "St Germain", "Tourist", 490, true}};
  state_.status = "Mock · " + scenario;
  state_.playing = scenario != "paused";
  state_.playbackState = state_.playing ? "playing" : "paused";
  state_.connected = scenario != "disconnected" && scenario != "refreshing";
  state_.refreshing = scenario == "refreshing";
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
  if (scenario == "missing-metadata")
    state_.queue[0] = {"", "", "", 300, false};
  if (scenario == "artwork") {
    auto image = std::make_shared<Artwork>();
    image->width = image->height = 2;
    image->pixels = {255, 0, 0,   255, 0,   255, 0,   255,
                     0,   0, 255, 255, 255, 255, 255, 255};
    state_.queue[0].image = image;
  }
  if (scenario == "speaker-busy")
    state_.acknowledgment = "Speaker busy: explicit takeover is required";
  if (scenario == "unknown-timing")
    state_.queue[0].duration.reset();
  for (size_t i = 0; i < state_.queue.size(); ++i)
    state_.queue[i].entryId = "entry-" + std::to_string(i);
  saved_ = state_.queue;
}
void MockData::command(Action action) {
  if (!state_.connected || !state_.available || state_.loading ||
      !state_.acknowledgment.empty())
    return;
  if (action == Action::RemoteDown)
    state_.volume = std::max(0, state_.volume - 5);
  if (action == Action::RemoteUp)
    state_.volume = std::min(100, state_.volume + 5);
  if (state_.queue.empty())
    return;
  if (action == Action::PlayPause) {
    state_.playing = !state_.playing;
    state_.playbackState = state_.playing ? "playing" : "paused";
  }
  if (action == Action::Next) {
    auto next = (state_.currentIndex + 1) % state_.queue.size();
    std::rotate(state_.queue.begin(), state_.queue.begin() + next,
                state_.queue.end());
    state_.currentIndex = 0;
    state_.position = remainder_ = 0;
  }
  if (action == Action::Previous) {
    auto previous = (state_.currentIndex + state_.queue.size() - 1) % state_.queue.size();
    std::rotate(state_.queue.begin(), state_.queue.begin() + previous,
                state_.queue.end());
    state_.currentIndex = 0;
    state_.position = remainder_ = 0;
  }
}
void MockData::selectPlayer(size_t index) {
  if (index < state_.players.size()) {
    state_.player = state_.players[index];
    state_.playerId = state_.playerIds[index];
  }
}
void MockData::browse(int64_t id, bool) {
  auto &c = state_.collection;
  c.names = state_.playlists;
  c.ids = {1, 2, 3};
  c.id = id;
  c.tracks = id == 3 ? std::vector<Track>{} : saved_;
  for (size_t i = 0; i < c.tracks.size(); ++i) {
    c.tracks[i].trackId = "mock-" + std::to_string(i);
    c.tracks[i].friendId = 1;
    c.tracks[i].playable = id != 2;
  }
  c.loaded = c.tracks.size();
  c.status = c.tracks.empty() && id ? "Empty playlist"
                                    : "Saved order · server validates audio";
}
void MockData::queueTracks(bool play, std::optional<size_t> track,
                           const std::string &) {
  if (!state_.connected || !state_.available || state_.loading ||
      !state_.acknowledgment.empty())
    return;
  try {
    queueCommand(state_.collection.tracks, play, track);
    auto tracks = track
                      ? std::vector<Track>{state_.collection.tracks.at(*track)}
                      : state_.collection.tracks;
    for (auto &t : tracks)
      t.entryId = "added-" + std::to_string(nextEntry_++);
    if (play) {
      state_.queue = tracks;
      state_.currentIndex = state_.position = 0;
      state_.playing = true;
      state_.playbackState = "playing";
    } else
      state_.queue.insert(state_.queue.end(), tracks.begin(), tracks.end());
    state_.collection.status =
        play ? "Playlist started" : "Added · playback unchanged";
  } catch (const NetworkError &e) {
    state_.acknowledgment = e.what();
  }
}
void MockData::editQueue(QueueEdit edit, const std::string &entry,
                         const std::string &) {
  if (!state_.connected || !state_.available || state_.loading ||
      !state_.acknowledgment.empty())
    return;
  try {
    queueEditCommand(state_, edit, entry);
    auto current = state_.currentIndex < state_.queue.size()
                       ? state_.queue[state_.currentIndex].entryId
                       : "";
    auto it = std::find_if(state_.queue.begin(), state_.queue.end(),
                           [&](const Track &t) { return t.entryId == entry; });
    if (edit == QueueEdit::Clear) {
      state_.queue.clear();
      current.clear();
    } else if (edit == QueueEdit::Play) {
      current = entry;
      state_.position = remainder_ = 0;
      state_.playing = true;
      state_.playbackState = "playing";
    } else if (edit == QueueEdit::Remove)
      state_.queue.erase(it);
    else
      std::iter_swap(it, edit == QueueEdit::Up ? it - 1 : it + 1);
    auto playing =
        std::find_if(state_.queue.begin(), state_.queue.end(),
                     [&](const Track &t) { return t.entryId == current; });
    state_.currentIndex = playing - state_.queue.begin();
    if (playing == state_.queue.end()) {
      state_.playing = false;
      state_.playbackState = "stopped";
      state_.position = remainder_ = 0;
    }
    state_.status = "Queue updated";
  } catch (const NetworkError &e) {
    state_.acknowledgment = e.what();
  }
}
void MockData::output(const std::string &body, const std::string &,
                      bool unknown, bool takeover) {
  if (!state_.connected || !state_.available || state_.loading ||
      !state_.acknowledgment.empty())
    return;
  auto *root = json_tokener_parse(body.c_str());
  if (!root)
    return;
  auto *value = json_object_object_get(root, "output_id");
  std::string id =
      value ? json_object_get_string(value) : state_.routing.desired;
  bool play = !value;
  json_object_put(root);
  auto it =
      std::find_if(state_.routing.devices.begin(), state_.routing.devices.end(),
                   [&](const Output &d) { return d.id == id; });
  if (it == state_.routing.devices.end())
    return;
  state_.outputApproval.clear();
  if (play && !it->assigned.empty() && it->assigned != state_.playerId) {
    state_.acknowledgment =
        "Speaker belongs to another player; choose explicit transfer";
    return;
  }
  if (play && ((it->availability == "unknown" && !unknown) ||
               (it->availability == "occupied" && !takeover))) {
    state_.outputApproval = it->availability == "unknown"
                                ? "AVAILABILITY_UNKNOWN"
                                : "SPEAKER_OCCUPIED";
    state_.outputUnknown = unknown || it->availability == "unknown";
    state_.outputTakeover = takeover || it->availability == "occupied";
    state_.acknowledgment =
        it->availability == "unknown"
            ? "Speaker availability unknown: approval is required"
            : "Speaker busy: explicit takeover is required";
    return;
  }
  state_.outputUnknown = state_.outputTakeover = false;
  for (auto &d : state_.routing.devices) {
    if (d.assigned == state_.playerId || d.id == id)
      d.assigned.clear();
    d.desiredBy.erase(
        std::remove(d.desiredBy.begin(), d.desiredBy.end(), state_.playerId),
        d.desiredBy.end());
  }
  state_.routing.desired = id;
  state_.routing.assigned = play ? id : "";
  it->desiredBy.push_back(state_.playerId);
  if (play)
    it->assigned = state_.playerId;
  state_.playing = play;
  state_.playbackState = play ? "playing" : "stopped";
  state_.routing.status =
      "Desired: " + id + " · Assigned: " + (play ? id : "none");
  state_.routing.token += "+";
  state_.acknowledgment =
      play ? "Mock playback confirmed"
           : "Mock selection confirmed; affected players stopped";
}
void MockData::advance(int milliseconds) {
  if (milliseconds <= 0 || !state_.playing || !state_.connected ||
      !state_.available || state_.loading || state_.queue.empty())
    return;
  remainder_ += milliseconds;
  state_.position += remainder_ / 1000;
  remainder_ %= 1000;
  if (state_.queue[state_.currentIndex].duration &&
      state_.position >= *state_.queue[state_.currentIndex].duration)
    command(Action::Next);
}
std::unique_ptr<DataAdapter> dataAdapter(const std::string &mode,
                                         const std::string &scenario,
                                         const std::string &configDirectory) {
  if (mode == "mock")
    return std::make_unique<MockData>(scenario);
  if (mode == "live") {
    auto config = LiveConfig::environment();
    if (!configDirectory.empty())
      config.selectionPath = configDirectory + "/selected-player";
    return liveAdapter(std::move(config));
  }
  throw std::invalid_argument("Mode must be mock or live");
}
App::App(std::string mode, std::string scenario,
         const std::string &configDirectory)
    : mode_(std::move(mode)), scenario_(std::move(scenario)),
      data_(dataAdapter(mode_, scenario_, configDirectory)) {}
App::App(std::unique_ptr<DataAdapter> data)
    : mode_("live"), data_(std::move(data)) {}
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
  case Screen::Players: {
    auto rows = state.players;
    for (size_t i = 0; i < rows.size() && i < state.playerIds.size(); ++i) {
      rows[i] += " [" + state.playerIds[i] + "]";
      if (state.playerIds[i] == state.playerId)
        rows[i] += " · following";
    }
    return rows;
  }
  case Screen::Playlists:
    return state.collection.names;
  case Screen::PlaylistTracks: {
    if (state.collection.loading && state.collection.tracks.empty())
      return {};
    if (state.collection.retry && state.collection.tracks.empty())
      return {"Retry loading playlist"};
    std::vector<std::string> rows{"Playlist actions"};
    for (size_t i = 0; i < state.collection.loaded; ++i) {
      const auto &t = state.collection.tracks[i];
      rows.push_back(
          t.title + " · " + t.artist +
          (t.playable == false ? " · No local audio / unindexed" : ""));
    }
    if (state.collection.loaded < state.collection.tracks.size())
      rows.push_back(state.collection.retry ? "Retry loading tracks" : "Load next 25 tracks");
    return rows;
  }
  case Screen::TrackActions:
    return {"Play now (replace queue and start)",
            "Add to queue (keep playback)"};
  case Screen::Confirm:
    return {"Cancel", "Replace shared queue and start"};
  case Screen::QueueActions:
    return {"Play selected entry", "Remove selected entry", "Move up",
            "Move down"};
  case Screen::ClearConfirm:
    return {"Cancel", "Clear shared queue and stop"};
  case Screen::OutputConfirm:
    return {"Cancel", outputLabel_};
  case Screen::Outputs: {
    std::vector<std::string> rows{"Play desired output…"};
    for (const auto &d : state.routing.devices) {
      std::string row = d.name + " [" + d.id + "] · observed " + d.availability;
      row += " · assigned " + (d.assigned.empty() ? "none" : d.assigned);
      row += " · desired by";
      for (const auto &id : d.desiredBy)
        row += " " + id;
      rows.push_back(row);
    }
    return rows;
  }
  case Screen::Queue: {
    std::vector<std::string> rows{
        state.queue.empty() ? "Queue empty · Clear queue…" : "Clear queue…"};
    for (size_t i = 0; i < state.queue.size(); ++i) {
      const auto &track = state.queue[i];
      rows.push_back(std::to_string(i + 1) + ". " +
                     (i == state.currentIndex ? "[current] " : "") +
                     (track.title.empty() ? "Unknown title" : track.title) +
                     " · " + track.artist +
                     (track.playable == false ? " · Unavailable" : ""));
    }
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
    data_->refresh(); // Discard unsent commands; waking obtains another
                      // snapshot.
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
  if (!snapshot().acknowledgment.empty()) {
    if (action == Action::Select && !snapshot().approvalAction.empty())
      data_->approve();
    else if (action == Action::Select || action == Action::Back)
      data_->acknowledge();
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
    if (screen_ == Screen::TrackActions || screen_ == Screen::Confirm ||
        screen_ == Screen::QueueActions || screen_ == Screen::ClearConfirm ||
        screen_ == Screen::OutputConfirm) {
      history_.clear();
      screen_ = Screen::NowPlaying;
    }
    open(Screen::Menu);
    return;
  }
  auto &focus = focus_[static_cast<size_t>(screen_)];
  const auto items = rows();
  if (!items.empty()) {
    focus %= items.size();
    if (action == Action::Up)
      focus = (focus + items.size() - 1) % items.size();
    if (action == Action::Down)
      focus = (focus + 1) % items.size();
    if (screen_ == Screen::Queue && action == Action::Left)
      focus = focus > 5 ? focus - 5 : 0;
    if (screen_ == Screen::Queue && action == Action::Right)
      focus = std::min(focus + 5, items.size() - 1);
    if (action == Action::Select) {
      if (screen_ == Screen::Menu) {
        open(static_cast<Screen>(focus));
        if (screen_ == Screen::Playlists)
          data_->browse();
        if (screen_ == Screen::Outputs)
          data_->browseOutputs();
      } else if (screen_ == Screen::Outputs) {
        try {
          if (snapshot().routing.token.empty())
            throw NetworkError("Wait for fresh output discovery");
          if (!focus && (snapshot().routing.desired.empty() ||
                         std::none_of(snapshot().routing.devices.begin(),
                                      snapshot().routing.devices.end(),
                                      [&](const Output &d) {
                                        return d.id ==
                                               snapshot().routing.desired;
                                      })))
            throw NetworkError(
                "Desired output missing; choose a discovered output first");
          outputBody_ =
              focus ? outputCommand(snapshot().routing.devices.at(focus - 1),
                                    snapshot().playerId)
                    : "{\"type\":\"play\"}";
          outputLabel_ = focus ? "Select output; stop affected players"
                         : snapshot().outputApproval == "AVAILABILITY_UNKNOWN"
                             ? "Allow unknown status and play"
                         : snapshot().outputApproval == "SPEAKER_OCCUPIED"
                             ? "Take over occupied speaker and play"
                         : snapshot().outputApproval == "DEVICE_BUSY"
                             ? "Take over engine playback and play"
                             : "Play desired output using server policy";
          outputUnknown_ = !focus && snapshot().outputUnknown;
          outputTakeover_ = !focus && snapshot().outputTakeover;
          outputToken_ =
              snapshot().commandToken + "|" + snapshot().routing.token;
          open(Screen::OutputConfirm);
          focus_[static_cast<size_t>(Screen::OutputConfirm)] = 0;
          if (focus) {
            const auto &d = snapshot().routing.devices.at(focus - 1);
            notice_ = "Stop target " + snapshot().playerId;
            if (!d.assigned.empty() && d.assigned != snapshot().playerId)
              notice_ += " and detach source " + d.assigned;
            notice_ += "; remember " + d.id + "; no playback starts";
          } else {
            notice_ = "Play desired output: " + snapshot().routing.desired;
            if (outputTakeover_)
              notice_ += "; may interrupt existing speaker or engine playback";
            if (outputUnknown_)
              notice_ += "; speaker use cannot be verified";
          }
        } catch (const NetworkError &e) {
          notice_ = e.what();
        }
      } else if (screen_ == Screen::OutputConfirm) {
        if (focus == 1)
          data_->output(outputBody_, outputToken_, outputUnknown_,
                        outputTakeover_);
        screen_ = history_.back();
        history_.pop_back();
      } else if (screen_ == Screen::Players) {
        data_->selectPlayer(focus);
        notice_ = "Following " + items[focus] + " · playback unchanged";
      } else if (screen_ == Screen::Playlists) {
        data_->browse(snapshot().collection.ids.at(focus));
        focus_[static_cast<size_t>(Screen::PlaylistTracks)] = 0;
        open(Screen::PlaylistTracks);
      } else if (screen_ == Screen::PlaylistTracks) {
        if (snapshot().collection.loading)
          return;
        if (snapshot().collection.retry && snapshot().collection.tracks.empty()) {
          data_->browse(snapshot().collection.id);
          return;
        }
        if (focus > snapshot().collection.loaded) {
          data_->browse(snapshot().collection.id, true);
          return;
        }
        selectedTrack_ =
            focus ? std::optional<size_t>(focus - 1) : std::nullopt;
        open(Screen::TrackActions);
      } else if (screen_ == Screen::Queue) {
        queueToken_ = snapshot().commandToken;
        if (focus == 0) {
          open(Screen::ClearConfirm);
          focus_[static_cast<size_t>(Screen::ClearConfirm)] = 0;
        } else {
          selectedEntry_ = snapshot().queue.at(focus - 1).entryId;
          open(Screen::QueueActions);
          focus_[static_cast<size_t>(Screen::QueueActions)] = 0;
        }
      } else if (screen_ == Screen::QueueActions ||
                 screen_ == Screen::ClearConfirm) {
        if (screen_ == Screen::QueueActions || focus == 1) {
          auto edit = screen_ == Screen::ClearConfirm ? QueueEdit::Clear
                      : focus == 0                    ? QueueEdit::Play
                      : focus == 1                    ? QueueEdit::Remove
                      : focus == 2                    ? QueueEdit::Up
                                                      : QueueEdit::Down;
          data_->editQueue(edit, selectedEntry_, queueToken_);
        }
        screen_ = history_.back();
        history_.pop_back();
      } else if (screen_ == Screen::TrackActions) {
        queueToken_ = snapshot().commandToken;
        if (focus == 0) {
          open(Screen::Confirm);
          focus_[static_cast<size_t>(Screen::Confirm)] = 0;
        } else
          data_->queueTracks(false, selectedTrack_, queueToken_);
      } else if (screen_ == Screen::Confirm) {
        if (focus == 1)
          data_->queueTracks(true, selectedTrack_, queueToken_);
        screen_ = history_.back();
        history_.pop_back();
      }
    }
  }
  if (screen_ == Screen::Outputs &&
      (action == Action::Up || action == Action::Down))
    rememberOutputFocus();
  if (screen_ == Screen::Queue &&
      (action == Action::Up || action == Action::Down ||
       action == Action::Left || action == Action::Right))
    rememberQueueFocus();
  if (screen_ == Screen::Confirm || screen_ == Screen::TrackActions ||
      screen_ == Screen::QueueActions || screen_ == Screen::ClearConfirm ||
      screen_ == Screen::OutputConfirm || screen_ == Screen::Outputs ||
      (screen_ == Screen::Queue &&
       (action == Action::Left || action == Action::Right)))
    return;
  if (screen_ == Screen::NowPlaying) {
    if (action == Action::Up)
      action = Action::RemoteUp;
    if (action == Action::Down)
      action = Action::RemoteDown;
  }
  if (action == Action::Left)
    action = Action::Previous;
  if (action == Action::Right)
    action = Action::Next;
  data_->command(action);
}
void App::advance(int milliseconds) {
  if (!suspended_) {
    data_->advance(milliseconds);
    auto &queueFocus = focus_[static_cast<size_t>(Screen::Queue)];
    const auto &state = snapshot();
    if (focusedPlayer_ != state.playerId) {
      queueFocus = 0;
      focusedEntry_.clear();
    } else if (!focusedEntry_.empty()) {
      auto it = std::find_if(
          state.queue.begin(), state.queue.end(),
          [&](const Track &t) { return t.entryId == focusedEntry_; });
      queueFocus = it == state.queue.end()
                       ? std::min(queueFocus, state.queue.size())
                       : static_cast<size_t>(it - state.queue.begin()) + 1;
    }
    rememberQueueFocus();
    auto &outputFocus = focus_[static_cast<size_t>(Screen::Outputs)];
    if (outputPlayer_ != state.playerId)
      outputFocus = 0;
    else if (!focusedOutput_.empty()) {
      auto it = std::find_if(
          state.routing.devices.begin(), state.routing.devices.end(),
          [&](const Output &d) { return d.id == focusedOutput_; });
      outputFocus =
          it == state.routing.devices.end()
              ? 0
              : static_cast<size_t>(it - state.routing.devices.begin()) + 1;
    }
    rememberOutputFocus();
    auto count = rows().size();
    auto &focus = focus_[static_cast<size_t>(screen_)];
    if (count == 0 || focus >= count)
      focus = 0;
  }
}
void App::rememberOutputFocus() {
  auto index = focus_[static_cast<size_t>(Screen::Outputs)];
  outputPlayer_ = snapshot().playerId;
  // Both callers reconcile focus against the current discovery first.
  focusedOutput_ = index ? snapshot().routing.devices.at(index - 1).id : "";
}
void App::rememberQueueFocus() {
  auto index = focus_[static_cast<size_t>(Screen::Queue)];
  focusedPlayer_ = snapshot().playerId;
  // Callers reconcile or clamp queue focus before recording its identity.
  focusedEntry_ = index ? snapshot().queue.at(index - 1).entryId : "";
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
