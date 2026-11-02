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
  buffer?: ArrayBuffer;
  blob?: Blob;
  type?: string;
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

// Unified IndexedDB Layer
class AppStorage {
  private dbName = 'UberMenschAudioDB';
  private dbVersion = 3;
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

  public async saveTrack(file: File): Promise<StoredTrack> {
    const buffer = await file.arrayBuffer();
    const track: StoredTrack = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      name: file.name,
      buffer,
      type: file.type || 'audio/mpeg',
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
  
  private phaseEndTime: number | null = null;

  private audioMode: 'local' | 'youtube' = 'local';
  private isMediaPlaying: boolean = false;
  private appStorage = new AppStorage();
  
  private tracks: StoredTrack[] = [];
  private activeTrackUrl: string | null = null;

  private ytStreams: YouTubeStream[] = [];
  private activeYtStream: YouTubeStream | null = null;
  private ytPlayer: any = null;
  private isYtReady: boolean = false;

  // DOM Elements - Timer
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

  // Audio Controls
  private localAudio = document.getElementById('localAudioPlayer') as HTMLAudioElement;
  private autoPlayCheck = document.getElementById('autoPlayAudio') as HTMLInputElement;
  private volumeSlider = document.getElementById('volumeSlider') as HTMLInputElement;
  private sourceLocalBtn = document.getElementById('sourceLocalBtn') as HTMLButtonElement;
  private sourceYtBtn = document.getElementById('sourceYtBtn') as HTMLButtonElement;
  private ytTabDot = document.getElementById('ytTabDot') as HTMLSpanElement;
  private localAudioContainer = document.getElementById('localAudioContainer') as HTMLDivElement;
  private ytInputContainer = document.getElementById('ytInputContainer') as HTMLDivElement;
  private ytApiBanner = document.getElementById('ytApiBanner') as HTMLDivElement;

  // Local Tracks UI
  private audioTrackSelect = document.getElementById('audioTrackSelect') as HTMLSelectElement;
  private audioFileInput = document.getElementById('audioFileInput') as HTMLInputElement;
  private deleteTrackBtn = document.getElementById('deleteTrackBtn') as HTMLButtonElement;
  private audioFileMeta = document.getElementById('audioFileMeta') as HTMLParagraphElement;
  private importBtnLabel = document.getElementById('importBtnLabel') as HTMLLabelElement;
  private importSpinner = document.getElementById('importSpinner') as unknown as SVGElement;
  private importBtnText = document.getElementById('importBtnText') as HTMLSpanElement;

  // YouTube UI
  private ytUrlInput = document.getElementById('ytUrlInput') as HTMLInputElement;
  private addYtBtn = document.getElementById('addYtBtn') as HTMLButtonElement;
  private ytSaveSpinner = document.getElementById('ytSaveSpinner') as unknown as SVGElement;
  private addYtBtnText = document.getElementById('addYtBtnText') as HTMLSpanElement;
  private ytStreamSelect = document.getElementById('ytStreamSelect') as HTMLSelectElement;
  private deleteYtBtn = document.getElementById('deleteYtBtn') as HTMLButtonElement;
  private ytInfoCard = document.getElementById('ytInfoCard') as HTMLDivElement;
  private ytThumb = document.getElementById('ytThumb') as HTMLImageElement;
  private ytTitle = document.getElementById('ytTitle') as HTMLHeadingElement;
  private ytAuthor = document.getElementById('ytAuthor') as HTMLParagraphElement;
  private ytIdTag = document.getElementById('ytIdTag') as HTMLSpanElement;
  private ytExternalLink = document.getElementById('ytExternalLink') as HTMLAnchorElement;

  // Media Toolbar Elements
  private mediaPrevBtn = document.getElementById('mediaPrevBtn') as HTMLButtonElement;
  private mediaNextBtn = document.getElementById('mediaNextBtn') as HTMLButtonElement;
  private mediaPlayPauseBtn = document.getElementById('mediaPlayPauseBtn') as HTMLButtonElement;
  private mediaStopBtn = document.getElementById('mediaStopBtn') as HTMLButtonElement;
  private mediaPlayIcon = document.getElementById('mediaPlayIcon') as unknown as SVGElement;
  private mediaPauseIcon = document.getElementById('mediaPauseIcon') as unknown as SVGElement;
  private mediaPlayingStatus = document.getElementById('mediaPlayingStatus') as HTMLSpanElement;

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

    window.addEventListener('beforeunload', (e) => {
      if (this.isRunning) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.isRunning && this.phaseEndTime) {
        this.tick();
      }
    });

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

    this.sourceLocalBtn.addEventListener('click', () => this.switchAudioSource('local'));
    this.sourceYtBtn.addEventListener('click', () => this.switchAudioSource('youtube'));
    this.volumeSlider.addEventListener('input', () => this.handleVolumeChange());

    this.audioFileInput.addEventListener('change', (e) => this.handleFileImport(e));
    this.audioTrackSelect.addEventListener('change', () => this.handleTrackSelect());
    this.deleteTrackBtn.addEventListener('click', () => this.handleDeleteTrack());

    this.localAudio.addEventListener('play', () => {
      if (this.audioMode === 'local') {
        this.isMediaPlaying = true;
        this.updateMediaControlsUI();
      }
    });
    this.localAudio.addEventListener('pause', () => {
      if (this.audioMode === 'local') {
        this.isMediaPlaying = false;
        this.updateMediaControlsUI();
      }
    });

    this.addYtBtn.addEventListener('click', () => this.handleSaveYouTubeStream());
    this.ytUrlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleSaveYouTubeStream();
    });
    this.ytStreamSelect.addEventListener('change', () => this.handleYouTubeSelect());
    this.deleteYtBtn.addEventListener('click', () => this.handleDeleteYouTubeStream());

    this.mediaPlayPauseBtn.addEventListener('click', () => this.handleMediaPlayPause());
    this.mediaStopBtn.addEventListener('click', () => this.handleMediaStop());
    this.mediaPrevBtn.addEventListener('click', () => this.handleMediaPrev());
    this.mediaNextBtn.addEventListener('click', () => this.handleMediaNext());
  }

  // --- ASYNC STORAGE INITIALIZATION & SKELETON RESOLUTION ---

  private async initStorageAndMedia(): Promise<void> {
    try {
      await this.appStorage.init();
      
      this.tracks = await this.appStorage.getAllTracks();
      this.renderTrackOptions();
      const lastSelectedTrackId = localStorage.getItem('selectedTrackId');
      if (lastSelectedTrackId && this.tracks.some(t => t.id === lastSelectedTrackId)) {
        this.audioTrackSelect.value = lastSelectedTrackId;
      }
      await this.handleTrackSelect();

      this.ytStreams = await this.appStorage.getAllYouTubeStreams();
      this.renderYouTubeOptions();
      const lastSelectedYtId = localStorage.getItem('selectedYtStreamId');
      if (lastSelectedYtId && this.ytStreams.some(s => s.id === lastSelectedYtId)) {
        this.ytStreamSelect.value = lastSelectedYtId;
      }
      this.handleYouTubeSelect();

      this.updateMediaControlsUI();
    } catch (err) {
      console.error('Failed to initialize storage:', err);
      this.mediaPlayingStatus.innerText = 'Storage init error';
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
    
    // UI Visual feedback: show spinner and disable interactions
    this.importSpinner.classList.remove('hidden');
    this.importBtnText.innerText = 'Reading audio...';
    this.importBtnLabel.classList.add('opacity-70', 'pointer-events-none');
    this.audioFileMeta.innerText = `Importing ${file.name} to persistent storage...`;

    try {
      const savedTrack = await this.appStorage.saveTrack(file);
      this.tracks.push(savedTrack);
      this.renderTrackOptions();
      this.audioTrackSelect.value = savedTrack.id;
      await this.handleTrackSelect();
    } catch (err) {
      console.error('Failed to save audio file:', err);
      this.audioFileMeta.innerText = 'Failed to import audio file.';
    } finally {
      this.importSpinner.classList.add('hidden');
      this.importBtnText.innerText = '+ Import File';
      this.importBtnLabel.classList.remove('opacity-70', 'pointer-events-none');
      target.value = '';
    }
  }

  private async handleTrackSelect(): Promise<void> {
    const selectedId = this.audioTrackSelect.value;
    const track = this.tracks.find(t => t.id === selectedId);

    if (this.activeTrackUrl) {
      URL.revokeObjectURL(this.activeTrackUrl);
      this.activeTrackUrl = null;
    }

    if (track) {
      localStorage.setItem('selectedTrackId', track.id);
      
      let blob: Blob;
      if (track.buffer) {
        blob = new Blob([track.buffer], { type: track.type || 'audio/mpeg' });
      } else if (track.blob) {
        const buf = await track.blob.arrayBuffer();
        blob = new Blob([buf], { type: track.type || 'audio/mpeg' });
      } else {
        return;
      }

      this.activeTrackUrl = URL.createObjectURL(blob);
      this.localAudio.src = this.activeTrackUrl;
      this.localAudio.load();

      const sizeMb = (blob.size / (1024 * 1024)).toFixed(2);
      this.audioFileMeta.innerText = `Active: ${track.name} (${sizeMb} MB) • Ready`;

      if (this.isMediaPlaying && this.audioMode === 'local') {
        this.playAudio();
      }
    } else {
      this.localAudio.removeAttribute('src');
    }
    this.updateMediaControlsUI();
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
      await this.handleTrackSelect();
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
      alert('Please provide a valid YouTube URL');
      return;
    }

    this.addYtBtn.disabled = true;
    this.ytSaveSpinner.classList.remove('hidden');
    this.addYtBtnText.innerText = 'Fetching info...';

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
      this.ytSaveSpinner.classList.add('hidden');
      this.addYtBtnText.innerText = '+ Save Stream';
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

      this.ytThumb.src = stream.thumbnailUrl;
      this.ytTitle.innerText = stream.title;
      this.ytAuthor.innerText = stream.author;
      this.ytIdTag.innerText = stream.videoId;
      this.ytExternalLink.href = stream.url;
      this.ytInfoCard.classList.remove('hidden');

      if (this.ytPlayer && this.isYtReady) {
        this.ytPlayer.cueVideoById(stream.videoId);
        if (this.isMediaPlaying && this.audioMode === 'youtube') {
          this.ytPlayer.playVideo();
        }
      }
    } else {
      this.activeYtStream = null;
      this.ytInfoCard.classList.add('hidden');
    }
    this.updateMediaControlsUI();
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

  // --- MEDIA TOOLBAR CONTROLS ---

  private updateMediaControlsUI(): void {
    if (this.isMediaPlaying) {
      this.mediaPlayIcon.classList.add('hidden');
      this.mediaPauseIcon.classList.remove('hidden');
    } else {
      this.mediaPlayIcon.classList.remove('hidden');
      this.mediaPauseIcon.classList.add('hidden');
    }

    const count = this.audioMode === 'local' ? this.tracks.length : this.ytStreams.length;
    this.mediaPrevBtn.disabled = count <= 1;
    this.mediaNextBtn.disabled = count <= 1;

    if (this.isMediaPlaying) {
      const activeName = this.audioMode === 'local' 
        ? (this.tracks.find(t => t.id === this.audioTrackSelect.value)?.name || 'Local File')
        : (this.activeYtStream?.title || 'YouTube Stream');
      this.mediaPlayingStatus.innerText = `Playing: ${activeName}`;
      this.mediaPlayingStatus.className = 'text-[11px] font-mono text-emerald-500 dark:text-emerald-400 truncate max-w-[160px] sm:max-w-[220px] font-semibold';
    } else {
      this.mediaPlayingStatus.innerText = 'Audio Paused / Idle';
      this.mediaPlayingStatus.className = 'text-[11px] font-mono text-zinc-400 dark:text-zinc-500 truncate max-w-[160px] sm:max-w-[220px]';
    }
  }

  private handleMediaPlayPause(): void {
    if (this.isMediaPlaying) {
      this.pauseAudio();
    } else {
      this.playAudio();
    }
  }

  private handleMediaStop(): void {
    this.pauseAudio();
    if (this.audioMode === 'local') {
      this.localAudio.currentTime = 0;
    } else if (this.audioMode === 'youtube' && this.ytPlayer && this.isYtReady) {
      this.ytPlayer.seekTo(0, true);
    }
    this.mediaPlayingStatus.innerText = 'Audio Stopped';
  }

  private handleMediaNext(): void {
    if (this.audioMode === 'local') {
      if (this.tracks.length <= 1) return;
      const currentIndex = this.tracks.findIndex(t => t.id === this.audioTrackSelect.value);
      const nextIndex = (currentIndex + 1) % this.tracks.length;
      this.audioTrackSelect.value = this.tracks[nextIndex].id;
      this.handleTrackSelect();
    } else {
      if (this.ytStreams.length <= 1) return;
      const currentIndex = this.ytStreams.findIndex(s => s.id === this.ytStreamSelect.value);
      const nextIndex = (currentIndex + 1) % this.ytStreams.length;
      this.ytStreamSelect.value = this.ytStreams[nextIndex].id;
      this.handleYouTubeSelect();
    }
  }

  private handleMediaPrev(): void {
    if (this.audioMode === 'local') {
      if (this.tracks.length <= 1) return;
      const currentIndex = this.tracks.findIndex(t => t.id === this.audioTrackSelect.value);
      const prevIndex = (currentIndex - 1 + this.tracks.length) % this.tracks.length;
      this.audioTrackSelect.value = this.tracks[prevIndex].id;
      this.handleTrackSelect();
    } else {
      if (this.ytStreams.length <= 1) return;
      const currentIndex = this.ytStreams.findIndex(s => s.id === this.ytStreamSelect.value);
      const prevIndex = (currentIndex - 1 + this.ytStreams.length) % this.ytStreams.length;
      this.ytStreamSelect.value = this.ytStreams[prevIndex].id;
      this.handleYouTubeSelect();
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
    this.phaseEndTime = Date.now() + this.secondsRemaining * 1000;

    this.startPauseBtn.innerText = 'Pause';
    this.startPauseBtn.classList.replace('bg-zinc-900', 'bg-amber-600');
    this.startPauseBtn.classList.replace('dark:bg-zinc-100', 'dark:bg-amber-500');

    if (this.currentPhase === 'work' && this.autoPlayCheck.checked) {
      this.playAudio();
    }

    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = window.setInterval(() => this.tick(), 250);
  }

  private tick(): void {
    if (!this.phaseEndTime) return;
    const remainingMs = this.phaseEndTime - Date.now();
    const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));

    if (remainingSec > 0) {
      this.secondsRemaining = remainingSec;
      this.updateDisplay();
    } else {
      this.secondsRemaining = 0;
      this.updateDisplay();
      this.handlePhaseTransition();
    }
  }

  private pauseTimer(): void {
    if (this.phaseEndTime) {
      this.secondsRemaining = Math.max(0, Math.ceil((this.phaseEndTime - Date.now()) / 1000));
      this.phaseEndTime = null;
    }

    this.isRunning = false;
    this.startPauseBtn.innerText = 'Resume';
    this.startPauseBtn.classList.replace('bg-amber-600', 'bg-zinc-900');
    this.startPauseBtn.classList.replace('dark:bg-amber-500', 'dark:bg-zinc-100');

    if (this.timerInterval) clearInterval(this.timerInterval);
    this.pauseAudio();
  }

  private resetTimer(): void {
    this.pauseTimer();
    this.phaseEndTime = null;
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

  // --- AUDIO CONTROLLER ENGINE ---

  private switchAudioSource(mode: 'local' | 'youtube'): void {
    const wasPlaying = this.isMediaPlaying;
    this.pauseAudio();
    this.audioMode = mode;

    if (mode === 'local') {
      this.sourceLocalBtn.className = 'flex-1 py-1.5 px-3 rounded-lg border border-zinc-400 dark:border-zinc-600 bg-zinc-200 dark:bg-zinc-800 font-medium transition-colors';
      this.sourceYtBtn.className = 'flex-1 py-1.5 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors flex items-center justify-center gap-1.5';
      this.localAudioContainer.classList.remove('hidden');
      this.ytInputContainer.classList.add('hidden');
    } else {
      this.sourceYtBtn.className = 'flex-1 py-1.5 px-3 rounded-lg border border-zinc-400 dark:border-zinc-600 bg-zinc-200 dark:bg-zinc-800 font-medium transition-colors flex items-center justify-center gap-1.5';
      this.sourceLocalBtn.className = 'flex-1 py-1.5 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors';
      this.localAudioContainer.classList.add('hidden');
      this.ytInputContainer.classList.remove('hidden');
    }

    if (wasPlaying || (this.isRunning && this.currentPhase === 'work' && this.autoPlayCheck.checked)) {
      this.playAudio();
    } else {
      this.updateMediaControlsUI();
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
    if (this.audioMode === 'local') {
      if (!this.localAudio.src || this.tracks.length === 0) {
        this.mediaPlayingStatus.innerText = 'No file imported';
        return;
      }

      this.localAudio.play()
        .then(() => {
          this.isMediaPlaying = true;
          this.updateMediaControlsUI();
        })
        .catch((err) => {
          console.error('Audio play error:', err);
          if (err.name === 'NotAllowedError') {
            this.mediaPlayingStatus.innerText = 'Safari blocked autoplay';
          } else {
            this.mediaPlayingStatus.innerText = 'Format unsupported';
          }
          this.isMediaPlaying = false;
          this.updateMediaControlsUI();
        });
    } else if (this.audioMode === 'youtube') {
      if (!this.isYtReady) {
        this.mediaPlayingStatus.innerText = 'Waiting on YouTube API...';
        return;
      }
      if (this.ytPlayer && this.activeYtStream) {
        this.ytPlayer.playVideo();
        this.isMediaPlaying = true;
        this.updateMediaControlsUI();
      }
    }
  }

  private pauseAudio(): void {
    if (this.audioMode === 'local') {
      this.localAudio.pause();
    }
    if (this.ytPlayer && this.isYtReady) {
      this.ytPlayer.pauseVideo();
    }
    this.isMediaPlaying = false;
    this.updateMediaControlsUI();
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
            
            // Visual Update: switch dot to green & hide banner
            this.ytTabDot.className = 'w-1.5 h-1.5 rounded-full bg-emerald-500';
            this.ytTabDot.title = 'YouTube API Connected';
            this.ytApiBanner.classList.add('hidden');

            if (this.activeYtStream) {
              this.ytPlayer.cueVideoById(this.activeYtStream.videoId);
            }
          },
          onStateChange: (event: any) => {
            if (this.audioMode === 'youtube') {
              if (event.data === 1) {
                this.isMediaPlaying = true;
              } else if (event.data === 2 || event.data === 0) {
                this.isMediaPlaying = false;
              }
              this.updateMediaControlsUI();
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
