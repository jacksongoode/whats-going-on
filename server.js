// Simple Bun server
import { serve } from "bun";

const port = process.env.PORT || 3001;
const entrypoint = process.env.ENTRYPOINT || "/index.html";

serve({
	port: port,
	async fetch(req) {
		const url = new URL(req.url);
		let path = url.pathname;

		// Serve the entrypoint for root requests
		if (path === "/") {
			path = entrypoint;
		}

		// Handle favicon requests gracefully
		if (path === "/favicon.ico") {
			return new Response(null, { status: 204 });
		}

		// Try to serve the file from the file system (only if it exists)
		const file = Bun.file(`.${path}`);
		if (await file.exists()) {
			return new Response(file);
		}
		return new Response("Not found", { status: 404 });
	},
});

console.log(`Server running at http://localhost:${port}`);
if (entrypoint) {
	console.log(`Serving ${entrypoint} at the root.`);
}
