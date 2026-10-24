import { useEffect, useMemo, useRef, useState } from "react";
import Hls from "hls.js";
import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, Play, RefreshCw, ShieldAlert, Search, Captions, Mic, Grid2X2, Eye, Flag, Settings, Volume2, Maximize } from "lucide-react";
import type { AnimeSearchResult } from "../services/api/search.api";

const API_BASE = (import.meta.env.VITE_ANIVAULT_API_BASE || "https://anivault-scraper-khaki.vercel.app").replace(/\/$/, "");
type Episode = { number: number; title?: string; id?: string; thumbnail?: string };
type Server = { id: string; name: string; type?: string; available?: boolean };
type Subtitle = { url: string; lang: string; default?: boolean };
type WatchResponse = { embedUrl?: string; m3u8?: string; iframeOnly?: boolean; subtitles?: Subtitle[]; note?: string | null; error?: string };
type Props = { anime: AnimeSearchResult; episodeNumber: number; onBack: () => void; onChangeEpisode: (episodeNumber: number) => void };
const object = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" ? value as Record<string, unknown> : null;
const str = (...values: unknown[]) => values.find((value): value is string => typeof value === "string" && value.trim().length > 0) as string | undefined;
function normalizeServers(payload: unknown): Server[] {
  const root = object(payload);
  const rows = Array.isArray(payload) ? payload : Array.isArray(root?.servers) ? root.servers : Array.isArray(root?.availableServers) ? root.availableServers : Array.isArray(root?.data) ? root.data : Array.isArray(object(root?.data)?.servers) ? object(root?.data)?.servers as unknown[] : Array.isArray(object(root?.data)?.availableServers) ? object(root?.data)?.availableServers as unknown[] : [];
  return rows.map((row, index) => {
    if (typeof row === "string") return { id: row, name: row };
    const item = object(row);
    const id = str(item?.id, item?.server, item?.serverId, item?.server_id, item?.key, item?.name, item?.provider) || `server-${index + 1}`;
    return { id, name: str(item?.name, item?.title, item?.label, item?.server, item?.provider) || id, type: str(item?.type, item?.language), available: item?.available !== false && item?.status !== "unavailable" };
  }).filter(server => server.available);
}
function normalizeEpisodes(payload: unknown): Episode[] {
  const root = object(payload);
  const rows = Array.isArray(payload) ? payload : Array.isArray(root?.episodes) ? root.episodes : Array.isArray(root?.data) ? root.data : Array.isArray(object(root?.data)?.episodes) ? object(root?.data)?.episodes as unknown[] : [];
  return rows.map((row, index) => { const item = object(row); return { number: Number(item?.number ?? item?.episode ?? item?.episodeNumber ?? index + 1), title: str(item?.title, item?.name), id: str(item?.id, item?.episodeId, item?.episode_id, item?._id), thumbnail: str(item?.thumbnail, item?.image, item?.poster, item?.thumbnailUrl) }; }).filter((item) => Number.isFinite(item.number) && item.number > 0).sort((a,b) => a.number-b.number);
}
export default function WatchPage({ anime, episodeNumber, onBack, onChangeEpisode }: Props) {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [playerUrl, setPlayerUrl] = useState("");
  const [streamUrl, setStreamUrl] = useState("");
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [selectedSubtitle, setSelectedSubtitle] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [servers, setServers] = useState<Server[]>([]);
  const [selectedServer, setSelectedServer] = useState("");
  const [audioType, setAudioType] = useState<"sub" | "dub">("sub");
  const [serversLoading, setServersLoading] = useState(true);
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
    if (!anime.malId) { setServers([]); setServersLoading(false); return; }
    const controller = new AbortController();
    setServersLoading(true);
    fetch(`${API_BASE}/api/servers?malId=${encodeURIComponent(String(anime.malId))}&ep=${encodeURIComponent(String(episodeNumber))}`, {
      signal: controller.signal, headers: { Accept: "application/json" },
    }).then(async response => {
      const contentType = response.headers.get("content-type") || "";
      if (!response.ok) throw new Error(`Server lookup failed (${response.status}).`);
      if (!contentType.includes("json")) throw new Error("Server endpoint returned HTML instead of JSON.");
      return response.json();
    }).then(payload => {
      const available = normalizeServers(payload);
      setServers(available);
      setSelectedServer(current => available.some(server => server.id === current) ? current : (available[0]?.id || ""));
    }).catch(() => { if (!controller.signal.aborted) { setServers([]); setSelectedServer(""); } })
      .finally(() => { if (!controller.signal.aborted) setServersLoading(false); });
    return () => controller.abort();
  }, [anime.malId, episodeNumber]);

  useEffect(() => {
    if (serversLoading) return;
    const controller = new AbortController(); let active = true;
    setLoading(true); setError(""); setPlayerUrl(""); setStreamUrl(""); setSubtitles([]); setSelectedSubtitle("");
    async function loadPlayer() {
      try {
        if (!anime.malId) throw new Error("This anime has no MyAnimeList ID, so the player cannot resolve its episode.");
        const params = new URLSearchParams({ malId: String(anime.malId), ep: String(episodeNumber), type: audioType, source: "anikoto" });
        if (selectedServer) params.set("server", selectedServer);
        const response = await fetch(`${API_BASE}/api/watch?${params.toString()}`, { signal: controller.signal, headers: { Accept: "application/json" } });
        const contentType = response.headers.get("content-type") || "";
        if (!response.ok) {
          const detail = contentType.includes("json") ? await response.json().catch(() => null) : await response.text().catch(() => "");
          const message = object(detail);
          throw new Error(str(message?.error, message?.message, message?.detail) || `Anikoto player request failed (${response.status}).`);
        }
        if (!contentType.includes("json")) throw new Error("The streaming endpoint returned HTML instead of JSON. Check the API base URL and route.");
        const payload = await response.json() as WatchResponse;
        // Prefer the original M3U8 manifest. Do not use hlsProxyUrl or route stream traffic through a proxy.
        const stream = str(payload.m3u8);
        const embed = str(payload.embedUrl);
        const tracks = Array.isArray(payload.subtitles) ? payload.subtitles.filter((track): track is Subtitle => !!track && typeof track.url === "string" && typeof track.lang === "string") : [];
        if (!stream && !embed) throw new Error(payload.error || payload.note || "The API did not return an M3U8 stream or embed URL.");
        if (active) {
          setSubtitles(tracks);
          const defaultTrack = tracks.find(track => track.default) || tracks.find(track => /english/i.test(track.lang));
          setSelectedSubtitle(defaultTrack?.url || "");
          if (stream && !payload.iframeOnly) setStreamUrl(stream);
          else if (embed) setPlayerUrl(embed);
          else throw new Error("The API returned an embed-only player without an embed URL.");
        }
      } catch (caught) {
        if (active && !controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Could not load the player.");
      } finally { if (active) setLoading(false); }
    }
    void loadPlayer();
    return () => { active = false; controller.abort(); };
  }, [anime.malId, episodeNumber, audioType, selectedServer, serversLoading]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;
    let hls: Hls | null = null;
    // Safari can play HLS natively. Other supported browsers use hls.js to read the M3U8 manifest
    // and request its media segments directly from the stream host (no Kairo HLS proxy).
    if (video.canPlayType("application/vnd.apple.mpegurl")) video.src = streamUrl;
    else if (Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, capLevelToPlayerSize: true });
      hls.loadSource(streamUrl); hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) setError(data.type === Hls.ErrorTypes.NETWORK_ERROR ? "The direct stream request failed. Check stream availability and CORS, or try another available server." : "This stream could not be decoded. Try another server.");
      });
    } else setError("HLS playback is not supported by this browser.");
    return () => { hls?.destroy(); video.removeAttribute("src"); video.load(); };
  }, [streamUrl]);


  const previous = episodes.filter(item => item.number < episodeNumber).at(-1);
  const next = episodes.find(item => item.number > episodeNumber);
  const title = currentEpisode?.title || `Episode ${episodeNumber}`;
  return <main className={theater ? "watch-page watch-page--theater" : "watch-page"}>
    <div className="watch-breadcrumb"><button className="back-button" type="button" onClick={onBack}><ArrowLeft size={16}/> Home <span>›</span> {anime.title} <span>›</span> <b>Episode {episodeNumber}</b></button></div>
    <div className="watch-layout">
      <div className="watch-main-column">
        <section className="watch-player-shell" aria-label="Anime video player">
          {loading ? <div className="watch-player-state"><RefreshCw className="spin" size={26}/><strong>Connecting to Anikoto…</strong><span>Preparing episode {episodeNumber}</span></div>
          : streamUrl ? <div className="kairo-video-wrap"><video ref={videoRef} className="kairo-video" controls playsInline preload="metadata" autoPlay aria-label={`${anime.title} episode ${episodeNumber}`}>{subtitles.map(track => <track key={track.url} src={track.url} kind="subtitles" srcLang={track.lang.slice(0,2).toLowerCase()} label={track.lang} default={track.url === selectedSubtitle}/>)}</video><div className="kairo-player-top"><span><i/> KAIRO PLAYER</span><a href={streamUrl} target="_blank" rel="noreferrer"><ExternalLink size={13}/> Direct M3U8</a></div>{subtitles.length > 0 && <label className="kairo-subtitle-picker"><Captions size={14}/><select aria-label="Subtitle language" value={selectedSubtitle} onChange={event => {setSelectedSubtitle(event.target.value); const video=videoRef.current; if(video) Array.from(video.textTracks).forEach((track,index)=>{track.mode = subtitles[index]?.url === event.target.value ? "showing" : "disabled";});}}><option value="">Subtitles off</option>{subtitles.map(track=><option key={track.url} value={track.url}>{track.lang}{track.default ? " (default)" : ""}</option>)}</select></label>}{error && <div className="kairo-video-warning">{error}</div>}</div>
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
          <div className="watch-language-row"><Captions size={16}/><b>SUB:</b><button type="button" className={audioType === "sub" ? "watch-server-selected" : "watch-server-disabled"} onClick={() => setAudioType("sub")}>SUB</button></div>
          <div className="watch-language-row"><Mic size={16}/><b>DUB:</b><button type="button" className={audioType === "dub" ? "watch-server-selected" : "watch-server-disabled"} onClick={() => setAudioType("dub")}>DUB</button></div>
          <div className="watch-language-row watch-server-list-row"><b>SERVER:</b>{serversLoading ? <span>Checking availability…</span> : servers.length ? <div className="watch-server-options">{servers.map(server => <button key={server.id} type="button" className={selectedServer === server.id ? "watch-server-selected" : "watch-server-disabled"} onClick={() => setSelectedServer(server.id)}>{server.name}</button>)}</div> : <span>No servers reported available.</span>}</div>
        </div>
        <section className="watch-about">
          <h2>About Anime</h2><div className="watch-about-card">
            <div className="watch-about-poster">{anime.image ? <img src={anime.image} alt={anime.title} loading="lazy"/> : <Play size={25}/>}</div>
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
