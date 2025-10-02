# Action Runner

- To run the project: `bun run dev`
- To run a specific entrypoint: `ENTRYPOINT=/minimal.html bun server.js`

# Code Style

- Use Prettier for formatting.
- Use ES modules for imports and exports.
- Use `const` by default, `let` when reassignment is needed.
- No type checking is configured.

# Naming Conventions

- Use camelCase for variables and functions.
- Use PascalCase for classes.
- Prefix private methods with an underscore (e.g., `_privateMethod`).

# Error Handling

- Use `try...catch` blocks for asynchronous operations that may fail.
- Log errors to the console with `console.error()`.
- Avoid silently failing; always provide some feedback.

# Comments

- Use JSDoc-style comments for functions and classes.
- Explain _why_ the code is written a certain way, not _what_ it does.
- Add comments to complex or non-obvious code.

# General Guidelines

- Avoid direct DOM manipulation; use the `UIManager` for UI updates.
- Keep the `AudioProcessor` and `UIManager` decoupled from each other.
- Use native browser APIs where possible.
