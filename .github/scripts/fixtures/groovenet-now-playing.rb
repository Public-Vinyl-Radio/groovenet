class GroovenetNowPlaying < Formula
  desc "Groovenet playback in macOS Now Playing, with media key control"
  homepage "https://github.com/Public-Vinyl-Radio/groovenet"
  # The groovenet release workflow rewrites the url and sha256 lines here and in
  # the resource after each player release; keep one of each per block.
  url "https://registry.npmjs.org/@groovenet/player/-/player-0.1.11.tgz"
  sha256 "82c1b9a49cccc25633a4824d1d10fdd9fe94a9a52f245163d9a21539da45d9e5"
  license "MIT"

  depends_on macos: :ventura
  depends_on "node"

  # The prebuilt, ad-hoc signed helper app from the same player release, so
  # installing needs no Xcode.
  resource "app" do
    url "https://github.com/Public-Vinyl-Radio/groovenet/releases/download/groovenet-player-v0.1.11/groovenet-now-playing-0.1.11-macos-universal.zip"
    sha256 "53a5967920b5bb02f2b8cb2f3d8c3981ae921536866a38e796e85ffe2cf787a9"
  end

  APP = "Groovenet Now Playing.app".freeze
  # Written by `groovenet now-playing enable`, the npm package's login item.
  NPM_LOGIN_ITEM = "~/Library/LaunchAgents/radio.publicvinyl.groovenet.nowplaying.plist".freeze

  def install
    system "npm", "install", *std_npm_args
    # Staging enters the zip's only directory, the app bundle itself.
    resource("app").stage { (libexec/APP).install "Contents" }

    # Only this entry is linked. --helper points it at the app above, so it never
    # downloads a copy into ~/.groovenet the way the npm wrapper does.
    entry = opt_libexec/"lib/node_modules/@groovenet/player/build/nowPlayingBin.js"
    helper = opt_libexec/APP/"Contents/MacOS/groovenet-now-playing"
    (bin/"groovenet-now-playing").write <<~SH
      #!/bin/sh
      set -eu

      case "${1:-}" in
        --help|-h)
          echo 'Usage: groovenet-now-playing [--socket PATH | --remote PLAYER_ID]'
          echo
          echo 'With no flag, follows the now_playing_target CLI config key: a remote'
          echo 'player ID, or local (the default). Set it once with:'
          echo '       groovenet config set now_playing_target PLAYER_ID'
          echo
          echo 'Start it at every login with: brew services start groovenet-now-playing'
          exit 0
          ;;
        --build|--install)
          echo "Groovenet Now Playing: Homebrew installs the prebuilt helper; $1 is for the npm package." >&2
          exit 1
          ;;
      esac

      if [ -e "$HOME/Library/LaunchAgents/radio.publicvinyl.groovenet.nowplaying.plist" ]; then
        echo 'Groovenet Now Playing: the npm login item is enabled' \\
          '(~/Library/LaunchAgents/radio.publicvinyl.groovenet.nowplaying.plist).' \\
          'Run `groovenet now-playing disable` first, so only one helper runs.' >&2
        exit 1
      fi

      exec "#{formula_opt_bin("node")}/node" "#{entry}" --helper "#{helper}" "$@"
    SH
  end

  def caveats
    text = <<~EOS
      The helper follows the local Groovenet player daemon by default. To follow a
      remote player, set its ID with the Groovenet CLI (npm i -g @groovenet/cli),
      which also holds the api_base and keys remote mode uses:
        groovenet config set now_playing_target <player-id>

      To start it now and at every login:
        brew services start groovenet-now-playing
      After changing now_playing_target, run `brew services restart groovenet-now-playing`.

      Don't also enable the npm login item (`groovenet now-playing enable`): only
      one helper should run.
    EOS
    if File.exist?(File.expand_path(NPM_LOGIN_ITEM))
      text += <<~EOS

        The npm login item is enabled (#{NPM_LOGIN_ITEM}).
        Run `groovenet now-playing disable` before `brew services start`.
      EOS
    end
    text
  end

  service do
    # Pinned: newer Homebrew defaults to sh.brew.*, and `groovenet now-playing
    # enable` refuses to run beside this service by looking for this label.
    name macos: "homebrew.mxcl.groovenet-now-playing"
    run opt_bin/"groovenet-now-playing"
    # The helper exits when the daemon or remote stream disconnects, so the
    # restart is the reconnect; the throttle stops a dead daemon from spinning.
    keep_alive true
    throttle_interval 30
    log_path var/"log/groovenet-now-playing.log"
    error_log_path var/"log/groovenet-now-playing.log"
  end

  test do
    assert_match "now_playing_target", shell_output("#{bin}/groovenet-now-playing --help")
    system "codesign", "--verify", "--strict", libexec/APP
  end
end
