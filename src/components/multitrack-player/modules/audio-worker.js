self.onmessage = async (event) => {
	const { tracks, cacheName, baseUrl } = event.data;

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

	// Simple semaphore to limit concurrent fetches.
	// Browsers typically cap at ~6 connections per domain;
	// exceeding this causes head-of-line blocking.
	const createLimiter = (concurrency) => {
		const queue = [];
		let active = 0;

		const runNext = () => {
			if (queue.length === 0 || active >= concurrency) return;
			active++;
			const { fn, resolve, reject } = queue.shift();
			fn().then(resolve, reject).finally(() => {
				active--;
				runNext();
			});
		};

		return (fn) =>
			new Promise((resolve, reject) => {
				queue.push({ fn, resolve, reject });
				runNext();
			});
	};

	const limit = createLimiter(4);

	if (tracks && tracks.length > 0) {
		await Promise.allSettled(
			tracks.map((track) =>
				limit(async () => {
					try {
						const fullUrl = new URL(track.path, baseUrl).href;
						const arrayBuffer = await _fetchAndCache(fullUrl);
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
				}),
			),
		);
	}
};
