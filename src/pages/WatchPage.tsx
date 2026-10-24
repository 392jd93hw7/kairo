import { useEffect, useMemo, useRef, useState } from "react";
import Hls from "hls.js";
import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, Play, RefreshCw, ShieldAlert, Search, Captions, Mic, Grid2X2, Eye, Flag, Settings, Volume2, Maximize } from "lucide-react";
import type { AnimeSearchResult } from "../services/api/search.api";

const API_BASE = (import.meta.env.VITE_ANIVAULT_API_BASE || "https://anivault-scraper-khaki.vercel.app").replace(/\/$/, "");
type Episode = { number: number; title?: string; id?: string; thumbnail?: string };
type Server = { id: string; name: string; type?: string; available?: boolean };
type Subtitle = { url: string; lang: string; default?: boolean };
type WatchResponse = { embedUrl?: string; m3u8?: string; hlsProxyUrl?: string; iframeOnly?: boolean; subtitles?: Subtitle[]; note?: string | null; error?: string };
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
