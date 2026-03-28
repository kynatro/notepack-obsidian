# Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for full codebase architecture, file structure, data flow, key types, and design patterns. Read it before making structural changes.

# Follow Obsidian plugin guidelines

This is an Obsidian plugin and should follow all best-practice guidelines. Whenever making enhancements to this project, first retrieve the plugin guidelines at https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines and build the practices found there into any code modifications.

# Coding best-practices

- After making modifications to JavaScript files run `npm run build` to ensure the project builds properly and `npm test` to verify operation.
- When modifications have been made, always make sure ARCHITECTURE.md and README.md are up-to-date
