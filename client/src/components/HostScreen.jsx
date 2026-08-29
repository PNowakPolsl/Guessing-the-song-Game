import { useState } from 'react';

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
              <p>Polacz sie ze Spotify, aby wybrac playliste.</p>
              <a className="btn btn-primary" href={spotifyLoginUrl} style={{ textDecoration: 'none' }}>
                Polacz ze Spotify
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
              🚀 Rozpocznij gre
            </button>
          )}
        </div>
      )}

      {phase === 'game' && (
        <div className="screen">
          <div className="panel">
            <p className="panel-label" style={{ textAlign: 'center' }}>
              Tabela wynikow
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
                    <td>{p.cardCount}/10</td>
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
              ▶️ Odtworz losowy utwor
            </button>

            {nowPlaying && (
              <div className="now-playing">
                <p className="now-playing-tag">Teraz gra (tylko Ty to widzisz)</p>
                <p className="now-playing-title">{nowPlaying.title}</p>
                <p className="now-playing-artist">{nowPlaying.artist}</p>
                <p className="now-playing-year">{nowPlaying.year}</p>
              </div>
            )}

            <div className="row-2">
              <button className="btn btn-ghost" onClick={() => onTogglePlayback('pause')}>
                ⏸ Pauza
              </button>
              <button className="btn btn-ghost" onClick={() => onTogglePlayback('play')}>
                ▶️ Wznow
              </button>
            </div>

            <p className="status-text">{status}</p>
            {timer !== null && <p className="timer-text">{timer}</p>}

            {judgeSongVisible && (
              <div className="judge-panel song">
                <p>{buzzedName} zgaduje utwor!</p>
                <div className="row-2">
                  <button className="btn btn-primary btn-sm" onClick={() => onJudgeSong(true)}>
                    ✅ Poprawnie
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => onJudgeSong(false)}>
                    ❌ Blednie
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
