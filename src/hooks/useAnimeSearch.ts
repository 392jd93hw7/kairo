import { useEffect, useState } from "react";
import { searchAnime, type AnimeSearchResult } from "../services/api/search.api";

type SearchState = {
  results: AnimeSearchResult[];
  loading: boolean;
  error: string | null;
};

const emptyState: SearchState = { results: [], loading: false, error: null };
const resultCache = new Map<string, AnimeSearchResult[]>();

export function useAnimeSearch(query: string, enabled = true): SearchState {
  const [state, setState] = useState<SearchState>(emptyState);

  useEffect(() => {
    const trimmed = query.trim();
    if (!enabled || trimmed.length < 2) {
      setState(emptyState);
      return;
    }

    const cacheKey = trimmed.toLowerCase();
    const cached = resultCache.get(cacheKey);
    if (cached) {
      setState({ results: cached, loading: false, error: null });
      return;
    }

    const controller = new AbortController();
    setState((previous) => ({ ...previous, loading: true, error: null }));

    const timer = window.setTimeout(async () => {
      try {
        const results = await searchAnime(trimmed, controller.signal);
        if (!controller.signal.aborted) {
          resultCache.set(cacheKey, results);
          setState({ results, loading: false, error: null });
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({
          results: [],
          loading: false,
          error: error instanceof Error ? error.message : "Something went wrong.",
        });
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, enabled]);

  return state;
}
