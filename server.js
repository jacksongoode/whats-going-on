// Simple Bun server
import { serve } from 'bun';

serve({
  port: 3001,
  fetch(req) {
    const url = new URL(req.url);
    let path = url.pathname;

    // Serve the index page for root requests
    if (path === '/') {
      path = '/index.html';
    }

    // Try to serve the file from the file system
    try {
      const file = Bun.file(`.${path}`);
      return new Response(file);
    } catch (error) {
      return new Response("Not found", { status: 404 });
    }
  }
});

console.log("Server running at http://localhost:3001");