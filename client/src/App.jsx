import { useEffect, useRef, useState } from 'react';
import { socket } from './socket.js';
import WelcomeScreen from './components/WelcomeScreen.jsx';
import HostScreen from './components/HostScreen.jsx';
import PlayerScreen from './components/PlayerScreen.jsx';
import RoundResultBanner from './components/RoundResultBanner.jsx';
import ConfirmModal from './components/ConfirmModal.jsx';
import GameSummaryModal from './components/GameSummaryModal.jsx';

export default function App() {
  // ---------- Ekran / rola ----------
  const [screen, setScreen] = useState('welcome'); // 'welcome' | 'host' | 'player'
  const roleRef = useRef(null); // 'host' | 'player' - odpowiednik zmiennej globalnej `role` z app.js
  const currentPinRef = useRef(null);

  // ---------- HOST ----------
  const [hostPin, setHostPin] = useState('----');
  const [inviteLink, setInviteLink] = useState('');
  const [spotifyLoginUrl, setSpotifyLoginUrl] = useState('#');
  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const [playlistStatus, setPlaylistStatus] = useState('');
  const [tracksLoaded, setTracksLoaded] = useState(0);
  const [players, setPlayers] = useState([]);
  const [hostPhase, setHostPhase] = useState('lobby'); // 'lobby' | 'game'
  const [nowPlaying, setNowPlaying] = useState(null);
  const [hostStatus, setHostStatus] = useState('');
  const [hostTimer, setHostTimer] = useState(null);
  const [judgeSongVisible, setJudgeSongVisible] = useState(false);
  const [judgeTimelineVisible, setJudgeTimelineVisible] = useState(false);
  const [buzzedName, setBuzzedName] = useState('');
  const [timelineBuzzedName, setTimelineBuzzedName] = useState('');
  const [playRandomDisabled, setPlayRandomDisabled] = useState(false);

  const spotifyPlayerRef = useRef(null);

  // ---------- PLAYER ----------
  const [playerStatus, setPlayerStatus] = useState('Czekaj na hosta...');
  const [buzzerDisabled, setBuzzerDisabled] = useState(true);
  const [timelineVisible, setTimelineVisible] = useState(false);
  const [currentGuessText, setCurrentGuessText] = useState('');
  const [myTimelineCards, setMyTimelineCards] = useState([]);
  const [playerTimer, setPlayerTimer] = useState(null);
  const [myCardCount, setMyCardCount] = useState(0);
  const [myCardsDisplay, setMyCardsDisplay] = useState([]);

  // ---------- WSPOLNE ----------
  const [joinError, setJoinError] = useState('');
  const [roundBanner, setRoundBanner] = useState({ visible: false, text: '' });
  const [endGameConfirmVisible, setEndGameConfirmVisible] = useState(false);
  const [gameSummary, setGameSummary] = useState({ visible: false, standings: [], winners: [] });

  const localTimerIntervalRef = useRef(null);

  // ---------- Prefill pola PIN przy dolaczaniu z linku zaproszenia ----------
  const [joinPrefillPin, setJoinPrefill] = useState('');

  function clearLocalTimer() {
    if (localTimerIntervalRef.current) {
      clearInterval(localTimerIntervalRef.current);
      localTimerIntervalRef.current = null;
    }
    setHostTimer(null);
    setPlayerTimer(null);
  }

  function hideJudgePanels() {
    setJudgeSongVisible(false);
    setJudgeTimelineVisible(false);
  }

  function hideNowPlaying() {
    setNowPlaying(null);
  }

  function renderPlayers(list) {
    setPlayers(list);
  }

  // ---------- Spotify Web Playback SDK (tylko host) ----------
  function initializePlayer(pin) {
    if (spotifyPlayerRef.current) return;
    const player = new window.Spotify.Player({
      name: 'Hitster Party Host',
      getOAuthToken: (cb) => {
        fetch(`/auth/token/${pin}`)
          .then((r) => r.json())
          .then((d) => cb(d.access_token))
          .catch((err) => console.error('Blad pobierania tokena:', err));
      },
      volume: 0.8,
    });

    player.addListener('ready', ({ device_id }) => {
      socket.emit('set_device_id', { pin, deviceId: device_id });
    });

    player.addListener('initialization_error', ({ message }) => console.error('Init error:', message));
    player.addListener('authentication_error', ({ message }) => console.error('Auth error:', message));
    player.addListener('account_error', ({ message }) =>
      console.error('Account error (wymagany Spotify Premium):', message)
    );

    player.connect();
    spotifyPlayerRef.current = player;
  }

  function connectSpotifyPlayer(pin) {
    if (window.Spotify) {
      initializePlayer(pin);
    } else {
      window.onSpotifyWebPlaybackSDKReady = () => initializePlayer(pin);
    }
  }

  // ---------- Rejestracja nasluchiwaczy socket.io (raz, przy montowaniu) ----------
  useEffect(() => {
    socket.on('player_ready', () => {
      setHostStatus('Odtwarzacz Spotify gotowy. Mozesz zaczac gre!');
    });

    socket.on('now_playing_host', ({ title, artist, year }) => {
      setNowPlaying({ title, artist, year });
    });

    socket.on('players_update', (list) => {
      if (roleRef.current === 'host') renderPlayers(list);
    });

    socket.on('round_started', () => {
      if (roleRef.current === 'player') {
        setPlayerStatus('Utwor leci! Kto pierwszy?');
        setBuzzerDisabled(false);
        setTimelineVisible(false);
      }
      if (roleRef.current === 'host') {
        setHostStatus('Utwor leci - gracze moga wcisnac buzzer.');
      }
    });

    socket.on('buzzer_locked', ({ playerId, playerName }) => {
      setPlayRandomDisabled(true);
      if (roleRef.current === 'player') {
        setBuzzerDisabled(true);
        setPlayerStatus(playerId === socket.id ? 'Twoja kolej! Powiedz Tytul i Wykonawce!' : `${playerName} zgaduje...`);
      }
      if (roleRef.current === 'host') {
        setHostStatus('Muzyka zatrzymana automatycznie.');
        setBuzzedName(playerName);
        setJudgeSongVisible(true);
        setJudgeTimelineVisible(false);
      }
    });

    socket.on('buzzer_unlocked', (payload = {}) => {
      const { excludedPlayerIds } = payload;
      if (roleRef.current === 'player') {
        const iAmExcluded = Array.isArray(excludedPlayerIds) && excludedPlayerIds.includes(socket.id);
        if (iAmExcluded) {
          setBuzzerDisabled(true);
          setPlayerStatus('Zle! Czekasz na kolejna runde.');
        } else {
          setBuzzerDisabled(false);
          setPlayerStatus('Zle! Sprobuj ponownie, kto pierwszy?');
        }
      }
      if (roleRef.current === 'host') {
        hideJudgePanels();
        setHostStatus('Buzzer odblokowany dla pozostalych graczy.');
      }
    });

    socket.on('song_correct', ({ playerName }) => {
      hideJudgePanels();
      hideNowPlaying();
      if (roleRef.current === 'host') setHostStatus(`${playerName} zgadl utwor! Teraz os czasu.`);
    });

    socket.on('enter_timeline_phase', ({ track, myCards }) => {
      setPlayerStatus('Poprawnie! Gdzie na osi czasu jest ten utwor?');
      setCurrentGuessText(`${track.title} - ${track.artist}`);
      setTimelineVisible(true);
      setMyTimelineCards(myCards);
    });

    socket.on('enter_timeline_phase_host', ({ playerName }) => {
      hideJudgePanels();
      setTimelineBuzzedName(playerName);
      setJudgeTimelineVisible(true);
    });

    socket.on('round_result', ({ playerName, correct, track, players: updatedPlayers }) => {
      hideJudgePanels();
      hideNowPlaying();
      setPlayRandomDisabled(false);
      clearLocalTimer();

      const text = correct
        ? `\u2705 ${playerName} zdobywa karte: ${track.title} (${track.year})!`
        : `\u274C Brak punktu. To bylo: ${track.title} - ${track.artist} (${track.year}).`;
      setRoundBanner({ visible: true, text });
      setTimeout(() => setRoundBanner((b) => ({ ...b, visible: false })), 4000);

      if (roleRef.current === 'host') {
        renderPlayers(updatedPlayers);
        setHostStatus('Gotowy na kolejna runde.');
      }
      if (roleRef.current === 'player') {
        setPlayerStatus('Czekaj na kolejny utwor...');
        setTimelineVisible(false);
        const me = updatedPlayers.find((p) => p.id === socket.id);
        if (me) {
          setMyCardCount(me.cardCount);
          setMyCardsDisplay(me.cards);
        }
      }
    });

    socket.on('game_ended', ({ standings, winners }) => {
      hideJudgePanels();
      hideNowPlaying();
      clearLocalTimer();
      setEndGameConfirmVisible(false);
      setGameSummary({ visible: true, standings, winners });
    });

    socket.on('timer_start', ({ seconds }) => {
      clearLocalTimer();
      let remaining = seconds;
      setHostTimer(remaining);
      setPlayerTimer(remaining);
      localTimerIntervalRef.current = setInterval(() => {
        remaining -= 1;
        const clamped = Math.max(remaining, 0);
        setHostTimer(clamped);
        setPlayerTimer(clamped);
        if (remaining <= 0) clearLocalTimer();
      }, 1000);
    });

    socket.on('time_up', () => {
      clearLocalTimer();
      hideJudgePanels();
      hideNowPlaying();
      setPlayRandomDisabled(false);
      if (roleRef.current === 'player') {
        setBuzzerDisabled(true);
        setPlayerStatus('Czas minal! Czekaj na kolejny utwor.');
        setTimelineVisible(false);
      }
      if (roleRef.current === 'host') {
        setHostStatus('Czas minal - brak punktu w tej rundzie.');
      }
    });

    // ---------- Powrot z autoryzacji Spotify / link zaproszenia ----------
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    const isHost = params.get('host');
    const invitePin = params.get('pin');

    if (invitePin) {
      setJoinPrefill(invitePin);
    }

    if (room && isHost) {
      socket.emit('rejoin_host', { pin: room }, (res) => {
        if (res.error) {
          alert(res.error);
          window.location.href = '/';
          return;
        }
        roleRef.current = 'host';
        currentPinRef.current = res.pin;
        setScreen('host');
        setHostPin(res.pin);
        setSpotifyLoginUrl(`/auth/login?room=${res.pin}`);
        setInviteLink(`${window.location.origin}/?pin=${res.pin}`);
        renderPlayers(res.players);

        if (res.spotifyConnected) {
          setSpotifyConnected(true);
          connectSpotifyPlayer(res.pin);
        }
        if (res.tracksLoaded > 0) {
          setPlaylistStatus(`Wczytano ${res.tracksLoaded} utworow.`);
          setTracksLoaded(res.tracksLoaded);
        }
        window.history.replaceState({}, document.title, '/');
      });
    }

    return () => {
      socket.off('player_ready');
      socket.off('now_playing_host');
      socket.off('players_update');
      socket.off('round_started');
      socket.off('buzzer_locked');
      socket.off('buzzer_unlocked');
      socket.off('song_correct');
      socket.off('enter_timeline_phase');
      socket.off('enter_timeline_phase_host');
      socket.off('round_result');
      socket.off('game_ended');
      socket.off('timer_start');
      socket.off('time_up');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Akcje: EKRAN POWITALNY ----------
  function handleCreateRoom() {
    socket.emit('create_room', (res) => {
      roleRef.current = 'host';
      currentPinRef.current = res.pin;
      setHostPin(res.pin);
      setSpotifyLoginUrl(`/auth/login?room=${res.pin}`);
      setInviteLink(`${window.location.origin}/?pin=${res.pin}`);
      setScreen('host');
    });
  }

  function handleJoinRoom(name, pin) {
    setJoinError('');
    if (!name || pin.length !== 4) {
      setJoinError('Podaj imie i 4-cyfrowy PIN.');
      return;
    }
    socket.emit('join_room', { pin, name }, (res) => {
      if (res.error) {
        setJoinError(res.error);
        return;
      }
      roleRef.current = 'player';
      currentPinRef.current = pin;
      setPlayerStatus('Czekaj, az host odtworzy utwor...');
      setScreen('player');
    });
  }

  // ---------- Akcje: HOST ----------
  function handleLoadPlaylist(playlistUrl) {
    if (!playlistUrl) return;
    setPlaylistStatus('Wczytywanie...');
    socket.emit('load_playlist', { pin: currentPinRef.current, playlistUrl }, (res) => {
      if (res.error) {
        setPlaylistStatus(res.error);
        return;
      }
      setPlaylistStatus(`Wczytano ${res.count} utworow z latami wydania.`);
      setTracksLoaded(res.count);
    });
  }

  function handleStartGame() {
    setHostPhase('game');
  }

  function handlePlayRandom() {
    socket.emit('play_random_track', { pin: currentPinRef.current }, (res) => {
      if (res && res.error) setHostStatus(res.error);
    });
    hideJudgePanels();
    setPlayRandomDisabled(true);
  }

  function handleTogglePlayback(action) {
    socket.emit('toggle_playback', { pin: currentPinRef.current, action });
  }

  function handleJudgeSong(correct) {
    socket.emit('judge_song', { pin: currentPinRef.current, correct });
  }

  function handleJudgeTimeline(correct) {
    socket.emit('judge_timeline', { pin: currentPinRef.current, correct });
  }

  function handleCopyInviteLink() {
    navigator.clipboard.writeText(inviteLink).catch(() => {});
  }

  function handleRequestEndGame() {
    setEndGameConfirmVisible(true);
  }

  function handleCancelEndGame() {
    setEndGameConfirmVisible(false);
  }

  function handleConfirmEndGame() {
    socket.emit('end_game', { pin: currentPinRef.current }, (res) => {
      if (res && res.error) {
        setEndGameConfirmVisible(false);
        setHostStatus(res.error);
      }
    });
  }

  // ---------- Akcje: GRACZ ----------
  function handleBuzz() {
    socket.emit('buzz', { pin: currentPinRef.current });
    setBuzzerDisabled(true);
  }

  return (
    <div className="app-shell">
      <div className="brand">
        <span className="brand-dot">🎵</span>
        <h1>Hitster Party</h1>
      </div>

      {screen === 'welcome' && (
        <WelcomeScreen
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          joinError={joinError}
          prefillPin={joinPrefillPin}
        />
      )}

      {screen === 'host' && (
        <HostScreen
          pin={hostPin}
          inviteLink={inviteLink}
          onCopyInviteLink={handleCopyInviteLink}
          spotifyLoginUrl={spotifyLoginUrl}
          spotifyConnected={spotifyConnected}
          playlistStatus={playlistStatus}
          tracksLoaded={tracksLoaded}
          onLoadPlaylist={handleLoadPlaylist}
          players={players}
          phase={hostPhase}
          onStartGame={handleStartGame}
          nowPlaying={nowPlaying}
          status={hostStatus}
          timer={hostTimer}
          judgeSongVisible={judgeSongVisible}
          judgeTimelineVisible={judgeTimelineVisible}
          buzzedName={buzzedName}
          timelineBuzzedName={timelineBuzzedName}
          playRandomDisabled={playRandomDisabled}
          onPlayRandom={handlePlayRandom}
          onTogglePlayback={handleTogglePlayback}
          onJudgeSong={handleJudgeSong}
          onJudgeTimeline={handleJudgeTimeline}
          onRequestEndGame={handleRequestEndGame}
        />
      )}

      {screen === 'player' && (
        <PlayerScreen
          status={playerStatus}
          buzzerDisabled={buzzerDisabled}
          onBuzz={handleBuzz}
          timelineVisible={timelineVisible}
          currentGuessText={currentGuessText}
          myTimelineCards={myTimelineCards}
          timer={playerTimer}
          myCardCount={myCardCount}
          myCardsDisplay={myCardsDisplay}
        />
      )}

      <RoundResultBanner visible={roundBanner.visible} text={roundBanner.text} />

      <ConfirmModal
        visible={endGameConfirmVisible}
        title="Zakonczyc gre?"
        message="Czy na pewno konczymy gre? Ta akcja zakonczy rozgrywke dla wszystkich graczy i pokaze wyniki koncowe."
        confirmLabel="Tak, zakoncz"
        cancelLabel="Wroc do gry"
        onConfirm={handleConfirmEndGame}
        onCancel={handleCancelEndGame}
      />

      <GameSummaryModal visible={gameSummary.visible} standings={gameSummary.standings} winners={gameSummary.winners} />
    </div>
  );
}
