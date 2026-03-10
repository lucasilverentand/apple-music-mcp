#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as music from "./music.ts";

import { lookupSong } from "./wikidata.ts";

const server = new McpServer({
  name: "apple-music",
  version: "0.2.0",
});

// ── Playback Controls ──

server.registerTool("get_player_state", {
  description:
    "Get the current playback state of Apple Music, including current track info, player position, volume, shuffle, and repeat settings.",
}, async () => {
  const state = await music.getPlayerState();
  let trackInfo: music.TrackInfo | null = null;
  if (state.state !== "stopped") {
    trackInfo = await music.getCurrentTrack();
  }
  return {
    content: [{ type: "text", text: JSON.stringify({ ...state, currentTrack: trackInfo }, null, 2) }],
  };
});

server.registerTool("play_pause", {
  description: "Toggle play/pause in Apple Music.",
}, async () => {
  await music.playPause();
  const state = await music.getPlayerState();
  return { content: [{ type: "text", text: `Player is now ${state.state}.` }] };
});

server.registerTool("next_track", {
  description: "Skip to the next track in Apple Music.",
}, async () => {
  await music.nextTrack();
  const track = await music.getCurrentTrack();
  return { content: [{ type: "text", text: `Now playing: ${track.name} by ${track.artist}` }] };
});

server.registerTool("previous_track", {
  description: "Go to the previous track in Apple Music.",
}, async () => {
  await music.previousTrack();
  const track = await music.getCurrentTrack();
  return { content: [{ type: "text", text: `Now playing: ${track.name} by ${track.artist}` }] };
});

server.registerTool("set_volume", {
  description: "Set the Apple Music volume (0-100).",
  inputSchema: {
    volume: z.number().min(0).max(100).describe("Volume level from 0 to 100"),
  },
}, async ({ volume }) => {
  await music.setVolume(volume);
  return { content: [{ type: "text", text: `Volume set to ${volume}.` }] };
});

server.registerTool("set_shuffle", {
  description: "Enable or disable shuffle in Apple Music.",
  inputSchema: {
    enabled: z.boolean().describe("Whether shuffle should be enabled"),
  },
}, async ({ enabled }) => {
  await music.setShuffle(enabled);
  return { content: [{ type: "text", text: `Shuffle ${enabled ? "enabled" : "disabled"}.` }] };
});

server.registerTool("set_repeat", {
  description: "Set the repeat mode in Apple Music.",
  inputSchema: {
    mode: z.enum(["off", "one", "all"]).describe("Repeat mode: 'off', 'one', or 'all'"),
  },
}, async ({ mode }) => {
  await music.setRepeat(mode);
  return { content: [{ type: "text", text: `Repeat mode set to ${mode}.` }] };
});

// ── Search ──

server.registerTool("search_tracks", {
  description:
    "Search for tracks in your Apple Music library by name, artist, or album. Returns up to 50 results with persistent IDs that can be used with other tools.",
  inputSchema: {
    query: z.string().describe("Search query (song name, artist, album, etc.)"),
    filter: z
      .enum(["all", "artists", "albums", "composers"])
      .optional()
      .describe("Narrow search to a specific field. Defaults to 'all'."),
  },
}, async ({ query, filter }) => {
  const tracks = await music.searchTracks(query, filter);
  return {
    content: [{ type: "text", text: JSON.stringify(tracks, null, 2) }],
  };
});

// ── Playlists ──

server.registerTool("list_playlists", {
  description: "List all playlists in Apple Music with their track counts.",
}, async () => {
  const playlists = await music.listPlaylists();
  return {
    content: [{ type: "text", text: JSON.stringify(playlists, null, 2) }],
  };
});

server.registerTool("get_playlist_tracks", {
  description: "Get tracks from a specific playlist, with pagination support.",
  inputSchema: {
    playlist: z.string().describe("Name of the playlist"),
    limit: z.number().optional().describe("Max number of tracks to return (default 50)"),
    offset: z.number().optional().describe("Number of tracks to skip (default 0)"),
  },
}, async ({ playlist, limit, offset }) => {
  const result = await music.getPlaylistTracks(playlist, limit ?? 50, offset ?? 0);
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
});

server.registerTool("create_playlist", {
  description: "Create a new empty playlist or playlist folder in Apple Music.",
  inputSchema: {
    name: z.string().describe("Name for the new playlist"),
    folder: z.boolean().optional().describe("If true, create a folder playlist instead of a regular playlist"),
  },
}, async ({ name, folder }) => {
  const playlist = await music.createPlaylist(name, folder);
  const kind = folder ? "folder" : "playlist";
  return {
    content: [{ type: "text", text: `Created ${kind} "${playlist.name}" (ID: ${playlist.persistentID}).` }],
  };
});

server.registerTool("add_to_playlist", {
  description:
    "Add tracks to a playlist by their persistent IDs. Use search_tracks first to find track IDs.",
  inputSchema: {
    playlist: z.string().describe("Name of the target playlist"),
    trackIds: z
      .array(z.string())
      .describe("Array of track persistent IDs to add"),
  },
}, async ({ playlist, trackIds }) => {
  const result = await music.addTracksToPlaylist(playlist, trackIds);
  return {
    content: [{ type: "text", text: `Added ${result.added} track(s) to "${playlist}".` }],
  };
});

server.registerTool("remove_from_playlist", {
  description: "Remove tracks from a playlist by their persistent IDs.",
  inputSchema: {
    playlist: z.string().describe("Name of the playlist"),
    trackIds: z
      .array(z.string())
      .describe("Array of track persistent IDs to remove"),
  },
}, async ({ playlist, trackIds }) => {
  const result = await music.removeFromPlaylist(playlist, trackIds);
  return {
    content: [{ type: "text", text: `Removed ${result.removed} track(s) from "${playlist}".` }],
  };
});

server.registerTool("delete_playlist", {
  description: "Delete a playlist from Apple Music. This cannot be undone.",
  inputSchema: {
    playlist: z.string().describe("Name of the playlist to delete"),
  },
}, async ({ playlist }) => {
  await music.deletePlaylist(playlist);
  return { content: [{ type: "text", text: `Deleted playlist "${playlist}".` }] };
});

// ── Play Specific Content ──

server.registerTool("play_track", {
  description: "Play a specific track by its persistent ID.",
  inputSchema: {
    persistentID: z.string().describe("Persistent ID of the track to play"),
  },
}, async ({ persistentID }) => {
  await music.playTrack(persistentID);
  const track = await music.getCurrentTrack();
  return { content: [{ type: "text", text: `Now playing: ${track.name} by ${track.artist}` }] };
});

server.registerTool("play_playlist", {
  description: "Start playing a playlist by name.",
  inputSchema: {
    playlist: z.string().describe("Name of the playlist to play"),
  },
}, async ({ playlist }) => {
  await music.playPlaylist(playlist);
  return { content: [{ type: "text", text: `Now playing playlist "${playlist}".` }] };
});

// ── Track Actions ──

server.registerTool("favorite", {
  description: "Favorite or unfavorite a track by its persistent ID.",
  inputSchema: {
    persistentID: z.string().describe("Persistent ID of the track"),
    favorited: z.boolean().describe("true to favorite, false to unfavorite"),
  },
}, async ({ persistentID, favorited }) => {
  await music.setFavorite(persistentID, favorited);
  return { content: [{ type: "text", text: `Track ${favorited ? "favorited" : "unfavorited"}.` }] };
});

server.registerTool("dislike", {
  description: "Dislike or un-dislike a track by its persistent ID.",
  inputSchema: {
    persistentID: z.string().describe("Persistent ID of the track"),
    disliked: z.boolean().describe("true to dislike, false to un-dislike"),
  },
}, async ({ persistentID, disliked }) => {
  await music.setDislike(persistentID, disliked);
  return { content: [{ type: "text", text: `Track ${disliked ? "disliked" : "un-disliked"}.` }] };
});

server.registerTool("set_rating", {
  description: "Rate a track from 0-5 stars by its persistent ID.",
  inputSchema: {
    persistentID: z.string().describe("Persistent ID of the track"),
    stars: z.number().min(0).max(5).describe("Rating from 0 (no rating) to 5 stars"),
  },
}, async ({ persistentID, stars }) => {
  await music.setRating(persistentID, stars);
  return { content: [{ type: "text", text: `Track rated ${stars} star(s).` }] };
});

server.registerTool("add_to_library", {
  description: "Add the currently playing track to your Apple Music library.",
}, async () => {
  await music.addToLibrary();
  return { content: [{ type: "text", text: "Current track added to library." }] };
});

// ── Organization ──

server.registerTool("move_playlist_to_folder", {
  description: "Move a playlist into a folder playlist. The folder must already exist.",
  inputSchema: {
    playlist: z.string().describe("Name of the playlist to move"),
    folder: z.string().describe("Name of the destination folder"),
  },
}, async ({ playlist, folder }) => {
  await music.movePlaylistToFolder(playlist, folder);
  return { content: [{ type: "text", text: `Moved "${playlist}" into folder "${folder}".` }] };
});

// ── Metadata & Smart Organization ──

server.registerTool("get_track_details", {
  description:
    "Get full metadata for a single track by persistent ID. Returns all standard fields plus composer, grouping, comment, sampleRate, bitRate, kind, discNumber, and size.",
  inputSchema: {
    persistentID: z.string().describe("Persistent ID of the track"),
  },
}, async ({ persistentID }) => {
  const details = await music.getTrackDetails(persistentID);
  return {
    content: [{ type: "text", text: JSON.stringify(details, null, 2) }],
  };
});

server.registerTool("set_bpm", {
  description: "Set the BPM (beats per minute) on a track. Useful for manually tagging tempo since Apple Music streaming tracks often have BPM=0.",
  inputSchema: {
    persistentID: z.string().describe("Persistent ID of the track"),
    bpm: z.number().min(1).max(500).describe("BPM value to set"),
  },
}, async ({ persistentID, bpm }) => {
  await music.setBpm(persistentID, bpm);
  return { content: [{ type: "text", text: `BPM set to ${bpm}.` }] };
});

server.registerTool("get_library_stats", {
  description:
    "Get aggregated library statistics: genre distribution, top artists, most played/skipped tracks, decade distribution, favorite and rated counts. Runs in a single JXA pass for performance.",
  inputSchema: {
    topN: z.number().optional().describe("Number of top items to return per category (default 15)"),
  },
}, async ({ topN }) => {
  const stats = await music.getLibraryStats(topN ?? 15);
  return {
    content: [{ type: "text", text: JSON.stringify(stats, null, 2) }],
  };
});

server.registerTool("get_tracks_by_criteria", {
  description:
    "Find tracks matching flexible filter criteria: genre, BPM range, year range, favorites only, play count range, artist, with sorting options. Returns up to `limit` tracks.",
  inputSchema: {
    genre: z.string().optional().describe("Exact genre name to filter by"),
    bpmMin: z.number().optional().describe("Minimum BPM (only matches tracks with BPM set)"),
    bpmMax: z.number().optional().describe("Maximum BPM (only matches tracks with BPM set)"),
    yearMin: z.number().optional().describe("Minimum release year"),
    yearMax: z.number().optional().describe("Maximum release year"),
    favoritesOnly: z.boolean().optional().describe("Only return favorited tracks"),
    minPlayedCount: z.number().optional().describe("Minimum play count"),
    maxPlayedCount: z.number().optional().describe("Maximum play count"),
    artist: z.string().optional().describe("Exact artist name to filter by"),
    sortBy: z
      .enum(["playedCount", "dateAdded", "name", "artist", "bpm", "random"])
      .optional()
      .describe("Sort order for results (default: name)"),
    limit: z.number().optional().describe("Max tracks to return (default 50)"),
  },
}, async ({ genre, bpmMin, bpmMax, yearMin, yearMax, favoritesOnly, minPlayedCount, maxPlayedCount, artist, sortBy, limit }) => {
  const tracks = await music.getTracksByCriteria({
    genre, bpmMin, bpmMax, yearMin, yearMax, favoritesOnly,
    minPlayedCount, maxPlayedCount, artist, sortBy, limit,
  });
  return {
    content: [{ type: "text", text: JSON.stringify(tracks, null, 2) }],
  };
});

server.registerTool("create_smart_playlist", {
  description:
    "Create a new playlist and populate it with tracks matching filter criteria in one atomic operation. Uses the same filters as get_tracks_by_criteria.",
  inputSchema: {
    name: z.string().describe("Name for the new playlist"),
    genre: z.string().optional().describe("Exact genre name to filter by"),
    bpmMin: z.number().optional().describe("Minimum BPM"),
    bpmMax: z.number().optional().describe("Maximum BPM"),
    yearMin: z.number().optional().describe("Minimum release year"),
    yearMax: z.number().optional().describe("Maximum release year"),
    favoritesOnly: z.boolean().optional().describe("Only include favorited tracks"),
    minPlayedCount: z.number().optional().describe("Minimum play count"),
    maxPlayedCount: z.number().optional().describe("Maximum play count"),
    artist: z.string().optional().describe("Exact artist name to filter by"),
    sortBy: z
      .enum(["playedCount", "dateAdded", "name", "artist", "bpm", "random"])
      .optional()
      .describe("Sort order for track selection (default: name)"),
    limit: z.number().optional().describe("Max tracks to include (default 50)"),
  },
}, async ({ name, genre, bpmMin, bpmMax, yearMin, yearMax, favoritesOnly, minPlayedCount, maxPlayedCount, artist, sortBy, limit }) => {
  const result = await music.createSmartPlaylist(name, {
    genre, bpmMin, bpmMax, yearMin, yearMax, favoritesOnly,
    minPlayedCount, maxPlayedCount, artist, sortBy, limit,
  });
  return {
    content: [{
      type: "text",
      text: `Created playlist "${result.playlist.name}" (ID: ${result.playlist.persistentID}) with ${result.tracksAdded} track(s).`,
    }],
  };
});

// ── Wikidata Lookup ──

server.registerTool("wikidata_lookup", {
  description:
    "Look up a song on Wikidata to get rich metadata not available in Apple Music: detailed genres, musical key, BPM, record label, producers, songwriters, ISRC, Spotify ID, MusicBrainz ID, and more. Use the currently playing track or provide a song name and artist.",
  inputSchema: {
    songName: z.string().describe("Name of the song to look up"),
    artistName: z.string().optional().describe("Artist name to narrow results"),
  },
}, async ({ songName, artistName }) => {
  const results = await lookupSong(songName, artistName);
  if (results.length === 0) {
    return {
      content: [{ type: "text", text: `No Wikidata results found for "${songName}"${artistName ? ` by ${artistName}` : ""}.` }],
    };
  }
  return {
    content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
  };
});

// ── Start Server ──

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Apple Music MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
