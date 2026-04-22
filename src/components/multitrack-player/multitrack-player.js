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
			loadingProgress: 0,
			currentTime: 0,
			duration: 0,
			startTime: 0,
		};

		this.audioNodes = [];
		this.playbackTimer = null;
		this.initialized = false;
		this.cacheName = "multitrack-audio-v2";
		this.audioWorker = null;
		this._cachedTrackList = null;

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

		// Set initial player state to ready (but not loaded) so play button is enabled
		this.uiManager.showPlayerControls();
		this.updateUI();

		// Eagerly fetch track metadata so it's ready before the user hits play
		this._prefetchTrackMetadata();
	}

	async _prefetchTrackMetadata() {
		try {
			const trackSet = this.trackSets[this.currentTrackSet];
			const response = await fetch(trackSet.src);
			this._cachedTrackList = await response.json();
		} catch (e) {
			console.warn("Failed to prefetch track metadata:", e);
		}
	}

	attributeChangedCallback(name, oldValue, newValue) {
		if (name === "stylesheet" && oldValue !== newValue) {
			this.loadStylesheet();
		}
	}

	loadStylesheet() {
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
			toggleReverb: async () => this.toggleReverb(),
			isPlaying: () => this.state.isPlaying,
			isReady: () => true, // Always return true so UI is interactive for lazy loading
		});
	}

	async initialize() {
		if (this.initialized) return;
		await this.audioProcessor.initializeContext();
		this.initialized = true;
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

	async toggleReverb() {
		const enabled = await this.audioProcessor.toggleReverb();
		this.uiManager.updateReverbUI(enabled);
	}

	_dismantleSources() {
		this.audioNodes.forEach((node) => {
			if (node?.source) {
				try {
					node.source.stop();
				} catch (e) {}
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

		// Properly dispose of all audio nodes to prevent memory leaks
		this.audioNodes.forEach((node) => {
			this.audioProcessor.disposeTrack(node);
		});

		this.audioNodes = [];

		this._setState({
			isReady: false,
			duration: 0,
			currentTime: 0,
		});

		this.uiManager.resetUI();
	}

	async _loadAndDecodeTracks() {
		if (this.state.isLoading) return;

		this._setState({ isLoading: true, loadingProgress: 0 });
		this.updateUI();

		try {
			await this.initialize();

			const trackSet = this.trackSets[this.currentTrackSet];
			const tracks =
				this._cachedTrackList ||
				(await fetch(trackSet.src).then((r) => r.json()));
			const baseUrl = new URL(".", new URL(trackSet.src, window.location.href))
				.href;

			this.audioWorker = new Worker(
				new URL("./modules/audio-worker.js", import.meta.url),
				{ type: "module" },
			);

			// Fire off ALL fetches in parallel via the worker
			this.audioWorker.postMessage({
				tracks,
				cacheName: this.cacheName,
				baseUrl,
			});

			const allDecodedTracks = [];
			const totalTracks = tracks.length;
			let completedCount = 0;
			const MAX_CONCURRENT_DECODES = 4;
			let activeDecodes = 0;
			const decodeQueue = [];

			await new Promise((resolve) => {
				const checkComplete = () => {
					if (completedCount >= totalTracks) {
						resolve();
					}
				};

				const startDecode = ({ arrayBuffer, config }) => {
					activeDecodes++;
					this.audioProcessor
						.decodeAudioData(arrayBuffer)
						.then((audioBuffer) => {
							allDecodedTracks.push({ audioBuffer, config });
						})
						.catch((error) => {
							console.error(`Failed to decode ${config.name}:`, error);
						})
						.finally(() => {
							activeDecodes--;
							completedCount++;
							this._setState({
								loadingProgress: completedCount / totalTracks,
							});
							// Release compressed data reference to help GC on mobile
							arrayBuffer = null;
							// Pull next from queue if available
							if (decodeQueue.length > 0) {
								startDecode(decodeQueue.shift());
							}
							checkComplete();
						});
				};

				const onMessage = (event) => {
					const { type, arrayBuffer, config, message } = event.data;

					if (type === "fetched") {
						const job = { arrayBuffer, config };
						// Explicitly release the transferred ArrayBuffer reference
						// to help GC reclaim the compressed audio data sooner on mobile
						event.data.arrayBuffer = null;
						if (activeDecodes < MAX_CONCURRENT_DECODES) {
							startDecode(job);
						} else {
							decodeQueue.push(job);
						}
					} else if (type === "error") {
						console.error(message);
						completedCount++;
						this._setState({
							loadingProgress: completedCount / totalTracks,
						});
						checkComplete();
					}
				};

				this.audioWorker.addEventListener("message", onMessage);
			});

			const trackMap = new Map(allDecodedTracks.map((t) => [t.config.path, t]));
			this.audioNodes = tracks
				.map((t) => trackMap.get(t.path))
				.filter(Boolean)
				.map((item) =>
					this.audioProcessor.createTrackNodes(item.audioBuffer, item.config),
				);

			const duration = this.audioNodes[0]?.buffer.duration || 0;
			this.uiManager.createTrackUI(
				this.audioNodes,
				(i) => this.toggleSolo(i),
				(i, t, v) => this.updateTrackControl(i, t, v),
			);

			this._setState({ isReady: true, duration });
		} catch (error) {
			console.error("Loading failed:", error);
		} finally {
			this.audioWorker?.terminate();
			this.audioWorker = null;
			this._setState({ isLoading: false });
		}
	}

	swapTrackSet() {
		if (this.state.isLoading) return;

		this._resetAudioState();

		const keys = Object.keys(this.trackSets);
		this.currentTrackSet =
			keys[(keys.indexOf(this.currentTrackSet) + 1) % keys.length];

		return {
			name: this.currentTrackSet,
			description: this.trackSets[this.currentTrackSet].description,
		};
	}

	async play() {
		if (this.state.isPlaying || this.state.isLoading) return;

		if (!this.state.isReady) {
			await this._loadAndDecodeTracks();
		}

		if (!this.state.isReady) return;

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
		this.startPlaybackTimer();
	}
	pause() {
		if (!this.state.isPlaying) return;

		const ctx = this.audioProcessor.audioContext;
		const currentTime = ctx.currentTime - this.state.startTime;

		this._dismantleSources();

		this._setState({ isPlaying: false, currentTime });
		this.stopPlaybackTimer();
	}
	stop() {
		if (this.state.isPlaying) {
			this._dismantleSources();
		}

		this._setState({ isPlaying: false, currentTime: 0 });
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
		this.uiManager.updatePlayerUI(this.state, this.audioProcessor.audioContext);
	}
}

customElements.define("multitrack-player", MultitrackPlayer);
