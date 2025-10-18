self.onmessage = async (event) => {
	const { tracks, cacheName } = event.data;

	const _fetchAndCache = async (url) => {
		const cache = await caches.open(cacheName);
		const cachedResponse = await cache.match(url);
		if (cachedResponse) {
			return cachedResponse.arrayBuffer();
		}
		const networkResponse = await fetch(url);
		if (!networkResponse.ok) {
			throw new Error(`HTTP error! status: ${networkResponse.status}`);
		}
		cache.put(url, networkResponse.clone());
		return networkResponse.arrayBuffer();
	};

	tracks.forEach(async (track) => {
		try {
			const arrayBuffer = await _fetchAndCache(track.path);
			self.postMessage(
				{
					type: "fetched",
					config: track,
					arrayBuffer,
				},
				[arrayBuffer],
			);
		} catch (error) {
			console.error(`Worker failed to fetch ${track.name}:`, error);
			self.postMessage({
				type: "error",
				message: `Failed to fetch ${track.name}`,
				config: track,
			});
		}
	});
};
