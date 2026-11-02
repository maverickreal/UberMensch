import './style.css';

declare global {
  interface Window {
    onYouTubeIframeAPIReady: () => void;
    YT: any;
  }
}

type TimerPhase = 'work' | 'break';

interface ProtocolConfig {
  workMinutes: number;
  breakMinutes: number;
  totalCycles: number;
}

interface StoredTrack {
  id: string;
  name: string;
  blob: Blob;
  createdAt: number;
}

interface YouTubeStream {
  id: string;
  videoId: string;
  url: string;
  title: string;
  author: string;
  thumbnailUrl: string;
  createdAt: number;
}

// Unified IndexedDB Layer for Audio Files & YouTube Streams
class AppStorage {
  private dbName = 'UberMenschAudioDB';
  private dbVersion = 2; // Upgraded for youtube_streams store
  private db: IDBDatabase | null = null;

  public async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('tracks')) {
          db.createObjectStore('tracks', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('youtube_streams')) {
          db.createObjectStore('youtube_streams', { keyPath: 'id' });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  }

  // --- Track Methods ---
  public async saveTrack(file: File): Promise<StoredTrack> {
    const track: StoredTrack = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      name: file.name,
      blob: file,
      createdAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      if (!this.db) return reject('Database not initialized');
      const tx = this.db.transaction('tracks', 'readwrite');
      const store = tx.objectStore('tracks');
      store.add(track);
      tx.oncomplete = () => resolve(track);
      tx.onerror = () => reject(tx.error);
    });
  }

  public async getAllTracks(): Promise<StoredTrack[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject('Database not initialized');
      const tx = this.db.transaction('tracks', 'readonly');
      const store = tx.objectStore('tracks');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  public async deleteTrack(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject('Database not initialized');
      const tx = this.db.transaction('tracks', 'readwrite');
      const store = tx.objectStore('tracks');
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // --- YouTube Stream Methods ---
  public async saveYouTubeStream(stream: YouTubeStream): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject('Database not initialized');
      const tx = this.db.transaction('youtube_streams', 'readwrite');
      const store = tx.objectStore('youtube_streams');
      store.put(stream);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public async getAllYouTubeStreams(): Promise<YouTubeStream[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject('Database not initialized');
      const tx = this.db.transaction('youtube_streams', 'readonly');
      const store = tx.objectStore('youtube_streams');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  public async deleteYouTubeStream(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject('Database not initialized');
      const tx = this.db.transaction('youtube_streams', 'readwrite');
      const store = tx.objectStore('youtube_streams');
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

class FocusApp {
  private config: ProtocolConfig = {
    workMinutes: 90,
    breakMinutes: 20,
    totalCycles: 3,
  };

  private currentPhase: TimerPhase = 'work';
  private currentCycle: number = 1;
  private secondsRemaining: number = 90 * 60;
  private totalPhaseSeconds: number = 90 * 60;
  private timerInterval: number | null = null;
  private isRunning: boolean = false;

  private audioMode: 'local' | 'youtube' = 'local';
  private appStorage = new AppStorage();
  
  // Local Tracks State
  private tracks: StoredTrack[] = [];
  private activeTrackUrl: string | null = null;

  // YouTube State
  private ytStreams: YouTubeStream[] = [];
  private activeYtStream: YouTubeStream | null = null;
  private ytPlayer: any = null;
  private isYtReady: boolean = false;

  // DOM Elements
  private timerDisplay = document.getElementById('timerDisplay') as HTMLDivElement;
  private phaseBadge = document.getElementById('phaseBadge') as HTMLSpanElement;
  private cycleTracker = document.getElementById('cycleTracker') as HTMLSpanElement;
  private progressBar = document.getElementById('progressBar') as HTMLDivElement;
  private startPauseBtn = document.getElementById('startPauseBtn') as HTMLButtonElement;
  private skipBtn = document.getElementById('skipBtn') as HTMLButtonElement;
  private resetBtn = document.getElementById('resetBtn') as HTMLButtonElement;

  private workInput = document.getElementById('workDurationInput') as HTMLInputElement;
  private breakInput = document.getElementById('breakDurationInput') as HTMLInputElement;
  private cyclesInput = document.getElementById('cyclesInput') as HTMLInputElement;

  private themeToggleBtn = document.getElementById('themeToggleBtn') as HTMLButtonElement;
  private themeIcon = document.getElementById('themeIcon') as HTMLSpanElement;

  private localAudio = document.getElementById('localAudioPlayer') as HTMLAudioElement;
  private autoPlayCheck = document.getElementById('autoPlayAudio') as HTMLInputElement;
  private volumeSlider = document.getElementById('volumeSlider') as HTMLInputElement;
  private sourceLocalBtn = document.getElementById('sourceLocalBtn') as HTMLButtonElement;
  private sourceYtBtn = document.getElementById('sourceYtBtn') as HTMLButtonElement;
  private localAudioContainer = document.getElementById('localAudioContainer') as HTMLDivElement;
  private ytInputContainer = document.getElementById('ytInputContainer') as HTMLDivElement;

  // Local Tracks UI
  private audioTrackSelect = document.getElementById('audioTrackSelect') as HTMLSelectElement;
  private audioFileInput = document.getElementById('audioFileInput') as HTMLInputElement;
  private deleteTrackBtn = document.getElementById('deleteTrackBtn') as HTMLButtonElement;
  private audioFileMeta = document.getElementById('audioFileMeta') as HTMLParagraphElement;

  // YouTube UI
  private ytUrlInput = document.getElementById('ytUrlInput') as HTMLInputElement;
  private addYtBtn = document.getElementById('addYtBtn') as HTMLButtonElement;
  private ytStreamSelect = document.getElementById('ytStreamSelect') as HTMLSelectElement;
  private deleteYtBtn = document.getElementById('deleteYtBtn') as HTMLButtonElement;
  private ytInfoCard = document.getElementById('ytInfoCard') as HTMLDivElement;
  private ytThumb = document.getElementById('ytThumb') as HTMLImageElement;
  private ytTitle = document.getElementById('ytTitle') as HTMLHeadingElement;
  private ytAuthor = document.getElementById('ytAuthor') as HTMLParagraphElement;
  private ytIdTag = document.getElementById('ytIdTag') as HTMLSpanElement;
  private ytExternalLink = document.getElementById('ytExternalLink') as HTMLAnchorElement;
  private ytStatusMeta = document.getElementById('ytStatusMeta') as HTMLParagraphElement;

  constructor() {
    this.initTheme();
    this.initEventListeners();
    this.initYouTubeAPI();
    this.initStorageAndMedia();
    this.applyConfig();
  }

  private initTheme(): void {
    const isDark = localStorage.getItem('theme') !== 'light';
    if (isDark) {
      document.documentElement.classList.add('dark');
      this.themeIcon.innerText = '☀️';
    } else {
      document.documentElement.classList.remove('dark');
      this.themeIcon.innerText = '🌙';
    }
  }

  private toggleTheme(): void {
    const isCurrentlyDark = document.documentElement.classList.contains('dark');
    if (isCurrentlyDark) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
      this.themeIcon.innerText = '🌙';
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
      this.themeIcon.innerText = '☀️';
    }
  }

  private initEventListeners(): void {
    this.themeToggleBtn.addEventListener('click', () => this.toggleTheme());
    this.startPauseBtn.addEventListener('click', () => this.toggleTimer());
    this.resetBtn.addEventListener('click', () => this.resetTimer());
    this.skipBtn.addEventListener('click', () => this.skipPhase());

    // Presets
    document.querySelectorAll('.preset-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const preset = target.dataset.preset;
        if (preset === 'huberman') this.setProtocol(90, 20, 3);
        if (preset === 'pomodoro') this.setProtocol(25, 5, 4);
        if (preset === '5217') this.setProtocol(52, 17, 3);
      });
    });

    const onConfigChange = () => {
      this.setProtocol(
        parseInt(this.workInput.value) || 25,
        parseInt(this.breakInput.value) || 5,
        parseInt(this.cyclesInput.value) || 1
      );
    };

    this.workInput.addEventListener('change', onConfigChange);
    this.breakInput.addEventListener('change', onConfigChange);
    this.cyclesInput.addEventListener('change', onConfigChange);

    // Audio source switches
    this.sourceLocalBtn.addEventListener('click', () => this.switchAudioSource('local'));
    this.sourceYtBtn.addEventListener('click', () => this.switchAudioSource('youtube'));
    this.volumeSlider.addEventListener('input', () => this.handleVolumeChange());

    // Local Tracks
    this.audioFileInput.addEventListener('change', (e) => this.handleFileImport(e));
    this.audioTrackSelect.addEventListener('change', () => this.handleTrackSelect());
    this.deleteTrackBtn.addEventListener('click', () => this.handleDeleteTrack());

    // YouTube Streams
    this.addYtBtn.addEventListener('click', () => this.handleSaveYouTubeStream());
    this.ytUrlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleSaveYouTubeStream();
    });
    this.ytStreamSelect.addEventListener('change', () => this.handleYouTubeSelect());
    this.deleteYtBtn.addEventListener('click', () => this.handleDeleteYouTubeStream());
  }

  // --- INITIALIZATION ---

  private async initStorageAndMedia(): Promise<void> {
    try {
      await this.appStorage.init();
      
      // Load Local Audio Tracks
      this.tracks = await this.appStorage.getAllTracks();
      this.renderTrackOptions();
      const lastSelectedTrackId = localStorage.getItem('selectedTrackId');
      if (lastSelectedTrackId && this.tracks.some(t => t.id === lastSelectedTrackId)) {
        this.audioTrackSelect.value = lastSelectedTrackId;
      }
      this.handleTrackSelect();

      // Load YouTube Streams
      this.ytStreams = await this.appStorage.getAllYouTubeStreams();
      this.renderYouTubeOptions();
      const lastSelectedYtId = localStorage.getItem('selectedYtStreamId');
      if (lastSelectedYtId && this.ytStreams.some(s => s.id === lastSelectedYtId)) {
        this.ytStreamSelect.value = lastSelectedYtId;
      }
      this.handleYouTubeSelect();
    } catch (err) {
      console.error('Failed to initialize storage and media:', err);
    }
  }

  // --- LOCAL TRACKS MANAGEMENT ---

  private renderTrackOptions(): void {
    this.audioTrackSelect.innerHTML = '';

    if (this.tracks.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.innerText = 'No audio files imported';
      option.disabled = true;
      option.selected = true;
      this.audioTrackSelect.appendChild(option);
      this.deleteTrackBtn.disabled = true;
      this.audioFileMeta.innerText = 'Upload audio files (.mp3, .wav, .m4a, etc.). Stored permanently in your browser.';
      return;
    }

    this.deleteTrackBtn.disabled = false;
    this.tracks.forEach((track) => {
      const option = document.createElement('option');
      option.value = track.id;
      option.innerText = track.name;
      this.audioTrackSelect.appendChild(option);
    });
  }

  private async handleFileImport(event: Event): Promise<void> {
    const target = event.target as HTMLInputElement;
    if (!target.files || target.files.length === 0) return;

    const file = target.files[0];
    try {
      const savedTrack = await this.appStorage.saveTrack(file);
      this.tracks.push(savedTrack);
      this.renderTrackOptions();
      this.audioTrackSelect.value = savedTrack.id;
      this.handleTrackSelect();
    } catch (err) {
      console.error('Failed to save audio file:', err);
    } finally {
      target.value = '';
    }
  }

  private handleTrackSelect(): void {
    const selectedId = this.audioTrackSelect.value;
    const track = this.tracks.find(t => t.id === selectedId);

    if (this.activeTrackUrl) {
      URL.revokeObjectURL(this.activeTrackUrl);
      this.activeTrackUrl = null;
    }

    if (track) {
      localStorage.setItem('selectedTrackId', track.id);
      this.activeTrackUrl = URL.createObjectURL(track.blob);
      this.localAudio.src = this.activeTrackUrl;
      const sizeMb = (track.blob.size / (1024 * 1024)).toFixed(2);
      this.audioFileMeta.innerText = `Active: ${track.name} (${sizeMb} MB) • Loop enabled`;
    } else {
      this.localAudio.removeAttribute('src');
    }
  }

  private async handleDeleteTrack(): Promise<void> {
    const selectedId = this.audioTrackSelect.value;
    if (!selectedId) return;

    try {
      await this.appStorage.deleteTrack(selectedId);
      this.tracks = this.tracks.filter(t => t.id !== selectedId);
      this.renderTrackOptions();
      if (this.tracks.length > 0) {
        this.audioTrackSelect.value = this.tracks[0].id;
      }
      this.handleTrackSelect();
    } catch (err) {
      console.error('Failed to delete track:', err);
    }
  }

  // --- YOUTUBE STREAMS MANAGEMENT ---

  private extractYouTubeID(url: string): string | null {
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    return match ? match[1] : null;
  }

  private async fetchYouTubeMetadata(videoId: string): Promise<{ title: string; author: string }> {
    try {
      const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
      if (response.ok) {
        const data = await response.json();
        return {
          title: data.title || `YouTube Video (${videoId})`,
          author: data.author_name || 'YouTube',
        };
      }
    } catch (e) {
      console.warn('oEmbed request failed, fallback to defaults', e);
    }
    return {
      title: `YouTube Stream (${videoId})`,
      author: 'YouTube',
    };
  }

  private async handleSaveYouTubeStream(): Promise<void> {
    const rawUrl = this.ytUrlInput.value.trim();
    if (!rawUrl) return;

    const videoId = this.extractYouTubeID(rawUrl);
    if (!videoId) {
      alert('Please provide a valid YouTube URL (e.g., https://www.youtube.com/watch?v=... or https://youtu.be/...)');
      return;
    }

    this.addYtBtn.disabled = true;
    this.addYtBtn.innerText = 'Saving...';

    const metadata = await this.fetchYouTubeMetadata(videoId);
    const newStream: YouTubeStream = {
      id: videoId,
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      title: metadata.title,
      author: metadata.author,
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      createdAt: Date.now(),
    };

    try {
      await this.appStorage.saveYouTubeStream(newStream);
      
      const existingIdx = this.ytStreams.findIndex(s => s.id === newStream.id);
      if (existingIdx !== -1) {
        this.ytStreams[existingIdx] = newStream;
      } else {
        this.ytStreams.push(newStream);
      }

      this.renderYouTubeOptions();
      this.ytStreamSelect.value = newStream.id;
      this.handleYouTubeSelect();
      this.ytUrlInput.value = '';
    } catch (err) {
      console.error('Failed to save YouTube stream:', err);
    } finally {
      this.addYtBtn.disabled = false;
      this.addYtBtn.innerText = '+ Save Stream';
    }
  }

  private renderYouTubeOptions(): void {
    this.ytStreamSelect.innerHTML = '';

    if (this.ytStreams.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.innerText = 'No saved YouTube streams';
      option.disabled = true;
      option.selected = true;
      this.ytStreamSelect.appendChild(option);
      this.deleteYtBtn.disabled = true;
      this.ytInfoCard.classList.add('hidden');
      return;
    }

    this.deleteYtBtn.disabled = false;
    this.ytStreams.forEach((stream) => {
      const option = document.createElement('option');
      option.value = stream.id;
      option.innerText = `${stream.title} (${stream.author})`;
      this.ytStreamSelect.appendChild(option);
    });
  }

  private handleYouTubeSelect(): void {
    const selectedId = this.ytStreamSelect.value;
    const stream = this.ytStreams.find(s => s.id === selectedId);

    if (stream) {
      this.activeYtStream = stream;
      localStorage.setItem('selectedYtStreamId', stream.id);

      // Populate Info Card
      this.ytThumb.src = stream.thumbnailUrl;
      this.ytTitle.innerText = stream.title;
      this.ytAuthor.innerText = stream.author;
      this.ytIdTag.innerText = stream.videoId;
      this.ytExternalLink.href = stream.url;
      this.ytInfoCard.classList.remove('hidden');

      // Cue inside headless YouTube player
      if (this.ytPlayer && this.isYtReady) {
        this.ytPlayer.cueVideoById(stream.videoId);
      }
    } else {
      this.activeYtStream = null;
      this.ytInfoCard.classList.add('hidden');
    }
  }

  private async handleDeleteYouTubeStream(): Promise<void> {
    const selectedId = this.ytStreamSelect.value;
    if (!selectedId) return;

    try {
      await this.appStorage.deleteYouTubeStream(selectedId);
      this.ytStreams = this.ytStreams.filter(s => s.id !== selectedId);
      this.renderYouTubeOptions();
      if (this.ytStreams.length > 0) {
        this.ytStreamSelect.value = this.ytStreams[0].id;
      }
      this.handleYouTubeSelect();
    } catch (err) {
      console.error('Failed to delete YouTube stream:', err);
    }
  }

  // --- TIMER PROTOCOL ENGINE ---

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
    this.totalPhaseSeconds = this.currentPhase === 'work' 
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
    this.startPauseBtn.innerText = 'Pause';
    this.startPauseBtn.classList.replace('bg-zinc-900', 'bg-amber-600');
    this.startPauseBtn.classList.replace('dark:bg-zinc-100', 'dark:bg-amber-500');

    if (this.currentPhase === 'work' && this.autoPlayCheck.checked) {
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
    this.startPauseBtn.innerText = 'Resume';
    this.startPauseBtn.classList.replace('bg-amber-600', 'bg-zinc-900');
    this.startPauseBtn.classList.replace('dark:bg-amber-500', 'dark:bg-zinc-100');

    if (this.timerInterval) clearInterval(this.timerInterval);
    this.pauseAudio();
  }

  private resetTimer(): void {
    this.pauseTimer();
    this.currentPhase = 'work';
    this.currentCycle = 1;
    this.startPauseBtn.innerText = 'Start Focus';
    this.applyConfig();
  }

  private skipPhase(): void {
    this.pauseTimer();
    this.handlePhaseTransition();
  }

  private handlePhaseTransition(): void {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.pauseAudio();

    if (this.currentPhase === 'work') {
      this.currentPhase = 'break';
    } else {
      this.currentPhase = 'work';
      this.currentCycle = this.currentCycle >= this.config.totalCycles ? 1 : this.currentCycle + 1;
    }

    this.applyConfig();
    this.startTimer();
  }

  private updateDisplay(): void {
    const minutes = Math.floor(this.secondsRemaining / 60);
    const seconds = this.secondsRemaining % 60;
    const timeFormatted = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    this.timerDisplay.innerText = timeFormatted;
    document.title = `${timeFormatted} • ${this.currentPhase === 'work' ? 'Focus' : 'Break'} | UberMensch`;

    const progress = ((this.totalPhaseSeconds - this.secondsRemaining) / this.totalPhaseSeconds) * 100;
    this.progressBar.style.width = `${progress}%`;

    this.cycleTracker.innerText = `Cycle ${this.currentCycle} / ${this.config.totalCycles}`;
    if (this.currentPhase === 'work') {
      this.phaseBadge.innerText = 'Focus';
      this.phaseBadge.className = 'text-xs font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300';
      this.progressBar.className = 'absolute bottom-0 left-0 h-1 bg-emerald-500 transition-all duration-300';
    } else {
      this.phaseBadge.innerText = 'Break';
      this.phaseBadge.className = 'text-xs font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wider bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300';
      this.progressBar.className = 'absolute bottom-0 left-0 h-1 bg-blue-500 transition-all duration-300';
    }
  }

  // --- AUDIO CONTROLLER ---

  private switchAudioSource(mode: 'local' | 'youtube'): void {
    this.pauseAudio();
    this.audioMode = mode;

    if (mode === 'local') {
      this.sourceLocalBtn.className = 'flex-1 py-1.5 px-3 rounded-lg border border-zinc-400 dark:border-zinc-600 bg-zinc-200 dark:bg-zinc-800 font-medium transition-colors';
      this.sourceYtBtn.className = 'flex-1 py-1.5 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors';
      this.localAudioContainer.classList.remove('hidden');
      this.ytInputContainer.classList.add('hidden');
    } else {
      this.sourceYtBtn.className = 'flex-1 py-1.5 px-3 rounded-lg border border-zinc-400 dark:border-zinc-600 bg-zinc-200 dark:bg-zinc-800 font-medium transition-colors';
      this.sourceLocalBtn.className = 'flex-1 py-1.5 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors';
      this.localAudioContainer.classList.add('hidden');
      this.ytInputContainer.classList.remove('hidden');
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
    if (this.audioMode === 'local' && this.localAudio.src) {
      this.localAudio.play().catch(() => {
        console.warn('Waiting on user gesture for audio playback');
      });
    } else if (this.audioMode === 'youtube' && this.ytPlayer && this.isYtReady && this.activeYtStream) {
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
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

    window.onYouTubeIframeAPIReady = () => {
      this.ytPlayer = new window.YT.Player('ytPlayerContainer', {
        height: '0',
        width: '0',
        playerVars: {
          autoplay: 0,
          controls: 0,
          loop: 1,
        },
        events: {
          onReady: () => {
            this.isYtReady = true;
            this.handleVolumeChange();
            if (this.activeYtStream) {
              this.ytPlayer.cueVideoById(this.activeYtStream.videoId);
            }
          },
        },
      });
    };
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new FocusApp();
});
