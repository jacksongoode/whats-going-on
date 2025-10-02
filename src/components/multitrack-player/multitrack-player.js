import { AudioProcessor } from "./modules/audio-processor.js";
import { UIManager } from "./modules/ui-manager.js";

class MultitrackPlayer extends HTMLElement {
	static get observedAttributes() {
		return ["src", "stylesheet"];
	}

	constructor() {
		super();
		this.attachShadow({ mode: "open" });

		this.audioProcessor = new AudioProcessor();
		this.uiManager = new UIManager();

		this.state = {
			isPlaying: false,
			isReady: false,
			currentTime: 0,
			duration: 0,
			startTime: 0,
		};

		this.audioNodes = [];
		this.rawAudioData = [];
		this.playbackTimer = null;
		this.initialized = false;
		this.loading = false;
		this.cacheName = "multitrack-audio-v1";
		this.decodingStarted = false;
		this.decodingPromise = null;
	}

	async connectedCallback() {
		const template = this.uiManager.createTemplate();
		this.shadowRoot.appendChild(template);

		this.uiManager.cacheElements(this.shadowRoot);
		this.loadStylesheet();
		this.setupUI();

		if (this.hasAttribute("src")) {
			requestAnimationFrame(() => {
				this.loadTracks();
			});
		}
	}

	attributeChangedCallback(name, oldValue, newValue) {
		if (name === "src" && oldValue !== newValue) {
			this.loadTracks();
		}
		if (name === "stylesheet" && oldValue !== newValue) {
			this.loadStylesheet();
		}
	}

	loadStylesheet() {
		// Only load external stylesheet if specified (for theming/overrides)
		const stylesheetUrl = this.getAttribute("stylesheet");
		if (!stylesheetUrl) return;

		const existing = this.shadowRoot.querySelector("link[rel=stylesheet]");
		if (existing) existing.remove();

		const link = document.createElement("link");
		link.rel = "stylesheet";
		link.href = stylesheetUrl;
		this.shadowRoot.appendChild(link);
	}

	setupUI() {
		this.uiManager.setupInitialUI({
			play: () => this.play(),
			pause: () => this.pause(),
			stop: () => this.stop(),
			seek: (position) => this.seek(position),
			toggleReverb: () => this.toggleReverb(),
			isPlaying: () => this.state.isPlaying,
			isReady: () => this.state.isReady,
		});
	}

	async initialize() {
		if (this.initialized) return;

		try {
			await this.audioProcessor.initializeContext();
			this.initialized = true;
		} catch (error) {
			console.error("Failed to initialize audio:", error);
			throw error;
		}
	}

	async getCachedAudio(url) {
		try {
			const cache = await caches.open(this.cacheName);
			const cached = await cache.match(url);
			if (cached) {
				return await cached.arrayBuffer();
			}
		} catch (error) {
			console.warn("Cache read failed:", error);
		}
		return null;
	}

	async cacheAudio(url, response) {
		try {
			const cache = await caches.open(this.cacheName);
			await cache.put(url, response);
		} catch (error) {
			console.warn("Cache write failed:", error);
		}
	}

	async loadTracks() {
		const src = this.getAttribute("src");
		if (!src || this.loading) return;

		this.loading = true;
		this.uiManager.updateLoadingUI(0, 1, "Initializing...");

		try {
			const response = await fetch(src);
			const tracks = await response.json();

			this.uiManager.updateLoadingUI(0, tracks.length, "Loading tracks...");

			const nodes = [];
			for (let i = 0; i < tracks.length; i++) {
				try {
					const track = tracks[i];

					let arrayBuffer = await this.getCachedAudio(track.path);
					const usedPath = track.path;

					if (!arrayBuffer) {
						console.log("Fetching from network:", track.name);
						const response = await fetch(track.path);
						this.cacheAudio(track.path, response.clone());
						arrayBuffer = await response.arrayBuffer();
					} else {
						console.log("Cache hit:", track.name);
					}

					nodes.push({ arrayBuffer, config: { ...track, path: usedPath } });

					this.uiManager.updateLoadingUI(i + 1, tracks.length);
				} catch (error) {
					console.error(`Error loading track ${i}:`, error);
					nodes.push(null);
				}
			}

			this.rawAudioData = nodes.filter((n) => n);

			if (this.rawAudioData.length > 0) {
				this.uiManager.updateLoadingUI(
					nodes.length,
					nodes.length,
					"Ready to play",
				);

				setTimeout(() => {
					this.uiManager.showPlayerControls();
					this.uiManager.fadeOutLoading();
					this.state.isReady = true;
					this.updateUI();

					console.log(
						`✓ All ${this.rawAudioData.length} tracks loaded. Click anywhere to start decoding.`,
					);

					const startDecode = (e) => {
						console.log(
							"Click detected on:",
							e.target.tagName || e.target.nodeName,
						);
						if (!this.decodingPromise) {
							console.log("→ Starting background decode...");
							this.uiManager.showSpinner();
							this.decodeTracksInBackground();
						} else {
							console.log("→ Decode already in progress");
						}
					};

					this.shadowRoot.addEventListener("click", startDecode, {
						once: true,
						capture: true,
					});
					document.addEventListener("click", startDecode, {
						once: true,
						capture: true,
					});
				}, 500);
			} else {
				this.updateUI();
			}
		} catch (error) {
			console.error("Error loading tracks:", error);
			this.uiManager.updateLoadingUI(0, 0, `Error: ${error.message}`);
		} finally {
			this.loading = false;
		}
	}

	async decodeTracksInBackground() {
		if (this.decodingPromise) return this.decodingPromise;
		if (this.audioNodes.length > 0 || this.rawAudioData.length === 0) return;

		this.decodingPromise = (async () => {
			if (!this.initialized) {
				try {
					await this.initialize();
				} catch (error) {
					console.warn(
						"Cannot decode yet, audio context needs user interaction",
					);
					this.decodingPromise = null;
					return;
				}
			}

			const total = this.rawAudioData.length;
			const startTime = performance.now();

			console.log(`🎵 Decoding ${total} tracks in parallel...`);

			const decodePromises = this.rawAudioData.map(async (item) => {
				let audioBuffer;

				try {
					audioBuffer = await this.audioProcessor.decodeAudioData(
						item.arrayBuffer,
					);
				} catch (decodeError) {
					if (item.config.fallback) {
						try {
							let fallbackBuffer = await this.getCachedAudio(
								item.config.fallback,
							);

							if (!fallbackBuffer) {
								const response = await fetch(item.config.fallback);
								this.cacheAudio(item.config.fallback, response.clone());
								fallbackBuffer = await response.arrayBuffer();
							}

							audioBuffer =
								await this.audioProcessor.decodeAudioData(fallbackBuffer);
						} catch (fallbackError) {
							console.error(`Both formats failed for ${item.config.name}`);
							return null;
						}
					} else {
						return null;
					}
				}

				return this.audioProcessor.createTrackNodes(audioBuffer, item.config);
			});

			this.audioNodes = await Promise.all(decodePromises);
			this.state.duration =
				this.audioNodes.find((n) => n)?.buffer.duration || 0;

			const decodeTime = ((performance.now() - startTime) / 1000).toFixed(2);
			const successful = this.audioNodes.filter((n) => n).length;
			console.log(
				`✓ Successfully decoded ${successful}/${total} tracks in ${decodeTime}s`,
			);

			this.uiManager.hideSpinner();

			this.uiManager.createTrackUI(
				this.audioNodes,
				(index) => this.toggleSolo(index),
				(index, type, value) => this.updateTrackControl(index, type, value),
			);

			this.dispatchEvent(
				new CustomEvent("tracks-ready", { detail: { decodeTime } }),
			);
		})();

		return this.decodingPromise;
	}

	updateTrackControl(index, type, value) {
		const track = this.audioNodes[index];
		if (!track) return;

		if (type === "gain") {
			track.gain = value;
			if (track.gainNode) {
				const hasSolo = this.audioNodes.some((n) => n?.isSolo);
				track.gainNode.gain.value = hasSolo && !track.isSolo ? 0 : value;
			}
		} else if (type === "pan") {
			track.pan = value;
			if (track.panNode) {
				track.panNode.pan.value = value;
			}
		}
	}

	toggleSolo(index) {
		const track = this.audioNodes[index];
		if (!track) return;

		track.isSolo = !track.isSolo;
		this.uiManager.updateSoloUI(this.audioNodes);

		const hasSolo = this.audioNodes.some((n) => n?.isSolo);
		this.audioNodes.forEach((node) => {
			if (node?.gainNode) {
				node.gainNode.gain.value = hasSolo && !node.isSolo ? 0 : node.gain;
			}
		});
	}

	toggleReverb() {
		const enabled = this.audioProcessor.toggleReverb(this.audioNodes);
		this.uiManager.updateReverbUI(enabled);
	}

	async play() {
		if (!this.state.isReady || this.state.isPlaying) return;

		if (this.audioNodes.length === 0) {
			this.uiManager.updateLoadingUI(0, 1, "Preparing audio...");
			this.uiManager.elements.loading.classList.remove("hidden");
			await this.decodeTracksInBackground();
			this.uiManager.fadeOutLoading();
		}

		if (!this.initialized) {
			await this.initialize();
		}

		const ctx = this.audioProcessor.audioContext;
		const startTime = ctx.currentTime - this.state.currentTime;

		this.audioNodes.forEach((node) => {
			if (!node?.buffer) return;

			node.source = ctx.createBufferSource();
			node.source.buffer = node.buffer;
			node.source.connect(node.gainNode);
			node.source.start(0, this.state.currentTime);
		});

		this.state.isPlaying = true;
		this.state.startTime = startTime;
		this.dispatchEvent(new CustomEvent("play"));
		this.updateUI();
		this.startPlaybackTimer();
	}

	pause() {
		if (!this.state.isPlaying) return;

		const ctx = this.audioProcessor.audioContext;
		this.state.currentTime = ctx.currentTime - this.state.startTime;

		this.audioNodes.forEach((node) => {
			if (node?.source) {
				node.source.stop();
				node.source = null;
			}
		});

		this.state.isPlaying = false;
		this.dispatchEvent(new CustomEvent("pause"));
		this.updateUI();
		this.stopPlaybackTimer();
	}

	stop() {
		if (this.state.isPlaying) {
			this.audioNodes.forEach((node) => {
				if (node?.source) {
					node.source.stop();
					node.source = null;
				}
			});
		}

		this.state.isPlaying = false;
		this.state.currentTime = 0;
		this.dispatchEvent(new CustomEvent("pause"));
		this.updateUI();
		this.stopPlaybackTimer();
	}

	seek(position) {
		if (!this.state.isReady || !this.state.duration) return;

		const seekTime = Math.max(
			0,
			Math.min(position * this.state.duration, this.state.duration),
		);
		const wasPlaying = this.state.isPlaying;

		this.audioNodes.forEach((node) => {
			if (node?.source) {
				node.source.stop();
				node.source = null;
			}
		});

		this.state.currentTime = seekTime;

		if (wasPlaying) {
			const ctx = this.audioProcessor.audioContext;
			this.state.startTime = ctx.currentTime - seekTime;

			this.audioNodes.forEach((node) => {
				if (!node?.buffer) return;

				node.source = ctx.createBufferSource();
				node.source.buffer = node.buffer;
				node.source.connect(node.gainNode);
				node.source.start(0, seekTime);
			});
		}

		this.updateUI();
	}

	startPlaybackTimer() {
		if (this.playbackTimer) clearInterval(this.playbackTimer);

		this.playbackTimer = setInterval(() => {
			const ctx = this.audioProcessor.audioContext;
			const currentTime = ctx.currentTime - this.state.startTime;

			if (this.state.isPlaying && currentTime >= this.state.duration) {
				this.stop();
			}

			this.updateUI();
		}, 50);
	}

	stopPlaybackTimer() {
		if (this.playbackTimer) {
			clearInterval(this.playbackTimer);
			this.playbackTimer = null;
		}
	}

	updateUI() {
		this.uiManager.updatePlayerUI(this.state, this.audioProcessor);
	}
}

customElements.define("multitrack-player", MultitrackPlayer);
