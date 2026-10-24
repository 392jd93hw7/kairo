import { lazy, Suspense, useEffect, useState } from "react";
import { ArrowDown, ArrowRight, Compass, Play, Sparkles } from "lucide-react";
import NavbarSearch from "./components/layout/NavbarSearch";
const AnimeDetailsPage = lazy(() => import("./pages/AnimeDetailsPage"));
const WatchPage = lazy(() => import("./pages/WatchPage"));
import type { AnimeSearchResult } from "./services/api/search.api";

const featured = [
  { number: "01", title: "Find your next world.", text: "From all-time classics to the next big thing.", icon: "✦" },
  { number: "02", title: "Make it your anime home.", text: "Discover, keep track, and pick up where you left off.", icon: "◈" },
  { number: "03", title: "Your next episode awaits.", text: "A cleaner way to explore your watchlist.", icon: "↗" },
];

export default function App() {
  const [selectedAnime, setSelectedAnime] = useState<AnimeSearchResult | null>(null);
  const [route, setRoute] = useState(window.location.pathname);
  const [notice, setNotice] = useState("");
  const [selectedEpisode, setSelectedEpisode] = useState(1);

  useEffect(() => {
    const onPopState = () => {
      setRoute(window.location.pathname);
      const stateAnime = window.history.state?.anime as AnimeSearchResult | undefined;
      if (stateAnime) setSelectedAnime(stateAnime);
      if (window.location.pathname === "/") setSelectedAnime(null);
      const episode = Number(new URLSearchParams(window.location.search).get("ep"));
      if (Number.isFinite(episode) && episode > 0) setSelectedEpisode(episode);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const openAnime = (anime: AnimeSearchResult) => {
    setSelectedAnime(anime);
    setNotice("");
    const path = `/anime/${encodeURIComponent(anime.id)}`;
    window.history.pushState({ anime }, "", path);
    setRoute(path);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goHome = () => {
    window.history.pushState({}, "", "/");
    setRoute("/");
    setSelectedAnime(null);
    setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const startEpisode = (anime: AnimeSearchResult, episode: { number: number }) => {
    setSelectedAnime(anime);
    setSelectedEpisode(episode.number);
    const path = `/watch/${encodeURIComponent(anime.id)}?ep=${episode.number}`;
    window.history.pushState({ anime }, "", path);
    setRoute(path);
    setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const changeEpisode = (episodeNumber: number) => {
    setSelectedEpisode(episodeNumber);
    const path = `/watch/${encodeURIComponent(selectedAnime?.id ?? "")}?ep=${episodeNumber}`;
    window.history.pushState({ anime: selectedAnime }, "", path);
    setRoute(path);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const backToDetails = () => {
    if (!selectedAnime) return goHome();
    const path = `/anime/${encodeURIComponent(selectedAnime.id)}`;
    window.history.pushState({ anime: selectedAnime }, "", path);
    setRoute(path);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const showingWatch = route.startsWith("/watch/") && selectedAnime !== null;
  const showingDetails = route.startsWith("/anime/") && selectedAnime !== null;

  return (
    <div className="app-shell">
      <div className="ambient ambient--one" />
      <div className="ambient ambient--two" />
      <header className="site-header">
        <a className="brand" href="/" aria-label="Kairo home" onClick={(event) => { event.preventDefault(); goHome(); }}>
          <span className="brand-mark"><span /></span>
          <span className="brand-word">kairo<span>.</span></span>
        </a>
        <nav className="main-nav" aria-label="Main navigation">
          <a className={`main-nav__link ${!showingDetails && !showingWatch ? "main-nav__link--active" : ""}`} href="/" onClick={(event) => { event.preventDefault(); goHome(); }}>Discover</a>
          <a className="main-nav__link" href="/#explore" onClick={(event) => { event.preventDefault(); goHome(); window.setTimeout(() => document.getElementById("explore")?.scrollIntoView({ behavior: "smooth" }), 0); }}>Explore</a>
          <a className="main-nav__link" href="/#schedule" onClick={(event) => { event.preventDefault(); setNotice("The release schedule is planned for a later build step."); }}>Schedule</a>
        </nav>
        <div className="header-actions">
          <NavbarSearch onSelectAnime={openAnime} />
          <button className="profile-button" aria-label="Profile" onClick={() => setNotice("Profiles and accounts are planned for a later build step.")}>K</button>
        </div>
      </header>

      {showingWatch && selectedAnime ? (
        <Suspense fallback={<div className="page-loading" role="status">Loading player…</div>}>
          <WatchPage anime={selectedAnime} episodeNumber={selectedEpisode} onBack={backToDetails} onChangeEpisode={changeEpisode} />
        </Suspense>
      ) : showingDetails && selectedAnime ? (
        <Suspense fallback={<div className="page-loading" role="status">Loading anime details…</div>}>
          <AnimeDetailsPage anime={selectedAnime} onBack={goHome} onWatch={startEpisode} />
        </Suspense>
      ) : (
        <main>
          <section className="hero">
            <div className="hero__eyebrow"><span className="live-dot" /> YOUR ANIME UNIVERSE <span className="eyebrow-line" /></div>
            <h1>There’s a whole<br />world <span>to get lost in.</span></h1>
            <p className="hero__description">Find stories that stay with you. Explore your next favourite anime, one episode at a time.</p>
            <div className="hero__actions">
              <a className="button button--primary" href="#explore"><Compass size={17} /> Explore anime <ArrowRight size={17} /></a>
              <a className="button button--quiet" href="#how-it-works"><Play size={15} /> How Kairo works</a>
            </div>
            <div className="hero__meta">
              <div className="avatar-stack"><span>N</span><span>A</span><span>カ</span><span>+</span></div>
              <span>Made for the stories you love</span>
              <span className="meta-divider" />
              <span className="meta-sparkle"><Sparkles size={14} /> Discover something new</span>
            </div>
            <div className="hero__orbit hero__orbit--outer" />
            <div className="hero__orbit hero__orbit--inner" />
            <div className="hero__symbol">界</div>
            <div className="hero__side-note">ANIME · DISCOVER · REPEAT</div>
            <div className="hero__bottom-note"><span>SCROLL TO EXPLORE</span><ArrowDown size={14} /></div>
          </section>

          <section className="intro-section" id="explore">
            <div className="section-heading">
              <div><span className="section-kicker">A BETTER WAY TO FIND ANIME</span><h2>Your next story<br /><span>starts here.</span></h2></div>
              <p>One universe, endless rabbit holes. Search for a title above or start exploring what makes Kairo yours.</p>
            </div>
            <div className="feature-grid">
              {featured.map((item) => (
                <article className="feature-card" key={item.number}>
                  <div className="feature-card__top"><span>{item.number} / KAIRO</span><span className="feature-card__icon">{item.icon}</span></div>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                  <span className="feature-card__line" />
                </article>
              ))}
            </div>
          </section>

          <section className="search-tip" id="how-it-works">
            <div className="search-tip__icon"><Play size={17} fill="currentColor" /></div>
            <div><strong>Know what you’re looking for?</strong><p>Type at least two letters into the search bar. Results update as you type.</p></div>
            <span className="search-tip__status"><span /> LIVE SEARCH</span>
          </section>
        </main>
      )}

      {notice && <div className="app-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice("")} aria-label="Dismiss message">×</button></div>}
      <footer className="site-footer"><a className="brand brand--footer" href="/" onClick={(event) => { event.preventDefault(); goHome(); }}><span className="brand-mark"><span /></span><span className="brand-word">kairo<span>.</span></span></a><span>Made for the love of anime.</span><span>DISCOVER YOUR NEXT WORLD ↗</span></footer>
    </div>
  );
}
