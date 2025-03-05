# What's Going On - Multitrack Player

A web-based multitrack audio player for exploring the individual elements of Marvin Gaye's "What's Going On". This project allows you to listen to, mix, and solo individual tracks from this iconic song.

## Features

- Load and play multitrack audio files with synchronized playback
- Individual track controls for volume and panning
- Solo functionality to isolate specific tracks
- Audio caching using IndexedDB for improved performance
- Reverb effect with toggle control
- Responsive UI with intuitive playback controls
- Web Component architecture for easy reuse

## Tech Stack

- Vanilla JavaScript (ES Modules)
- Web Components
- Web Audio API
- IndexedDB for caching
- Lucide Icons
- Bun for server

## Getting Started

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the server:
   ```bash
   npm start
   ```
4. Visit http://localhost:3000 in your browser

## Development

For development with automatic restarts:

```bash
npm run dev
```

## Project Structure

```
├── public/                  # Static assets
│   └── assets/              # Audio tracks and images
├── src/                     # Source code
│   └── components/          # Web components
│       └── multitrack-player/   # Multitrack player component
│           ├── modules/     # Component modules
│           │   ├── audio-cache.js       # Audio caching logic
│           │   ├── audio-processor.js   # Audio processing and effects
│           │   ├── track-loader.js      # Track loading functionality
│           │   └── ui-manager.js        # UI handling
│           ├── multitrack-player.js     # Main component file
│           └── styles.css               # Component styles
├── index.html               # Main HTML file
├── styles.css               # Global styles
├── server.js                # Bun server
└── package.json             # Project dependencies
```

## Component Usage

```html
<multitrack-player
  id="player"
  tracks='[
    {
      "path": "path/to/track.ogg",
      "name": "Track Name",
      "gain": 1.0,
      "pan": 0
    },
    ...
  ]'
></multitrack-player>
```

## License

MIT

## Acknowledgements

- Marvin Gaye for the amazing music
- The Motown Record Company for producing this iconic album