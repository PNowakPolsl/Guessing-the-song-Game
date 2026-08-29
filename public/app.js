const socket = io();

let role = null; // 'host' | 'player'
let currentPin = null;
let myPlayerId = null;
let spotifyPlayer = null;
let localTimerInterval = null;

// ---------- Pomocnicze: przełączanie ekranów ----------
function showScreen(id) {
  ['screen-welcome', 'screen-host', 'screen-player'].forEach((s) => {
    document.getElementById(s).classList.toggle('hidden', s !== id);
  });
}

function el(id) { return document.getElementById(id); }

// ---------- EKRAN POWITALNY ----------
el('btn-create-room').addEventListener('click', () => {
  socket.emit('create_room', (res) => {
    role = 'host';
    currentPin = res.pin;
    el('host-pin').textContent = res.pin;
    el('link-spotify-connect').href = `/auth/login?room=${res.pin}`;
    el('invite-link').value = `${window.location.origin}/?pin=${res.pin}`;
    showScreen('screen-host');
  });
});

el('btn-copy-link').addEventListener('click', () => {
  const input = el('invite-link');
  input.select();
  navigator.clipboard
    .writeText(input.value)
    .then(() => {
      const btn = el('btn-copy-link');
      const original = btn.textContent;
      btn.textContent = 'Skopiowano!';
      setTimeout(() => (btn.textContent = original), 1500);
    })
    .catch(() => {});
});

el('btn-join-room').addEventListener('click', () => {
  const name = el('input-join-name').value.trim();
  const pin = el('input-join-pin').value.trim();
  el('join-error').classList.add('hidden');
  if (!name || pin.length !== 4) {
    el('join-error').textContent = 'Podaj imię i 4-cyfrowy PIN.';
    el('join-error').classList.remove('hidden');
    return;
  }
  socket.emit('join_room', { pin, name }, (res) => {
    if (res.error) {
      el('join-error').textContent = res.error;
      el('join-error').classList.remove('hidden');
      return;
    }
    role = 'player';
    currentPin = pin;
    myPlayerId = socket.id;
    el('player-status').textContent = 'Czekaj, aż host odtworzy utwór...';
    showScreen('screen-player');
  });
});

// ---------- OBSŁUGA POWROTU Z AUTORYZACJI SPOTIFY / LINKU ZAPROSZENIA ----------
window.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const room = params.get('room');
  const isHost = params.get('host');
  const invitePin = params.get('pin');

  if (invitePin) {
    el('input-join-pin').value = invitePin;
    el('input-join-name').focus();
  }

  if (room && isHost) {
    socket.emit('rejoin_host', { pin: room }, (res) => {
      if (res.error) {
        alert(res.error);
        window.location.href = '/';
        return;
      }
      role = 'host';
      currentPin = res.pin;
      showScreen('screen-host');
      el('host-pin').textContent = res.pin;
      el('link-spotify-connect').href = `/auth/login?room=${res.pin}`;
      el('invite-link').value = `${window.location.origin}/?pin=${res.pin}`;
      renderPlayers(res.players);

      if (res.spotifyConnected) {
        el('host-spotify-connect').classList.add('hidden');
        el('host-playlist-section').classList.remove('hidden');
        connectSpotifyPlayer(res.pin);
      }
      if (res.tracksLoaded > 0) {
        el('playlist-status').textContent = `Wczytano ${res.tracksLoaded} utworów.`;
        el('btn-start-game').classList.remove('hidden');
      }
      window.history.replaceState({}, document.title, '/');
    });
  }
});

// ---------- HOST: WCZYTYWANIE PLAYLISTY ----------
el('btn-load-playlist').addEventListener('click', () => {
  const playlistUrl = el('input-playlist').value.trim();
  if (!playlistUrl) return;
  el('playlist-status').textContent = 'Wczytywanie...';
  socket.emit('load_playlist', { pin: currentPin, playlistUrl }, (res) => {
    if (res.error) {
      el('playlist-status').textContent = res.error;
      return;
    }
    el('playlist-status').textContent = `Wczytano ${res.count} utworów z latami wydania.`;
    el('btn-start-game').classList.remove('hidden');
  });
});

// ---------- HOST: PRZEJŚCIE Z LOBBY DO WŁAŚCIWEJ GRY ----------
el('btn-start-game').addEventListener('click', () => {
  el('host-lobby-section').classList.add('hidden');
  el('host-game-section').classList.remove('hidden');
});

// ---------- HOST: SPOTIFY WEB PLAYBACK SDK ----------
async function connectSpotifyPlayer(pin) {
  const initWhenReady = () => {
    if (window.Spotify) {
      initializePlayer(pin);
    } else {
      window.onSpotifyWebPlaybackSDKReady = () => initializePlayer(pin);
    }
  };
  initWhenReady();
}

function initializePlayer(pin) {
  if (spotifyPlayer) return;
  spotifyPlayer = new Spotify.Player({
    name: 'Hitster Party Host',
    getOAuthToken: (cb) => {
      fetch(`/auth/token/${pin}`)
        .then((r) => r.json())
        .then((d) => cb(d.access_token))
        .catch((err) => console.error('Błąd pobierania tokena:', err));
    },
    volume: 0.8,
  });

  spotifyPlayer.addListener('ready', ({ device_id }) => {
    socket.emit('set_device_id', { pin, deviceId: device_id });
  });

  spotifyPlayer.addListener('initialization_error', ({ message }) => console.error('Init error:', message));
  spotifyPlayer.addListener('authentication_error', ({ message }) => console.error('Auth error:', message));
  spotifyPlayer.addListener('account_error', ({ message }) => console.error('Account error (wymagany Spotify Premium):', message));

  spotifyPlayer.connect();
}

socket.on('player_ready', () => {
  el('host-status').textContent = 'Odtwarzacz Spotify gotowy. Możesz zacząć grę!';
});

socket.on('now_playing_host', ({ title, artist, year }) => {
  el('now-playing-title').textContent = title;
  el('now-playing-artist').textContent = artist;
  el('now-playing-year').textContent = year;
  el('host-now-playing').classList.remove('hidden');
});

function hideNowPlaying() {
  el('host-now-playing').classList.add('hidden');
}

// ---------- HOST: STEROWANIE GRĄ ----------
el('btn-play-random').addEventListener('click', () => {
  socket.emit('play_random_track', { pin: currentPin }, (res) => {
    if (res && res.error) el('host-status').textContent = res.error;
  });
  hideJudgePanels();
  el('btn-play-random').disabled = true;
});

el('btn-pause').addEventListener('click', () => socket.emit('toggle_playback', { pin: currentPin, action: 'pause' }));
el('btn-resume').addEventListener('click', () => socket.emit('toggle_playback', { pin: currentPin, action: 'play' }));

el('btn-song-correct').addEventListener('click', () => socket.emit('judge_song', { pin: currentPin, correct: true }));
el('btn-song-wrong').addEventListener('click', () => socket.emit('judge_song', { pin: currentPin, correct: false }));
el('btn-timeline-correct').addEventListener('click', () => socket.emit('judge_timeline', { pin: currentPin, correct: true }));
el('btn-timeline-wrong').addEventListener('click', () => socket.emit('judge_timeline', { pin: currentPin, correct: false }));

function hideJudgePanels() {
  el('host-judge-song').classList.add('hidden');
  el('host-judge-timeline').classList.add('hidden');
}

function renderPlayers(players) {
  el('host-player-count').textContent = players.length;
  el('host-players-list').innerHTML = players
    .map((p) => `<li class="flex justify-between bg-white/5 px-3 py-2 rounded-lg"><span>${escapeHtml(p.name)}</span><span>🎴 ${p.cardCount}/10</span></li>`)
    .join('');

  const scoreboardBody = el('scoreboard-body');
  if (scoreboardBody) {
    const sorted = [...players].sort((a, b) => b.cardCount - a.cardCount);
    scoreboardBody.innerHTML = sorted
      .map(
        (p) =>
          `<tr class="border-b border-white/10"><td class="py-2">${escapeHtml(p.name)}</td><td class="py-2 text-right font-bold">${p.cardCount}/10</td></tr>`
      )
      .join('');
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- ZDARZENIA WSPÓLNE (SOCKET) ----------
socket.on('players_update', (players) => {
  if (role === 'host') renderPlayers(players);
});

socket.on('round_started', () => {
  if (role === 'player') {
    el('player-status').textContent = 'Utwór leci! Kto pierwszy?';
    el('btn-buzzer').disabled = false;
    el('player-timeline').classList.add('hidden');
  }
  if (role === 'host') {
    el('host-status').textContent = 'Utwór leci — gracze mogą wcisnąć buzzer.';
  }
});

el('btn-buzzer').addEventListener('click', () => {
  socket.emit('buzz', { pin: currentPin });
  el('btn-buzzer').disabled = true;
});

socket.on('buzzer_locked', ({ playerId, playerName }) => {
  el('btn-play-random').disabled = true;
  if (role === 'player') {
    el('btn-buzzer').disabled = true;
    el('player-status').textContent =
      playerId === socket.id ? 'Twoja kolej! Powiedz Tytuł i Wykonawcę!' : `${playerName} zgaduje...`;
  }
  if (role === 'host') {
    el('host-status').textContent = '⏸ Muzyka zatrzymana automatycznie.';
    el('host-buzzed-name').textContent = playerName;
    el('host-judge-song').classList.remove('hidden');
    el('host-judge-timeline').classList.add('hidden');
  }
});

socket.on('buzzer_unlocked', ({ excludedPlayerIds } = {}) => {
  if (role === 'player') {
    const iAmExcluded = Array.isArray(excludedPlayerIds) && excludedPlayerIds.includes(socket.id);
    if (iAmExcluded) {
      el('btn-buzzer').disabled = true;
      el('player-status').textContent = 'Źle! Czekasz na kolejną rundę.';
    } else {
      el('btn-buzzer').disabled = false;
      el('player-status').textContent = 'Źle! Spróbuj ponownie, kto pierwszy?';
    }
  }
  if (role === 'host') {
    hideJudgePanels();
    el('host-status').textContent = 'Buzzer odblokowany dla pozostałych graczy.';
  }
});

socket.on('song_correct', ({ playerName }) => {
  hideJudgePanels();
  hideNowPlaying(); // utwór odgadnięty — chowamy tytuł/wykonawcę/rok u hosta
  if (role === 'host') el('host-status').textContent = `${playerName} zgadł utwór! Teraz oś czasu.`;
});

socket.on('enter_timeline_phase', ({ track, myCards }) => {
  el('player-status').textContent = `Poprawnie! Gdzie na osi czasu jest ten utwór?`;
  el('player-current-guess').textContent = `${track.title} — ${track.artist}`;
  el('player-timeline').classList.remove('hidden');
  el('player-cards').innerHTML = myCards
    .map((c) => `<span class="bg-white/20 px-2 py-1 rounded-lg text-sm">${c.year}</span>`)
    .join(' ');
});

socket.on('enter_timeline_phase_host', ({ playerName }) => {
  hideJudgePanels();
  el('timeline-buzzed-name').textContent = playerName;
  el('host-judge-timeline').classList.remove('hidden');
});

socket.on('round_result', ({ playerName, correct, track, players }) => {
  hideJudgePanels();
  hideNowPlaying();
  el('btn-play-random').disabled = false;
  clearLocalTimer();

  const banner = el('round-result-banner');
  el('round-result-text').textContent = correct
    ? `✅ ${playerName} zdobywa kartę: ${track.title} (${track.year})!`
    : `❌ Brak punktu. To było: ${track.title} — ${track.artist} (${track.year}).`;
  banner.classList.remove('hidden');
  setTimeout(() => banner.classList.add('hidden'), 4000);

  if (role === 'host') {
    renderPlayers(players);
    el('host-status').textContent = 'Gotowy na kolejną rundę.';
  }
  if (role === 'player') {
    el('player-status').textContent = 'Czekaj na kolejny utwór...';
    el('player-timeline').classList.add('hidden');
    const me = players.find((p) => p.id === socket.id);
    if (me) {
      el('player-card-count').textContent = me.cardCount;
      el('player-cards-display').innerHTML = me.cards
        .map((c) => `<span class="bg-yellow-500/80 text-black px-2 py-1 rounded-lg text-sm font-bold">${c.year} · ${escapeHtml(c.title)}</span>`)
        .join(' ');
    }
  }
});

socket.on('game_over', ({ winnerName }) => {
  el('winner-text').textContent = `${winnerName} wygrywa grę z 10 kartami!`;
  el('winner-banner').classList.remove('hidden');
});

// ---------- TIMER (WIZUALNY, LICZONY LOKALNIE) ----------
socket.on('timer_start', ({ seconds }) => {
  clearLocalTimer();
  let remaining = seconds;
  const hostTimerEl = el('host-timer');
  const playerTimerEl = el('player-timer');
  hostTimerEl.classList.remove('hidden');
  playerTimerEl.classList.remove('hidden');
  hostTimerEl.textContent = remaining;
  playerTimerEl.textContent = remaining;
  localTimerInterval = setInterval(() => {
    remaining -= 1;
    hostTimerEl.textContent = Math.max(remaining, 0);
    playerTimerEl.textContent = Math.max(remaining, 0);
    if (remaining <= 0) clearLocalTimer();
  }, 1000);
});

socket.on('time_up', () => {
  clearLocalTimer();
  hideJudgePanels();
  hideNowPlaying();
  el('btn-play-random').disabled = false;
  if (role === 'player') {
    el('btn-buzzer').disabled = true;
    el('player-status').textContent = 'Czas minął! Czekaj na kolejny utwór.';
    el('player-timeline').classList.add('hidden');
  }
  if (role === 'host') {
    el('host-status').textContent = 'Czas minął — brak punktu w tej rundzie.';
  }
});

function clearLocalTimer() {
  if (localTimerInterval) {
    clearInterval(localTimerInterval);
    localTimerInterval = null;
  }
  el('host-timer').classList.add('hidden');
  el('player-timer').classList.add('hidden');
}