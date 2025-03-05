/**
 * Audio Processor Module - Handles audio context, effects and processing
 */

export class AudioProcessor {
  constructor() {
    this.audioContext = null;
    this.masterGain = null;
    this.reverbBuffer = null;
    this.reverbEnabled = true;
    this.reverbType = 'medium'; // 'bright', 'medium', or 'dark'
  }

  /**
   * Initialize the audio context
   * @returns {Promise<AudioContext>} The audio context
   */
  async initializeContext() {
    if (this.audioContext) return this.audioContext;

    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

    // Create master gain node
    this.masterGain = this.audioContext.createGain();
    this.masterGain.connect(this.audioContext.destination);

    // Create reverb buffer for effects
    await this.loadReverbImpulse();

    return this.audioContext;
  }

  /**
   * Check if audio context exists and resume it if needed
   */
  async ensureContext() {
    if (!this.audioContext) {
      await this.initializeContext();
      return;
    }

    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
  }

  /**
   * Loads an EMT 140 plate reverb impulse response
   * @returns {Promise<AudioBuffer>} The reverb buffer
   */
  async loadReverbImpulse() {
    try {
      if (!this.audioContext) {
        await this.initializeContext();
      }

      // Select appropriate EMT 140 impulse response for Motown sound
      // Medium is typical for vocals, bright for drums/percussion
      const impulseNum = 3; // Using the middle variant for balanced tone
      const url = `https://oramics.github.io/sampled/IR/EMT140-Plate/samples/emt_140_${this.reverbType}_${impulseNum}.wav`;

      console.log(`Loading reverb impulse response: ${url}`);

      // Fetch the impulse response file
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch impulse response: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      this.reverbBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

      return this.reverbBuffer;
    } catch (error) {
      console.error("Error loading reverb impulse response:", error);

      // Fall back to synthetic reverb if loading fails
      console.log("Falling back to synthetic reverb");
      return this.createSyntheticReverb();
    }
  }

  /**
   * Creates a synthetic reverb impulse response as fallback
   * @param {number} duration - Duration of the reverb in seconds
   * @returns {Promise<AudioBuffer>} The reverb buffer
   */
  async createSyntheticReverb(duration = 2.5) {
    try {
      if (!this.audioContext) {
        await this.initializeContext();
      }

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
        // More authentic decay curve for plate reverb
        channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - progress, 1.5);
      }

      // Shape with filters (more authentic for Motown plate reverb)
      const hpFilter = offlineContext.createBiquadFilter();
      hpFilter.type = "highpass";
      hpFilter.frequency.value = 600; // Adjusted for Motown sound

      const lpFilter = offlineContext.createBiquadFilter();
      lpFilter.type = "lowpass";
      lpFilter.frequency.value = 5000; // Brighter top end

      // Add mid-range boost for Motown vocal warmth
      const midBoost = offlineContext.createBiquadFilter();
      midBoost.type = "peaking";
      midBoost.frequency.value = 1200;
      midBoost.gain.value = 3;
      midBoost.Q.value = 1.5;

      // Connect nodes with additional filter
      noise.buffer = buffer;
      noise.connect(hpFilter);
      hpFilter.connect(midBoost);
      midBoost.connect(lpFilter);
      lpFilter.connect(offlineContext.destination);

      // Render
      noise.start(0);
      this.reverbBuffer = await offlineContext.startRendering();

      return this.reverbBuffer;
    } catch (error) {
      console.error("Error creating synthetic reverb buffer:", error);
      return null;
    }
  }

  /**
   * Decode an audio buffer from array buffer
   * @param {ArrayBuffer} arrayBuffer - The raw audio data
   * @returns {Promise<AudioBuffer>} The decoded audio buffer
   */
  async decodeAudioData(arrayBuffer) {
    if (!this.audioContext) {
      await this.initializeContext();
    }
    return this.audioContext.decodeAudioData(arrayBuffer);
  }

  /**
   * Format seconds into a readable time string
   * @param {number} seconds - The time in seconds
   * @returns {string} Formatted time string
   */
  formatTime(seconds) {
    if (isNaN(seconds)) return "0:00";

    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec.toString().padStart(2, "0")}`;
  }

  /**
   * Create and connect all necessary audio nodes for a track
   * @param {AudioBuffer} audioBuffer - The decoded audio buffer for the track
   * @param {Object} trackConfig - Configuration for the track (gain, pan)
   * @returns {Object} Collection of audio nodes for the track
   */
  createTrackNodes(audioBuffer, trackConfig) {
    // Create necessary nodes
    const gainNode = this.audioContext.createGain();
    gainNode.gain.value = trackConfig.gain;

    const panNode = this.audioContext.createStereoPanner();
    panNode.pan.value = trackConfig.pan;

    // Create reverb path nodes
    const dryGain = this.audioContext.createGain();
    const wetGain = this.audioContext.createGain();
    const preDelay = this.audioContext.createDelay(0.1);
    const convolver = this.audioContext.createConvolver();

    // Set initial values - adjusted for Motown sound (wetter reverb)
    dryGain.gain.value = this.reverbEnabled ? 0.75 : 1; // Slightly more dry signal
    wetGain.gain.value = this.reverbEnabled ? 0.25 : 0; // More wet signal for Motown
    preDelay.delayTime.value = 0.02; // Shorter pre-delay for tighter sound

    // Basic connections (will be adjusted when toggling reverb)
    gainNode.connect(panNode);

    // Connect dry path
    panNode.connect(dryGain);
    dryGain.connect(this.masterGain);

    // Connect wet path with reverb
    if (this.reverbBuffer) {
      convolver.buffer = this.reverbBuffer;
      panNode.connect(preDelay);
      preDelay.connect(convolver);
      convolver.connect(wetGain);
      wetGain.connect(this.masterGain);
    }

    return {
      buffer: audioBuffer,
      source: null, // Will be created when playing
      gainNode,
      panNode,
      dryGain,
      wetGain,
      preDelay,
      convolver,
      ...trackConfig
    };
  }

  /**
   * Toggle reverb effect for all nodes
   * @param {Array} nodes - Array of audio nodes
   * @returns {boolean} New reverb state
   */
  toggleReverb(nodes) {
    this.reverbEnabled = !this.reverbEnabled;

    // Update audio nodes
    nodes.forEach(node => {
      if (!node || !node.dryGain || !node.wetGain) return;

      if (this.reverbEnabled) {
        node.dryGain.gain.value = 0.75; // Adjusted for Motown sound
        node.wetGain.gain.value = 0.25; // More authentic reverb balance
      } else {
        node.dryGain.gain.value = 1;
        node.wetGain.gain.value = 0;
      }
    });

    return this.reverbEnabled;
  }

  /**
   * Change reverb character (bright, medium, dark)
   * @param {string} type - Type of reverb ('bright', 'medium', or 'dark')
   * @param {Array} nodes - Array of audio nodes
   * @returns {Promise<boolean>} Success state
   */
  async changeReverbType(type, nodes) {
    if (type === 'none') {
      // Disable reverb completely
      this.reverbEnabled = false;
      nodes.forEach(node => {
        if (!node || !node.dryGain || !node.wetGain) return;
        node.dryGain.gain.value = 1;
        node.wetGain.gain.value = 0;
      });
      return true;
    } else if (!['bright', 'medium', 'dark'].includes(type)) {
      console.error("Invalid reverb type:", type);
      return false;
    } else {
      // Enable reverb with selected type
      this.reverbEnabled = true;
      this.reverbType = type;

      // Reload impulse response with new type
      await this.loadReverbImpulse();

      // Update all nodes with new buffer if reverb is enabled
      nodes.forEach(node => {
        if (!node || !node.dryGain || !node.wetGain) return;
        // Adjust balance: reduce wet gain to mitigate excess low-end
        node.dryGain.gain.value = 0.75;
        node.wetGain.gain.value = 0.25;
      });

      return true;
    }
  }

  /**
   * Update reverb buffers for all nodes
   * @param {Array} nodes - Array of audio nodes
   */
  updateReverbBuffers(nodes) {
    if (!nodes || !this.reverbBuffer) return;

    nodes.forEach((node) => {
      if (node && node.convolver && this.reverbBuffer) {
        node.convolver.buffer = this.reverbBuffer;
      }
    });
  }
}