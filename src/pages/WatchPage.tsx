import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, Play, RefreshCw, ShieldAlert, Search, Captions, Mic, Grid2X2, Eye, Flag, Settings, Volume2, Maximize } from "lucide-react";
import type { AnimeSearchResult } from "../services/api/search.api";

const API_BASE = (import.meta.env.VITE_ANIVAULT_API_BASE || "https://anivault-scraper-khaki.vercel.app").replace(/\/$/, "");
type Episode = { number: number; title?: string; id?: string; thumbnail?: string };
type Props = { anime: AnimeSearchResult; episodeNumber: number; onBack: () => void; onChangeEpisode: (episodeNumber: number) => void };
const object = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" ? value as Record<string, unknown> : null;
const str = (...values: unknown[]) => values.find((value): value is string => typeof value === "string" && value.trim().length > 0) as string | undefined;
function normalizeEpisodes(payload: unknown): Episode[] {
  const root = object(payload);
  const rows = Array.isArray(payload) ? payload : Array.isArray(root?.episodes) ? root.episodes : Array.isArray(root?.data) ? root.data : Array.isArray(object(root?.data)?.episodes) ? object(root?.data)?.episodes as unknown[] : [];
  return rows.map((row, index) => { const item = object(row); return { number: Number(item?.number ?? item?.episode ?? item?.episodeNumber ?? index + 1), title: str(item?.title, item?.name), id: str(item?.id, item?.episodeId, item?.episode_id, item?._id), thumbnail: str(item?.thumbnail, item?.image, item?.poster, item?.thumbnailUrl) }; }).filter((item) => Number.isFinite(item.number) && item.number > 0).sort((a,b) => a.number-b.number);
}
function findPlayerUrl(payload: unknown, depth = 0): string | undefined {
  if (depth > 6 || payload == null) return undefined;
  if (typeof payload === "string") { const value = payload.trim(); return /^https?:\/\//i.test(value) && /\.(m3u8|mp4|webm)(\?|$)/i.test(value) ? value : undefined; }
  if (Array.isArray(payload)) { for (const item of payload) { const found = findPlayerUrl(item, depth + 1); if (found) return found; } return undefined; }
  const item = object(payload); if (!item) return undefined;
  for (const key of ["embedUrl", "embed_url", "iframe", "iframeUrl", "playerUrl", "player_url", "url", "src", "streamUrl", "stream_url", "videoUrl", "video_url"]) { const value = item[key]; if (typeof value === "string" && /^https?:\/\//i.test(value.trim())) return value.trim(); }
  for (const key of ["data", "result", "sources", "servers", "episodes", "stream", "player"]) { const found = findPlayerUrl(item[key], depth + 1); if (found) return found; }
  return undefined;
}
export default function WatchPage({ anime, episodeNumber, onBack, onChangeEpisode }: Props) {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [playerUrl, setPlayerUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [episodeLoading, setEpisodeLoading] = useState(true);
  const [error, setError] = useState("");
  const [episodeQuery, setEpisodeQuery] = useState("");
  const [theater, setTheater] = useState(false);
  const currentEpisode = useMemo(() => episodes.find((episode) => episode.number === episodeNumber), [episodes, episodeNumber]);
  const filteredEpisodes = useMemo(() => episodes.filter(item => (item.title || `Episode ${item.number}`).toLowerCase().includes(episodeQuery.toLowerCase()) || String(item.number).includes(episodeQuery.trim())), [episodes, episodeQuery]);
  useEffect(() => {
    if (!anime.malId) { setEpisodeLoading(false); return; }
    const controller = new AbortController();
    fetch(`${API_BASE}/api/episodes?malId=${anime.malId}&source=anikoto`, { signal: controller.signal, headers: { Accept: "application/json" } })
      .then(async response => { if (!response.ok) throw new Error("Could not load the episode list."); return response.json(); })
      .then(payload => setEpisodes(normalizeEpisodes(payload)))
      .catch(() => { if (!controller.signal.aborted) setEpisodes([]); })
      .finally(() => { if (!controller.signal.aborted) setEpisodeLoading(false); });
    return () => controller.abort();
  }, [anime.malId]);
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    setLoading(true); setError(""); setPlayerUrl("");
    async function loadPlayer() {
      try {
        const params = new URLSearchParams({ malId: String(anime.malId ?? ""), ep: String(episodeNumber), source: "anikoto" });
        const response = await fetch(`${API_BASE}/api/watch?${params.toString()}`, { signal: controller.signal, headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error(`The Anikoto player request failed (${response.status}).`);
        const payload: unknown = await response.json(); const url = findPlayerUrl(payload);
        if (!url) throw new Error("The API did not return an Anikoto player URL for this episode.");
        if (active) setPlayerUrl(url);
      } catch (caught) { if (active && !controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Could not load the player."); }
      finally { if (active) setLoading(false); }
    }
    void loadPlayer(); return () => { active = false; controller.abort(); };
  }, [anime.malId, episodeNumber]);
  const previous = episodes.filter(item => item.number < episodeNumber).at(-1);
  const next = episodes.find(item => item.number > episodeNumber);
  const title = currentEpisode?.title || `Episode ${episodeNumber}`;
  return <main className={theater ? "watch-page watch-page--theater" : "watch-page"}>
    <div className="watch-breadcrumb"><button className="back-button" type="button" onClick={onBack}><ArrowLeft size={16}/> Home <span>›</span> {anime.title} <span>›</span> <b>Episode {episodeNumber}</b></button></div>
    <div className="watch-layout">
      <div className="watch-main-column">
        <section className="watch-player-shell" aria-label="Anime video player">
          {loading ? <div className="watch-player-state"><RefreshCw className="spin" size={26}/><strong>Connecting to Anikoto…</strong><span>Preparing episode {episodeNumber}</span></div>
          : playerUrl ? <><iframe key={playerUrl} className="watch-iframe" src={playerUrl} title={`${anime.title} — Episode ${episodeNumber}`} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-forms allow-presentation" /><a className="watch-open-link" href={playerUrl} target="_blank" rel="noreferrer"><ExternalLink size={14}/> Open player</a></>
          : <div className="watch-player-state watch-player-state--error"><ShieldAlert size={30}/><strong>Player unavailable</strong><span>{error || "This episode does not currently have a playable URL."}</span><button className="button button--quiet" type="button" onClick={() => onChangeEpisode(episodeNumber)}><RefreshCw size={14}/> Try again</button><small>Kairo uses Anikoto only. It will not silently switch to another provider.</small></div>}
        </section>
        <div className="watch-report-notice"><Flag size={15}/> If this episode is not working, report it so we can investigate.</div>
        <div className="watch-feature-bar">
          <span className="watch-live"><i/> ANIKOTO</span>
          <button type="button" onClick={() => setTheater(value => !value)}><Grid2X2 size={15}/> THEATER</button>
          <button type="button" title="Keyboard shortcuts"><Settings size={15}/> KEYS</button>
          <button type="button" onClick={() => onChangeEpisode(episodeNumber)}><RefreshCw size={15}/> RELOAD</button>
          <button type="button" onClick={() => next && onChangeEpisode(next.number)} disabled={!next}><Play size={15}/> AUTO NEXT</button>
          <button type="button" onClick={() => setTheater(true)}><Maximize size={15}/> FULLSCREEN</button>
        </div>
        <div className="watch-server-panel">
          <div className="watch-now-playing"><span>You are Watching</span><strong>Episode {episodeNumber}</strong><small>If the current server doesn't work, try another available source.</small></div>
          <div className="watch-language-row"><Captions size={16}/><b>SUB:</b><span className="watch-server-selected">Anikoto</span></div>
          <div className="watch-language-row"><Mic size={16}/><b>DUB:</b><span className="watch-server-disabled">If available</span></div>
        </div>
        <section className="watch-about">
          <h2>About Anime</h2><div className="watch-about-card">
            <div className="watch-about-poster">{anime.imageUrl ? <img src={anime.imageUrl} alt={anime.title} loading="lazy"/> : <Play size={25}/>}</div>
            <div className="watch-about-copy"><h3>{anime.title}</h3><p>{anime.synopsis || "Explore the series details and continue watching episodes on Kairo."}</p><div><span>{episodes.length || "—"} EPISODES</span><span>MYANIMELIST METADATA</span></div></div>
          </div>
        </section>
      </div>
      <aside className="watch-sidebar">
        <div className="watch-sidebar-heading"><h2>Episodes</h2><span>{episodes.length || (episodeLoading ? "…" : "—")}</span><div className="watch-sidebar-tools"><button type="button" aria-label="Episode grid"><Grid2X2 size={16}/></button><button type="button" aria-label="Show episode list"><Eye size={16}/></button></div></div>
        <label className="watch-episode-search"><Search size={16}/><input value={episodeQuery} onChange={event => setEpisodeQuery(event.target.value)} placeholder="Search episodes…"/></label>
        <div className="watch-episode-list">
          {filteredEpisodes.map(item => <button key={item.id ?? item.number} type="button" className={item.number === episodeNumber ? "watch-episode-item watch-episode-item--active" : "watch-episode-item"} onClick={() => onChangeEpisode(item.number)}>
            <span className="watch-episode-thumb">{item.thumbnail ? <img src={item.thumbnail} alt="" loading="lazy"/> : <span>{String(item.number).padStart(2,"0")}</span>}<i><Play size={15} fill="currentColor"/></i></span>
            <span className="watch-episode-copy"><small>EP {String(item.number).padStart(2,"0")}</small><strong>{item.title || `Episode ${item.number}`}</strong><span className="watch-audio-badges"><b><Captions size={10}/> SUB</b><b><Mic size={10}/> DUB</b></span></span>
            {item.number === episodeNumber && <span className="watch-now"><i/></span>}
          </button>)}
          {!filteredEpisodes.length && <div className="episodes-state">{episodeLoading ? "Loading episodes…" : episodeQuery ? "No episodes match your search." : "Episode list is unavailable right now."}</div>}
        </div>
      </aside>
    </div>
    <section className="watch-community"><h2>Comments <span>Community</span></h2><p>Comments and community features can be connected when Kairo has a comment service configured.</p></section>
    <div className="watch-bottom-controls"><button className="button button--quiet" type="button" onClick={() => previous && onChangeEpisode(previous.number)} disabled={!previous}><ChevronLeft size={16}/> Previous episode</button><span>{title} · Episode {episodeNumber}</span><button className="button button--primary" type="button" onClick={() => next && onChangeEpisode(next.number)} disabled={!next}>Next episode <ChevronRight size={16}/></button></div>
    <span className="watch-hidden-tools" aria-hidden="true"><Volume2/></span>
  </main>;
}
