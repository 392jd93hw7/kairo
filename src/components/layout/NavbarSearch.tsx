import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { ArrowUpRight, LoaderCircle, Search, X } from "lucide-react";
import { useAnimeSearch } from "../../hooks/useAnimeSearch";
import { getKitsuArtwork, type AnimeSearchResult } from "../../services/api/search.api";

type Props = {
  onSelectAnime: (anime: AnimeSearchResult) => void;
};

export default function NavbarSearch({ onSelectAnime }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { results, loading, error } = useAnimeSearch(query, open);
  const hasQuery = query.trim().length >= 2;

  useEffect(() => {
    setActiveIndex(-1);
  }, [query]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const select = (anime: AnimeSearchResult) => {
    setOpen(false);
    setQuery("");
    onSelectAnime(anime);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.min(current + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && activeIndex >= 0 && results[activeIndex]) {
      event.preventDefault();
      select(results[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div className="navbar-search" ref={wrapperRef}>
      <div className={`search-field ${open ? "search-field--active" : ""}`}>
        <Search size={18} aria-hidden="true" className="search-field__icon" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search anime..."
          aria-label="Search anime"
          aria-autocomplete="list"
          aria-expanded={open && hasQuery}
          aria-controls="kairo-search-results"
          role="combobox"
          autoComplete="off"
        />
        {loading ? (
          <LoaderCircle className="search-field__spinner" size={17} aria-label="Searching" />
        ) : query ? (
          <button className="search-field__clear" onClick={() => { setQuery(""); inputRef.current?.focus(); }} aria-label="Clear search" type="button">
            <X size={16} />
          </button>
        ) : (
          <kbd className="search-shortcut">⌘ K</kbd>
        )}
      </div>

      {open && hasQuery && (
        <div className="search-popover" id="kairo-search-results" role="listbox" aria-label="Anime search results">
          <div className="search-popover__heading">
            <span>{loading ? "Searching the anime universe…" : `Results for “${query.trim()}”`}</span>
            <span className="search-popover__hint">ANIME</span>
          </div>

          {loading && results.length === 0 && (
            <div className="search-state"><LoaderCircle className="spin" size={20} /> Finding your next obsession</div>
          )}
          {!loading && error && <div className="search-state search-state--error">{error}. Please try again.</div>}
          {!loading && !error && results.length === 0 && <div className="search-state">No anime found. Try another title.</div>}

          {results.map((anime, index) => (
            <SearchResultRow
              key={anime.id}
              anime={anime}
              active={index === activeIndex}
              onChoose={() => select(anime)}
            />
          ))}

          {results.length > 0 && (
            <div className="search-popover__footer">
              <span><kbd>↑</kbd> <kbd>↓</kbd> to navigate</span>
              <span><kbd>Enter</kbd> to open</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SearchResultRow({ anime, active, onChoose }: { anime: AnimeSearchResult; active: boolean; onChoose: () => void }) {
  const [artwork, setArtwork] = useState(anime.image);

  useEffect(() => {
    setArtwork(anime.image);
    if (anime.image || !anime.malId) return;
    const controller = new AbortController();
    getKitsuArtwork(anime.malId, controller.signal)
      .then((image) => { if (image && !controller.signal.aborted) setArtwork(image); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [anime.image, anime.malId]);

  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      className={`search-result ${active ? "search-result--active" : ""}`}
      onClick={onChoose}
    >
      <span className="search-result__poster">
        {artwork ? <img src={artwork} alt="" loading="lazy" /> : <span className="poster-placeholder">K</span>}
      </span>
      <span className="search-result__copy">
        <strong>{anime.title}</strong>
        <span>{[anime.year, anime.format].filter(Boolean).join(" · ") || "Anime"}</span>
      </span>
      <ArrowUpRight size={17} className="search-result__arrow" aria-hidden="true" />
    </button>
  );
}
