# ⏱️ UberMensch

A protocol-agnostic, distraction-free desktop focus engine and ambient audio companion.

## Overview

**UberMensch** is a lightweight, zero-subscription desktop focus application designed for deep work. Rather than enforcing a rigid methodology, it provides a protocol-agnostic timing engine coupled with integrated ambient audio options (offline local audio imports and persistent YouTube streaming).

Built as a high-performance single-page application wrapped in **Tauri v2**, UberMensch runs natively on Apple Silicon with minimal RAM overhead and zero background drift.

## Key Features

* **Protocol-Agnostic Engine:** Switch effortlessly between established productivity intervals or configure custom work sessions, rest breaks, and cycle frequencies:

  * **Huberman Ultradian:** 90m focus / 20m break

  * **Classic Pomodoro:** 25m focus / 5m break

  * **Rule 52 / 17:** 52m focus / 17m break

  * **Custom Intervals:** Fully adjustable focus duration, break duration, and target cycle limits.

* **Drift-Free Wall-Clock Timing:** Calculated against absolute system timestamps (`Date.now()`). The countdown never drifts or freezes, even across system sleep, background tab throttling, or multi-hour cycles.

* **Persistent Local Audio Library:** Import audio files (`.mp3`, `.wav`, `.m4a`, `.flac`, `.aac`) directly from disk. Files are converted to raw `ArrayBuffer` binaries and stored permanently in **IndexedDB**—available offline forever with zero cloud dependencies.

* **YouTube Ambient Streaming:** Save focus streams or brown noise tracks by link. UberMensch automatically retrieves stream metadata (title, creator, thumbnail) via oEmbed and plays audio through an embedded headless player.

* **Dedicated Media Toolbar:** Full playback controls (Previous, Play/Pause, Stop, Next, and Volume Slider) with real-time audio state indicators and seamless audio handoffs during active focus sessions.

* **Distraction & Accident Guard:** Prevents accidental window closes and page reloads (`beforeunload`) while an active session is in progress.

* **Native Look & Feel:** Clean dark/light theme toggle, minimalist typography, and tailored macOS window styling.

## Tech Stack

| Layer | Technology | 
| ----- | ----- | 
| **Desktop Framework** | [Tauri v2](https://tauri.app/) (Rust native wrapper) | 
| **Runtime & Package Manager** | [Bun](https://bun.sh/) | 
| **Bundler & Build Tool** | [Vite](https://vitejs.dev/) | 
| **Language** | [TypeScript](https://www.typescriptlang.org/) (Strict Mode) | 
| **Styling** | [Tailwind CSS](https://tailwindcss.com/) | 
| **Local Storage** | WebKit [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) | 

## Getting Started

### Prerequisites

* [Bun](https://bun.sh/) (v1.0+)

* [Rust & Cargo](https://rustup.rs/) (for Tauri desktop compilation)

* macOS with Xcode Command Line Tools (`xcode-select --install`)

### Installation & Local Development

1. **Clone the repository:**

   ```
   git clone https://github.com/maverickreal/UberMensch.git
   cd UberMensch
   
   ```

2. **Install dependencies:**

   ```
   bun install
   
   ```

3. **Run the Vite development server (Browser Mode):**

   ```
   bun run dev
   
   ```

   Open `http://localhost:3000` in Safari or Chrome.

4. **Launch the Native Desktop App (Tauri Dev Mode):**

   ```
   bun tauri dev
   
   ```

## Building the Desktop App

To compile a production `.dmg` installer and standalone `.app` bundle for Apple Silicon (macOS):

```
bun tauri build

```

Compiled binaries are output to:

```
src-tauri/target/release/bundle/
├── dmg/
│   └── UberMensch_<version>_aarch64.dmg
└── macos/
    └── UberMensch.app

```

## CI / CD Deployment

This repository includes an automated GitHub Actions pipeline (`.github/workflows/release.yml`).

Pushing a semver tag automatically compiles the app on a native Apple Silicon runner (`macos-14`) and attaches the `.dmg` installer directly to a new GitHub Release:

```
git tag v0.1.0
git push origin v0.1.0

```

## License

This project is licensed under the [MIT License](LICENSE).