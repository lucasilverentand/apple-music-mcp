/**
 * Wikidata SPARQL lookup for song metadata.
 * Queries the public Wikidata Query Service — no API keys needed.
 */

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";

export interface WikidataSongResult {
  wikidataId: string;
  name: string;
  artist?: string;
  album?: string;
  genres: string[];
  key?: string;
  bpm?: number;
  duration?: number;
  recordLabel?: string;
  publicationDate?: string;
  producers: string[];
  songwriters: string[];
  isrc?: string;
  spotifyId?: string;
  musicBrainzId?: string;
  description?: string;
  wikidataUrl: string;
  wikipediaUrl?: string;
  wikipediaExtract?: string;
}

/**
 * Build a SPARQL query that searches for a song by name and optionally artist.
 * Returns core properties: genre, key, BPM, label, producers, songwriters, identifiers.
 */
function buildSongQuery(songName: string, artistName?: string): string {
  const artistFilter = artistName
    ? `?item wdt:P175 ?performerEntity .
       ?performerEntity rdfs:label ?performerLabel .
       FILTER(LANG(?performerLabel) = "en")
       FILTER(CONTAINS(LCASE(?performerLabel), ${sparqlString(artistName.toLowerCase())}))`
    : "";

  return `
SELECT DISTINCT
  ?item ?itemLabel ?itemDescription
  (GROUP_CONCAT(DISTINCT ?genreLabel; SEPARATOR=", ") AS ?genres)
  ?keyLabel
  ?bpm
  ?duration
  ?recordLabelLabel
  ?publicationDate
  (GROUP_CONCAT(DISTINCT ?producerLabel; SEPARATOR=", ") AS ?producers)
  (GROUP_CONCAT(DISTINCT ?songwriterLabel; SEPARATOR=", ") AS ?songwriters)
  ?performerLabel
  ?albumLabel
  ?isrc
  ?spotifyId
  ?musicBrainzId
WHERE {
  # Find items that are instances of song/single/musical composition/musical work
  VALUES ?type { wd:Q7366 wd:Q134556 wd:Q105543609 wd:Q2188189 }
  ?item wdt:P31 ?type .

  ?item rdfs:label ?titleLabel .
  FILTER(LANG(?titleLabel) = "en")
  FILTER(CONTAINS(LCASE(?titleLabel), ${sparqlString(songName.toLowerCase())}))

  ${artistFilter}

  OPTIONAL {
    ?item wdt:P175 ?performer .
    ?performer rdfs:label ?performerLabel .
    FILTER(LANG(?performerLabel) = "en")
  }
  OPTIONAL {
    ?item wdt:P136 ?genre .
    ?genre rdfs:label ?genreLabel .
    FILTER(LANG(?genreLabel) = "en")
  }
  OPTIONAL {
    ?item wdt:P826 ?key .
    ?key rdfs:label ?keyLabel .
    FILTER(LANG(?keyLabel) = "en")
  }
  OPTIONAL { ?item wdt:P7084 ?bpm . }
  OPTIONAL { ?item wdt:P2047 ?duration . }
  OPTIONAL {
    ?item wdt:P264 ?recordLabel .
    ?recordLabel rdfs:label ?recordLabelLabel .
    FILTER(LANG(?recordLabelLabel) = "en")
  }
  OPTIONAL { ?item wdt:P577 ?publicationDate . }
  OPTIONAL {
    ?item wdt:P162 ?producer .
    ?producer rdfs:label ?producerLabel .
    FILTER(LANG(?producerLabel) = "en")
  }
  OPTIONAL {
    ?item wdt:P676 ?songwriter .
    ?songwriter rdfs:label ?songwriterLabel .
    FILTER(LANG(?songwriterLabel) = "en")
  }
  OPTIONAL {
    ?item wdt:P361 ?album .
    ?album rdfs:label ?albumLabel .
    FILTER(LANG(?albumLabel) = "en")
  }
  OPTIONAL { ?item wdt:P1243 ?isrc . }
  OPTIONAL { ?item wdt:P2207 ?spotifyId . }
  OPTIONAL { ?item wdt:P435 ?musicBrainzId . }

  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
GROUP BY ?item ?itemLabel ?itemDescription ?keyLabel ?bpm ?duration
         ?recordLabelLabel ?publicationDate ?performerLabel ?albumLabel
         ?isrc ?spotifyId ?musicBrainzId
LIMIT 5
`;
}

function sparqlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

async function runSparqlQuery(query: string): Promise<Record<string, unknown>[]> {
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/sparql-results+json",
      "User-Agent": "AppleMusicMCP/1.0 (https://github.com/lucasilverentand/apple-music-mcp)",
    },
  });

  if (!response.ok) {
    throw new Error(`Wikidata query failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
    results: { bindings: Record<string, { value: string }>[] };
  };

  return data.results.bindings;
}

function extractValue(
  binding: Record<string, { value: string }>,
  key: string,
): string | undefined {
  return binding[key]?.value;
}

function splitList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(", ")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseResults(bindings: Record<string, unknown>[]): WikidataSongResult[] {
  const typedBindings = bindings as Record<string, { value: string }>[];
  return typedBindings.map((b) => {
    const itemUri = extractValue(b, "item") ?? "";
    const wikidataId = itemUri.split("/").pop() ?? "";
    const bpmRaw = extractValue(b, "bpm");

    return {
      wikidataId,
      name: extractValue(b, "itemLabel") ?? "Unknown",
      artist: extractValue(b, "performerLabel"),
      album: extractValue(b, "albumLabel"),
      genres: splitList(extractValue(b, "genres")),
      key: extractValue(b, "keyLabel"),
      bpm: bpmRaw ? parseFloat(bpmRaw) : undefined,
      duration: extractValue(b, "duration")
        ? parseFloat(extractValue(b, "duration")!)
        : undefined,
      recordLabel: extractValue(b, "recordLabelLabel"),
      publicationDate: extractValue(b, "publicationDate"),
      producers: splitList(extractValue(b, "producers")),
      songwriters: splitList(extractValue(b, "songwriters")),
      isrc: extractValue(b, "isrc"),
      spotifyId: extractValue(b, "spotifyId"),
      musicBrainzId: extractValue(b, "musicBrainzId"),
      description: extractValue(b, "itemDescription"),
      wikidataUrl: `https://www.wikidata.org/wiki/${wikidataId}`,
    };
  });
}

// ── Wikipedia enrichment ──

const FETCH_HEADERS = {
  "User-Agent": "AppleMusicMCP/1.0 (https://github.com/lucasilverentand/apple-music-mcp)",
};

interface WikidataSitelinks {
  entities: Record<
    string,
    { sitelinks?: { enwiki?: { title: string } } }
  >;
}

/**
 * Resolve Wikidata IDs → English Wikipedia article titles via the Wikidata API.
 * Returns a map of wikidataId → article title.
 */
async function getWikipediaTitles(
  wikidataIds: string[],
): Promise<Record<string, string>> {
  if (wikidataIds.length === 0) return {};
  const ids = wikidataIds.join("|");
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids}&props=sitelinks&sitefilter=enwiki&format=json`;
  const response = await fetch(url, { headers: FETCH_HEADERS });
  if (!response.ok) return {};
  const data = (await response.json()) as WikidataSitelinks;
  const result: Record<string, string> = {};
  for (const [id, entity] of Object.entries(data.entities)) {
    const title = entity.sitelinks?.enwiki?.title;
    if (title) result[id] = title;
  }
  return result;
}

interface WikipediaQueryResult {
  query?: {
    pages?: Record<
      string,
      { title: string; extract?: string }
    >;
  };
}

/**
 * Fetch Wikipedia article extracts (plain text summaries) for multiple titles in one request.
 * Returns a map of title → extract.
 */
async function getWikipediaExtracts(
  titles: string[],
): Promise<Record<string, string>> {
  if (titles.length === 0) return {};
  const joined = titles.map(encodeURIComponent).join("|");
  const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${joined}&prop=extracts&exintro=true&explaintext=true&exlimit=${titles.length}&format=json&redirects=1`;
  const response = await fetch(url, { headers: FETCH_HEADERS });
  if (!response.ok) return {};
  const data = (await response.json()) as WikipediaQueryResult;
  const result: Record<string, string> = {};
  for (const page of Object.values(data.query?.pages ?? {})) {
    if (page.extract) result[page.title] = page.extract;
  }
  return result;
}

interface WikipediaSearchResult {
  query?: {
    search?: { title: string }[];
  };
}

/**
 * Search Wikipedia for an article about a song, using song name + artist as the query.
 * Returns the best-matching article title, or undefined.
 */
async function searchWikipediaTitle(
  songName: string,
  artistName?: string,
): Promise<string | undefined> {
  const q = artistName ? `${songName} ${artistName} song` : `${songName} song`;
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=1&format=json`;
  const response = await fetch(url, { headers: FETCH_HEADERS });
  if (!response.ok) return undefined;
  const data = (await response.json()) as WikipediaSearchResult;
  return data.query?.search?.[0]?.title;
}

/**
 * Look up a song on Wikidata by name and optionally artist.
 * Returns rich metadata: genres, key, BPM, producers, songwriters, identifiers,
 * plus a Wikipedia summary when available.
 */
export async function lookupSong(
  songName: string,
  artistName?: string,
): Promise<WikidataSongResult[]> {
  const query = buildSongQuery(songName, artistName);
  const bindings = await runSparqlQuery(query);
  const results = parseResults(bindings);

  // Deduplicate Wikidata IDs (multiple results can share the same entity)
  const uniqueIds = [...new Set(results.map((r) => r.wikidataId))];

  // Resolve Wikipedia titles and fetch extracts in parallel
  const titleMap = await getWikipediaTitles(uniqueIds);
  const titlesToFetch = [...new Set(Object.values(titleMap))];
  const extractMap = await getWikipediaExtracts(titlesToFetch);

  // Enrich results with Wikipedia data from sitelinks
  for (const result of results) {
    const title = titleMap[result.wikidataId];
    if (title) {
      result.wikipediaUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
      result.wikipediaExtract = extractMap[title];
    }
  }

  // If the top result has no Wikipedia data, fall back to Wikipedia search
  const topResult = results[0];
  if (topResult && !topResult.wikipediaUrl) {
    const fallbackTitle = await searchWikipediaTitle(
      topResult.name,
      topResult.artist ?? artistName,
    );
    if (fallbackTitle) {
      const fallbackExtract = await getWikipediaExtracts([fallbackTitle]);
      topResult.wikipediaUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(fallbackTitle.replace(/ /g, "_"))}`;
      topResult.wikipediaExtract = fallbackExtract[fallbackTitle];
    }
  }

  return results;
}
