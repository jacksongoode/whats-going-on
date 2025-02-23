class MultitrackPlayer {
	constructor() {
		document.querySelector(".loading-status").textContent =
			"Click anywhere to begin...";

		this.tracks = [
			{
				path: "public/assets/tracks/main_vox_2.ogg",
				name: "Lead Vocals",
				gain: 1.0,
				pan: 0,
			},
			{
				path: "public/assets/tracks/main_vox_1.ogg",
				name: "Lead Vocals 2",
				gain: 0.75,
				pan: 0,
			},
			{
				path: "public/assets/tracks/bvox_1.ogg",
				name: "Background Vocals",
				gain: 0.35,
				pan: -0.2,
			},
			{
				path: "public/assets/tracks/clicks_n_vox_bits.ogg",
				name: "Snaps & Vocals",
				gain: 0.4,
				pan: -0.15,
			},
			{
				path: "public/assets/tracks/bass.ogg",
				name: "Bass",
				gain: 0.75,
				pan: 0,
			},
			{
				path: "public/assets/tracks/gtr_1.ogg",
				name: "Guitar 1",
				gain: 0.6,
				pan: -0.35,
			},
			{
				path: "public/assets/tracks/gtr_2.ogg",
				name: "Guitar 2",
				gain: 0.4,
				pan: -0.5,
			},
			{
				path: "public/assets/tracks/main_kit.ogg",
				name: "Drum Kit",
				gain: 0.85,
				pan: 0.1,
			},
			{
				path: "public/assets/tracks/kit_2.ogg",
				name: "Conga",
				gain: 0.3,
				pan: 0.15,
			},
			{
				path: "public/assets/tracks/perc.ogg",
				name: "Bongo",
				gain: 0.6,
				pan: -0.45,
			},
			{
				path: "public/assets/tracks/piano.ogg",
				name: "Piano",
				gain: 0.3,
				pan: 0.1,
			},
			{
				path: "public/assets/tracks/vibes.ogg",
				name: "Vibraphone",
				gain: 0.5,
				pan: 0.75,
			},
			{
				path: "public/assets/tracks/sax.ogg",
				name: "Saxophone",
				gain: 0.7,
				pan: -0.6,
			},
			{
				path: "public/assets/tracks/strings_1l.ogg",
				name: "Strings L",
				gain: 0.3,
				pan: -0.55,
			},
			{
				path: "public/assets/tracks/strings_2r.ogg",
				name: "Strings R",
				gain: 0.3,
				pan: 0.55,
			},
			{
				path: "public/assets/tracks/strings_3m.ogg",
				name: "Strings M",
				gain: 0.3,
				pan: 0,
			},
		];

		this.state = {
			isPlaying: false,
			isReady: false,
			currentTime: 0,
			startTime: 0,
		};

		this.audioContext = new (window.AudioContext ||
			window.webkitAudioContext)();
		this.audioNodes = [];
		this.elements = {};
		this.reverbEnabled = true;
		this.cacheName = "audio-cache-v1";
		this.reverbBuffer = null;
		this.cacheElements();

		this.init();
	}

	async init() {
		try {
			await this.createReverbNodes();
			this.setupInitialUI();
			this.updateLoadingStatus("Click anywhere to load tracks...");
		} catch (error) {
			console.error("Initial setup failed:", error);
			this.updateLoadingStatus("Error during initialization");
		}
	}

	setupInitialUI() {
		// Spacebar handler (simple version)
		document.addEventListener("keydown", (e) => {
			if (e.code === "Space") {
				e.preventDefault();
				this.state.isPlaying ? this.pause() : this.play();
			}
		});

		// Only setup the basic UI elements (play button, timeline, etc)
		this.elements.tracks.innerHTML = "";

		// Setup play button handler
		this.elements.playButton.addEventListener("click", async () => {
			if (!this.state.isReady) return;
			try {
				if (this.state.isPlaying) {
					await this.pause();
				} else {
					await this.play();
				}
			} catch (error) {
				console.error("Error handling play/pause:", error);
			}
		});

		// Setup timeline interaction
		let isDragging = false;
		let wasPlaying = false;

		this.elements.timeline.addEventListener("mousedown", (e) => {
			isDragging = true;
			wasPlaying = this.state.isPlaying;
			if (this.state.isPlaying) {
				this.pause();
			}
			handleTimelineInteraction(e);
		});

		document.addEventListener("mousemove", (e) => {
			if (!isDragging) return;
			handleTimelineInteraction(e);
		});

		document.addEventListener("mouseup", async () => {
			if (!isDragging) return;
			isDragging = false;
			if (wasPlaying) {
				await this.play();
			}
		});

		// Direct click handling for timeline
		this.elements.timeline.addEventListener("click", (e) => {
			if (!this.state.isReady) return;
			handleTimelineInteraction(e);
		});

		const handleTimelineInteraction = (e) => {
			const rect = this.elements.timeline.getBoundingClientRect();
			const position = (e.clientX - rect.left) / rect.width;
			const normalizedPosition = Math.max(0, Math.min(1, position));
			this.seekTo(normalizedPosition * this.duration);
		};

		// Wrap each letter in the title with a span, preserving spaces
		const title = document.querySelector(".title");
		title.innerHTML = title.textContent
			.split("")
			.map((char, i) =>
				char === " "
					? " "
					: `<span style="animation-delay: ${i * 0.1}s">${char}</span>`
			)
			.join("");

		const titleContainer = document.querySelector(".title-container");
		title.addEventListener("click", function (e) {
			e.preventDefault();
			document.querySelector(".title-container").classList.toggle("active");
		});
	}

	async initializeAudio() {
		if (this.audioContext.state === "suspended") {
			try {
				await this.audioContext.resume();
				this.updateLoadingStatus("Loading audio tracks...");
				await this.loadTracks();
				await this.setupTrackUI();
				this.state.isReady = true;
				this.updateUI();
				document.querySelector(".garfield-icon").classList.add("loaded");
			} catch (error) {
				console.error("Error initializing audio:", error);
				this.updateLoadingStatus("Error loading audio system");
			}
		}
	}

	async setupTrackUI() {
		// Now create UI elements for each loaded track
		this.audioNodes.forEach((track, index) => this.createTrackUI(track, index));

		// Setup reverb toggle
		this.elements.reverb.addEventListener("click", () => this.toggleReverb());
	}

	cacheElements() {
		this.elements = {
			playButton: document.querySelector(".play-pause-button"),
			timeline: document.querySelector(".timeline"),
			progress: document.querySelector(".progress-bar"),
			playhead: document.querySelector(".playhead"),
			timeDisplay: document.querySelector(".current-time"),
			duration: document.querySelector(".duration"),
			loading: document.querySelector(".loading-container"),
			tracks: document.querySelector(".tracks-container"),
			reverb: document.querySelector(".reverb-toggle"),
			loadingCount: document.querySelector(".loading-count"),
			loadingProgress: document.querySelector(".loading-progress"),
		};

		// Set initial active state for reverb toggle
		this.elements.reverb.classList.add("active");
	}

	async loadTracks() {
		try {
			this.updateLoadingStatus("Loading tracks...");
			const total = this.tracks.length;
			let loadedCount = 0;

			// Helper: decode one track
			const decodeTrack = async (track) => {
				const response = await fetch(track.path);
				if (!response.ok)
					throw new Error(`HTTP error! status: ${response.status}`);

				const arrayBuffer = await response.arrayBuffer();
				const audioBuffer = await this.audioContext.decodeAudioData(
					arrayBuffer
				);

				// Create and connect audio nodes
				const gainNode = this.audioContext.createGain();
				const panNode = this.audioContext.createStereoPanner();
				const dryGain = this.audioContext.createGain();
				const wetGain = this.audioContext.createGain();
				const preDelay = this.audioContext.createDelay(0.1);
				const convolver = this.audioContext.createConvolver();

				// Set initial values
				gainNode.gain.value = track.gain;
				panNode.pan.value = track.pan;
				preDelay.delayTime.value = 0.03;
				dryGain.gain.value = 0.85;
				wetGain.gain.value = 0.15;

				// Connect nodes
				gainNode.connect(panNode);
				panNode.connect(dryGain);
				panNode.connect(preDelay);
				preDelay.connect(convolver);
				convolver.connect(wetGain);
				dryGain.connect(this.audioContext.destination);
				wetGain.connect(this.audioContext.destination);

				// Update loading progress
				loadedCount++;
				this.elements.loadingCount.textContent = `${loadedCount}/${total}`;
				this.elements.loadingProgress.style.width = `${
					(loadedCount / total) * 100
				}%`;

				if (this.reverbBuffer) {
					convolver.buffer = this.reverbBuffer;
				}

				return {
					...track,
					buffer: audioBuffer,
					source: null,
					gainNode,
					panNode,
					dryGain,
					wetGain,
					preDelay,
					convolver,
					isSolo: false,
					gain: track.gain,
					pan: track.pan,
				};
			};

			// Initialize audioNodes array with the correct length
			this.audioNodes = new Array(this.tracks.length);

			// Load all tracks and store them in order
			const loadedNodes = await Promise.all(
				this.tracks.map((track, index) =>
					decodeTrack(track).then((node) => ({ node, index }))
				)
			);

			// Place each node in its correct position in the array
			loadedNodes.forEach(({ node, index }) => {
				this.audioNodes[index] = node;
			});

			// Set up player after all tracks are loaded
			this.duration = this.audioNodes[0].buffer.duration;
			this.updateTimeDisplay(0, this.duration);

			// Update player state
			this.state.isReady = true;
			this.elements.playButton.disabled = false;
			this.elements.playButton.classList.remove("disabled");
			this.elements.loading.classList.add("hidden");
		} catch (error) {
			console.error("Error loading tracks:", error);
			this.updateLoadingStatus("Failed to load tracks");
			this.showErrorMessage(`Failed to load tracks: ${error.message}`);
		}
	}

	createTrackUI(track, index) {
		const trackElement = document.createElement("div");
		trackElement.className = "track";

		// Add click handler to track element
		trackElement.addEventListener("click", (e) => {
			// Check if the click originated from a knob or knob container
			if (!e.target.closest(".knob-container")) {
				this.toggleSolo(index);
			}
		});

		const trackName = document.createElement("div");
		trackName.className = "track-name";
		trackName.textContent = track.name;

		const controls = document.createElement("div");
		controls.className = "track-controls";

		// Gain knob
		const gainKnob = this.createKnob("gain", track.gain, (value) => {
			track.gain = value;
			track.gainNode.gain.value = value;
		});

		// Pan knob
		const panKnob = this.createKnob("pan", track.pan, (value) => {
			track.pan = value;
			track.panNode.pan.value = value;
		});

		controls.appendChild(gainKnob);
		controls.appendChild(panKnob);
		trackElement.appendChild(trackName);
		trackElement.appendChild(controls);

		this.elements.tracks.appendChild(trackElement);
		return trackElement;
	}

	createKnob(type, initialValue, onChange) {
		const container = document.createElement("div");
		container.className = "knob-container";

		// Prevent text selection on the container
		container.style.userSelect = "none";
		container.style.webkitUserSelect = "none";
		container.style.msUserSelect = "none";

		// Add icons
		const iconsContainer = document.createElement("div");
		iconsContainer.className = "knob-icons";

		if (type === "gain") {
			iconsContainer.innerHTML = `
                <i data-feather="volume-1"></i>
                <i data-feather="volume-2"></i>
            `;
		} else {
			iconsContainer.innerHTML = `
                <i data-feather="chevron-left"></i>
                <i data-feather="chevron-right"></i>
            `;
		}
		container.appendChild(iconsContainer);

		const knob = document.createElement("div");
		knob.className = "knob";
		knob.dataset.type = type;

		// Prevent text selection on the knob
		knob.style.userSelect = "none";
		knob.style.webkitUserSelect = "none";
		knob.style.msUserSelect = "none";

		const label = document.createElement("div");
		label.className = "knob-label";
		label.textContent = type;

		// Add tooltip for displaying current value
		const tooltip = document.createElement("div");
		tooltip.className = "knob-tooltip";
		tooltip.style.position = "absolute";
		tooltip.style.top = "-25px";
		tooltip.style.left = "50%";
		tooltip.style.transform = "translateX(-50%)";
		tooltip.style.backgroundColor = "#222";
		tooltip.style.color = "#fff";
		tooltip.style.padding = "2px 4px";
		tooltip.style.borderRadius = "3px";
		tooltip.style.fontSize = "10px";
		tooltip.style.display = "none";
		container.appendChild(tooltip);

		// Convert value to rotation angle
		const valueToAngle = (val) => {
			const min = type === "gain" ? 0 : -1;
			const max = type === "gain" ? 1 : 1;
			return ((val - min) / (max - min)) * 270 - 135; // -135 to +135 degrees
		};

		// Convert angle to value
		const angleToValue = (angle) => {
			const min = type === "gain" ? 0 : -1;
			const max = type === "gain" ? 1 : 1;
			return Math.min(
				max,
				Math.max(min, min + ((angle + 135) / 270) * (max - min))
			);
		};

		// Set initial rotation
		knob.style.transform = `rotate(${valueToAngle(initialValue)}deg)`;

		// Knob interaction
		let isDragging = false;
		let startY;
		let startValue;

		const handleMove = (e) => {
			if (!isDragging) return;

			// Prevent text selection during drag
			e.preventDefault();
			e.stopPropagation();

			const clientY = e.type.startsWith("touch")
				? e.touches[0].clientY
				: e.clientY;
			const deltaY = startY - clientY;
			const deltaValue = (deltaY / 100) * (type === "gain" ? 1 : 2);
			const newValue = Math.min(
				1,
				Math.max(type === "gain" ? 0 : -1, startValue + deltaValue)
			);

			knob.style.transform = `rotate(${valueToAngle(newValue)}deg)`;
			onChange(newValue);
			tooltip.textContent = newValue.toFixed(2);
			tooltip.style.display = "block";
		};

		const handleStart = (e) => {
			isDragging = true;
			startY = e.type.startsWith("touch") ? e.touches[0].clientY : e.clientY;
			startValue = initialValue;

			// Prevent text selection on drag start
			e.preventDefault();
			e.stopPropagation();

			document.addEventListener("mousemove", handleMove);
			document.addEventListener("touchmove", handleMove, { passive: false });
			document.addEventListener("mouseup", handleEnd);
			document.addEventListener("touchend", handleEnd);

			// Add a class to body to prevent selection during drag
			document.body.classList.add("dragging-knob");
		};

		const handleEnd = (e) => {
			if (!isDragging) return;
			isDragging = false;
			tooltip.style.display = "none";

			document.removeEventListener("mousemove", handleMove);
			document.removeEventListener("touchmove", handleMove);
			document.removeEventListener("mouseup", handleEnd);
			document.removeEventListener("touchend", handleEnd);

			// Remove the dragging class
			document.body.classList.remove("dragging-knob");

			if (e) {
				e.preventDefault();
				e.stopPropagation();
			}
		};

		knob.addEventListener("mousedown", handleStart);
		knob.addEventListener("touchstart", handleStart, { passive: false });

		container.appendChild(knob);
		container.appendChild(label);

		// Initialize the Feather icons we just added
		feather.replace();

		return container;
	}

	toggleSolo(index) {
		// Guard against invalid indices
		if (
			index < 0 ||
			index >= this.audioNodes.length ||
			!this.audioNodes[index]
		) {
			console.error("Invalid track index:", index);
			return;
		}

		const track = this.audioNodes[index];
		track.isSolo = !track.isSolo;

		// Get only valid track elements
		const trackElements = Array.from(this.elements.tracks.children);

		// Update UI and gains only for valid tracks
		this.audioNodes.forEach((node, i) => {
			if (node && i < trackElements.length) {
				trackElements[i].classList.toggle("solo", node.isSolo);
			}
		});

		// Update gain values
		const hasSoloTracks = this.audioNodes.some((node) => node && node.isSolo);
		this.audioNodes.forEach((node) => {
			if (node) {
				const newGain = hasSoloTracks
					? node.isSolo
						? node.gain
						: 0
					: node.gain;
				node.gainNode.gain.value = newGain;
			}
		});
	}

	async play() {
		if (!this.state.isReady || this.state.isPlaying) return;

		await this.audioContext.resume();

		const startTime = this.audioContext.currentTime - this.state.currentTime;

		this.audioNodes.forEach((node) => {
			node.source = this.audioContext.createBufferSource();
			node.source.buffer = node.buffer;
			node.source.connect(node.gainNode);
			node.source.start(0, this.state.currentTime);
		});

		this.state.isPlaying = true;
		this.state.startTime = startTime;
		this.updateUI();
		this.updatePlayhead();
	}

	pause() {
		if (!this.state.isPlaying) return;

		this.state.currentTime =
			this.audioContext.currentTime - this.state.startTime;

		this.audioNodes.forEach((node) => {
			node.source?.stop();
			node.source = null;
		});

		this.state.isPlaying = false;
		this.updateUI();
	}

	async seekTo(time, resume = this.state.isPlaying) {
		// Ensure we have a valid total duration before proceeding
		if (!Number.isFinite(this.duration) || this.duration <= 0) {
			console.error("Invalid duration; cannot seek.");
			return;
		}
		const total = this.duration;
		// Clamp the desired seek time between 0 and the total duration
		const newTime = Math.max(0, Math.min(time, total));
		const wasPlaying = this.state.isPlaying;

		// If currently playing, pause playback (which updates currentTime)
		if (wasPlaying) {
			await this.pause();
		}

		// Update the current time and UI immediately
		this.state.currentTime = newTime;
		this.updateSeekPosition(newTime / total);

		// Resume playback if it was playing before
		if (resume && wasPlaying) {
			await this.play();
		}
	}

	updatePlayhead() {
		if (!this.state.isPlaying) return;

		const currentTime = this.audioContext.currentTime - this.state.startTime;
		const duration = this.audioNodes[0].buffer.duration;
		const position = currentTime / duration;

		this.elements.progress.style.width = `${position * 100}%`;
		this.elements.playhead.style.left = `${position * 100}%`;
		this.elements.timeDisplay.textContent = this.formatTime(currentTime);

		if (currentTime < duration) {
			requestAnimationFrame(() => this.updatePlayhead());
		} else {
			this.pause();
			this.state.currentTime = 0;
			this.updatePlayhead();
		}
	}

	updateUI() {
		this.elements.playButton.classList.toggle("playing", this.state.isPlaying);
		this.elements.loading.style.display = this.state.isReady ? "none" : "block";
		document
			.querySelector(".title")
			.classList.toggle("playing", this.state.isPlaying);
	}

	formatTime(seconds) {
		const minutes = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${minutes}:${secs.toString().padStart(2, "0")}`;
	}

	updateLoadingStatus(message) {
		const statusElement = document.querySelector(".loading-status");
		if (statusElement) {
			statusElement.textContent = message;
		}
	}

	showErrorMessage(message) {
		console.error(message);
		this.updateLoadingStatus(`Error: ${message}`);
	}

	async createReverbNodes() {
		try {
			this.reverbBuffer = await this.renderReverbTail(1.8);
			this.updateReverbBuffers();
		} catch (error) {
			console.error("Reverb generation failed:", error);
		}
	}

	async renderReverbTail(duration) {
		const offlineContext = new OfflineAudioContext(
			2,
			this.audioContext.sampleRate * duration,
			this.audioContext.sampleRate
		);

		// Create decaying noise
		const noise = offlineContext.createBufferSource();
		const buffer = offlineContext.createBuffer(
			1,
			offlineContext.sampleRate * duration,
			offlineContext.sampleRate
		);

		// Fill with noise that exponentially decays
		const channelData = buffer.getChannelData(0);
		for (let i = 0; i < channelData.length; i++) {
			const progress = i / channelData.length;
			channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - progress, 2);
		}

		// Shape with filters
		const hpFilter = offlineContext.createBiquadFilter();
		hpFilter.type = "highpass";
		hpFilter.frequency.value = 800;

		const lpFilter = offlineContext.createBiquadFilter();
		lpFilter.type = "lowpass";
		lpFilter.frequency.value = 3000;

		// Connect nodes
		noise.buffer = buffer;
		noise.connect(hpFilter);
		hpFilter.connect(lpFilter);
		lpFilter.connect(offlineContext.destination);

		// Render
		noise.start(0);
		const renderedBuffer = await offlineContext.startRendering();
		return renderedBuffer;
	}

	updateReverbBuffers() {
		this.audioNodes.forEach((track) => {
			if (track.convolver && this.reverbBuffer) {
				track.convolver.buffer = this.reverbBuffer;
			}
		});
	}

	toggleReverb() {
		this.reverbEnabled = !this.reverbEnabled;
		this.elements.reverb.classList.toggle("active", this.reverbEnabled);

		this.audioNodes.forEach((track) => {
			track.panNode.disconnect();

			if (this.reverbEnabled) {
				// Connect to both paths with original mix
				track.panNode.connect(track.dryGain);
				track.panNode.connect(track.preDelay);
				track.dryGain.gain.setValueAtTime(0.85, this.audioContext.currentTime);
				track.wetGain.gain.setValueAtTime(0.15, this.audioContext.currentTime);
			} else {
				// Bypass wet path completely
				track.panNode.connect(track.dryGain);
				track.dryGain.gain.setValueAtTime(1.0, this.audioContext.currentTime);
				track.wetGain.gain.setValueAtTime(0, this.audioContext.currentTime);
			}
		});
	}

	// Add this method to handle time display updates
	updateTimeDisplay(currentTime, duration) {
		this.elements.timeDisplay.textContent = this.formatTime(currentTime);
		this.elements.duration.textContent = this.formatTime(duration);
	}

	// Add seek position method
	updateSeekPosition(position) {
		const normalizedPosition = Math.max(0, Math.min(1, position));
		const time = normalizedPosition * this.duration;
		this.updateTimeDisplay(time, this.duration);
		this.elements.progress.style.width = `${normalizedPosition * 100}%`;
		this.elements.playhead.style.left = `${normalizedPosition * 100}%`;
	}
}

// Initialize player but wait for interaction to load audio
let player = new MultitrackPlayer();

// Add click handler to document
document.addEventListener(
	"click",
	() => {
		player.initializeAudio();
	},
	{ once: true }
);
