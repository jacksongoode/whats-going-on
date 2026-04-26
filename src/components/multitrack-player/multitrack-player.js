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

		this.trackSets = {};
		this.currentTrackSet = null;
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

		// If src attribute is present, load track sets from it
		const src = this.getAttribute("src");
		if (src) {
			await this._loadTrackSetsFromSrc(src);
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

	/**
	 * Load track sets into the player.
	 * @param {Object} trackSets - Object keyed by set name, values are { src, description }
	 * @example
	 * player.loadTrackSets({
	 *   "My Song": { src: "tracks.json", description: "A multitrack song" }
	 * });
	 */
	loadTrackSets(trackSets) {
		this.trackSets = trackSets || {};
		const keys = Object.keys(this.trackSets);
		this.currentTrackSet = keys[0] || null;
		if (this.currentTrackSet) {
			this._cachedTrackList = null;
			this._prefetchTrackMetadata();
		}
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

	_stopAllSources() {
		for (const node of this.audioNodes) {
			if (node?.source) {
				try { node.source.stop(); } catch {}
				node.source.disconnect();
				node.source = null;
			}
		}
	}

	_startAllSources(offset = 0) {
		const ctx = this.audioProcessor.audioContext;
		for (const node of this.audioNodes) {
			if (!node?.buffer) continue;
			node.source = ctx.createBufferSource();
			node.source.buffer = node.buffer;
			node.source.connect(node.gainNode);
			node.source.start(0, offset);
		}
	}

	/// Swap the current track set with the next one.
	_setState(newState) {
		Object.assign(this.state, newState);
		this.updateUI();
	}

	_resetAudioState() {
		this.audioWorker?.terminate();
		this.audioWorker = null;

		this._stopAllSources();
		this.stopPlaybackTimer();

		for (const node of this.audioNodes) {
			this.audioProcessor.disposeTrack(node);
		}
		this.audioNodes = [];

		this._setState({
			isReady: false,
			isPlaying: false,
			duration: 0,
			currentTime: 0,
		});

		this.uiManager.resetUI();
	}

	async _decodeAllTracks(tracks) {
		const decoded = [];
		const total = tracks.length;
		let done = 0;
		let active = 0;
		const queue = [];
		let onDone;

		const checkComplete = () => {
			if (done >= total) onDone?.();
		};

		const startDecode = ({ arrayBuffer, config }) => {
			active++;
			this.audioProcessor
				.decodeAudioData(arrayBuffer)
				.then((audioBuffer) => decoded.push({ audioBuffer, config }))
				.catch((err) => console.error(`Decode failed: ${config.name}`, err))
				.finally(() => {
					active--;
					done++;
					this._setState({ loadingProgress: done / total });
					if (queue.length) startDecode(queue.shift());
					checkComplete();
				});
		};

		return new Promise((resolve) => {
			onDone = resolve;

			this.audioWorker.addEventListener("message", (event) => {
				const { type, arrayBuffer, config, message } = event.data;

				if (type === "fetched") {
					event.data.arrayBuffer = null;
					const job = { arrayBuffer, config };
					if (active < 4) startDecode(job);
					else queue.push(job);
				} else if (type === "error") {
					console.error(message);
					done++;
					this._setState({ loadingProgress: done / total });
					checkComplete();
				}
			});
		}).then(() => decoded);
	}

	async _loadAndDecodeTracks() {
		if (this.state.isLoading) return;

		this._setState({ isLoading: true, loadingProgress: 0 });
		this.updateUI();

		try {
			await this.initialize();

			if (!this.currentTrackSet || !this.trackSets[this.currentTrackSet]) {
				console.error("No track set loaded");
				return;
			}

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

			const decoded = await this._decodeAllTracks(tracks);

			const trackMap = new Map(decoded.map((t) => [t.config.path, t]));
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
		if (this.state.isLoading) return null;

		const keys = Object.keys(this.trackSets);
		if (keys.length === 0) return null;

		this._resetAudioState();
		this._cachedTrackList = null;

		this.currentTrackSet =
			keys[(keys.indexOf(this.currentTrackSet) + 1) % keys.length];

		return {
			name: this.currentTrackSet,
			description: this.trackSets[this.currentTrackSet]?.description,
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

		this._startAllSources(this.state.currentTime);
		this._setState({ isPlaying: true, startTime });
		this.startPlaybackTimer();
	}

	pause() {
		if (!this.state.isPlaying) return;

		const ctx = this.audioProcessor.audioContext;
		const currentTime = ctx.currentTime - this.state.startTime;

		this._stopAllSources();
		this._setState({ isPlaying: false, currentTime });
		this.stopPlaybackTimer();
	}

	stop() {
		if (this.state.isPlaying) this._stopAllSources();
		this._setState({ isPlaying: false, currentTime: 0 });
		this.stopPlaybackTimer();
	}

	seek(position) {
		if (!this.state.isReady || !this.state.duration) return;

		const seekTime = Math.max(0, Math.min(position * this.state.duration, this.state.duration));
		const wasPlaying = this.state.isPlaying;

		this._stopAllSources();
		this.state.currentTime = seekTime;

		if (wasPlaying) {
			this.state.startTime = this.audioProcessor.audioContext.currentTime - seekTime;
			this._startAllSources(seekTime);
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
