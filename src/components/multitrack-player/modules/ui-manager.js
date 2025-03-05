/**
 * UI Manager Module - Handles UI creation and interaction
 */

export class UIManager {
  constructor() {
    this.elements = {};
  }

  /**
   * Cache DOM elements for quick access
   * @param {ShadowRoot} root - The shadow root container
   */
  cacheElements(root) {
    this.elements = {
      playButton: root.querySelector(".play-pause-button"),
      timeline: root.querySelector(".timeline"),
      progress: root.querySelector(".progress-bar"),
      playhead: root.querySelector(".playhead"),
      timeDisplay: root.querySelector(".current-time"),
      duration: root.querySelector(".duration"),
      loading: root.querySelector(".loading-container"),
      tracksContainer: root.querySelector(".tracks-container"),
      reverb: root.querySelector(".reverb-toggle"),
      reverbMenu: root.querySelector(".reverb-menu"),
      reverbOptions: root.querySelectorAll(".reverb-option"),
      loadingCount: root.querySelector(".loading-count"),
      loadingProgress: root.querySelector(".loading-progress"),
      loadingStatus: root.querySelector(".loading-status")
    };
  }

  /**
   * Create base template for the player
   * @returns {DocumentFragment} The template content
   */
  createTemplate() {
    const template = document.createElement("template");
    template.innerHTML = `
      <link rel="stylesheet" href="src/components/multitrack-player/styles.css">
      <div class="multitrack-player">
        <div class="player-container">
          <div class="loading-container">
            <div class="loading-status">Loading...</div>
            <div class="loading-bar">
              <div class="loading-progress"></div>
            </div>
            <div class="loading-count">0/0</div>
          </div>
          <div class="timeline-container">
            <button class="play-pause-button disabled" disabled>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-play play-icon">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pause pause-icon">
                <rect x="6" y="4" width="4" height="16"></rect>
                <rect x="14" y="4" width="4" height="16"></rect>
              </svg>
            </button>
            <div class="timeline" role="slider" aria-label="Playback progress">
              <div class="progress-bar"></div>
              <div class="playhead"></div>
            </div>
            <div class="time-display">
              <span class="current-time">0:00</span> /
              <span class="duration">0:00</span>
            </div>
            <div class="reverb-container">
              <button class="reverb-toggle" title="Toggle Reverb">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-radio radio-icon">
                  <circle cx="12" cy="12" r="2"></circle>
                  <path d="M4.93 19.07a10 10 0 0 1 0-14.14"></path>
                  <path d="M7.76 16.24a6 6 0 0 1 0-8.48"></path>
                  <path d="M16.24 7.76a6 6 0 0 1 0 8.48"></path>
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                </svg>
              </button>
              <div class="reverb-menu">
                <button class="reverb-option" data-type="none">None</button>
                <button class="reverb-option" data-type="bright">Bright</button>
                <button class="reverb-option active" data-type="medium">Medium</button>
                <button class="reverb-option" data-type="dark">Dark</button>
              </div>
            </div>
          </div>
          <div class="tracks-container card-style">
            <!-- Tracks will be added here -->
          </div>
        </div>
      </div>
    `;
    return template.content.cloneNode(true);
  }

  /**
   * Update the loading UI
   * @param {number} loadedCount - Number of tracks loaded
   * @param {number} total - Total number of tracks
   */
  updateLoadingUI(loadedCount, total) {
    const percent = (loadedCount / total) * 100;
    if (this.elements.loadingProgress) {
      this.elements.loadingProgress.style.width = `${percent}%`;
    }
    if (this.elements.loadingCount) {
      this.elements.loadingCount.textContent = `${loadedCount}/${total}`;
    }
  }

  /**
   * Update loading status message
   * @param {string} message - Status message to display
   */
  updateLoadingStatus(message) {
    if (this.elements.loadingStatus) {
      this.elements.loadingStatus.textContent = message;
    }
  }

  /**
   * Create the UI for all tracks
   * @param {Array} audioNodes - Array of audio node objects
   * @param {Function} onSoloToggle - Callback for when solo is toggled
   * @param {Function} onKnobChange - Callback for when a knob is adjusted
   */
  createTrackUI(audioNodes, onSoloToggle, onKnobChange) {
    // Clear existing tracks container first
    if (!this.elements.tracksContainer) return;
    this.elements.tracksContainer.innerHTML = '';

    // Make the tracks container visible
    this.elements.tracksContainer.style.display = "block";

    // Add class to timeline container to connect it visually with tracks
    const timelineContainer = this.elements.playButton?.closest('.timeline-container');
    if (timelineContainer) {
      timelineContainer.classList.add('tracks-loaded');
    }

    // Create UI for each track
    audioNodes.forEach((track, index) => {
      // Skip any null or undefined tracks
      if (!track) return;

      const trackEl = document.createElement('div');
      trackEl.className = 'track';
      trackEl.setAttribute('data-index', index);

      // Add click handler for soloing
      trackEl.addEventListener('click', (e) => {
        // Only solo if not clicking on a knob
        if (!e.target.closest('.knob-container')) {
          onSoloToggle(index);
        }
      });

      // Create track name element
      const trackName = document.createElement('div');
      trackName.className = 'track-name';
      trackName.textContent = track.name;

      // Create controls container
      const controls = document.createElement('div');
      controls.className = 'track-controls';

      // Create gain knob
      const gainKnob = this.createKnob('gain', track.gain, (value) => {
        onKnobChange(index, 'gain', value);
      });

      // Create pan knob
      const panKnob = this.createKnob('pan', track.pan, (value) => {
        onKnobChange(index, 'pan', value);
      });

      // Add knobs to controls
      controls.appendChild(gainKnob);
      controls.appendChild(panKnob);

      // Add all elements to track
      trackEl.appendChild(trackName);
      trackEl.appendChild(controls);

      // Add track to container
      this.elements.tracksContainer.appendChild(trackEl);
    });

    // Initialize Lucide icons for the tracks
    try {
      window.lucide?.createIcons({
        attrs: {
          class: ["lucide"],
          stroke: "currentColor",
          "stroke-width": "2",
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
          fill: "none"
        },
        root: this.elements.tracksContainer
      });
    } catch (error) {
      console.error("Error initializing Lucide icons:", error);
    }
  }

  /**
   * Create a knob control
   * @param {string} type - Type of knob ('gain' or 'pan')
   * @param {number} initialValue - Initial value
   * @param {Function} onChange - Change handler
   * @returns {HTMLElement} The knob container element
   */
  createKnob(type, initialValue, onChange) {
    const container = document.createElement('div');
    container.className = 'knob-container';
    container.dataset.type = type;

    // Create knob element
    const knob = document.createElement('div');
    knob.className = 'knob';

    // Set initial rotation
    knob.style.transform = `rotate(${this.valueToAngle(initialValue, type)}deg)`;

    // Create label
    const label = document.createElement('div');
    label.className = 'knob-label';
    label.textContent = type.toUpperCase();

    // Add drag handling
    let isDragging = false;
    let startY = 0;
    let startValue = initialValue;

    // Create tooltip for value display
    const tooltip = document.createElement('div');
    tooltip.className = 'knob-tooltip';
    tooltip.style.display = 'none';
    container.appendChild(tooltip);

    const handleMove = (e) => {
      if (!isDragging) return;

      e.preventDefault();
      e.stopPropagation();

      const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
      const deltaY = startY - clientY;

      // Different scale for gain vs pan
      const deltaValue = (deltaY / 100) * (type === 'gain' ? 1 : 2);

      // Clamp value depending on type
      const min = type === 'gain' ? 0 : -1;
      const max = 1;
      const newValue = Math.min(max, Math.max(min, startValue + deltaValue));

      knob.style.transform = `rotate(${this.valueToAngle(newValue, type)}deg)`;
      onChange(newValue);

      tooltip.textContent = newValue.toFixed(2);
      tooltip.style.display = 'block';
    };

    const handleEnd = () => {
      if (!isDragging) return;
      isDragging = false;
      tooltip.style.display = 'none';

      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchend', handleEnd);
      document.body.classList.remove('dragging-knob');
    };

    const handleStart = (e) => {
      isDragging = true;
      startY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
      startValue = initialValue;

      e.preventDefault();
      e.stopPropagation();

      document.addEventListener('mousemove', handleMove);
      document.addEventListener('touchmove', handleMove, { passive: false });
      document.addEventListener('mouseup', handleEnd);
      document.addEventListener('touchend', handleEnd);

      document.body.classList.add('dragging-knob');
    };

    knob.addEventListener('mousedown', handleStart);
    knob.addEventListener('touchstart', handleStart, { passive: false });

    container.appendChild(knob);
    container.appendChild(label);

    return container;
  }

  /**
   * Convert value to angle for knob display
   * @param {number} value - The value to convert
   * @param {string} type - Type of knob ('gain' or 'pan')
   * @returns {number} Angle in degrees
   */
  valueToAngle(value, type) {
    if (type === "gain") {
      // Map 0-1 to -135 to 135 degrees
      return -135 + value * 270;
    } else if (type === "pan") {
      // Map -1 to 1 to -135 to 135 degrees
      return -135 + ((value + 1) / 2) * 270;
    }
    return 0;
  }

  /**
   * Update the player UI with current state
   * @param {Object} state - Current player state
   * @param {Object} audioProcessor - Audio processor with formatTime method
   */
  updatePlayerUI(state, audioProcessor) {
    if (!this.elements) return;

    // Calculate current time
    const currentTime = state.isPlaying
      ? (audioProcessor.audioContext?.currentTime || 0) - state.startTime
      : state.currentTime;

    // Update play/pause button state
    if (this.elements.playButton) {
      this.elements.playButton.classList.toggle("playing", state.isPlaying);

      // Update play/pause icons
      const playIcon = this.elements.playButton.querySelector('.play-icon');
      const pauseIcon = this.elements.playButton.querySelector('.pause-icon');

      if (state.isPlaying) {
        if (playIcon) playIcon.style.display = 'none';
        if (pauseIcon) pauseIcon.style.display = 'inline-block';
      } else {
        if (playIcon) playIcon.style.display = 'inline-block';
        if (pauseIcon) pauseIcon.style.display = 'none';
      }
    }

    // Update loading indicator
    if (this.elements.loading) {
      this.elements.loading.style.display = state.isReady ? "none" : "block";
    }

    // Update time display
    if (this.elements.timeDisplay) {
      this.elements.timeDisplay.textContent = audioProcessor.formatTime(currentTime);
    }

    if (this.elements.duration && state.duration) {
      this.elements.duration.textContent = audioProcessor.formatTime(state.duration);
    }

    // Update playhead and progress bar
    if (state.duration > 0) {
      const position = currentTime / state.duration;

      if (this.elements.progress) {
        this.elements.progress.style.width = `${position * 100}%`;
      }

      if (this.elements.playhead) {
        this.elements.playhead.style.left = `${position * 100}%`;
      }
    }
  }

  /**
   * Set up the basic event listeners
   * @param {Object} callbacks - Object containing callback functions
   */
  setupInitialUI(callbacks) {
    // Setup play button handler
    if (this.elements.playButton) {
      this.elements.playButton.addEventListener("click", () => {
        if (!callbacks.isReady()) return;
        if (callbacks.isPlaying()) {
          callbacks.pause();
        } else {
          callbacks.play();
        }
      });
    }

    // Setup timeline interaction
    if (this.elements.timeline) {
      let isDragging = false;
      let wasPlaying = false;

      this.elements.timeline.addEventListener("mousedown", (e) => {
        if (!callbacks.isReady()) return;
        isDragging = true;
        wasPlaying = callbacks.isPlaying();
        if (wasPlaying) {
          callbacks.pause();
        }
        handleTimelineInteraction(e);
      });

      document.addEventListener("mousemove", (e) => {
        if (!isDragging) return;
        handleTimelineInteraction(e);
      });

      document.addEventListener("mouseup", () => {
        if (!isDragging) return;
        isDragging = false;
        if (wasPlaying) {
          callbacks.play();
        }
      });

      // Direct click on timeline
      this.elements.timeline.addEventListener("click", (e) => {
        if (!callbacks.isReady()) return;
        handleTimelineInteraction(e);
      });

      const handleTimelineInteraction = (e) => {
        const rect = this.elements.timeline.getBoundingClientRect();
        const position = (e.clientX - rect.left) / rect.width;
        const normalizedPosition = Math.max(0, Math.min(1, position));
        callbacks.seek(normalizedPosition);
      };
    }

    // Setup reverb toggle
    if (this.elements.reverb) {
      this.elements.reverb.addEventListener("click", () => {
        if (this.elements.reverbMenu) {
          this.elements.reverbMenu.classList.toggle('show');
        }
      });
      // Set initial active state based on default reverb type (assume medium is default)
      this.elements.reverb.classList.add("active");
    }

    // Setup reverb type options
    if (this.elements.reverbOptions) {
      this.elements.reverbOptions.forEach(option => {
        option.addEventListener('click', () => {
          const type = option.dataset.type;
          callbacks.changeReverbType(type);

          // Hide the menu after selection
          if (this.elements.reverbMenu) {
            this.elements.reverbMenu.classList.remove('show');
          }
        });
      });
    }
  }

  /**
   * Update the UI to reflect the state of reverb
   * @param {boolean} enabled - Whether reverb is enabled
   */
  updateReverbUI(enabled) {
    if (this.elements.reverb) {
      this.elements.reverb.classList.toggle('active', enabled);
    }

    // If reverb is disabled, hide the menu
    if (!enabled && this.elements.reverbMenu) {
      this.elements.reverbMenu.classList.remove('show');
    }
  }

  /**
   * Update the UI to reflect the selected reverb type
   * @param {string} type - Type of reverb
   */
  updateReverbTypeUI(type) {
    if (!this.elements.reverbOptions) return;
    this.elements.reverbOptions.forEach(option => {
      option.classList.toggle('active', option.dataset.type === type);
    });
    // Update the reverb toggle button active state: disable if 'none' is selected
    if (this.elements.reverb) {
      if (type === 'none') {
        this.elements.reverb.classList.remove('active');
      } else {
        this.elements.reverb.classList.add('active');
      }
    }
  }

  /**
   * Update the solo states in the UI
   * @param {Array} tracks - Array of track objects with isSolo property
   */
  updateSoloUI(tracks) {
    const trackElements = [...this.elements.tracksContainer.querySelectorAll('.track')];

    trackElements.forEach((element, index) => {
      if (index < tracks.length && tracks[index]) {
        element.classList.toggle("solo", tracks[index].isSolo);
      }
    });
  }
}