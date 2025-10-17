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
			loadingProgress: root.querySelector(".loading-progress"),
			loadingStatus: root.querySelector(".loading-status"),
		};

		// Initially hide the tracks container until tracks are loaded
		if (this.elements.tracksContainer) {
			this.elements.tracksContainer.style.display = "none";
		}
	}

	/**
	 * Create base template for the player
	 * @returns {DocumentFragment} The template content
	 */
	createTemplate() {
		const template = document.createElement("template");
		template.innerHTML = `
      <style>
        :host { display: block; font-family: system-ui, sans-serif; user-select: none; }
        .multitrack-player { display: block; }
        .loading-container { margin-bottom: 1rem; }
        .loading-container.hidden { display: none !important; }
        .loading-status { margin-bottom: 0.5rem; }
        .loading-bar { width: 100%; height: 4px; background: #ddd; }
        .loading-progress { height: 100%; width: 0; background: #000; transition: width 0.2s; }
        .timeline-container {
            display: flex;
            align-items-center;
            gap: 0.5rem;
            margin: 1rem 0;
        }
        .play-pause-button { width: 2.5rem; height: 2.5rem; display: flex; align-items: center; justify-content: center; cursor: pointer; border: 1px solid; background: none; }
        .play-pause-button.disabled { opacity: 0.5; cursor: not-allowed; }
        .play-pause-button .pause-icon { display: none; }
        .play-pause-button.playing .play-icon { display: none; }
        .play-pause-button.playing .pause-icon { display: inline; }
        .timeline { position: relative; flex: 1; height: 6px; background: #ddd; cursor: pointer; }
        .progress-bar { position: absolute; height: 100%; width: 0; background: #000; }
        .playhead { position: absolute; top: 50%; left: 0; width: 12px; height: 12px; background: #000; border-radius: 50%; transform: translate(-50%, -50%); }
        .time-display { min-width: 5rem; text-align: right; }
        .reverb-toggle { width: 2rem; height: 2rem; display: flex; align-items: center; justify-content: center; cursor: pointer; border: 1px solid; background: none; }
        .tracks-container { display: none; margin-top: 1rem; }
        .tracks-container.card-style { display: block; }
        .track { display: flex; align-items: center; padding: 0.5rem 0; border-top: 1px solid #ddd; }
        .track:first-child { border-top: none; }
        .track-name { flex: 1; cursor: pointer; }
        .track-controls { display: flex; align-items: center; gap: 1.5rem; }
        .knob-container { display: flex; flex-direction: column; align-items: center; gap: 0.25rem; position: relative; touch-action: none; }
        .knob { width: 2rem; height: 2rem; border: 2px solid; border-radius: 50%; position: relative; cursor: ns-resize; }
        .knob::after { content: ""; position: absolute; top: 0.25rem; left: 50%; width: 2px; height: 0.75rem; background: currentColor; transform: translateX(-50%); transform-origin: bottom; }
        .knob-label { font-size: 0.75rem; text-transform: uppercase; }
        .knob-tooltip { position: absolute; top: -1.75rem; left: 50%; transform: translateX(-50%); background: #000; color: #fff; font-size: 0.875rem; padding: 0.25rem 0.5rem; white-space: nowrap; display: none; z-index: 9999; }
        .lucide, .spinner-icon { width: 1.25rem; height: 1.25rem; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .dragging-knob { user-select: none; }
      </style>
      <div class="multitrack-player">
        <div class="player-container">
          <div class="loading-container">
            <div class="loading-status">Loading...</div>
            <div class="loading-bar">
              <div class="loading-progress"></div>
            </div>
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
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spinner-icon" style="display: none;">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
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
              <button class="reverb-toggle" title="Toggle Motown Reverb">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-radio radio-icon">
                  <circle cx="12" cy="12" r="2"></circle>
                  <path d="M4.93 19.07a10 10 0 0 1 0-14.14"></path>
                  <path d="M7.76 16.24a6 6 0 0 1 0-8.48"></path>
                  <path d="M16.24 7.76a6 6 0 0 1 0 8.48"></path>
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                </svg>
              </button>
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
	 * @param {string|null} message - An optional message to display instead of the default
	 */
	updateLoadingUI(loadedCount, total, message = null) {
		if (this.elements.loadingStatus) {
			if (message) {
				this.elements.loadingStatus.textContent = message;
			} else if (total > 0) {
				this.elements.loadingStatus.textContent = `Loading tracks... ${loadedCount}/${total}`;
			} else {
				this.elements.loadingStatus.textContent = "Loading...";
			}
		}

		const percent = total > 0 ? (loadedCount / total) * 100 : 0;
		if (this.elements.loadingProgress) {
			this.elements.loadingProgress.style.width = `${percent}%`;
		}

		if (loadedCount === total && total > 0) {
			this.fadeOutLoading();
		}
	}

	/**
	 * Fade out and hide the loading UI
	 */
	fadeOutLoading() {
		if (this.elements.loading) {
			this.elements.loading.classList.add("hidden");
		}
	}

	/**
	 * Create the UI for all tracks
	 * @param {Array} audioNodes - Array of audio node objects
	 * @param {Function} onSoloToggle - Callback for when solo is toggled
	 * @param {Function} onKnobChange - Callback for when a knob is adjusted
	 */
	createTrackUI(audioNodes, onSoloToggle, onKnobChange) {
		if (!this.elements.tracksContainer || !audioNodes || !audioNodes.length)
			return;

		const validNodes = audioNodes.filter((n) => n);
		if (
			this.elements.tracksContainer.style.display === "block" &&
			this.elements.tracksContainer.childElementCount === validNodes.length
		) {
			return;
		}

		this.elements.tracksContainer.innerHTML = "";
		this.elements.tracksContainer.style.display = "block";

		const timelineContainer = this.elements.playButton?.closest(
			".timeline-container",
		);
		if (timelineContainer) {
			timelineContainer.classList.add("tracks-loaded");
		}

		audioNodes.forEach((node, index) => {
			if (!node) return;

			const trackEl = document.createElement("div");
			trackEl.className = "track";
			trackEl.setAttribute("data-index", index);

			trackEl.addEventListener("click", (e) => {
				if (!e.target.closest(".knob-container")) {
					onSoloToggle(index);
				}
			});

			const trackName = document.createElement("div");
			trackName.className = "track-name";
			trackName.textContent = node.name;

			const controls = document.createElement("div");
			controls.className = "track-controls";

			const gainKnob = this.createKnob("gain", node.gain, (value) => {
				onKnobChange(index, "gain", value);
			});

			const panKnob = this.createKnob("pan", node.pan, (value) => {
				onKnobChange(index, "pan", value);
			});

			controls.appendChild(gainKnob);
			controls.appendChild(panKnob);

			trackEl.appendChild(trackName);
			trackEl.appendChild(controls);

			this.elements.tracksContainer.appendChild(trackEl);
		});

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
				root: this.elements.tracksContainer,
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
		const container = document.createElement("div");
		container.className = "knob-container";
		container.dataset.type = type;

		const knob = document.createElement("div");
		knob.className = "knob";

		knob.style.transform = `rotate(${this.valueToAngle(initialValue, type)}deg)`;

		const label = document.createElement("div");
		label.className = "knob-label";
		label.textContent = type.toUpperCase();

		let isDragging = false;
		let startY = 0;
		let startValue = initialValue;

		const tooltip = document.createElement("div");
		tooltip.className = "knob-tooltip";
		tooltip.style.display = "none";
		container.appendChild(tooltip);

		const handleMove = (e) => {
			if (!isDragging) return;

			e.preventDefault();
			e.stopPropagation();

			const clientY = e.type.includes("touch")
				? e.touches[0].clientY
				: e.clientY;
			const deltaY = startY - clientY;

			// Different scale for gain vs pan
			const deltaValue = (deltaY / 100) * (type === "gain" ? 1 : 2);

			// Clamp value depending on type
			const min = type === "gain" ? 0 : -1;
			const max = 1;
			const newValue = Math.min(max, Math.max(min, startValue + deltaValue));

			knob.style.transform = `rotate(${this.valueToAngle(newValue, type)}deg)`;
			onChange(newValue);

			tooltip.textContent = newValue.toFixed(2);
			tooltip.style.display = "block";
		};

		const handleEnd = () => {
			if (!isDragging) return;
			isDragging = false;
			tooltip.style.display = "none";

			document.removeEventListener("mousemove", handleMove);
			document.removeEventListener("touchmove", handleMove);
			document.removeEventListener("mouseup", handleEnd);
			document.removeEventListener("touchend", handleEnd);
			document.body.classList.remove("dragging-knob");
		};

		const handleStart = (e) => {
			isDragging = true;
			startY = e.type.includes("touch") ? e.touches[0].clientY : e.clientY;
			startValue = initialValue;

			e.preventDefault();
			e.stopPropagation();

			document.addEventListener("mousemove", handleMove);
			document.addEventListener("touchmove", handleMove, { passive: false });
			document.addEventListener("mouseup", handleEnd);
			document.addEventListener("touchend", handleEnd);

			document.body.classList.add("dragging-knob");
		};

		knob.addEventListener("mousedown", handleStart);
		knob.addEventListener("touchstart", handleStart, { passive: false });

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

		const currentTime = state.isPlaying
			? (audioProcessor.audioContext?.currentTime || 0) - state.startTime
			: state.currentTime;

		if (this.elements.playButton) {
			this.elements.playButton.classList.toggle("playing", state.isPlaying);

			const playIcon = this.elements.playButton.querySelector(".play-icon");
			const pauseIcon = this.elements.playButton.querySelector(".pause-icon");

			if (state.isPlaying) {
				if (playIcon) playIcon.style.display = "none";
				if (pauseIcon) pauseIcon.style.display = "inline-block";
			} else {
				if (playIcon) playIcon.style.display = "inline-block";
				if (pauseIcon) pauseIcon.style.display = "none";
			}
		}

		if (this.elements.loading) {
			this.elements.loading.style.display = state.isReady ? "none" : "block";
		}

		if (this.elements.timeDisplay) {
			this.elements.timeDisplay.textContent =
				audioProcessor.formatTime(currentTime);
		}

		if (this.elements.duration && state.duration) {
			this.elements.duration.textContent = audioProcessor.formatTime(
				state.duration,
			);
		}

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

		if (this.elements.reverb) {
			this.elements.reverb.addEventListener("click", () => {
				callbacks.toggleReverb();
			});
			this.elements.reverb.classList.add("active");
		}
	}

	/**
	 * Update the UI to reflect the state of reverb
	 * @param {boolean} enabled - Whether reverb is enabled
	 */
	updateReverbUI(enabled) {
		if (this.elements.reverb) {
			this.elements.reverb.classList.toggle("active", enabled);
		}
	}

	/**
	 * Update the UI to reflect the selected reverb type - simplified
	 * @param {string} type - Type of reverb
	 */
	updateReverbTypeUI(type) {
		if (this.elements.reverb) {
			this.elements.reverb.classList.toggle("active", type !== "none");
		}
	}

	/**
	 * Update the solo states in the UI
	 * @param {Array} tracks - Array of track objects with isSolo property
	 */
	updateSoloUI(tracks) {
		const trackElements = [
			...this.elements.tracksContainer.querySelectorAll(".track"),
		];

		trackElements.forEach((element, index) => {
			if (index < tracks.length && tracks[index]) {
				element.classList.toggle("solo", tracks[index].isSolo);
			}
		});
	}

	/**
	 * Show the main player controls when the player is ready.
	 */
	showPlayerControls() {
		const timelineContainer = this.elements.playButton?.closest(
			".timeline-container",
		);
		if (timelineContainer) {
			timelineContainer.style.visibility = "visible";
			timelineContainer.style.opacity = "1";
		}
		if (this.elements.playButton) {
			this.elements.playButton.disabled = false;
			this.elements.playButton.classList.remove("disabled");
		}
	}

	showSpinner() {
		if (this.elements.playButton) {
			const playIcon = this.elements.playButton.querySelector(".play-icon");
			const pauseIcon = this.elements.playButton.querySelector(".pause-icon");
			const spinner = this.elements.playButton.querySelector(".spinner-icon");

			if (playIcon) playIcon.style.display = "none";
			if (pauseIcon) pauseIcon.style.display = "none";
			if (spinner) {
				spinner.style.display = "inline-block";
				spinner.style.animation = "spin 1s linear infinite";
			}
		}
	}

	hideSpinner() {
		if (this.elements.playButton) {
			const playIcon = this.elements.playButton.querySelector(".play-icon");
			const spinner = this.elements.playButton.querySelector(".spinner-icon");

			if (playIcon) playIcon.style.display = "inline-block";
			if (spinner) {
				spinner.style.display = "none";
				spinner.style.animation = "";
			}
		}
	}
}
