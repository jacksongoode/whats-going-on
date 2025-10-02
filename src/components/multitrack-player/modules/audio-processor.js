export class AudioProcessor {
	constructor() {
		this.audioContext = null;
		this.masterGain = null;
		this.reverbBuffer = null;
		this.reverbEnabled = true;
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
			sampleRate: 44100,
		});

		this.masterGain = this.audioContext.createGain();
		this.masterGain.connect(this.audioContext.destination);

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
		} catch (error) {
			console.warn("Failed to load reverb, using synthetic:", error);
			this.reverbBuffer = await this.createSyntheticReverb();
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
			const decay = Math.pow(1 - i / data.length, 2);
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
		return await this.audioContext.decodeAudioData(arrayBuffer);
	}

	createTrackNodes(audioBuffer, config) {
		const gainNode = this.audioContext.createGain();
		gainNode.gain.value = config.gain;

		const panNode = this.audioContext.createStereoPanner();
		panNode.pan.value = config.pan;

		const dryGain = this.audioContext.createGain();
		const wetGain = this.audioContext.createGain();
		const convolver = this.audioContext.createConvolver();

		dryGain.gain.value = this.reverbEnabled ? 0.8 : 1;
		wetGain.gain.value = this.reverbEnabled ? 0.2 : 0;

		gainNode.connect(panNode);
		panNode.connect(dryGain);
		dryGain.connect(this.masterGain);

		if (this.reverbBuffer) {
			convolver.buffer = this.reverbBuffer;
			panNode.connect(convolver);
			convolver.connect(wetGain);
			wetGain.connect(this.masterGain);
		}

		return {
			buffer: audioBuffer,
			source: null,
			gainNode,
			panNode,
			dryGain,
			wetGain,
			convolver,
			gain: config.gain,
			pan: config.pan,
			name: config.name,
			path: config.path,
			isSolo: false,
		};
	}

	toggleReverb(nodes) {
		this.reverbEnabled = !this.reverbEnabled;

		nodes.forEach((node) => {
			if (!node) return;
			node.dryGain.gain.value = this.reverbEnabled ? 0.8 : 1;
			node.wetGain.gain.value = this.reverbEnabled ? 0.2 : 0;
		});

		return this.reverbEnabled;
	}

	formatTime(seconds) {
		if (Number.isNaN(seconds)) return "0:00";
		const min = Math.floor(seconds / 60);
		const sec = Math.floor(seconds % 60);
		return `${min}:${sec.toString().padStart(2, "0")}`;
	}
}
