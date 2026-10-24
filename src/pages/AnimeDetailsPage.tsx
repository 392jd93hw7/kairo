import { useEffect, useState } from "react";
import { ArrowLeft, CalendarDays, CheckCircle2, Clock3, Play, Plus, Star } from "lucide-react";
import type { AnimeSearchResult } from "../services/api/search.api";
import { getKitsuArtwork } from "../services/api/search.api";

const API_BASE = (import.meta.env.VITE_ANIVAULT_API_BASE || "https://anivault-scraper-khaki.vercel.app").replace(/\/$/, "");

type Episode = { number: number; title?: string; id?: string; filler?: boolean; thumbnail?: string };
const thumbnailCache = new Map<string, string>();
const episodeListCache = new Map<number, Episode[]>();
type Details = {
  title?: string;
  titleEnglish?: string;
  synopsis?: string;
  score?: number;
  episodes?: number;
  status?: string;
  type?: string;
  year?: number;
  genres?: Array<string | { name?: string }>;
  rating?: string;
  images?: { jpg?: { large_image_url?: string; image_url?: string } };
  poster?: string;
  posterUrl?: string;
  data?: Details;
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}
function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
function normalizeEpisodes(payload: unknown): Episode[] {
  const root = asObject(payload);
  const rows = Array.isArray(payload) ? payload
    : Array.isArray(root?.episodes) ? root.episodes
    : Array.isArray(root?.data) ? root.data
    : Array.isArray(asObject(root?.data)?.episodes) ? asObject(root?.data)?.episodes as unknown[]
    : [];
  return rows.map((row, index) => {
    const item = asObject(row);
    return {
      number: number(item?.number) ?? number(item?.episode) ?? number(item?.episodeNumber) ?? index + 1,
      title: text(item?.title) ?? text(item?.name),
      id: text(item?.id) ?? text(item?.episodeId) ?? text(item?.episode_id) ?? text(item?._id) ?? text(item?.slug),
      filler: item?.filler === true,
      thumbnail: text(item?.thumbnail) ?? text(item?.thumbnailUrl) ?? text(item?.thumbnail_url) ?? text(item?.image) ?? text(item?.imageUrl) ?? text(item?.image_url) ?? text(item?.poster) ?? text(asObject(item?.images)?.jpg && asObject(asObject(item?.images)?.jpg)?.image_url),
    };
  }).filter((episode) => episode.number > 0);
}


async function fetchEpisodeThumbnail(malId: number, episode: Episode, signal: AbortSignal): Promise<string | undefined> {
  // The endpoint expects the episode identifier in "ep" and the MAL anime ID in "malId".
  // The endpoint resolves the episode number (for example ep=1) against the MAL anime ID.
  // AniKoto episode IDs are not Kitsu episode IDs, so do not pass episode.id here.
  const params = new URLSearchParams({ ep: String(episode.number), malId: String(malId) });
  const response = await fetch(`${API_BASE}/api/kitsu/episode-thumb?${params.toString()}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return undefined;

  const payload: unknown = await response.json();
  // API deployments may wrap the URL in different response shapes.
  const findImage = (value: unknown, depth = 0): string | undefined => {
    if (depth > 5 || value == null) return undefined;
    if (typeof value === "string" && /^(https?:)?\/\//i.test(value.trim())) return value.trim();
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findImage(item, depth + 1);
        if (found) return found;
      }
      return undefined;
    }
    const object = asObject(value);
    if (!object) return undefined;
    const preferredKeys = [
      "thumbnail", "thumbnailUrl", "thumbnail_url", "thumbnailImage",
      "image", "imageUrl", "image_url", "poster", "posterUrl", "poster_url",
      "original", "large", "medium", "small", "url", "src", "href",
    ];
    for (const key of preferredKeys) {
      const found = findImage(object[key], depth + 1);
      if (found) return found;
    }
    for (const key of ["data", "attributes", "images", "relationships", "episode", "result"]) {
      const found = findImage(object[key], depth + 1);
      if (found) return found;
    }
    return undefined;
  };

  return findImage(payload);
}

export default function AnimeDetailsPage({ anime, onBack, onWatch }: {
  anime: AnimeSearchResult;
  onBack: () => void;
  onWatch: (anime: AnimeSearchResult, episode: Episode) => void;
}) {
  const [details, setDetails] = useState<Details | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [artwork, setArtwork] = useState(anime.image);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [loadingEpisodes, setLoadingEpisodes] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function loadDetails() {
      if (!anime.malId) {
        setLoadingDetails(false);
        return;
      }
      try {
        const response = await fetch(`${API_BASE}/api/mal/anime/${anime.malId}`, {
          signal: controller.signal, headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error(`Anime details request failed (${response.status})`);
        const payload: unknown = await response.json();
        const root = asObject(payload);
        const data = (asObject(root?.data) ?? root) as Details | null;
        if (active && data) {
          setDetails(data);
          const image = text(data.poster) ?? text(data.posterUrl) ?? text(data.images?.jpg?.large_image_url) ?? text(data.images?.jpg?.image_url);
          if (image && !anime.image) setArtwork(image);
        }
      } catch (caught) {
        if (active && !controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Could not load anime details.");
      } finally {
        if (active) setLoadingDetails(false);
      }
    }

    async function loadEpisodes() {
      if (!anime.malId) {
        setLoadingEpisodes(false);
        return;
      }

      // Show previously fetched episode lists immediately while revalidating in the background.
      const cachedEpisodes = episodeListCache.get(anime.malId);
      if (cachedEpisodes?.length && active) {
        setEpisodes(cachedEpisodes.map((episode) => ({
          ...episode,
          thumbnail: episode.thumbnail ?? thumbnailCache.get(`${anime.malId}:${episode.number}`),
        })));
        setLoadingEpisodes(false);
      }

      try {
        const response = await fetch(`${API_BASE}/api/episodes?malId=${anime.malId}&source=anikoto`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error(`Episode request failed (${response.status})`);
        const payload: unknown = await response.json();
        const normalized = normalizeEpisodes(payload);
        const cacheKey = String(anime.malId);
        const initial = normalized.map((episode) => ({
          ...episode,
          thumbnail: episode.thumbnail ?? thumbnailCache.get(`${cacheKey}:${episode.number}`),
        }));
        episodeListCache.set(anime.malId, initial);
        if (active) {
          setEpisodes(initial);
          setLoadingEpisodes(false);
        }

        // Thumbnails never block the episode list; update cards individually as URLs arrive.
        void Promise.all(normalized.map(async (episode) => {
          const key = `${cacheKey}:${episode.number}`;
          if (thumbnailCache.has(key)) return;
          try {
            const thumbnail = await fetchEpisodeThumbnail(anime.malId!, episode, controller.signal);
            if (thumbnail) {
              thumbnailCache.set(key, thumbnail);
              episodeListCache.set(anime.malId!, (episodeListCache.get(anime.malId!) ?? []).map((item) =>
                item.number === episode.number ? { ...item, thumbnail } : item
              ));
              if (active) setEpisodes((current) => current.map((item) =>
                item.number === episode.number ? { ...item, thumbnail } : item
              ));
            }
          } catch {
            // Keep the poster placeholder while the thumbnail is unavailable.
          }
        }));
      } catch {
        if (active && !controller.signal.aborted && !episodeListCache.has(anime.malId)) setEpisodes([]);
      } finally {
        if (active && !episodeListCache.has(anime.malId)) setLoadingEpisodes(false);
      }
    }

    void loadDetails();
    void loadEpisodes();

    if (!anime.image && anime.malId) {
      getKitsuArtwork(anime.malId, controller.signal)
        .then((image) => { if (active && image) setArtwork(image); })
        .catch(() => undefined);
    }

    return () => { active = false; controller.abort(); };
  }, [anime]);

  const title = text(details?.titleEnglish) ?? text(details?.title) ?? anime.title;
  const synopsis = text(details?.synopsis) ?? anime.synopsis;
  const score = number(details?.score);
  const totalEpisodes = number(details?.episodes);
  const year = number(details?.year) ?? anime.year;
  const genres = (details?.genres ?? []).map((genre) => typeof genre === "string" ? genre : genre.name).filter((genre): genre is string => Boolean(genre));

  return (
    <main className="details-page">
      <button className="back-button" type="button" onClick={onBack}><ArrowLeft size={16} /> Back to discover</button>
      <section className="details-hero">
        <div
          className="details-backdrop"
          style={
            artwork
              ? {
                  backgroundImage: `linear-gradient(90deg,#090a12 0%,rgba(9,10,18,.94) 36%,rgba(9,10,18,.48) 100%),linear-gradient(0deg,#090a12 0%,transparent 70%),url("${artwork}")`,
                }
              : undefined
          }
        />
        <div className="details-poster">{artwork ? <img src={artwork} alt={`${title} poster`} /> : <div className="details-poster__placeholder">K</div>}</div>
        <div className="details-copy">
          <span className="section-kicker">ANIME DETAILS / KAIRO</span>
          <h1>{title}</h1>
          {anime.title !== title && <p className="details-alt-title">{anime.title}</p>}
          <div className="details-badges">
            {(text(details?.type) ?? anime.format) && <span>{text(details?.type) ?? anime.format}</span>}
            {year && <span><CalendarDays size={13} /> {year}</span>}
            {text(details?.status) && <span>{details?.status}</span>}
            {score && <span className="score-badge"><Star size={13} fill="currentColor" /> {score.toFixed(2)}</span>}
          </div>
          {genres.length > 0 && <div className="genre-list">{genres.slice(0, 6).map((genre) => <span key={genre}>{genre}</span>)}</div>}
          <p className="details-synopsis">{loadingDetails ? "Loading anime information…" : synopsis || "No synopsis is available for this title yet."}</p>
          <div className="details-actions">
            <a className="button button--primary" href="#episodes"><Play size={16} fill="currentColor" /> View episodes <span>↓</span></a>
            <button className="button button--quiet" type="button" onClick={() => window.alert("Watchlist is coming in a later Kairo step.")}><Plus size={16} /> Add to watchlist</button>
          </div>
        </div>
      </section>

      <section className="episodes-section" id="episodes">
        <div className="episodes-heading">
          <div><span className="section-kicker">CONTINUE YOUR JOURNEY</span><h2>Episodes <span>list.</span></h2></div>
          <div className="episode-count"><Clock3 size={14} /> {totalEpisodes ? `${totalEpisodes} episodes listed by MAL` : "Anikoto episode list"}</div>
        </div>
        {error && <p className="details-notice">{error}. Some metadata may be unavailable.</p>}
        {loadingEpisodes ? (
          <div className="episodes-state">Loading episodes from Anikoto…</div>
        ) : episodes.length ? (
          <div className="episode-grid">
            {episodes.map((episode) => (
              <button className="episode-card" key={episode.id ?? episode.number} type="button" onClick={() => onWatch(anime, episode)}>
                <span className="episode-card__thumbnail">
                  {(episode.thumbnail || artwork) ? (
                    <img src={episode.thumbnail || artwork} alt="" loading="lazy" />
                  ) : (
                    <span className="episode-card__thumbnail-placeholder">{String(episode.number).padStart(2, "0")}</span>
                  )}
                  <span className="episode-card__thumbnail-play"><Play size={14} fill="currentColor" /></span>
                </span>
                <span className="episode-card__copy"><strong>{episode.title ?? `Episode ${episode.number}`}</strong><small>{episode.filler ? "Filler episode" : "Available via Anikoto"}</small></span>
              </button>
            ))}
          </div>
        ) : (
          <div className="episodes-empty">
            <div className="episodes-empty__icon"><CheckCircle2 size={22} /></div>
            <strong>{anime.malId ? "Episodes could not be loaded yet" : "This result has no MAL ID"}</strong>
            <p>Episode availability depends on the AniVault API response. Kairo uses Anikoto only and will not switch to another streaming source.</p>
          </div>
        )}
      </section>
    </main>
  );
}
