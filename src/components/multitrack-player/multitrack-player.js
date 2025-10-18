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
			isLoading: false,
			currentTime: 0,
			duration: 0,
			startTime: 0,
		};

		this.audioNodes = [];
		this.rawAudioData = [];
		this.playbackTimer = null;
		this.initialized = false;
		this.loading = false;
		this.cacheName = "multitrack-audio-v2";
		this.decodingStarted = false;
		this.decodingPromise = null;
		this.audioWorker = null;

		this.trackSets = {
			"What's Going On?": {
				src: "public/tracks-whats.json",
				description: `Born from the police violence targeting student protesters
                    at Berkeley, harrowing letters from Vietnam from his brother
                    and Gaye's own personal grief in the wake of Tammi Terrell's
                    death into a collective catharsis. Jazz-infused arrangements
                    and layered vocals - recorded in a single midnight take -
                    rejected Motown's apolitical formula, bringing soul music's
                    first protest concept album with one enduring question.`,
			},
			"I Want You": {
				src: "public/tracks-want.json",
				description: `
					<div style="width: 100%; max-width: 400px; margin: auto;">
						<iframe
							style="width: 100%; aspect-ratio: 4 / 3; border-radius: 8px; border: 0;"
							src="https://www.youtube.com/embed/hPEecWIAvao?controls=0"
							title="YouTube video player"
							allowfullscreen>
						</iframe>
					</div>`,
			},
		};
		this.currentTrackSet = "What's Going On?";
	}

	async connectedCallback() {
		const template = this.uiManager.createTemplate();
		this.shadowRoot.appendChild(template);

		this.uiManager.cacheElements(this.shadowRoot);
		this.loadStylesheet();
		this.setupUI();

		this.titleElement = document.querySelector(".title");
		this.garfieldIcon = document.querySelector(".garfield-icon");

		if (this.garfieldIcon) {
			this.garfieldIcon.addEventListener("click", this.swapTrackSet.bind(this));
		}

		this.uiManager.showPlayerControls();
		this.updateUI();
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

	async _fetchAndCache(url) {
		const cached = await this.getCachedAudio(url);
		if (cached) {
			console.log("Cache hit:", url);
			return cached;
		}
		console.log("Fetching from network:", url);
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}
		this.cacheAudio(url, response.clone());
		return response.arrayBuffer();
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

	_dismantleSources() {
		this.audioNodes.forEach((node) => {
			if (node?.source) {
				node.source.stop();
				node.source.disconnect();
				node.source = null;
			}
		});
	}

	/// Swap the current track set with the next one.
	_setState(newState) {
		Object.assign(this.state, newState);
		this.updateUI();
	}
	_resetAudioState() {
		if (this.audioWorker) {
			this.audioWorker.terminate();
			this.audioWorker = null;
		}
		this.stop();
		this._dismantleSources();
		this.audioNodes = [];
		this.rawAudioData = [];
		this.decodingPromise = null;
		this._setState({
			isReady: false,
			duration: 0,
			currentTime: 0,
		});
		this.uiManager.elements.tracksContainer.innerHTML = "";
		this.uiManager.elements.tracksContainer.style.display = "none";
	}
	async _loadAndDecodeTracks() {
		if (this.state.isLoading) return;

		this._setState({ isLoading: true });
		this.updateUI();

		try {
			await this.initialize();

			const trackSet = this.trackSets[this.currentTrackSet];
			if (!trackSet) return;

			const response = await fetch(trackSet.src);
			const tracks = await response.json();

			await new Promise((resolve, reject) => {
				const workerUrl = new URL(
					"./modules/audio-worker.js",
					import.meta.url,
				);
				this.audioWorker = new Worker(workerUrl, { type: "module" });
				const decodedPromises = [];

				this.audioWorker.onmessage = (event) => {
					const { type, arrayBuffer, config, message } = event.data;

					if (type === "fetched") {
						const promise = this.audioProcessor
							.decodeAudioData(arrayBuffer)
							.then((audioBuffer) => ({ audioBuffer, config }))
							.catch((decodeError) => {
								console.error(
									`Failed to decode ${config.name} on main thread:`,
									decodeError,
								);
								return null;
							});
						decodedPromises.push(promise);
					} else if (type === "error") {
						console.error(`Worker error for track ${config.name}: ${message}`);
					}

					if (decodedPromises.length === tracks.length) {
						Promise.all(decodedPromises)
							.then((decodedTracks) => {
								const trackMap = new Map(
									decodedTracks.filter(Boolean).map((t) => [t.config.path, t]),
								);
								const orderedTracks = tracks.map((track) =>
									trackMap.get(track.path),
								);
								this.audioNodes = orderedTracks.filter(Boolean).map((item) => {
									return this.audioProcessor.createTrackNodes(
										item.audioBuffer,
										item.config,
									);
								});

								const duration =
									this.audioNodes.find((n) => n)?.buffer.duration || 0;
								this.uiManager.createTrackUI(
									this.audioNodes,
									(index) => this.toggleSolo(index),
									(index, type, value) =>
										this.updateTrackControl(index, type, value),
								);

								this.dispatchEvent(
									new CustomEvent("tracks-ready", {
										detail: { decodeTime: "worker" },
									}),
								);
								this._setState({ isReady: true, duration });
								this.audioWorker.terminate();
								resolve();
							})
							.catch(reject);
					}
				};

				this.audioWorker.onerror = (error) => {
					console.error("An error occurred in the audio worker:", error);
					this.audioWorker.terminate();
					reject(error);
				};

				const baseUrl = new URL(
					".",
					new URL(trackSet.src, window.location.href),
				).href;

				this.audioWorker.postMessage({
					tracks,
					cacheName: this.cacheName,
					baseUrl,
				});
			});
		} catch (error) {
			console.error("Track loading and decoding failed:", error);
			this._setState({ isReady: false });
		} finally {
			this._setState({ isLoading: false });
		}
	}
	async swapTrackSet() {
		this._resetAudioState();
		this.updateUI();

		// Toggle to the next track set and update the UI.
		const trackSetKeys = Object.keys(this.trackSets);
		const currentIndex = trackSetKeys.indexOf(this.currentTrackSet);
		this.currentTrackSet =
			trackSetKeys[(currentIndex + 1) % trackSetKeys.length];

		if (this.titleElement) this.titleElement.textContent = this.currentTrackSet;
		if (this.garfieldIcon) this.garfieldIcon.classList.toggle("flipped");

		const descriptionEl = document.querySelector(".description");
		if (descriptionEl) {
			descriptionEl.innerHTML =
				this.trackSets[this.currentTrackSet].description;
		}

		await this._loadAndDecodeTracks();
	}
	async play() {
		if (this.state.isPlaying || this.state.isLoading) return;

		if (!this.state.isReady) {
			await this._loadAndDecodeTracks();
		}

		if (!this.state.isReady) {
			return;
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

		this._setState({ isPlaying: true, startTime });
		this.dispatchEvent(new CustomEvent("play"));
		this.startPlaybackTimer();
	}
	pause() {
		if (!this.state.isPlaying) return;

		const ctx = this.audioProcessor.audioContext;
		const currentTime = ctx.currentTime - this.state.startTime;

		this._dismantleSources();

		this._setState({ isPlaying: false, currentTime });
		this.dispatchEvent(new CustomEvent("pause"));
		this.stopPlaybackTimer();
	}
	stop() {
		if (this.state.isPlaying) {
			this._dismantleSources();
		}

		this._setState({ isPlaying: false, currentTime: 0 });
		this.dispatchEvent(new CustomEvent("pause"));
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
