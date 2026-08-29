import { useState, useEffect } from 'react';

export default function HostScreen({
  pin,
  inviteLink,
  onCopyInviteLink,
  spotifyLoginUrl,
  spotifyConnected,
  playlistStatus,
  tracksLoaded,
  onLoadPlaylist,
  players,
  phase,
  onStartGame,
  nowPlaying,
  status,
  timer,
  judgeSongVisible,
  judgeTimelineVisible,
  buzzedName,
  timelineBuzzedName,
  playRandomDisabled,
  onPlayRandom,
  onTogglePlayback,
  onJudgeSong,
  onJudgeTimeline,
  onRequestEndGame,
}) {
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [copied, setCopied] = useState(false);

  // --- STANY DLA FISZEK ---
  const [songRevealed, setSongRevealed] = useState(false);
  const [yearRevealed, setYearRevealed] = useState(false);

  // Automatyczny reset fiszek, gdy zmienia się piosenka (nowPlaying)
  useEffect(() => {
    setSongRevealed(false);
    setYearRevealed(false);
  }, [nowPlaying]);

  function handleCopy() {
    onCopyInviteLink();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const sortedPlayers = [...players].sort((a, b) => b.cardCount - a.cardCount);

  return (
    <section className="screen">
      {phase === 'lobby' && (
        <div className="screen">
          <div className="panel pin-display">
            <p className="panel-label">Kod PIN pokoju</p>
            <p className="pin-value">{pin}</p>
          </div>

          <div className="panel">
            <p className="panel-label">Link zaproszenia dla graczy</p>
            <div className="invite-row">
              <input className="input" type="text" readOnly value={inviteLink} />
              <button className="btn btn-ghost btn-sm" onClick={handleCopy}>
                {copied ? 'Skopiowano!' : 'Kopiuj'}
              </button>
            </div>
          </div>

          {!spotifyConnected && (
            <div className="panel spotify-connect-box">
              <p>Połącz się ze Spotify, aby wybrać playlistę.</p>
              <a className="btn btn-primary" href={spotifyLoginUrl} style={{ textDecoration: 'none' }}>
                Połącz ze Spotify
              </a>
            </div>
          )}

          {spotifyConnected && (
            <div className="panel">
              <p className="panel-label">Link lub URI playlisty Spotify</p>
              <input
                className="input"
                type="text"
                placeholder="https://open.spotify.com/playlist/..."
                value={playlistUrl}
                onChange={(e) => setPlaylistUrl(e.target.value)}
              />
              <button className="btn btn-outline-green" onClick={() => onLoadPlaylist(playlistUrl.trim())}>
                Wczytaj utwory
              </button>
              {playlistStatus && <p className="status-text">{playlistStatus}</p>}
            </div>
          )}

          <div className="panel">
            <p className="panel-label">Gracze ({players.length})</p>
            <ul className="player-list">
              {players.map((p) => (
                <li className="player-row" key={p.id}>
                  <span>{p.name}</span>
                  <span className="badge">🎴 {p.cardCount}/10</span>
                </li>
              ))}
            </ul>
          </div>

          {tracksLoaded > 0 && (
            <button className="btn btn-primary" onClick={onStartGame}>
              🚀 Rozpocznij grę
            </button>
          )}
        </div>
      )}

      {phase === 'game' && (
        <div className="screen">
          <div className="panel">
            <p className="panel-label" style={{ textAlign: 'center' }}>
              Tabela wyników
            </p>
            <table className="scoreboard-table">
              <thead>
                <tr>
                  <th>Gracz</th>
                  <th>Karty</th>
                </tr>
              </thead>
              <tbody>
                {sortedPlayers.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{p.cardCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button className="btn btn-secondary btn-sm end-game-btn" onClick={onRequestEndGame}>
            🏁 Koniec gry
          </button>

          <div className="panel">
            <button className="btn btn-primary" disabled={playRandomDisabled} onClick={onPlayRandom}>
              ▶️ Odtwórz losowy utwór
            </button>

            {nowPlaying && (
              <div className="now-playing" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                <p className="now-playing-tag">Teraz gra (Fiszka)</p>
                
                {judgeTimelineVisible ? (
                  // FAZA 2: Zgadywanie na osi czasu. Tytuł na stałe, Rok to fiszka.
                  <>
                    <div style={{ textAlign: 'center' }}>
                      <p className="now-playing-title">{nowPlaying.title}</p>
                      <p className="now-playing-artist">{nowPlaying.artist}</p>
                    </div>
                    
                    {yearRevealed ? (
                      <div onClick={() => setYearRevealed(false)} style={{ cursor: 'pointer', padding: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', width: '100%', textAlign: 'center' }}>
                        <p className="now-playing-year">{nowPlaying.year}</p>
                        <p style={{ fontSize: '11px', color: 'var(--spotify-text-subdued)', margin: '4px 0 0 0' }}>👆 Kliknij, aby zakryć</p>
                      </div>
                    ) : (
                      <button className="btn btn-outline-green btn-sm" onClick={() => setYearRevealed(true)}>
                        📅 Odkryj rok utworu
                      </button>
                    )}
                  </>
                ) : (
                  // FAZA 1: Zgadywanie utworu. Tytuł i autor to fiszka, rok jest niewidoczny.
                  <>
                    {songRevealed ? (
                      <div onClick={() => setSongRevealed(false)} style={{ cursor: 'pointer', padding: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', width: '100%', textAlign: 'center' }}>
                        <p className="now-playing-title">{nowPlaying.title}</p>
                        <p className="now-playing-artist">{nowPlaying.artist}</p>
                        <p style={{ fontSize: '11px', color: 'var(--spotify-text-subdued)', margin: '4px 0 0 0' }}>👆 Kliknij, aby zakryć</p>
                      </div>
                    ) : (
                      <button className="btn btn-outline-green btn-sm" onClick={() => setSongRevealed(true)}>
                        👀 Odkryj tytuł i wykonawcę
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="row-2" style={{ marginTop: '10px' }}>
              <button className="btn btn-ghost" onClick={() => onTogglePlayback('pause')}>
                ⏸ Pauza
              </button>
              <button className="btn btn-ghost" onClick={() => onTogglePlayback('play')}>
                ▶️ Wznów
              </button>
            </div>

            <p className="status-text">{status}</p>
            {timer !== null && <p className="timer-text">{timer}</p>}

            {judgeSongVisible && (
              <div className="judge-panel song">
                <p>{buzzedName} zgaduje utwór!</p>
                <div className="row-2">
                  <button className="btn btn-primary btn-sm" onClick={() => onJudgeSong(true)}>
                    ✅ Poprawnie
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => onJudgeSong(false)}>
                    ❌ Błędnie
                  </button>
                </div>
              </div>
            )}

            {judgeTimelineVisible && (
              <div className="judge-panel timeline">
                <p>{timelineBuzzedName} ustawia na osi czasu</p>
                <div className="row-2">
                  <button className="btn btn-primary btn-sm" onClick={() => onJudgeTimeline(true)}>
                    ✅ Daj punkt
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => onJudgeTimeline(false)}>
                    ❌ Brak punktu
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}