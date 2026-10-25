const API_BASE = (import.meta.env.VITE_ANIVAULT_API_BASE || "").replace(/\/$/, "");

export type AnimeSearchResult = {
  id: string;
  title: string;
  malId?: number;
  anilistId?: number;
  image?: string;
  year?: number;
  format?: string;
  status?: string;
  synopsis?: string;
};

const object = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" ? value as Record<string, unknown> : null;

const firstString = (...values: unknown[]): string | undefined =>
  values.find((value): value is string => typeof value === "string" && value.trim().length > 0);

const firstNumber = (...values: unknown[]): number | undefined =>
  values.find((value): value is number => typeof value === "number" && Number.isFinite(value));

function normalizeAnime(value: unknown, index: number): AnimeSearchResult | null {
  const item = object(value);
  if (!item) return null;

  const titleObject = object(item.title);
  const titles = object(item.titles);
  const imageObject = object(item.images) ?? object(item.coverImage) ?? object(item.image);
  const jpg = object(imageObject?.jpg);
  const webp = object(imageObject?.webp);
  const malId = firstNumber(item.malId, item.mal_id, item.malID, item.idMal);
  const anilistId = firstNumber(item.anilistId, item.anilist_id, item.anilistID, item.id);
  const title = firstString(
    item.titleEnglish, item.title_english, item.english, item.name,
    typeof item.title === "string" ? item.title : undefined,
    titleObject?.english, titleObject?.romaji, titleObject?.userPreferred,
    titles?.english, titles?.romaji, item.titleJapanese,
  );

  if (!title) return null;
  const image = firstString(
    item.poster, item.posterUrl, item.poster_url, item.imageUrl, item.image_url,
    item.coverImage, item.cover_image, item.thumbnail,
    jpg?.large_image_url, jpg?.image_url, webp?.large_image_url, webp?.image_url,
    imageObject?.extraLarge, imageObject?.large, imageObject?.medium, imageObject?.url,
  );

  return {
    id: String(malId ?? anilistId ?? item.id ?? title.toLowerCase().replace(/[^a-z0-9]+/g, "-") ?? index),
    title,
    malId,
    anilistId,
    image,
    year: firstNumber(item.year, item.airedYear, item.startYear, item.seasonYear),
    format: firstString(item.type, item.format, item.mediaType),
    status: firstString(item.status),
    synopsis: firstString(item.synopsis, item.description),
  };
}

export async function searchAnime(query: string, signal?: AbortSignal): Promise<AnimeSearchResult[]> {
  const response = await fetch(`${API_BASE}/api/mal/search?q=${encodeURIComponent(query)}&limit=8`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Search failed (${response.status})`);

  const payload: unknown = await response.json();
  const root = object(payload);
  const candidates = Array.isArray(payload)
    ? payload
    : Array.isArray(root?.results) ? root.results
    : Array.isArray(root?.data) ? root.data
    : Array.isArray(root?.anime) ? root.anime
    : Array.isArray(object(root?.data)?.results) ? object(root?.data)?.results as unknown[]
    : [];

  return candidates
    .map((item, index) => normalizeAnime(item, index))
    .filter((item): item is AnimeSearchResult => item !== null)
    .slice(0, 8);
}

const artworkCache = new Map<number, string>();

export async function getKitsuArtwork(malId: number, signal?: AbortSignal): Promise<string | undefined> {
  const cached = artworkCache.get(malId);
  if (cached) return cached;

  const response = await fetch(`${API_BASE}/api/kitsu/anime?malId=${malId}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return undefined;

  const payload: unknown = await response.json();
  const root = object(payload);
  const data = object(root?.data) ?? root;
  const attributes = object(data?.attributes);
  const poster = object(attributes?.posterImage);
  const cover = object(attributes?.coverImage);
  const image = firstString(
    poster?.large, poster?.original, poster?.medium,
    cover?.large, cover?.original,
    data?.poster, data?.image, data?.posterUrl,
  );

  if (image) artworkCache.set(malId, image);
  return image;
}
