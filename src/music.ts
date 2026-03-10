import { execFile } from "node:child_process";

/**
 * Execute JXA (JavaScript for Automation) code via osascript and return parsed JSON.
 */
export function runJxa<T>(script: string): Promise<T> {
  return new Promise((resolve, reject) => {
    execFile(
      "osascript",
      ["-l", "JavaScript", "-e", script],
      { maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim() || error.message));
          return;
        }
        const trimmed = stdout.trim();
        if (!trimmed) {
          resolve(undefined as T);
          return;
        }
        try {
          resolve(JSON.parse(trimmed) as T);
        } catch {
          resolve(trimmed as T);
        }
      },
    );
  });
}

// ── macOS version detection ──
// Sonoma (14+) renamed `loved` → `favorited`

let _macosVersion: number | null = null;

async function getMacosVersion(): Promise<number> {
  if (_macosVersion !== null) return _macosVersion;
  const raw = await new Promise<string>((resolve, reject) => {
    execFile("sw_vers", ["-productVersion"], (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout.trim());
    });
  });
  _macosVersion = parseInt(raw.split(".")[0]!, 10);
  return _macosVersion;
}

async function getFavoriteProp(): Promise<string> {
  const ver = await getMacosVersion();
  return ver >= 14 ? "favorited" : "loved";
}

// ── Types ──

export interface TrackInfo {
  name: string;
  artist: string;
  album: string;
  albumArtist: string;
  genre: string;
  duration: number;
  year: number;
  trackNumber: number;
  persistentID: string;
  bpm: number;
  playedCount: number;
  skippedCount: number;
  rating: number;
  dateAdded: string;
  playedDate: string;
  favorited?: boolean;
}

export interface TrackDetails extends TrackInfo {
  composer: string;
  grouping: string;
  comment: string;
  sampleRate: number;
  bitRate: number;
  kind: string;
  discNumber: number;
  discCount: number;
  size: number;
}

export interface PlaylistInfo {
  name: string;
  persistentID: string;
  class: string;
  trackCount: number;
}

// ── Helper to format track fields in JXA ──

function trackFields(favProp?: string): string {
  const favField = favProp ? `, favorited: t.${favProp}()` : "";
  return `({
    name: t.name(),
    artist: t.artist(),
    album: t.album(),
    albumArtist: t.albumArtist(),
    genre: t.genre(),
    duration: t.duration(),
    year: t.year(),
    trackNumber: t.trackNumber(),
    persistentID: t.persistentID(),
    bpm: t.bpm(),
    playedCount: t.playedCount(),
    skippedCount: t.skippedCount(),
    rating: t.rating(),
    dateAdded: t.dateAdded().toISOString(),
    playedDate: t.playedDate() ? t.playedDate().toISOString() : null${favField}
  })`;
}

function trackDetailFields(favProp?: string): string {
  const favField = favProp ? `, favorited: t.${favProp}()` : "";
  return `({
    name: t.name(),
    artist: t.artist(),
    album: t.album(),
    albumArtist: t.albumArtist(),
    genre: t.genre(),
    duration: t.duration(),
    year: t.year(),
    trackNumber: t.trackNumber(),
    persistentID: t.persistentID(),
    bpm: t.bpm(),
    playedCount: t.playedCount(),
    skippedCount: t.skippedCount(),
    rating: t.rating(),
    dateAdded: t.dateAdded().toISOString(),
    playedDate: t.playedDate() ? t.playedDate().toISOString() : null,
    composer: t.composer(),
    grouping: t.grouping(),
    comment: t.comment(),
    sampleRate: t.sampleRate(),
    bitRate: t.bitRate(),
    kind: t.kind(),
    discNumber: t.discNumber(),
    discCount: t.discCount(),
    size: t.size()${favField}
  })`;
}

// ── Music.app Operations ──

export async function getCurrentTrack(): Promise<TrackInfo> {
  const favProp = await getFavoriteProp();
  return runJxa<TrackInfo>(`
    const Music = Application("Music");
    if (Music.playerState() === "stopped") throw new Error("No track is currently playing.");
    const t = Music.currentTrack();
    JSON.stringify(${trackFields(favProp)});
  `);
}

export async function getPlayerState(): Promise<{
  state: string;
  position: number;
  volume: number;
  shuffleEnabled: boolean;
  songRepeat: string;
}> {
  return runJxa(`
    const Music = Application("Music");
    JSON.stringify({
      state: Music.playerState(),
      position: Music.playerState() === "stopped" ? 0 : Music.playerPosition(),
      volume: Music.soundVolume(),
      shuffleEnabled: Music.shuffleEnabled(),
      songRepeat: Music.songRepeat()
    });
  `);
}

export async function play(): Promise<void> {
  await runJxa(`Application("Music").play()`);
}

export async function pause(): Promise<void> {
  await runJxa(`Application("Music").pause()`);
}

export async function playPause(): Promise<void> {
  await runJxa(`Application("Music").playpause()`);
}

export async function nextTrack(): Promise<void> {
  await runJxa(`Application("Music").nextTrack()`);
}

export async function previousTrack(): Promise<void> {
  await runJxa(`Application("Music").previousTrack()`);
}

export async function setVolume(volume: number): Promise<void> {
  await runJxa(`Application("Music").soundVolume = ${volume}`);
}

export async function setShuffle(enabled: boolean): Promise<void> {
  await runJxa(`Application("Music").shuffleEnabled = ${enabled}`);
}

export async function setRepeat(mode: string): Promise<void> {
  await runJxa(`Application("Music").songRepeat = "${mode}"`);
}

export async function searchTracks(
  query: string,
  filter?: "all" | "artists" | "albums" | "composers",
  limit = 50,
): Promise<TrackInfo[]> {
  const favProp = await getFavoriteProp();
  const filterArg = filter && filter !== "all" ? `, only: "${filter}"` : "";
  return runJxa<TrackInfo[]>(`
    const Music = Application("Music");
    const lib = Music.libraryPlaylists[0];
    const results = lib.search({for: ${JSON.stringify(query)}${filterArg}});
    if (!results) JSON.stringify([]);
    else JSON.stringify(results.slice(0, ${limit}).map(t => ${trackFields(favProp)}));
  `);
}

export async function listPlaylists(): Promise<PlaylistInfo[]> {
  return runJxa<PlaylistInfo[]>(`
    const Music = Application("Music");
    const playlists = Music.playlists();
    JSON.stringify(playlists.map(p => ({
      name: p.name(),
      persistentID: p.persistentID(),
      class: p.class(),
      trackCount: p.tracks().length
    })));
  `);
}

export async function getPlaylistTracks(
  playlistName: string,
  limit = 50,
  offset = 0,
): Promise<{ tracks: TrackInfo[]; total: number }> {
  const favProp = await getFavoriteProp();
  return runJxa<{ tracks: TrackInfo[]; total: number }>(`
    const Music = Application("Music");
    const playlist = Music.playlists.byName(${JSON.stringify(playlistName)});
    const allTracks = playlist.tracks();
    const total = allTracks.length;
    const slice = allTracks.slice(${offset}, ${offset + limit});
    JSON.stringify({
      tracks: slice.map(t => ${trackFields(favProp)}),
      total
    });
  `);
}

export async function createPlaylist(
  name: string,
  folder?: boolean,
): Promise<PlaylistInfo> {
  const kind = folder ? "folderPlaylist" : "playlist";
  return runJxa<PlaylistInfo>(`
    const Music = Application("Music");
    const p = Music.make({new: "${kind}", withProperties: {name: ${JSON.stringify(name)}}});
    JSON.stringify({
      name: p.name(),
      persistentID: p.persistentID(),
      class: p.class(),
      trackCount: 0
    });
  `);
}

export async function addTracksToPlaylist(
  playlistName: string,
  trackPersistentIDs: string[],
): Promise<{ added: number }> {
  const idsJson = JSON.stringify(trackPersistentIDs);
  return runJxa<{ added: number }>(`
    const Music = Application("Music");
    const targetPlaylist = Music.playlists.byName(${JSON.stringify(playlistName)});
    const lib = Music.playlists.byName("Library");
    const ids = ${idsJson};
    let added = 0;
    for (const id of ids) {
      const found = lib.tracks.whose({persistentID: id})();
      if (found.length > 0) {
        Music.duplicate(found[0], {to: targetPlaylist});
        added++;
      }
    }
    JSON.stringify({added});
  `);
}

export async function playTrack(persistentID: string): Promise<void> {
  await runJxa(`
    const Music = Application("Music");
    const lib = Music.playlists.byName("Library");
    const found = lib.tracks.whose({persistentID: ${JSON.stringify(persistentID)}})();
    if (found.length === 0) throw new Error("Track not found");
    Music.play(found[0]);
  `);
}

export async function playPlaylist(playlistName: string): Promise<void> {
  await runJxa(`
    const Music = Application("Music");
    const playlist = Music.playlists.byName(${JSON.stringify(playlistName)});
    Music.play(playlist);
  `);
}

export async function removeFromPlaylist(
  playlistName: string,
  trackPersistentIDs: string[],
): Promise<{ removed: number }> {
  const idsJson = JSON.stringify(trackPersistentIDs);
  return runJxa<{ removed: number }>(`
    const Music = Application("Music");
    const playlist = Music.playlists.byName(${JSON.stringify(playlistName)});
    const ids = new Set(${idsJson});
    const tracks = playlist.tracks();
    let removed = 0;
    for (let i = tracks.length - 1; i >= 0; i--) {
      if (ids.has(tracks[i].persistentID())) {
        Music.delete(tracks[i]);
        removed++;
      }
    }
    JSON.stringify({removed});
  `);
}

export async function deletePlaylist(playlistName: string): Promise<void> {
  await runJxa(`
    const Music = Application("Music");
    const playlist = Music.playlists.byName(${JSON.stringify(playlistName)});
    Music.delete(playlist);
  `);
}

export async function setFavorite(
  persistentID: string,
  favorited: boolean,
): Promise<void> {
  const favProp = await getFavoriteProp();
  await runJxa(`
    const Music = Application("Music");
    const lib = Music.playlists.byName("Library");
    const found = lib.tracks.whose({persistentID: ${JSON.stringify(persistentID)}})();
    if (found.length === 0) throw new Error("Track not found");
    found[0].${favProp} = ${favorited};
  `);
}

export async function setDislike(
  persistentID: string,
  disliked: boolean,
): Promise<void> {
  await runJxa(`
    const Music = Application("Music");
    const lib = Music.playlists.byName("Library");
    const found = lib.tracks.whose({persistentID: ${JSON.stringify(persistentID)}})();
    if (found.length === 0) throw new Error("Track not found");
    found[0].disliked = ${disliked};
  `);
}

export async function setRating(
  persistentID: string,
  stars: number,
): Promise<void> {
  const ratingValue = Math.round(stars * 20); // 1-5 stars → 0-100
  await runJxa(`
    const Music = Application("Music");
    const lib = Music.playlists.byName("Library");
    const found = lib.tracks.whose({persistentID: ${JSON.stringify(persistentID)}})();
    if (found.length === 0) throw new Error("Track not found");
    found[0].rating = ${ratingValue};
  `);
}

export async function addToLibrary(): Promise<void> {
  await runJxa(`
    const Music = Application("Music");
    if (Music.playerState() === "stopped") throw new Error("No track is currently playing.");
    const t = Music.currentTrack();
    Music.duplicate(t, {to: Music.sources[0]});
  `);
}

export async function movePlaylistToFolder(
  playlistName: string,
  folderName: string,
): Promise<void> {
  await runJxa(`
    const Music = Application("Music");
    const playlist = Music.playlists.byName(${JSON.stringify(playlistName)});
    const folder = Music.playlists.byName(${JSON.stringify(folderName)});
    Music.move(playlist, {to: folder});
  `);
}

// ── Metadata & Smart Organization ──

export async function getTrackDetails(persistentID: string): Promise<TrackDetails> {
  const favProp = await getFavoriteProp();
  return runJxa<TrackDetails>(`
    const Music = Application("Music");
    const lib = Music.playlists.byName("Library");
    const found = lib.tracks.whose({persistentID: ${JSON.stringify(persistentID)}})();
    if (found.length === 0) throw new Error("Track not found");
    const t = found[0];
    JSON.stringify(${trackDetailFields(favProp)});
  `);
}

export async function setBpm(persistentID: string, bpm: number): Promise<void> {
  await runJxa(`
    const Music = Application("Music");
    const lib = Music.playlists.byName("Library");
    const found = lib.tracks.whose({persistentID: ${JSON.stringify(persistentID)}})();
    if (found.length === 0) throw new Error("Track not found");
    found[0].bpm = ${bpm};
  `);
}

export interface LibraryStats {
  totalTracks: number;
  totalDuration: number;
  genres: Record<string, number>;
  topArtists: { name: string; count: number }[];
  mostPlayed: { name: string; artist: string; playedCount: number; persistentID: string }[];
  mostSkipped: { name: string; artist: string; skippedCount: number; persistentID: string }[];
  decades: Record<string, number>;
  favoriteCount: number;
  ratedCount: number;
  bpmSetCount: number;
}

export async function getLibraryStats(topN = 15): Promise<LibraryStats> {
  const favProp = await getFavoriteProp();
  return runJxa<LibraryStats>(`
    const Music = Application("Music");
    const lib = Music.playlists.byName("Library");
    const tracks = lib.tracks();
    const genres = {};
    const artists = {};
    const decades = {};
    const played = [];
    const skipped = [];
    let totalDuration = 0;
    let favoriteCount = 0;
    let ratedCount = 0;
    let bpmSetCount = 0;

    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i];
      const g = t.genre();
      if (g) genres[g] = (genres[g] || 0) + 1;

      const a = t.artist();
      if (a) artists[a] = (artists[a] || 0) + 1;

      const y = t.year();
      if (y > 0) {
        const decade = Math.floor(y / 10) * 10 + "s";
        decades[decade] = (decades[decade] || 0) + 1;
      }

      totalDuration += t.duration();

      const pc = t.playedCount();
      if (pc > 0) played.push({name: t.name(), artist: a, playedCount: pc, persistentID: t.persistentID()});

      const sc = t.skippedCount();
      if (sc > 0) skipped.push({name: t.name(), artist: a, skippedCount: sc, persistentID: t.persistentID()});

      if (t.${favProp}()) favoriteCount++;
      if (t.rating() > 0) ratedCount++;
      if (t.bpm() > 0) bpmSetCount++;
    }

    played.sort((a, b) => b.playedCount - a.playedCount);
    skipped.sort((a, b) => b.skippedCount - a.skippedCount);

    const topArtists = Object.entries(artists)
      .map(([name, count]) => ({name, count}))
      .sort((a, b) => b.count - a.count)
      .slice(0, ${topN});

    JSON.stringify({
      totalTracks: tracks.length,
      totalDuration,
      genres,
      topArtists,
      mostPlayed: played.slice(0, ${topN}),
      mostSkipped: skipped.slice(0, ${topN}),
      decades,
      favoriteCount,
      ratedCount,
      bpmSetCount
    });
  `);
}

export interface TrackCriteria {
  genre?: string;
  bpmMin?: number;
  bpmMax?: number;
  yearMin?: number;
  yearMax?: number;
  favoritesOnly?: boolean;
  minPlayedCount?: number;
  maxPlayedCount?: number;
  artist?: string;
  sortBy?: "playedCount" | "dateAdded" | "name" | "artist" | "bpm" | "random";
  limit?: number;
}

export async function getTracksByCriteria(criteria: TrackCriteria): Promise<TrackInfo[]> {
  const favProp = await getFavoriteProp();
  const limit = criteria.limit ?? 50;
  const criteriaJson = JSON.stringify(criteria);
  return runJxa<TrackInfo[]>(`
    const Music = Application("Music");
    const lib = Music.playlists.byName("Library");
    const tracks = lib.tracks();
    const c = ${criteriaJson};
    const results = [];

    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i];
      if (c.genre && t.genre() !== c.genre) continue;
      if (c.bpmMin && t.bpm() < c.bpmMin) continue;
      if (c.bpmMax && t.bpm() > c.bpmMax) continue;
      if (c.yearMin && t.year() < c.yearMin) continue;
      if (c.yearMax && t.year() > c.yearMax) continue;
      if (c.favoritesOnly && !t.${favProp}()) continue;
      if (c.minPlayedCount != null && t.playedCount() < c.minPlayedCount) continue;
      if (c.maxPlayedCount != null && t.playedCount() > c.maxPlayedCount) continue;
      if (c.artist && t.artist() !== c.artist) continue;
      results.push(t);
    }

    const sortBy = c.sortBy || "name";
    if (sortBy === "random") {
      for (let i = results.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = results[i]; results[i] = results[j]; results[j] = tmp;
      }
    } else {
      results.sort((a, b) => {
        if (sortBy === "playedCount") return b.playedCount() - a.playedCount();
        if (sortBy === "dateAdded") return b.dateAdded().getTime() - a.dateAdded().getTime();
        if (sortBy === "bpm") return b.bpm() - a.bpm();
        if (sortBy === "artist") return a.artist().localeCompare(b.artist());
        return a.name().localeCompare(b.name());
      });
    }

    JSON.stringify(results.slice(0, ${limit}).map(t => ${trackFields(favProp)}));
  `);
}

export async function createSmartPlaylist(
  name: string,
  criteria: TrackCriteria,
): Promise<{ playlist: PlaylistInfo; tracksAdded: number }> {
  const favProp = await getFavoriteProp();
  const limit = criteria.limit ?? 50;
  const criteriaJson = JSON.stringify(criteria);
  return runJxa<{ playlist: PlaylistInfo; tracksAdded: number }>(`
    const Music = Application("Music");
    const lib = Music.playlists.byName("Library");
    const tracks = lib.tracks();
    const c = ${criteriaJson};
    const matched = [];

    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i];
      if (c.genre && t.genre() !== c.genre) continue;
      if (c.bpmMin && t.bpm() < c.bpmMin) continue;
      if (c.bpmMax && t.bpm() > c.bpmMax) continue;
      if (c.yearMin && t.year() < c.yearMin) continue;
      if (c.yearMax && t.year() > c.yearMax) continue;
      if (c.favoritesOnly && !t.${favProp}()) continue;
      if (c.minPlayedCount != null && t.playedCount() < c.minPlayedCount) continue;
      if (c.maxPlayedCount != null && t.playedCount() > c.maxPlayedCount) continue;
      if (c.artist && t.artist() !== c.artist) continue;
      matched.push(t);
    }

    const sortBy = c.sortBy || "name";
    if (sortBy === "random") {
      for (let i = matched.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = matched[i]; matched[i] = matched[j]; matched[j] = tmp;
      }
    } else {
      matched.sort((a, b) => {
        if (sortBy === "playedCount") return b.playedCount() - a.playedCount();
        if (sortBy === "dateAdded") return b.dateAdded().getTime() - a.dateAdded().getTime();
        if (sortBy === "bpm") return b.bpm() - a.bpm();
        if (sortBy === "artist") return a.artist().localeCompare(b.artist());
        return a.name().localeCompare(b.name());
      });
    }

    const selected = matched.slice(0, ${limit});
    const p = Music.make({new: "playlist", withProperties: {name: ${JSON.stringify(name)}}});
    for (const t of selected) {
      Music.duplicate(t, {to: p});
    }

    JSON.stringify({
      playlist: {
        name: p.name(),
        persistentID: p.persistentID(),
        class: p.class(),
        trackCount: selected.length
      },
      tracksAdded: selected.length
    });
  `);
}
