/**
 * Audio Processor Module - Handles audio context, effects and processing
 */

export class AudioProcessor {
  constructor() {
    this.audioContext = null;
    this.masterGain = null;
    this.reverbBuffer = null;
    this.reverbEnabled = true;
  }

  /**
   * Initialize the Web Audio API context
   * @returns {Promise<AudioContext>} The initialized audio context
   */
  async initializeContext() {
    try {
      if (!this.audioContext) {
        // Use default options for best performance
        const contextOptions = {
          latencyHint: "interactive",
          sampleRate: 44100,
        };

        this.audioContext = new (window.AudioContext || window.webkitAudioContext)(
          contextOptions
        );

        // Create master gain node
        this.masterGain = this.audioContext.createGain();
        this.masterGain.connect(this.audioContext.destination);

        // Preload the reverb impulse immediately after context creation
        this.loadReverbImpulse().catch(err => {
          console.warn("Failed to load reverb impulse, will use fallback:", err);
        });
      } else if (this.audioContext.state === "suspended") {
        // Resume the context if it's suspended
        await this.audioContext.resume();
      }

      return this.audioContext;
    } catch (error) {
      console.error("Failed to initialize audio context:", error);
      throw new Error(`Audio system initialization failed: ${error.message}`);
    }
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
   * Loads a Motown-style plate reverb impulse response
   * @returns {Promise<AudioBuffer>} The reverb buffer
   */
  async loadReverbImpulse() {
    try {
      if (!this.audioContext) {
        await this.initializeContext();
      }

      // Use bright reverb type for Motown with impulse 2 (shorter tail)
      const url = `https://oramics.github.io/sampled/IR/EMT140-Plate/samples/emt_140_bright_2.wav`;

      console.log(`Loading Motown plate reverb impulse response`);

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
   * Creates a synthetic Motown-style plate reverb impulse response as fallback
   * @returns {Promise<AudioBuffer>} The reverb buffer
   */
  async createSyntheticReverb() {
    try {
      if (!this.audioContext) {
        await this.initializeContext();
      }

      // Use shorter duration for tighter Motown reverb
      const duration = 1.5;

      const offlineContext = new OfflineAudioContext(
        2,
        this.audioContext.sampleRate * duration,
        this.audioContext.sampleRate,
      );

      // Create decaying noise
      const noise = offlineContext.createBufferSource();
      const buffer = offlineContext.createBuffer(
        1,
        offlineContext.sampleRate * duration,
        offlineContext.sampleRate,
      );

      // Fill with noise that exponentially decays (faster for shorter tail)
      const channelData = buffer.getChannelData(0);
      for (let i = 0; i < channelData.length; i++) {
        const progress = i / channelData.length;
        // Steeper decay curve for shorter tail
        channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - progress, 2);
      }

      // Shape with filters optimized for Motown plate sound
      const hpFilter = offlineContext.createBiquadFilter();
      hpFilter.type = "highpass";
      hpFilter.frequency.value = 800; // Higher to reduce low-end heaviness

      const lpFilter = offlineContext.createBiquadFilter();
      lpFilter.type = "lowpass";
      lpFilter.frequency.value = 6000; // Brighter top end for clarity

      // Add mid-range boost for Motown vocal warmth
      const midBoost = offlineContext.createBiquadFilter();
      midBoost.type = "peaking";
      midBoost.frequency.value = 1800; // Focus on upper mids
      midBoost.gain.value = 4;
      midBoost.Q.value = 1.2;

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
   * Decode audio data with better error handling
   * @param {ArrayBuffer} arrayBuffer - Audio data to decode
   * @returns {Promise<AudioBuffer>} Decoded audio buffer
   */
  async decodeAudioData(arrayBuffer) {
    if (!arrayBuffer || !(arrayBuffer instanceof ArrayBuffer)) {
      throw new Error("Invalid audio data format");
    }

    // Ensure audio context is initialized
    if (!this.audioContext) {
      await this.initializeContext();
    }

    try {
      // Modern browsers support the promise-based decodeAudioData
      return await this.audioContext.decodeAudioData(arrayBuffer);
    } catch (error) {
      console.error("Audio decoding error:", error);
      throw new Error(`Failed to decode audio: ${error.message || "Unknown error"}`);
    }
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

    // Set initial values - optimized for Motown sound
    dryGain.gain.value = this.reverbEnabled ? 0.8 : 1; // More dry signal for clarity
    wetGain.gain.value = this.reverbEnabled ? 0.2 : 0; // Less wet signal to reduce muddiness
    preDelay.delayTime.value = 0.01; // Shorter pre-delay for tighter sound

    // Basic connections
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
      ...trackConfig,
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
    nodes.forEach((node) => {
      if (!node || !node.dryGain || !node.wetGain) return;

      if (this.reverbEnabled) {
        node.dryGain.gain.value = 0.8; // More dry signal
        node.wetGain.gain.value = 0.2; // Less wet signal
      } else {
        node.dryGain.gain.value = 1;
        node.wetGain.gain.value = 0;
      }
    });

    return this.reverbEnabled;
  }

  /**
   * Change reverb type
   * @param {string} type - Type of reverb ('none' or any other value for 'motown')
   * @param {Array} nodes - Array of audio nodes
   * @returns {boolean} Success status
   */
  async changeReverbType(type, nodes) {
    const enableReverb = type !== "none";

    this.reverbEnabled = enableReverb;

    nodes.forEach((node) => {
      if (!node || !node.dryGain || !node.wetGain) return;
      node.dryGain.gain.value = enableReverb ? 0.8 : 1;
      node.wetGain.gain.value = enableReverb ? 0.2 : 0;
    });

    return true;
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

  /**
   * Create an optimized version of a track node tree suitable for caching
   * @param {Object} nodeTree - Original node tree with all connections
   * @returns {Object} Simplified version for caching
   */
  createCacheableNodeTree(nodeTree) {
    // Clone only the essential parts that won't change between sessions
    return {
      buffer: nodeTree.buffer,
      gain: nodeTree.gain,
      pan: nodeTree.pan,
      name: nodeTree.name,
      path: nodeTree.path,
      isSolo: false
    };
  }

  /**
   * Create a new node tree from a cached one
   * @param {Object} cachedTree - Cached node tree
   * @returns {Object} Fresh node tree with new audio nodes
   */
  recreateNodeTreeFromCache(cachedTree) {
    // Create fresh audio nodes
    return this.createTrackNodes(cachedTree.buffer, {
      gain: cachedTree.gain,
      pan: cachedTree.pan,
      name: cachedTree.name,
      path: cachedTree.path,
      isSolo: false
    });
  }
}
