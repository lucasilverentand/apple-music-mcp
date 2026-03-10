# Apple Music MCP

MCP server for controlling Apple Music on macOS. Uses JXA (JavaScript for Automation) to talk to Music.app directly — no API keys or authentication needed.

## Install

Requires [Bun](https://bun.sh) and macOS.

### Claude Desktop / Claude Code

Add to your MCP config:

```json
{
  "mcpServers": {
    "apple-music": {
      "command": "bunx",
      "args": ["apple-music-mcp"]
    }
  }
}
```

### From source

```sh
git clone https://github.com/lucasilverentand/apple-music-mcp.git
cd apple-music-mcp
bun install
bun run src/index.ts
```

## Tools

### Playback

| Tool | Description |
|------|-------------|
| `get_player_state` | Current track, position, volume, shuffle & repeat state |
| `play_pause` | Toggle play/pause |
| `next_track` | Skip to next track |
| `previous_track` | Go to previous track |
| `set_volume` | Set volume (0–100) |
| `set_shuffle` | Enable/disable shuffle |
| `set_repeat` | Set repeat mode (off, one, all) |

### Search & Browse

| Tool | Description |
|------|-------------|
| `search_tracks` | Search library by name, artist, or album |
| `get_track_details` | Full metadata for a track by persistent ID |
| `get_tracks_by_criteria` | Filter tracks by genre, BPM, year, play count, artist, favorites |
| `get_library_stats` | Aggregated stats: genres, top artists, most played, decades |

### Playlists

| Tool | Description |
|------|-------------|
| `list_playlists` | List all playlists with track counts |
| `get_playlist_tracks` | Get tracks from a playlist (paginated) |
| `create_playlist` | Create a playlist or folder |
| `create_smart_playlist` | Create a playlist from filter criteria in one step |
| `add_to_playlist` | Add tracks to a playlist by persistent ID |
| `remove_from_playlist` | Remove tracks from a playlist |
| `delete_playlist` | Delete a playlist |
| `move_playlist_to_folder` | Move a playlist into a folder |

### Playback Control

| Tool | Description |
|------|-------------|
| `play_track` | Play a specific track by persistent ID |
| `play_playlist` | Start playing a playlist by name |

### Track Actions

| Tool | Description |
|------|-------------|
| `favorite` | Favorite/unfavorite a track |
| `dislike` | Dislike/un-dislike a track |
| `set_rating` | Rate a track (0–5 stars) |
| `add_to_library` | Add the currently playing track to your library |
| `set_bpm` | Manually tag BPM on a track |

### Wikidata Lookup

| Tool | Description |
|------|-------------|
| `wikidata_lookup` | Look up a song on Wikidata for rich metadata: genres, musical key, BPM, record label, producers, songwriters, ISRC, Spotify/MusicBrainz IDs, and Wikipedia summary |

## How it works

The server shells out to `osascript -l JavaScript` (JXA) to control Music.app. Track `persistentID` is the stable identifier used across all tools. Streaming tracks from Apple Music have `bpm: 0` — use `set_bpm` to tag them manually, or use `wikidata_lookup` to find the BPM.

## Requirements

- macOS (uses Music.app via JXA)
- [Bun](https://bun.sh) runtime

## License

MIT
