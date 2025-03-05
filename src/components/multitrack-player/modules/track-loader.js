/**
 * Track Loader Module - Handles loading and processing audio tracks
 */

export class TrackLoader {
  constructor(audioProcessor, audioCache) {
    this.audioProcessor = audioProcessor;
    this.audioCache = audioCache;
  }

  /**
   * Load all tracks from configuration
   * @param {Array} tracks - Array of track configuration objects
   * @param {Function} onProgress - Callback for loading progress updates
   * @param {Function} onComplete - Callback when loading is complete
   * @param {Function} onStatusUpdate - Callback for status message updates
   * @returns {Promise<Array>} Array of audio nodes for loaded tracks
   */
  async loadTracks(tracks, onProgress, onComplete, onStatusUpdate) {
    try {
      onStatusUpdate("Loading tracks...");

      const total = tracks.length;
      let loadedCount = 0;

      if (total === 0) {
        onStatusUpdate("No tracks found");
        onComplete([], 0);
        return [];
      }

      // Initialize database for caching
      await this.audioCache.initializeDB();

      // Initialize audioNodes array
      const audioNodes = new Array(total);

      // Track loading map to prevent duplicate loads of the same track
      const loadingMap = new Map();

      // Process tracks in parallel with Promise.all
      const loadPromises = tracks.map(async (track, i) => {
        try {
          // Use a loading map to avoid double-loading the same track URL
          if (loadingMap.has(track.path)) {
            console.log(`Already loading track: ${track.name}, reusing promise`);
            const result = await loadingMap.get(track.path);

            // Still need to create audio nodes for this instance
            if (result.success) {
              audioNodes[i] = this.audioProcessor.createTrackNodes(result.buffer, {
                ...track,
                isSolo: false
              });

              loadedCount++;
              onProgress(loadedCount, total);
            }
            return { success: result.success, index: i };
          }

          // Create a promise for loading this track and store in the map
          const loadingPromise = this.loadSingleTrack(track);
          loadingMap.set(track.path, loadingPromise);

          // Wait for the track to load
          const result = await loadingPromise;

          // Set up audio nodes if successful
          if (result.success) {
            audioNodes[i] = this.audioProcessor.createTrackNodes(result.buffer, {
              ...track,
              isSolo: false
            });

            loadedCount++;
            onProgress(loadedCount, total);
          }

          return { success: result.success, index: i };
        } catch (error) {
          console.error(`Error loading track ${i}:`, error);
          return { success: false, index: i, error };
        }
      });

      // Process all tracks in parallel
      const results = await Promise.all(loadPromises);
      const successfulLoads = results.filter(r => r.success).length;

      // Apply reverb buffer to all nodes
      this.audioProcessor.updateReverbBuffers(audioNodes);

      // Return results to caller
      onComplete(audioNodes, successfulLoads);
      return audioNodes;
    } catch (error) {
      console.error("Error loading tracks:", error);
      onStatusUpdate(`Error: ${error.message}`);
      return [];
    }
  }

  /**
   * Load a single track
   * @param {Object} track - Track configuration object
   * @returns {Promise<Object>} Result object with success status and buffer
   */
  async loadSingleTrack(track) {
    // First, check cache for this track
    const cachedBuffer = await this.audioCache.getCachedTrack(track.path);
    let arrayBuffer;

    if (cachedBuffer) {
      // Use cached data if available
      arrayBuffer = cachedBuffer;
      console.log(`Using cached track: ${track.name}`);
    } else {
      // Otherwise, fetch from network with retry
      console.log(`Fetching track: ${track.name} from network`);
      try {
        const response = await this.audioCache.fetchWithRetry(track.path);
        arrayBuffer = await response.arrayBuffer();

        // Cache for future use
        const cacheSuccess = await this.audioCache.cacheTrack(track.path, arrayBuffer);
        if (cacheSuccess) {
          console.log(`Successfully cached track: ${track.name}`);
        }
      } catch (error) {
        console.error(`Network error fetching track ${track.name}:`, error);
        return { success: false, error };
      }
    }

    try {
      // Decode audio data
      const audioBuffer = await this.audioProcessor.decodeAudioData(arrayBuffer);
      return { success: true, buffer: audioBuffer };
    } catch (error) {
      console.error(`Error decoding audio for track ${track.name}:`, error);
      return { success: false, error };
    }
  }
}