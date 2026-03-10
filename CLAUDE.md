# Apple Music MCP

MCP server for controlling Apple Music on macOS via JXA (JavaScript for Automation).

## Architecture

- `src/index.ts` — MCP server entry point, tool registration (27 tools)
- `src/music.ts` — JXA wrapper functions that shell out to `osascript`
- `src/bpm.ts` — Genre-to-BPM range mapping for tempo estimation
- `src/wikidata.ts` — Wikidata SPARQL lookup for song metadata (genres, key, BPM, producers, songwriters, identifiers)

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
- Apple Music streaming tracks have `bpm: 0` — use `set_bpm` to tag manually
- `get_library_stats` aggregates inside JXA in a single pass for performance
- `get_tracks_by_criteria` and `create_smart_playlist` share the same filter logic
- `wikidata_lookup` queries the public Wikidata SPARQL endpoint — no API keys needed
