# ⏱️ UberMensch

A configurable desktop focus timer with a local audio library and saved YouTube streams.

## Overview

UberMensch is a lightweight desktop focus app built around configurable focus/break cycles. It combines a wall-clock-based timer with a persistent local audio library and saved YouTube videos. The desktop app is built with Tauri v2; the frontend can also run in a browser during development.

## Features

### Focus timer

- **Presets:** Huberman (90 min focus / 20 min break / 3 cycles), Pomodoro (25 / 5 / 4), and Rule 52 / 17 (52 / 17 / 3).
- **Custom sessions:** Set focus duration (1–180 minutes), break duration (1–60 minutes), and target cycles (1–24).
- **Non-destructive edits:** Editing durations while a phase is running or paused does not reset its remaining time or interrupt audio. Updated durations take effect at the next phase. If the current phase has not started, edits update it immediately. Cycle-count edits apply immediately.
- **Pause precision:** Remaining milliseconds are preserved when pausing and resuming.
- **Wall-clock timing:** The timer uses absolute phase deadlines rather than decrementing a counter, reducing accumulated drift when UI updates are delayed or the app is temporarily suspended.
- **Phase alerts:** Phase transitions show an in-app banner, play a short chime, update the window title, and send a system notification when the app is hidden or unfocused (subject to OS notification permission).
- **Cycle flow:** A cycle consists of one focus block followed by its break. The session completes after the final break.
- **Skip and reset:** Skip advances to the next phase; Reset and selecting a preset start a fresh focus session.

### Audio

- **Local tracks:** Import MP3, WAV, M4A, FLAC, AAC, OGG, and other browser-supported audio files. Imported files are stored in IndexedDB for reuse in the same app storage profile.
- **Saved YouTube streams:** Save supported YouTube watch, youtu.be, embed, Shorts, and Live links with title, channel, thumbnail, and video ID metadata.
- **Media toolbar:** Previous, Play/Pause, Stop, Next, and volume controls work with the selected audio source.
- **YouTube playback:** The app uses the YouTube IFrame Player API and handles single-video looping. Some videos cannot be embedded because of their privacy, availability, or embedding settings.
- **Packaged desktop builds:** The YouTube player page is served from a small HTTP server bound only to `127.0.0.1` on an ephemeral port. This gives the embedded player a conventional HTTP origin/referrer in packaged Tauri WebViews while leaving the main app window on Tauri's normal origin. Browser development uses the current HTTP(S) origin.

### Interface

- Dark and light themes, with the selected theme remembered between launches.
- A minimal timer display with focus/break state and cycle progress.
- Notification permission is requested when a session is started.

## Install on macOS with Homebrew

UberMensch is distributed through the [Maverick Real Homebrew tap](https://github.com/maverickreal/homebrew-tap). The current cask is for **Apple Silicon (ARM64)** and requires **macOS Sonoma or newer**.

### 1. Install Homebrew

If Homebrew is not already installed, follow the instructions at [brew.sh](https://brew.sh/).

### 2. Add the tap and install UberMensch

```sh
brew tap maverickreal/homebrew-tap
brew install --cask ubermensch
```

To upgrade to a newer release:

```sh
brew update
brew upgrade --cask ubermensch
```

To uninstall:

```sh
brew uninstall --cask ubermensch
```

### 3. First launch: remove the macOS quarantine attribute

The distributed app is currently **not notarized/signed in a way that satisfies Gatekeeper**, so macOS may block it the first time you open it. After installing it with Homebrew, run:

```sh
xattr -cr /Applications/UberMensch.app
```

Then open UberMensch from Applications or Spotlight.

If you installed it somewhere other than `/Applications`, adjust the app path accordingly. For example, to remove the quarantine attribute from an app in your Downloads folder:

```sh
xattr -cr "$HOME/Downloads/UberMensch.app"
```

This removes the quarantine metadata from **UberMensch.app only**. It does not disable Gatekeeper system-wide. You may be prompted for your macOS password; Terminal does not display password characters while you type.

If macOS still blocks the app, check **System Settings → Privacy & Security** for an option to allow the blocked app, and verify that you downloaded it from the official release/tap. Do not disable Gatekeeper globally.

## Install manually (macOS)

You can also download the disk image directly from the [UberMensch Releases page](https://github.com/maverickreal/UberMensch/releases).

1. Download the `.dmg` asset for your release (the current Homebrew cask targets Apple Silicon).
2. Open the disk image and drag `UberMensch.app` into `/Applications`.
3. Run the quarantine-removal command shown above:

   ```sh
   xattr -cr /Applications/UberMensch.app
   ```

4. Launch UberMensch from Applications or Spotlight.

## Getting started (development)

### Prerequisites

- [Bun](https://bun.sh/)
- [Rust and Cargo](https://rustup.rs/) (for Tauri desktop builds)
- On macOS, Xcode Command Line Tools (`xcode-select --install`)

### Clone and install dependencies

```sh
git clone https://github.com/maverickreal/UberMensch.git
cd UberMensch
bun install
```

### Run in a browser

```sh
bun run dev
```

Open the Vite URL printed in the terminal (the project currently configures port 3000).

### Run the desktop app in development

```sh
bun tauri dev
```

### Build a desktop bundle

```sh
bun tauri build
```

Tauri writes packaged artifacts under `src-tauri/target/release/bundle/`.

## Releases and Homebrew updates

Releases are automated through GitHub Actions. The workflow builds a macOS Apple Silicon release when a `v*` tag is pushed or the workflow is manually dispatched. The release workflow uploads the `.dmg` and app archive to the [UberMensch GitHub Releases](https://github.com/maverickreal/UberMensch/releases) page and updates the [Homebrew tap](https://github.com/maverickreal/homebrew-tap) cask version and SHA-256 checksum.

## Troubleshooting

| Symptom | What to check |
| ----- | ----- |
| macOS says the app cannot be opened because it is from an unidentified developer | Run the app-specific `xattr` command in [First launch](#3-first-launch-remove-the-macos-quarantine-attribute), then launch again. |
| `brew install --cask ubermensch` cannot find the cask | Run `brew tap maverickreal/homebrew-tap`, then `brew update`, and retry. |
| Homebrew reports an unsupported macOS version or architecture | The current cask targets Apple Silicon (`arm64`) and macOS Sonoma or newer. |
| YouTube remains on “Connecting” | Check the internet connection and whether a network filter blocks `youtube.com` or the IFrame API. |
| YouTube error 101 or 150 | The video owner has disabled embedded playback; try a different video. |
| YouTube error 100 | The video may be private, removed, or unavailable. |
| YouTube error 153 in a packaged build | Confirm the app includes `public/yt-player.html` and the Rust loopback player endpoint starts successfully. |
| Local audio does not autoplay | Start playback manually from the media toolbar; WebView autoplay policies can vary by platform. |
| No system notification appears | Check the operating system's notification permission for UberMensch. |

## Project layout

```text
index.html                 App markup
src/main.ts                Timer engine, audio library, YouTube bridge, alerts
src/style.css              Global styles and phase-change animation
public/yt-player.html      YouTube IFrame API page
src-tauri/src/lib.rs       Tauri setup and loopback player-page server
scripts/release.ts         Release helper
```

## License

MIT. See [LICENSE](LICENSE).
