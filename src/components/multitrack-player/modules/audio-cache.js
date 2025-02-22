/**
 * Audio Cache Module - Handles caching of audio data
 */

export class AudioCache {
  constructor() {
    this.cacheDB = null;
    this.DB_NAME = "audio-cache";
    this.DB_VERSION = 1;
    this.STORE_NAME = "tracks";
    this.MAX_RETRY_ATTEMPTS = 3;

    // In-memory cache for decoded AudioBuffers
    this.decodedBuffers = new Map();

    // In-memory cache for complete audio node trees
    this.audioNodeTrees = new Map();
  }

  async initializeDB() {
    if (this.cacheDB) return this.cacheDB;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onerror = (event) => {
        console.error("IndexedDB error:", event.target.error);
        resolve(null); // Resolve with null to allow fallback to regular loading
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        // Create an object store for the audio chunks if it doesn't exist
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          db.createObjectStore(this.STORE_NAME, { keyPath: "path" });
        }
      };

      request.onsuccess = (event) => {
        this.cacheDB = event.target.result;
        resolve(this.cacheDB);
      };
    });
  }

  async getCachedTrack(path) {
    if (!this.cacheDB) return null;

    return new Promise((resolve) => {
      const transaction = this.cacheDB.transaction(
        [this.STORE_NAME],
        "readonly",
      );
      const store = transaction.objectStore(this.STORE_NAME);
      const request = store.get(path);

      request.onsuccess = () => {
        resolve(request.result ? request.result.buffer : null);
      };

      request.onerror = () => {
        console.warn("Error retrieving cached track:", path);
        resolve(null);
      };
    });
  }

  async cacheTrack(path, buffer) {
    if (!this.cacheDB) return false;

    return new Promise((resolve) => {
      const transaction = this.cacheDB.transaction(
        [this.STORE_NAME],
        "readwrite",
      );
      const store = transaction.objectStore(this.STORE_NAME);

      const request = store.put({
        path: path,
        buffer: buffer,
        timestamp: Date.now(),
      });

      request.onsuccess = () => resolve(true);
      request.onerror = (error) => {
        console.warn("Error caching track:", error);
        resolve(false);
      };
    });
  }

  getDecodedBuffer(path) {
    return this.decodedBuffers.get(path) || null;
  }

  cacheDecodedBuffer(path, buffer) {
    this.decodedBuffers.set(path, buffer);
  }

  async fetchWithRetry(url, retryCount = 0) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response;
    } catch (error) {
      if (retryCount < this.MAX_RETRY_ATTEMPTS) {
        // Exponential backoff: wait longer between each retry
        const delay = Math.pow(2, retryCount) * 500; // 500ms, 1s, 2s, etc.
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.fetchWithRetry(url, retryCount + 1);
      }
      throw error;
    }
  }

  /**
   * Clear the in-memory decoded buffer cache
   * @param {string|null} path - Specific path to clear, or null to clear all
   */
  clearDecodedBufferCache(path = null) {
    if (path) {
      this.decodedBuffers.delete(path);
    } else {
      this.decodedBuffers.clear();
    }
  }

  /**
   * Get a cached AudioNode tree for a track
   * @param {string} path - Path to the audio file
   * @returns {Object|null} The cached AudioNode tree or null
   */
  getAudioNodeTree(path) {
    return this.audioNodeTrees.get(path) || null;
  }

  /**
   * Cache a complete AudioNode tree
   * @param {string} path - Path to the audio file
   * @param {Object} nodeTree - AudioNode tree to cache
   */
  cacheAudioNodeTree(path, nodeTree) {
    this.audioNodeTrees.set(path, nodeTree);
  }

  /**
   * Clear the cached AudioNode trees
   * @param {string|null} path - Specific path to clear, or null to clear all
   */
  clearAudioNodeTreeCache(path = null) {
    if (path) {
      this.audioNodeTrees.delete(path);
    } else {
      this.audioNodeTrees.clear();
    }
  }
}
