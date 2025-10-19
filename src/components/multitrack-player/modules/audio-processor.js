export class AudioProcessor {
	constructor() {
		this.audioContext = null;
		this.masterGain = null;
		this.reverbBuffer = null;
		this.reverbEnabled = true;
		this.reverbNode = null;
		this.reverbGain = null;
	}

	disposeTrack(node) {
		if (!node) return;

		if (node.source) {
			try {
				node.source.stop();
			} catch (e) {}
			node.source.disconnect();
		}

		if (node.gainNode) node.gainNode.disconnect();
		if (node.panNode) node.panNode.disconnect();
		if (node.reverbSend) node.reverbSend.disconnect();

		// Help GC
		node.buffer = null;
		node.source = null;
		node.gainNode = null;
		node.panNode = null;
		node.reverbSend = null;
	}

	async initializeContext() {
		if (this.audioContext) {
			if (this.audioContext.state === "suspended") {
				await this.audioContext.resume();
			}
			return this.audioContext;
		}

		this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
			latencyHint: "interactive",
		});

		this.masterGain = this.audioContext.createGain();
		this.masterGain.connect(this.audioContext.destination);

		// Initialize shared reverb bus
		this.reverbNode = this.audioContext.createConvolver();
		this.reverbGain = this.audioContext.createGain();
		this.reverbGain.gain.value = this.reverbEnabled ? 0.3 : 0;

		this.reverbNode.connect(this.reverbGain);
		this.reverbGain.connect(this.masterGain);

		this.loadReverbImpulse().catch((err) => {
			console.warn("Failed to load reverb impulse:", err);
		});

		return this.audioContext;
	}

	async loadReverbImpulse() {
		const url =
			"https://oramics.github.io/sampled/IR/EMT140-Plate/samples/emt_140_bright_2.wav";

		try {
			const response = await fetch(url);
			const arrayBuffer = await response.arrayBuffer();
			this.reverbBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
			if (this.reverbNode) {
				this.reverbNode.buffer = this.reverbBuffer;
			}
		} catch (error) {
			console.warn("Failed to load reverb, using synthetic:", error);
			this.reverbBuffer = await this.createSyntheticReverb();
			if (this.reverbNode) {
				this.reverbNode.buffer = this.reverbBuffer;
			}
		}
	}

	async createSyntheticReverb() {
		const duration = 1.5;
		const sampleRate = this.audioContext.sampleRate;
		const offlineCtx = new OfflineAudioContext(
			2,
			sampleRate * duration,
			sampleRate,
		);

		const buffer = offlineCtx.createBuffer(
			1,
			sampleRate * duration,
			sampleRate,
		);
		const data = buffer.getChannelData(0);

		for (let i = 0; i < data.length; i++) {
			const decay = (1 - i / data.length) ** 2;
			data[i] = (Math.random() * 2 - 1) * decay;
		}

		const noise = offlineCtx.createBufferSource();
		noise.buffer = buffer;

		const hp = offlineCtx.createBiquadFilter();
		hp.type = "highpass";
		hp.frequency.value = 800;

		const lp = offlineCtx.createBiquadFilter();
		lp.type = "lowpass";
		lp.frequency.value = 6000;

		noise.connect(hp);
		hp.connect(lp);
		lp.connect(offlineCtx.destination);

		noise.start(0);
		return await offlineCtx.startRendering();
	}

	async decodeAudioData(arrayBuffer) {
		if (!this.audioContext) {
			await this.initializeContext();
		}
		let buffer = await this.audioContext.decodeAudioData(arrayBuffer);
		buffer = this.optimizeBuffer(buffer);

		// Mobile optimization: Downsample to save memory if on mobile
		if (this.isMobile() && buffer.sampleRate > 24000) {
			buffer = await this.downsampleBuffer(buffer, 22050);
		}

		return buffer;
	}

	isMobile() {
		return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
			navigator.userAgent,
		);
	}

	async downsampleBuffer(buffer, targetSampleRate) {
		const offlineCtx = new OfflineAudioContext(
			buffer.numberOfChannels,
			Math.ceil(buffer.duration * targetSampleRate),
			targetSampleRate,
		);

		const source = offlineCtx.createBufferSource();
		source.buffer = buffer;
		source.connect(offlineCtx.destination);
		source.start(0);

		console.log(`Downsampling track to ${targetSampleRate}Hz for mobile...`);
		return await offlineCtx.startRendering();
	}

	optimizeBuffer(buffer) {
		// If it's stereo but channels are identical, convert to mono to save 50% memory
		if (buffer.numberOfChannels === 2) {
			const left = buffer.getChannelData(0);
			const right = buffer.getChannelData(1);
			let isIdentical = true;

			// Sample check (every 100th sample) for performance
			const step = 100;
			for (let i = 0; i < left.length; i += step) {
				if (Math.abs(left[i] - right[i]) > 0.01) {
					isIdentical = false;
					break;
				}
			}

			if (isIdentical) {
				console.log("Optimizing stereo track to mono (identical channels)");
				const monoBuffer = this.audioContext.createBuffer(
					1,
					buffer.length,
					buffer.sampleRate,
				);
				monoBuffer.getChannelData(0).set(left);
				return monoBuffer;
			}
		}
		return buffer;
	}

	createTrackNodes(audioBuffer, config) {
		const gainNode = this.audioContext.createGain();
		gainNode.gain.value = config.gain ?? 1;

		const panNode = this.audioContext.createStereoPanner();
		panNode.pan.value = config.pan ?? 0;

		// Reverb send gain
		const reverbSend = this.audioContext.createGain();
		reverbSend.gain.value = 0.2; // Default send level

		gainNode.connect(panNode);
		panNode.connect(this.masterGain);

		// Connect to shared reverb bus
		panNode.connect(reverbSend);
		reverbSend.connect(this.reverbNode);

		return {
			buffer: audioBuffer,
			source: null,
			gainNode,
			panNode,
			reverbSend,
			gain: config.gain ?? 1,
			pan: config.pan ?? 0,
			name: config.name,
			path: config.path,
			isSolo: false,
		};
	}

	toggleReverb(nodes) {
		this.reverbEnabled = !this.reverbEnabled;

		if (this.reverbGain) {
			this.reverbGain.gain.setTargetAtTime(
				this.reverbEnabled ? 0.3 : 0,
				this.audioContext.currentTime,
				0.1,
			);
		}

		return this.reverbEnabled;
	}
}
