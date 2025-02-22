class MultitrackPlayer {
    constructor() {
        // Initialize AudioContext and suspend immediately to comply with autoplay policies
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.audioContext.suspend();

        // Array to store track objects
        this.tracks = [];

        // Playback state variables
        this.isPlaying = false;
        this.startTime = 0;      // Reference time when playback started
        this.currentTime = 0;    // Current playback position (in seconds)
        this.duration = 0;       // Duration of the tracks (assumed same for all)
        this.animationFrame = null;
        this.isReady = false;
        this.scheduledTime = null; // Track the scheduled start time

        // Cached UI element references
        this.elements = {
            playPauseButton: null,
            timeline: null,
            progressBar: null,
            playhead: null,
            currentTimeDisplay: null,
            durationDisplay: null,
            loadingContainer: null,
            loadingProgress: null,
            loadingCount: null,
            tracksContainer: null,
            loadingStatus: null,
            reverbToggle: null
        };

        // Track definitions with metadata
        this.trackDefinitions = [
            { path: 'tracks/main_vox_2.ogg', name: 'Lead Vocals', defaultGain: 1.0, defaultPan: 0 },
            { path: 'tracks/main_vox_1.ogg', name: 'Lead Vocals 2', defaultGain: 0.7, defaultPan: 0 },
            { path: 'tracks/bvox_1.ogg', name: 'Background Vocals', defaultGain: 0.4, defaultPan: 0 },
            { path: 'tracks/clicks_n_vox_bits.ogg', name: 'Snaps & Vocals', defaultGain: 0.5, defaultPan: 0 },
            { path: 'tracks/bass.ogg', name: 'Bass', defaultGain: 0.9, defaultPan: 0 },
            { path: 'tracks/gtr_1.ogg', name: 'Guitar 1', defaultGain: 0.7, defaultPan: -0.3 },
            { path: 'tracks/gtr_2.ogg', name: 'Guitar 2', defaultGain: 0.4, defaultPan: 0.3 },
            { path: 'tracks/main_kit.ogg', name: 'Drum Kit', defaultGain: 0.85, defaultPan: 0 },
            { path: 'tracks/kit_2.ogg', name: 'Conga', defaultGain: 0.5, defaultPan: -0.15 },
            { path: 'tracks/perc.ogg', name: 'Bongo', defaultGain: 0.5, defaultPan: 0.2 },
            { path: 'tracks/piano.ogg', name: 'Piano', defaultGain: 0.75, defaultPan: -0.1 },
            { path: 'tracks/vibes.ogg', name: 'Vibraphone', defaultGain: 0.6, defaultPan: 0.1 },
            { path: 'tracks/sax.ogg', name: 'Saxophone', defaultGain: 0.7, defaultPan: -0.2 },
            { path: 'tracks/strings_1l.ogg', name: 'Strings L', defaultGain: 0.6, defaultPan: -0.7 },
            { path: 'tracks/strings_2r.ogg', name: 'Strings R', defaultGain: 0.6, defaultPan: 0.7 },
            { path: 'tracks/strings_3m.ogg', name: 'Strings M', defaultGain: 0.6, defaultPan: 0 }
        ];

        this.reverbEnabled = false;
        this.createReverbNodes();

        this.init();
    }

    async init() {
        try {
            this.cacheElements();
            await this.loadTracks();
            this.setupUI();
        } catch (error) {
            console.error('Error during initialization:', error);
            this.showErrorMessage('Failed to initialize the audio player');
        }
    }

    cacheElements() {
        this.elements = {
            playPauseButton: document.querySelector('.play-pause-button'),
            timeline: document.querySelector('.timeline'),
            progressBar: document.querySelector('.progress-bar'),
            playhead: document.querySelector('.playhead'),
            currentTimeDisplay: document.querySelector('.current-time'),
            durationDisplay: document.querySelector('.duration'),
            loadingContainer: document.querySelector('.loading-container'),
            loadingProgress: document.querySelector('.loading-progress'),
            loadingCount: document.querySelector('.loading-count'),
            tracksContainer: document.querySelector('.tracks-container'),
            loadingStatus: document.querySelector('.loading-status'),
            reverbToggle: document.querySelector('.reverb-toggle')
        };

        // Disable play button until tracks are loaded
        this.elements.playPauseButton.disabled = true;
        this.elements.playPauseButton.classList.add('disabled');
    }

    async loadTracks() {
        const loadTrack = async (track) => {
            try {
                const response = await fetch(track.path);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                const gainNode = this.audioContext.createGain();
                const panNode = this.audioContext.createStereoPanner();
                panNode.connect(this.audioContext.destination);
                gainNode.connect(panNode);
                return {
                    ...track,
                    buffer: audioBuffer,
                    source: null,
                    gainNode,
                    panNode,
                    isSolo: false,
                    gain: track.defaultGain,
                    pan: track.defaultPan
                };
            } catch (error) {
                console.error(`Failed to load ${track.path}:`, error);
                return null;
            }
        };

        try {
            this.updateLoadingStatus('Initializing...');
            this.tracks = [];
            const total = this.trackDefinitions.length;
            let loadedCount = 0;

            for (const trackDef of this.trackDefinitions) {
                const currentNumber = loadedCount + 1;
                this.elements.loadingCount.textContent = `${currentNumber}/${total}`;
                this.updateLoadingStatus(trackDef.name);

                const track = await loadTrack(trackDef);
                if (track) {
                    this.tracks.push(track);
                }
                loadedCount++;
                const percent = Math.round((loadedCount / total) * 100);
                this.elements.loadingProgress.style.width = `${percent}%`;
            }

            if (this.tracks.length === 0) {
                throw new Error('No tracks were loaded successfully');
            }

            this.duration = this.tracks[0].buffer.duration;
            this.isReady = true;
            this.elements.playPauseButton.disabled = false;
            this.elements.playPauseButton.classList.remove('disabled');
            this.elements.loadingContainer.classList.add('hidden');

        } catch (error) {
            console.error('Error loading tracks:', error);
            this.updateLoadingStatus('Failed to load tracks');
            this.showErrorMessage(`Failed to load tracks: ${error.message}`);
        }
    }

    async loadTrack(filePath) {
        try {
            const response = await fetch(filePath);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

            // Find the track definition to get default values
            const trackDef = this.trackDefinitions.find(t => t.path === filePath) || {
                defaultGain: 1,
                defaultPan: 0
            };

            const track = {
                buffer: audioBuffer,
                name: filePath.split('/').pop().replace('.ogg', ''),
                source: null,
                gainNode: this.audioContext.createGain(),
                panNode: this.audioContext.createStereoPanner(),
                isSolo: false,
                gain: trackDef.defaultGain,
                pan: trackDef.defaultPan
            };

            // Connect the nodes: gainNode -> panNode -> destination
            track.panNode.connect(this.dryGain);
            track.gainNode.connect(track.panNode);

            return track;
        } catch (error) {
            console.error(`Error loading track ${filePath}:`, error);
            return null;
        }
    }

    // Create new AudioBufferSourceNodes for all tracks
    createSources() {
        this.tracks.forEach(track => {
            // Clean up existing source if any
            if (track.source) {
                try {
                    track.source.stop();
                    track.source.disconnect();
                } catch (e) {
                    // Ignore errors from already stopped sources
                }
            }

            // Create a fresh source node
            const source = this.audioContext.createBufferSource();
            source.buffer = track.buffer;
            source.connect(track.gainNode);
            track.source = source;
        });
    }

    async play() {
        if (!this.isReady || this.isPlaying) return;

        try {
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            // Create new source nodes for precise timing control
            this.createSources();

            const offset = this.currentTime;
            const now = this.audioContext.currentTime;
            const schedulingDelay = 0.03; // 30ms scheduling delay for stability
            const startTime = now + schedulingDelay;

            // Apply current gain and pan values
            const hasSolo = this.tracks.some(track => track.isSolo);
            this.tracks.forEach(track => {
                const effectiveGain = hasSolo ? (track.isSolo ? track.gain : 0) : track.gain;
                track.gainNode.gain.setValueAtTime(effectiveGain, startTime);
                track.panNode.pan.setValueAtTime(track.pan, startTime);
            });

            // Start all tracks in perfect sync
            this.tracks.forEach(track => {
                if (track.source) {
                    track.source.start(startTime, offset);
                }
            });

            this.startTime = startTime - offset;
            this.isPlaying = true;
            this.elements.playPauseButton.classList.add('playing');

            // Begin updating the playhead
            if (this.animationFrame) {
                cancelAnimationFrame(this.animationFrame);
            }
            this.updatePlayhead();
        } catch (error) {
            console.error('Error starting playback:', error);
            await this.stopPlayback();
        }
    }

    async pause() {
        if (!this.isPlaying) return;
        this.currentTime = this.audioContext.currentTime - this.startTime;
        await this.stopPlayback(true);
    }

    async stopPlayback(isPause = false) {
        try {
            const now = this.audioContext.currentTime;

            // Stop all sources together
            const promises = this.tracks.map(track => {
                if (track.source) {
                    return new Promise(resolve => {
                        try {
                            track.source.stop(now);
                            track.source.disconnect();
                        } catch (e) {
                            // Ignore errors from already stopped sources
                        }
                        track.source = null;
                        resolve();
                    });
                }
                return Promise.resolve();
            });

            await Promise.all(promises);

            this.isPlaying = false;
            this.elements.playPauseButton.classList.remove('playing');

            if (this.animationFrame) {
                cancelAnimationFrame(this.animationFrame);
            }

            if (!isPause) {
                this.currentTime = 0;
                this.updateSeekPosition(0);
            }
        } catch (error) {
            console.error('Error during playback stop:', error);
            this.isPlaying = false;
            this.elements.playPauseButton.classList.remove('playing');
        }
    }

    async seekTo(time, shouldResume = this.isPlaying) {
        try {
            const targetTime = Math.max(0, Math.min(time, this.duration));
            const wasPlaying = this.isPlaying;

            await this.stopPlayback(true);
            this.currentTime = targetTime;
            this.updateSeekPosition(this.currentTime / this.duration);

            if (shouldResume) {
                if (this.audioContext.state === 'suspended') {
                    await this.audioContext.resume();
                }
                await this.play();
            }
        } catch (error) {
            console.error('Error during seek:', error);
            await this.stopPlayback(false);
        }
    }

    setupUI() {
        // Clear existing track UI elements
        this.elements.tracksContainer.innerHTML = '';

        // Create UI elements for each track
        this.tracks.forEach((track, index) => this.createTrackUI(track, index));

        // Setup play/pause button
        this.elements.playPauseButton.addEventListener('click', async () => {
            if (!this.isReady) return;
            try {
                if (this.isPlaying) {
                    await this.pause();
                } else {
                    await this.play();
                }
            } catch (error) {
                console.error('Error handling play/pause:', error);
            }
        });

        // Setup timeline interaction
        let isDragging = false;
        let wasPlaying = false; // Track original play state

        this.elements.timeline.addEventListener('mousedown', (e) => {
            isDragging = true;
            wasPlaying = this.isPlaying; // Capture state before any pause
            if (this.isPlaying) {
                this.pause();
            }
            e.preventDefault(); // Prevent text selection during drag
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const rect = this.elements.timeline.getBoundingClientRect();
            const position = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            this.updateSeekPosition(position);
        });

        document.addEventListener('mouseup', async (e) => {
            if (!isDragging) return;
            isDragging = false;

            const rect = this.elements.timeline.getBoundingClientRect();
            const position = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

            // Use captured play state instead of current isPlaying
            await this.seekTo(position * this.duration, wasPlaying);
        });

        // Enable timeline seeking
        this.elements.timeline.addEventListener('click', async (e) => {
            if (!this.isReady) return;
            const rect = this.elements.timeline.getBoundingClientRect();
            const position = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const wasPlaying = this.isPlaying; // Capture current state before seeking
            await this.seekTo(position * this.duration, wasPlaying);
        });

        // Reverb toggle
        this.elements.reverbToggle.addEventListener('click', () => this.toggleReverb());

        // Start playhead update loop
        this.updatePlayhead();
    }

    createTrackUI(track, index) {
        const trackElement = document.createElement('div');
        trackElement.className = 'track';
        trackElement.onclick = () => this.toggleSolo(index);

        const trackName = document.createElement('div');
        trackName.className = 'track-name';
        trackName.textContent = track.name;

        const controls = document.createElement('div');
        controls.className = 'track-controls';

        // Gain knob
        const gainKnob = this.createKnob('gain', track.gain, (value) => {
            track.gain = value;
            track.gainNode.gain.value = value;
        });

        // Pan knob
        const panKnob = this.createKnob('pan', track.pan, (value) => {
            track.pan = value;
            track.panNode.pan.value = value;
        });

        controls.appendChild(gainKnob);
        controls.appendChild(panKnob);
        trackElement.appendChild(trackName);
        trackElement.appendChild(controls);

        this.elements.tracksContainer.appendChild(trackElement);
        return trackElement;
    }

    createKnob(type, initialValue, onChange) {
        const container = document.createElement('div');
        container.className = 'knob-container';

        // Add icons
        const iconsContainer = document.createElement('div');
        iconsContainer.className = 'knob-icons';

        if (type === 'gain') {
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

        const knob = document.createElement('div');
        knob.className = 'knob';
        knob.dataset.type = type;

        const label = document.createElement('div');
        label.className = 'knob-label';
        label.textContent = type;

        // Add tooltip for displaying current value
        const tooltip = document.createElement('div');
        tooltip.className = 'knob-tooltip';
        tooltip.style.position = 'absolute';
        tooltip.style.top = '-25px';
        tooltip.style.left = '50%';
        tooltip.style.transform = 'translateX(-50%)';
        tooltip.style.backgroundColor = '#222';
        tooltip.style.color = '#fff';
        tooltip.style.padding = '2px 4px';
        tooltip.style.borderRadius = '3px';
        tooltip.style.fontSize = '10px';
        tooltip.style.display = 'none';
        container.appendChild(tooltip);

        // Convert value to rotation angle
        const valueToAngle = (val) => {
            const min = type === 'gain' ? 0 : -1;
            const max = type === 'gain' ? 1 : 1;
            return ((val - min) / (max - min)) * 270 - 135; // -135 to +135 degrees
        };

        // Convert angle to value
        const angleToValue = (angle) => {
            const min = type === 'gain' ? 0 : -1;
            const max = type === 'gain' ? 1 : 1;
            return Math.min(max, Math.max(min,
                min + ((angle + 135) / 270) * (max - min)
            ));
        };

        // Set initial rotation
        knob.style.transform = `rotate(${valueToAngle(initialValue)}deg)`;

        // Knob interaction
        let isDragging = false;
        let startY;
        let startValue;

        const handleMove = (e) => {
            if (!isDragging) return;

            const clientY = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;
            const deltaY = startY - clientY;
            const deltaValue = (deltaY / 100) * (type === 'gain' ? 1 : 2);
            const newValue = Math.min(1, Math.max(type === 'gain' ? 0 : -1,
                startValue + deltaValue
            ));

            knob.style.transform = `rotate(${valueToAngle(newValue)}deg)`;
            onChange(newValue);
            tooltip.textContent = newValue.toFixed(2);
            tooltip.style.display = 'block';
            e.preventDefault();
        };

        const handleEnd = () => {
            isDragging = false;
            tooltip.style.display = 'none';
            document.removeEventListener('mousemove', handleMove);
            document.removeEventListener('mouseup', handleEnd);
            document.removeEventListener('touchmove', handleMove);
            document.removeEventListener('touchend', handleEnd);
        };

        knob.addEventListener('mousedown', (e) => {
            isDragging = true;
            startY = e.clientY;
            startValue = initialValue;
            document.addEventListener('mousemove', handleMove);
            document.addEventListener('mouseup', handleEnd);
            e.preventDefault();
        });

        knob.addEventListener('touchstart', (e) => {
            isDragging = true;
            startY = e.touches[0].clientY;
            startValue = initialValue;
            document.addEventListener('touchmove', handleMove);
            document.addEventListener('touchend', handleEnd);
            e.preventDefault();
        });

        container.appendChild(knob);
        container.appendChild(label);

        // Initialize the Feather icons we just added
        feather.replace();

        return container;
    }

    updateLoadingProgress(loadedCount, total) {
        const percent = Math.round((loadedCount / total) * 100);
        this.elements.loadingProgress.style.width = `${percent}%`;
        this.elements.loadingCount.textContent = `${loadedCount}/${total}`;
    }

    updatePlayhead() {
        if (this.isPlaying) {
            const currentTime = this.audioContext.currentTime - this.startTime;
            if (currentTime >= this.duration) {
                this.stopPlayback(false);
                return;
            }

            this.updateSeekPosition(currentTime / this.duration);
            this.animationFrame = requestAnimationFrame(() => this.updatePlayhead());
        }
    }

    updateSeekPosition(position) {
        const normalizedPosition = Math.max(0, Math.min(1, position));
        const time = normalizedPosition * this.duration;
        this.updateTimeDisplay(time, this.duration);
        this.elements.progressBar.style.width = `${normalizedPosition * 100}%`;
        this.elements.playhead.style.left = `${normalizedPosition * 100}%`;
    }

    formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    updateTimeDisplay(currentTime, duration) {
        this.elements.currentTimeDisplay.textContent = this.formatTime(currentTime);
        this.elements.durationDisplay.textContent = this.formatTime(duration);
    }

    showErrorMessage(message) {
        console.error(message);
        // You can implement a more user-friendly error display here
    }

    updateLoadingStatus(status) {
        this.elements.loadingStatus.textContent = status;
    }

    toggleSolo(index) {
        const track = this.tracks[index];
        track.isSolo = !track.isSolo;

        // Update track UI
        const trackElements = this.elements.tracksContainer.children;
        Array.from(trackElements).forEach((el, i) => {
            el.classList.toggle('solo', this.tracks[i].isSolo);
        });

        // Update gain values
        const hasSoloTracks = this.tracks.some(t => t.isSolo);
        this.tracks.forEach(t => {
            const newGain = hasSoloTracks ? (t.isSolo ? t.gain : 0) : t.gain;
            t.gainNode.gain.value = newGain;
        });
    }

    createReverbNodes() {
        // Core nodes
        this.convolver = this.audioContext.createConvolver();
        this.preDelay = this.audioContext.createDelay(0.1);
        this.dryGain = this.audioContext.createGain();
        this.wetGain = this.audioContext.createGain();

        // Motown-style settings
        this.preDelay.delayTime.value = 0.03; // 30ms pre-delay
        this.dryGain.gain.value = 0.85;
        this.wetGain.gain.value = 0.15;

        // Generate noise tail
        this.renderReverbTail(1.2); // 1.2 second decay

        // Connections
        this.preDelay.connect(this.convolver);
        this.convolver.connect(this.wetGain);
        this.wetGain.connect(this.audioContext.destination);
        this.dryGain.connect(this.audioContext.destination);
    }

    async renderReverbTail(duration) {
        const offlineContext = new OfflineAudioContext(2,
            this.audioContext.sampleRate * duration,
            this.audioContext.sampleRate
        );

        // Create decaying noise
        const noise = offlineContext.createBufferSource();
        const buffer = offlineContext.createBuffer(1,
            offlineContext.sampleRate * duration,
            offlineContext.sampleRate
        );

        // Fill with noise that exponentially decays
        const channelData = buffer.getChannelData(0);
        for(let i = 0; i < channelData.length; i++) {
            const progress = i / channelData.length;
            channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - progress, 2);
        }

        // Shape with filters
        const hpFilter = offlineContext.createBiquadFilter();
        hpFilter.type = 'highpass';
        hpFilter.frequency.value = 500;

        const lpFilter = offlineContext.createBiquadFilter();
        lpFilter.type = 'lowpass';
        lpFilter.frequency.value = 2000;

        // Connect nodes
        noise.buffer = buffer;
        noise.connect(hpFilter);
        hpFilter.connect(lpFilter);
        lpFilter.connect(offlineContext.destination);

        // Render
        noise.start(0);
        const renderedBuffer = await offlineContext.startRendering();
        this.convolver.buffer = renderedBuffer;
    }

    toggleReverb() {
        this.reverbEnabled = !this.reverbEnabled;
        this.elements.reverbToggle.classList.toggle('active', this.reverbEnabled);

        this.tracks.forEach(track => {
            track.panNode.disconnect();

            if(this.reverbEnabled) {
                track.panNode.connect(this.dryGain);
                track.panNode.connect(this.preDelay);
            } else {
                track.panNode.connect(this.audioContext.destination);
            }
        });
    }
}

// Initialize the player when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.player = new MultitrackPlayer();
});