
import ./style.css;

// Declaration for YouTube Iframe API
declare global {
  interface Window {
    onYouTubeIframeAPIReady: () => void;
    YT: any;
  }
}

type TimerPhase = work | break;

interface ProtocolConfig {
  workMinutes: number;
  breakMinutes: number;
  totalCycles: number;
}

class FocusApp {
  private config: ProtocolConfig = {
    workMinutes: 90,
    breakMinutes: 20,
    totalCycles: 3,
  };

  private currentPhase: TimerPhase = work;
  private currentCycle: number = 1;
  private secondsRemaining: number = 90 * 60;
  private totalPhaseSeconds: number = 90 * 60;
  private timerInterval: number | null = null;
  private isRunning: boolean = false;

  private audioMode: local | youtube = local;
  private ytPlayer: any = null;
  private isYtReady: boolean = false;

  // DOM Elements
  private timerDisplay = document.getElementById(timerDisplay) as HTMLDivElement;
  private phaseBadge = document.getElementById(phaseBadge) as HTMLSpanElement;
  private cycleTracker = document.getElementById(cycleTracker) as HTMLSpanElement;
  private progressBar = document.getElementById(progressBar) as HTMLDivElement;
  private startPauseBtn = document.getElementById(startPauseBtn) as HTMLButtonElement;
  private skipBtn = document.getElementById(skipBtn) as HTMLButtonElement;
  private resetBtn = document.getElementById(resetBtn) as HTMLButtonElement;

  private workInput = document.getElementById(workDurationInput) as HTMLInputElement;
  private breakInput = document.getElementById(breakDurationInput) as HTMLInputElement;
  private cyclesInput = document.getElementById(cyclesInput) as HTMLInputElement;

  private themeToggleBtn = document.getElementById(themeToggleBtn) as HTMLButtonElement;
  private themeIcon = document.getElementById(themeIcon) as HTMLSpanElement;

  private localAudio = document.getElementById(localAudioPlayer) as HTMLAudioElement;
  private autoPlayCheck = document.getElementById(autoPlayAudio) as HTMLInputElement;
  private volumeSlider = document.getElementById(volumeSlider) as HTMLInputElement;
  private sourceLocalBtn = document.getElementById(sourceLocalBtn) as HTMLButtonElement;
  private sourceYtBtn = document.getElementById(sourceYtBtn) as HTMLButtonElement;
  private ytInputContainer = document.getElementById(ytInputContainer) as HTMLDivElement;
  private ytUrlInput = document.getElementById(ytUrlInput) as HTMLInputElement;

  constructor() {
    this.initTheme();
    this.initEventListeners();
    this.initYouTubeAPI();
    this.applyConfig();
  }

  private initTheme(): void {
    const isDark = localStorage.getItem(theme) !== light;
    if (isDark) {
      document.documentElement.classList.add(dark);
      this.themeIcon.innerText = ☀️;
    } else {
      document.documentElement.classList.remove(dark);
      this.themeIcon.innerText = 🌙;
    }
  }

  private toggleTheme(): void {
    const isCurrentlyDark = document.documentElement.classList.contains(dark);
    if (isCurrentlyDark) {
      document.documentElement.classList.remove(dark);
      localStorage.setItem(theme, light);
      this.themeIcon.innerText = 🌙;
    } else {
      document.documentElement.classList.add(dark);
      localStorage.setItem(theme, dark);
      this.themeIcon.innerText = ☀️;
    }
  }

  private initEventListeners(): void {
    this.themeToggleBtn.addEventListener(click, () => this.toggleTheme());
    this.startPauseBtn.addEventListener(click, () => this.toggleTimer());
    this.resetBtn.addEventListener(click, () => this.resetTimer());
    this.skipBtn.addEventListener(click, () => this.skipPhase());

    // Presets
    document.querySelectorAll(.preset-btn).forEach((btn) => {
      btn.addEventListener(click, (e) => {
        const target = e.currentTarget as HTMLElement;
        const preset = target.dataset.preset;
        if (preset === huberman) this.setProtocol(90, 20, 3);
        if (preset === pomodoro) this.setProtocol(25, 5, 4);
        if (preset === 5217) this.setProtocol(52, 17, 3);
      });
    });

    // Custom configuration
    const onConfigChange = () => {
      this.setProtocol(
        parseInt(this.workInput.value) || 25,
        parseInt(this.breakInput.value) || 5,
        parseInt(this.cyclesInput.value) || 1
      );
    };

    this.workInput.addEventListener(change, onConfigChange);
    this.breakInput.addEventListener(change, onConfigChange);
    this.cyclesInput.addEventListener(change, onConfigChange);

    // Audio Selectors
    this.sourceLocalBtn.addEventListener(click, () => this.switchAudioSource(local));
    this.sourceYtBtn.addEventListener(click, () => this.switchAudioSource(youtube));
    this.ytUrlInput.addEventListener(input, () => this.loadYouTubeVideo());
    this.volumeSlider.addEventListener(input, () => this.handleVolumeChange());
  }

  private setProtocol(work: number, rest: number, cycles: number): void {
    this.config.workMinutes = work;
    this.config.breakMinutes = rest;
    this.config.totalCycles = cycles;

    this.workInput.value = work.toString();
    this.breakInput.value = rest.toString();
    this.cyclesInput.value = cycles.toString();

    this.resetTimer();
  }

  private applyConfig(): void {
    this.totalPhaseSeconds = this.currentPhase === work 
      ? this.config.workMinutes * 60 
      : this.config.breakMinutes * 60;
    this.secondsRemaining = this.totalPhaseSeconds;
    this.updateDisplay();
  }

  private toggleTimer(): void {
    if (this.isRunning) {
      this.pauseTimer();
    } else {
      this.startTimer();
    }
  }

  private startTimer(): void {
    this.isRunning = true;
    this.startPauseBtn.innerText = Pause;
    this.startPauseBtn.classList.replace(bg-zinc-900, bg-amber-600);
    this.startPauseBtn.classList.replace(dark:bg-zinc-100, dark:bg-amber-500);

    if (this.currentPhase === work && this.autoPlayCheck.checked) {
      this.playAudio();
    }

    this.timerInterval = window.setInterval(() => {
      if (this.secondsRemaining > 0) {
        this.secondsRemaining--;
        this.updateDisplay();
      } else {
        this.handlePhaseTransition();
      }
    }, 1000);
  }

  private pauseTimer(): void {
    this.isRunning = false;
    this.startPauseBtn.innerText = Resume;
    this.startPauseBtn.classList.replace(bg-amber-600, bg-zinc-900);
    this.startPauseBtn.classList.replace(dark:bg-amber-500, dark:bg-zinc-100);

    if (this.timerInterval) clearInterval(this.timerInterval);
    this.pauseAudio();
  }

  private resetTimer(): void {
    this.pauseTimer();
    this.currentPhase = work;
    this.currentCycle = 1;
    this.startPauseBtn.innerText = Start Focus;
    this.applyConfig();
  }

  private skipPhase(): void {
    this.pauseTimer();
    this.handlePhaseTransition();
  }

  private handlePhaseTransition(): void {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.pauseAudio();

    if (this.currentPhase === work) {
      this.currentPhase = break;
    } else {
      this.currentPhase = work;
      this.currentCycle = this.currentCycle >= this.config.totalCycles ? 1 : this.currentCycle + 1;
    }

    this.applyConfig();
    this.startTimer();
  }

  private updateDisplay(): void {
    const minutes = Math.floor(this.secondsRemaining / 60);
    const seconds = this.secondsRemaining % 60;
    const timeFormatted = `${minutes.toString().padStart(2, 0)}:${seconds.toString().padStart(2, 0)}`;
    
    this.timerDisplay.innerText = timeFormatted;
    document.title = `${timeFormatted} • ${this.currentPhase === work ? Focus : Break}`;

    // Progress bar
    const progress = ((this.totalPhaseSeconds - this.secondsRemaining) / this.totalPhaseSeconds) * 100;
    this.progressBar.style.width = `${progress}%`;

    // Indicators
    this.cycleTracker.innerText = `Cycle ${this.currentCycle} / ${this.config.totalCycles}`;
    if (this.currentPhase === work) {
      this.phaseBadge.innerText = Focus;
      this.phaseBadge.className = text-xs font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300;
      this.progressBar.className = absolute bottom-0 left-0 h-1 bg-emerald-500 transition-all duration-300;
    } else {
      this.phaseBadge.innerText = Break;
      this.phaseBadge.className = text-xs font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wider bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300;
      this.progressBar.className = absolute bottom-0 left-0 h-1 bg-blue-500 transition-all duration-300;
    }
  }

  // --- AUDIO LOGIC ---

  private switchAudioSource(mode: local | youtube): void {
    this.pauseAudio();
    this.audioMode = mode;

    if (mode === local) {
      this.sourceLocalBtn.className = flex-1 py-1.5 px-3 rounded-lg border border-zinc-400 dark:border-zinc-600 bg-zinc-200 dark:bg-zinc-800 font-medium;
      this.sourceYtBtn.className = flex-1 py-1.5 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200;
      this.ytInputContainer.classList.add(hidden);
    } else {
      this.sourceYtBtn.className = flex-1 py-1.5 px-3 rounded-lg border border-zinc-400 dark:border-zinc-600 bg-zinc-200 dark:bg-zinc-800 font-medium;
      this.sourceLocalBtn.className = flex-1 py-1.5 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200;
      this.ytInputContainer.classList.remove(hidden);
    }
  }

  private handleVolumeChange(): void {
    const val = parseFloat(this.volumeSlider.value);
    this.localAudio.volume = val;
    if (this.ytPlayer && this.isYtReady) {
      this.ytPlayer.setVolume(val * 100);
    }
  }

  private playAudio(): void {
    if (this.audioMode === local) {
      this.localAudio.play().catch(() => {
        console.warn(Playback waiting on initial user interaction);
      });
    } else if (this.audioMode === youtube && this.ytPlayer && this.isYtReady) {
      this.ytPlayer.playVideo();
    }
  }

  private pauseAudio(): void {
    this.localAudio.pause();
    if (this.ytPlayer && this.isYtReady) {
      this.ytPlayer.pauseVideo();
    }
  }

  private initYouTubeAPI(): void {
    const tag = document.createElement(script);
    tag.src = https://www.youtube.com/iframe_api;
    const firstScriptTag = document.getElementsByTagName(script)[0];
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

    window.onYouTubeIframeAPIReady = () => {
      this.ytPlayer = new window.YT.Player(ytPlayerContainer, {
        height: 0,
        width: 0,
        playerVars: {
          autoplay: 0,
          controls: 0,
          loop: 1,
        },
        events: {
          onReady: () => {
            this.isYtReady = true;
            this.handleVolumeChange();
          },
        },
      });
    };
  }

  private extractYouTubeID(url: string): string | null {
    const regExp = /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/;
    const match = url.match(regExp);
    return match ? match[1] : null;
  }

  private loadYouTubeVideo(): void {
    const url = this.ytUrlInput.value.trim();
    const videoId = this.extractYouTubeID(url);
    if (videoId && this.ytPlayer && this.isYtReady) {
      this.ytPlayer.cueVideoById(videoId);
    }
  }
}

// Bootstrap application on DOM ready
window.addEventListener(DOMContentLoaded, () => {
  new FocusApp();
});

