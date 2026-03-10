/**
 * Genre → BPM range mapping for tempo estimation.
 * Used by the LLM to reason about tempo without needing exact BPM values.
 * Ranges represent typical BPM for each genre.
 */

export interface BpmRange {
  min: number;
  max: number;
}

const genreBpmMap: Record<string, BpmRange> = {
  "Hip-Hop/Rap": { min: 80, max: 115 },
  "Dance": { min: 120, max: 130 },
  "House": { min: 120, max: 130 },
  "Techno": { min: 125, max: 140 },
  "Drum & Bass": { min: 160, max: 180 },
  "Dubstep": { min: 135, max: 145 },
  "Electronic": { min: 110, max: 150 },
  "Pop": { min: 100, max: 130 },
  "Rock": { min: 110, max: 140 },
  "Alternative": { min: 100, max: 140 },
  "Indie Rock": { min: 100, max: 140 },
  "Metal": { min: 120, max: 180 },
  "Punk": { min: 150, max: 180 },
  "R&B/Soul": { min: 60, max: 100 },
  "Jazz": { min: 80, max: 160 },
  "Blues": { min: 60, max: 100 },
  "Country": { min: 90, max: 120 },
  "Folk": { min: 80, max: 120 },
  "Reggae": { min: 60, max: 90 },
  "Classical": { min: 40, max: 180 },
  "Soundtrack": { min: 60, max: 140 },
  "Ambient": { min: 60, max: 100 },
  "Latin": { min: 90, max: 130 },
  "Afrobeats": { min: 100, max: 120 },
  "K-Pop": { min: 100, max: 130 },
  "Singer/Songwriter": { min: 80, max: 120 },
  "Funk": { min: 100, max: 130 },
  "Disco": { min: 110, max: 130 },
  "Trap": { min: 130, max: 170 },
  "Lo-Fi": { min: 70, max: 90 },
  "Gospel": { min: 80, max: 130 },
  "World": { min: 80, max: 140 },
};

/**
 * Estimate BPM range for a genre. Returns undefined if genre is unknown.
 */
export function estimateBpmRange(genre: string): BpmRange | undefined {
  // Try exact match first, then case-insensitive partial match
  if (genreBpmMap[genre]) return genreBpmMap[genre];

  const lower = genre.toLowerCase();
  for (const [key, range] of Object.entries(genreBpmMap)) {
    if (key.toLowerCase() === lower || lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
      return range;
    }
  }
  return undefined;
}

/**
 * Get the full genre-to-BPM mapping table.
 */
export function getGenreBpmMap(): Record<string, BpmRange> {
  return { ...genreBpmMap };
}
