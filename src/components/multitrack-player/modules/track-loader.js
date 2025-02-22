/**
 * Track Loader Module - Handles loading and processing audio tracks
 */

export class TrackLoader {
  constructor(audioProcessor, audioCache) {
    this.audioProcessor = audioProcessor;
    this.audioCache = audioCache;
    // Add a tracking set to prevent duplicate loading messages
    this.processedTracks = new Set();
  }

  /**
   * Load tracks from configuration
   * @param {Array} tracks - Array of track configuration objects
   * @param {Function} onProgress - Callback for loading progress updates
   * @param {Function} onComplete - Callback when loading is complete
   * @param {Function} onStatusUpdate - Callback for status message updates
   * @returns {Promise<Array>} Array of audio nodes for loaded tracks
   */
  async loadTracks(tracks, onProgress, onComplete, onStatusUpdate) {
    try {
      // Reset the track processing set for fresh load
      this.processedTracks.clear();

      onStatusUpdate("Loading tracks...");

      const total = tracks.length;

      if (total === 0) {
        onStatusUpdate("No tracks found");
        onComplete([], 0);
        return [];
      }

      // Initialize database for caching
      await this.audioCache.initializeDB();

      // Initialize audioNodes array
      const audioNodes = new Array(total);
      let completedCount = 0;
      let usedCachedNodes = 0;

      // First, try to use cached AudioNode trees (fastest path)
      // This is a synchronous operation and should be near-instant
      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        const cachedNodeTree = this.audioCache.getAudioNodeTree(track.path);

        if (cachedNodeTree) {
          // Recreate the node tree from cache
          audioNodes[i] = this.audioProcessor.recreateNodeTreeFromCache({
            ...cachedNodeTree,
            ...track  // Use latest track config (in case gain/pan changed)
          });

          console.log(`Using cached node tree for: ${track.name}`);
          usedCachedNodes++;
          completedCount++;
          onProgress(completedCount, total);
        }
      }

      // If we've loaded all tracks from cache, we're done!
      if (usedCachedNodes === total) {
        console.log("All tracks loaded from node tree cache!");
        onStatusUpdate(`Loaded all tracks from cache`);

        // Apply reverb buffer to all nodes
        this.audioProcessor.updateReverbBuffers(audioNodes);

        onComplete(audioNodes, usedCachedNodes);
        return audioNodes;
      }

      // For any tracks not loaded from cache, load them normally
      const remainingPromises = tracks.map((track, i) => {
        // Skip tracks already loaded from cache
        if (audioNodes[i]) return Promise.resolve({ success: true, index: i });

        return this.loadSingleTrack(track)
          .then((result) => {
            // Set up audio nodes if successful
            if (result.success) {
              // Create node tree
              const nodeTree = this.audioProcessor.createTrackNodes(
                result.buffer,
                {
                  ...track,
                  isSolo: false,
                }
              );

              // Store in array
              audioNodes[i] = nodeTree;

              // Cache a simplified version of the node tree
              const cacheableTree = this.audioProcessor.createCacheableNodeTree({
                ...nodeTree,
                path: track.path
              });
              this.audioCache.cacheAudioNodeTree(track.path, cacheableTree);
            }

            // Update progress
            completedCount++;
            onProgress(completedCount, total);

            return { success: result.success, index: i };
          })
          .catch((error) => {
            console.error(`Error loading track ${i}:`, error);
            completedCount++;
            onProgress(completedCount, total);
            return { success: false, index: i, error };
          });
      });

      // Only wait for tracks that weren't loaded from cache
      const remainingResults = await Promise.all(remainingPromises);
      const loadedCount = remainingResults.filter((r) => r.success).length + usedCachedNodes;

      // Apply reverb buffer to all nodes
      this.audioProcessor.updateReverbBuffers(audioNodes);

      // Return results
      onStatusUpdate(`Loaded ${loadedCount} of ${total} tracks`);
      onComplete(audioNodes, loadedCount);
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
    try {
      // Create a unique identifier for this track
      const trackId = track.path;

      // Check if we've already processed this track in current session
      if (this.processedTracks.has(trackId)) {
        console.log(`Re-using previously loaded track: ${track.name}`);
      } else {
        this.processedTracks.add(trackId);
      }

      // Check for AudioNode tree in cache (fastest path)
      const cachedNodeTree = this.audioCache.getAudioNodeTree(track.path);
      if (cachedNodeTree) {
        console.log(`Found complete node tree for: ${track.name}`);
        // This will be handled by loadTracks directly
        return { success: true, buffer: cachedNodeTree.buffer };
      }

      // Check in-memory cache for decoded AudioBuffer
      const cachedDecodedBuffer = this.audioCache.getDecodedBuffer(track.path);
      if (cachedDecodedBuffer) {
        console.log(`Using cached decoded audio for: ${track.name}`);
        return { success: true, buffer: cachedDecodedBuffer };
      }

      // Check IndexedDB cache for raw audio data
      let arrayBuffer = await this.audioCache.getCachedTrack(track.path);

      if (arrayBuffer) {
        console.log(`Using cached audio file for: ${track.name}`);
      } else {
        // Fetch from network
        console.log(`Fetching track: ${track.name} from network`);
        const response = await this.audioCache.fetchWithRetry(track.path);
        arrayBuffer = await response.arrayBuffer();

        // Cache raw audio data for future use
        this.audioCache.cacheTrack(track.path, arrayBuffer)
          .catch(err => console.warn(`Failed to cache track: ${track.name}`, err));
      }

      try {
        // Decode audio data
        const audioBuffer = await this.audioProcessor.decodeAudioData(arrayBuffer);

        // Cache the decoded buffer
        this.audioCache.cacheDecodedBuffer(track.path, audioBuffer);

        return { success: true, buffer: audioBuffer };
      } catch (decodeError) {
        console.error(`Error decoding track ${track.name}:`, decodeError);
        return { success: false, error: decodeError };
      }
    } catch (error) {
      console.error(`Error loading track ${track.name}:`, error);
      return { success: false, error };
    }
  }
}
