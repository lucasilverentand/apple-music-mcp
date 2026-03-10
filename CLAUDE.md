# Apple Music MCP

MCP server for controlling Apple Music on macOS via JXA (JavaScript for Automation).

## Architecture

- `src/index.ts` — MCP server entry point, tool registration
- `src/music.ts` — JXA wrapper functions that shell out to `osascript`

## Running

```sh
bun run src/index.ts  # starts stdio MCP server
```

## Key Notes

- Uses `osascript -l JavaScript` (JXA) to control Music.app — no API keys needed
- `search` works on `playlist "Music"` (not `"Library"`) for streaming tracks
- `whose` clause works on both Library and Music playlists
- Track `persistentID` is the stable identifier used across tools
- Never use `console.log()` in the server — it corrupts stdio JSON-RPC. Use `console.error()`.
