import { AudioCache } from "./modules/audio-cache.js";
import { AudioProcessor } from "./modules/audio-processor.js";
import { UIManager } from "./modules/ui-manager.js";
import { TrackLoader } from "./modules/track-loader.js";

/**
 * Multitrack Player Web Component - A fully-featured multitrack audio player
 */
class MultitrackPlayer extends HTMLElement {
  static get observedAttributes() {
    return ["tracks"];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });

    // Initialize component modules
    this.audioCache = new AudioCache();
    this.audioProcessor = new AudioProcessor();
    this.uiManager = new UIManager();
    this.trackLoader = new TrackLoader(this.audioProcessor, this.audioCache);

    // Component state
    this._state = {
      isPlaying: false,
      isReady: false,
      currentTime: 0,
      duration: 0,
      startTime: 0,
      isDragging: false,
    };

    // Track audio nodes
    this.audioNodes = [];

    // Playback timer
    this.playbackTimer = null;

    // Initialize flags
    this.audioInitialized = false;
    this.clickHandlerAdded = false;
    this.tracksLoading = false;
  }

  // State getter
  get state() {
    return this._state;
  }

  async connectedCallback() {
    // Create the shadow DOM
    if (!this.shadowRoot.firstChild) {
      const template = this.uiManager.createTemplate();
      this.shadowRoot.appendChild(template);

      // Initialize Lucide icons if available
      try {
        window.lucide?.createIcons({
          attrs: {
            class: ["lucide"],
            stroke: "currentColor",
            "stroke-width": "2",
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
            fill: "none",
          },
          root: this.shadowRoot,
        });
      } catch (error) {
        console.error("Error initializing Lucide icons:", error);
      }
    }

    // Cache all UI elements
    this.uiManager.cacheElements(this.shadowRoot);

    // First interaction with UI can initialize audio context
    // Add click handler to element if not already added
    if (!this.clickHandlerAdded) {
      // Use capture to catch all clicks on the container
      this.shadowRoot.addEventListener(
        "click",
        this.handleFirstInteraction.bind(this),
        { once: true, capture: true }
      );

      // Try to initialize audio context early, after showing UI
      // This is a performance optimization - many browsers now allow
      // audio context creation without user interaction
      setTimeout(() => {
        this.tryInitializeAudioEarly();
      }, 100);

      this.clickHandlerAdded = true;
    }

    // Setup UI handlers
    this.uiManager.setupInitialUI({
      play: () => this.play(),
      pause: () => this.pause(),
      stop: () => this.stop(),
      seek: (position) => this.seek(position),
      toggleReverb: () => this.toggleReverb(),
      changeReverbType: (type) => this.changeReverbType(type),
      isPlaying: () => this._state.isPlaying,
      isReady: () => this._state.isReady,
    });

    // Start loading tracks if there is a tracks attribute
    // This will start loading tracks immediately without waiting for audio context
    if (this.hasAttribute("tracks") && !this.tracksLoading) {
      this.loadTracks();
    }
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === "tracks" && oldValue !== newValue && !this.tracksLoading) {
      this.loadTracks();
    }
  }

  /**
   * Try to initialize audio early if browser allows it
   * This is a performance optimization
   */
  async tryInitializeAudioEarly() {
    if (this.audioInitialized) return;

    try {
      // Try to initialize audio context without user interaction
      await this.audioProcessor.initializeContext();
      this.audioInitialized = true;
      console.log("Audio context initialized early");

      // If we already have tracks loaded, update player state
      if (this.audioNodes.length > 0) {
        this._state.isReady = true;
        this.updateUI();
      }
    } catch (error) {
      // Silently fail - we'll try again on user interaction
      console.log("Early audio context init failed, will try again on user interaction");
    }
  }

  /**
   * Handle the first user interaction to unlock audio
   */
  handleFirstInteraction() {
    // Initialize audio on first interaction
    if (!this.audioInitialized) {
      this.initializeAudio();
    }
  }

  /**
   * Initialize Web Audio API
   * This is needed for playback and must be triggered by user interaction
   * but we can load track data before this
   */
  async initializeAudio() {
    if (this.audioInitialized) return;

    try {
      // Initialize audio context
      await this.audioProcessor.initializeContext();
      this.audioInitialized = true;

      // If tracks are already loaded, just update the player state without recreating track UI
      if (this.audioNodes.length > 0) {
        // Only update player state
        this._state.isReady = true;

        // Enable play button
        if (this.uiManager.elements.playButton) {
          this.uiManager.elements.playButton.disabled = false;
          this.uiManager.elements.playButton.classList.remove("disabled");
        }

        // Update duration if not already set
        if (!this._state.duration) {
          for (const node of this.audioNodes) {
            if (node && node.buffer) {
              this._state.duration = node.buffer.duration;
              break;
            }
          }
          // Update UI with duration
          this.updateUI();
        }
      }
    } catch (error) {
      console.error("Error initializing audio:", error);
      this.uiManager.updateLoadingStatus(
        "Error initializing audio: " + error.message,
      );
    }
  }

  /**
   * Load tracks from provided configuration
   */
  async loadTracks() {
    if (this.tracksLoading) return;
    this.tracksLoading = true;

    try {
      // Get tracks from attribute
      const tracksAttr = this.getAttribute("tracks");
      if (!tracksAttr) {
        this.uiManager.updateLoadingStatus("No track configuration found");
        return;
      }

      let tracks;
      try {
        tracks = JSON.parse(tracksAttr);
      } catch (e) {
        this.uiManager.updateLoadingStatus(
          "Invalid track configuration format",
        );
        return;
      }

      // Update loading status
      this.uiManager.updateLoadingStatus("Loading tracks...");

      // Clear previous tracks but preserve memory cache
      this.audioNodes = [];

      // Load tracks
      this.audioNodes = await this.trackLoader.loadTracks(
        tracks,
        // Progress callback - update UI for each track
        (loadedCount, total) => {
          this.uiManager.updateLoadingUI(loadedCount, total);
        },
        // Complete callback
        (audioNodes, successfulLoads) => {
          this.audioNodes = audioNodes;

          // Create track UI immediately after loading
          this.finalizeTracks();

          // Auto-initialize audio context if not already initialized
          if (!this.audioInitialized && successfulLoads > 0) {
            this.initializeAudio();
          }
        },
        (msg) => this.uiManager.updateLoadingStatus(msg),
      );
    } catch (error) {
      console.error("Error loading tracks:", error);
      this.uiManager.updateLoadingStatus(`Error: ${error.message}`);
    } finally {
      this.tracksLoading = false;
    }
  }

  /**
   * Once tracks are loaded and audio context is initialized,
   * finalize setup and make player ready
   */
  finalizeTracks() {
    // Check if any tracks were successfully loaded
    const successfulLoads = this.audioNodes.filter((n) => n).length;

    if (successfulLoads > 0) {
      // Get duration from the first track with a buffer
      for (const node of this.audioNodes) {
        if (node && node.buffer) {
          this._state.duration = node.buffer.duration;
          break;
        }
      }

      // Create track UI immediately, regardless of audio context status
      this.uiManager.createTrackUI(
        this.audioNodes,
        (index) => this.toggleSolo(index),
        (index, type, value) => this.updateTrackControl(index, type, value),
      );

      // Only set player as ready if audio context is initialized
      if (this.audioInitialized) {
        this._state.isReady = true;

        // Enable play button
        if (this.uiManager.elements.playButton) {
          this.uiManager.elements.playButton.disabled = false;
          this.uiManager.elements.playButton.classList.remove("disabled");
        }
      }

      // Update UI once after setup
      this.updateUI();

      // Hide loading indicator
      if (this.uiManager.elements.loading) {
        this.uiManager.elements.loading.classList.add("hidden");
      }
    } else {
      this.uiManager.updateLoadingStatus("Failed to load any tracks");
    }
  }

  /**
   * Update a track's control value (gain or pan)
   */
  updateTrackControl(index, type, value) {
    const track = this.audioNodes[index];
    if (!track) return;

    if (type === "gain") {
      track.gain = value;
      if (track.gainNode) {
        // Check if track is soloed or no tracks are soloed
        const hasSoloTracks = this.audioNodes.some(
          (node) => node && node.isSolo,
        );
        const shouldMute = hasSoloTracks && !track.isSolo;
        track.gainNode.gain.value = shouldMute ? 0 : value;
      }
    } else if (type === "pan") {
      track.pan = value;
      if (track.panNode) {
        track.panNode.pan.value = value;
      }
    }
  }

  /**
   * Toggle solo state for a track
   */
  toggleSolo(index) {
    if (
      index < 0 ||
      index >= this.audioNodes.length ||
      !this.audioNodes[index]
    ) {
      return;
    }

    const track = this.audioNodes[index];
    track.isSolo = !track.isSolo;

    // Update UI
    this.uiManager.updateSoloUI(this.audioNodes);

    // Update gain values based on solo state
    const hasSoloTracks = this.audioNodes.some((node) => node && node.isSolo);
    this.audioNodes.forEach((node) => {
      if (node && node.gainNode) {
        const newGain = hasSoloTracks
          ? node.isSolo
            ? node.gain
            : 0
          : node.gain;
        node.gainNode.gain.value = newGain;
      }
    });
  }

  /**
   * Toggle reverb effect
   */
  toggleReverb() {
    const reverbEnabled = this.audioProcessor.toggleReverb(this.audioNodes);
    this.uiManager.updateReverbUI(reverbEnabled);
  }

  /**
   * Change reverb type (bright, medium, dark)
   * @param {string} type - Type of reverb
   */
  async changeReverbType(type) {
    if (!this.audioNodes || this.audioNodes.length === 0) return;

    const success = await this.audioProcessor.changeReverbType(
      type,
      this.audioNodes,
    );
    if (success) {
      this.uiManager.updateReverbTypeUI(type);
    }
  }

  /**
   * Start playback
   */
  play() {
    if (
      !this.audioNodes ||
      this.audioNodes.length === 0 ||
      this._state.isPlaying
    )
      return;

    // Use audio context currentTime as reference
    const startTime =
      this.audioProcessor.audioContext.currentTime - this._state.currentTime;

    // Create and start audio sources for each track
    this.audioNodes.forEach((node) => {
      if (!node || !node.buffer) return;

      node.source = this.audioProcessor.audioContext.createBufferSource();
      node.source.buffer = node.buffer;
      node.source.connect(node.gainNode);
      node.source.start(0, this._state.currentTime);
    });

    // Update state
    this._state.isPlaying = true;
    this._state.startTime = startTime;

    // Update UI
    this.updateUI();

    // Start the timer for ongoing UI updates
    this.startPlaybackTimer();
  }

  /**
   * Pause playback
   */
  pause() {
    if (!this._state.isPlaying) return;

    // Update current time before stopping
    this._state.currentTime =
      this.audioProcessor.audioContext.currentTime - this._state.startTime;

    // Stop all sources
    this.audioNodes.forEach((node) => {
      if (node && node.source) {
        node.source.stop();
        node.source = null;
      }
    });

    // Update state
    this._state.isPlaying = false;

    // Update UI
    this.updateUI();

    // Stop the timer
    this.stopPlaybackTimer();
  }

  /**
   * Stop playback and reset to beginning
   */
  stop() {
    // Stop all sources
    if (this._state.isPlaying) {
      this.audioNodes.forEach((node) => {
        if (node && node.source) {
          node.source.stop();
          node.source = null;
        }
      });
    }

    // Reset state
    this._state.isPlaying = false;
    this._state.currentTime = 0;

    // Update UI
    this.updateUI();

    // Stop the timer
    this.stopPlaybackTimer();
  }

  /**
   * Seek to a specific position (0-1)
   */
  seek(position) {
    if (!this._state.isReady || !this._state.duration) return;
    this.seekTo(position * this._state.duration);
  }

  /**
   * Seek to a specific time in seconds
   */
  seekTo(timeInSeconds) {
    if (!this.audioNodes || !this._state.duration) return;

    // Clamp the value to the valid range
    const seekTime = Math.max(0, Math.min(timeInSeconds, this._state.duration));

    // Store whether we were playing before seeking
    const wasPlaying = this._state.isPlaying;

    // Stop all current playback
    this.audioNodes.forEach((node) => {
      if (node && node.source) {
        node.source.stop();
        node.source = null;
      }
    });

    // Update the current time
    this._state.currentTime = seekTime;
    this._state.startTime = this.audioProcessor.audioContext.currentTime - seekTime;

    // If we were playing, restart playback at new position
    if (wasPlaying) {
      // Create and start audio sources for each track at new position
      this.audioNodes.forEach((node) => {
        if (!node || !node.buffer) return;

        node.source = this.audioProcessor.audioContext.createBufferSource();
        node.source.buffer = node.buffer;
        node.source.connect(node.gainNode);
        node.source.start(0, seekTime);
      });
    }

    // Update UI
    this.updateUI();
  }

  /**
   * Start the playback timer for UI updates
   */
  startPlaybackTimer() {
    if (this.playbackTimer) clearInterval(this.playbackTimer);

    this.playbackTimer = setInterval(() => {
      this.updateUI();

      // Check if we've reached the end
      const currentTime =
        this.audioProcessor.audioContext.currentTime - this._state.startTime;
      if (this._state.isPlaying && currentTime >= this._state.duration) {
        this.stop();
      }
    }, 50);
  }

  /**
   * Stop the playback timer
   */
  stopPlaybackTimer() {
    if (this.playbackTimer) {
      clearInterval(this.playbackTimer);
      this.playbackTimer = null;
    }
  }

  /**
   * Update the UI to reflect current state
   */
  updateUI() {
    this.uiManager.updatePlayerUI(this._state, this.audioProcessor);
  }
}

// Register the custom element
customElements.define("multitrack-player", MultitrackPlayer);
