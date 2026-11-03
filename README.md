# ⏱️ UberMensch

A configurable desktop focus timer with a local audio library and saved YouTube streams.

## Overview

UberMensch is a lightweight focus timer built with TypeScript, Vite, and Tauri v2. It supports configurable focus/break cycles, a persistent local audio library, and saved YouTube videos controlled from the app's media toolbar.

## Features

### Focus timer

- **Presets:** Huberman (90 min focus / 20 min break / 3 cycles), Pomodoro (25 / 5 / 4), and Rule 52 / 17 (52 / 17 / 3).
- **Custom sessions:** Focus duration from 1–180 minutes, break duration from 1–60 minutes, and 1–24 target cycles.
- **Non-destructive edits:** Editing durations while a phase is running or paused does not reset its remaining time. New durations apply at the next phase. When a phase has not started yet, edits update it immediately. Cycle-count edits apply immediately.
- **Pause precision:** Remaining milliseconds are preserved when pausing and resuming.
- **Wall-clock timing:** The timer uses absolute phase deadlines instead of decrementing a counter. It catches up across delayed UI ticks and background suspensions by advancing from scheduled phase boundaries.
- **Phase alerts:** Phase transitions show an in-app banner, play a short chime, update the window title, and send a system notification when the app is hidden or unfocused (subject to OS notification permission).
- **Cycle flow:** A cycle consists of one focus block followed by its break. The session completes after the final break.
- **Skip and reset:** Skip advances silently; Reset and selecting a preset start a fresh focus session.

### Audio

- **Local tracks:** Import MP3, WAV, M4A, FLAC, AAC, OGG, and other browser-supported audio files. Imported files are stored in IndexedDB for reuse in the same app storage profile.
- **Saved YouTube streams:** Save supported YouTube watch, youtu.be, embed, Shorts, and Live links with title, channel, thumbnail, and video ID metadata.
- **Media toolbar:** Previous, Play/Pause, Stop, Next, and volume controls work with the selected audio source.
- **YouTube playback:** The app uses the YouTube IFrame Player API and loops the selected single video while playback remains active. Some videos cannot be embedded because of their privacy, availability, or embedding settings.
- **Packaged desktop builds:** The YouTube player document is served by a small HTTP server bound only to `127.0.0.1` on an ephemeral port. This gives the embedded player a conventional HTTP origin/referrer in packaged Tauri WebViews while leaving the main app window on Tauri's normal origin. Browser development uses the current HTTP(S) origin.

### Interface

- Dark and light themes, with the selected theme remembered between launches.
- A minimal timer display with focus/break state and cycle progress.
- Notification permission is requested when a session is started.

## Tech stack

| Layer | Technology |
| ----- | ----- |
| Desktop framework | Tauri v2 and Rust |
| Frontend language | TypeScript |
| Dev server and bundler | Vite |
| Styling | Tailwind CSS |
| Package manager | Bun |
| Local persistence | IndexedDB and localStorage |

## Getting started

### Prerequisites

- Bun
- Rust and Cargo (for desktop builds)
- On macOS, Xcode Command Line Tools (`xcode-select --install`)

### Install dependencies

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

Tauri writes packaged artifacts under `src-tauri/target/release/bundle/`. The checked-in release workflow currently builds a macOS Apple Silicon release when a `v*` tag is pushed or the workflow is manually dispatched.

## Troubleshooting

| Symptom | What to check |
| ----- | ----- |
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
