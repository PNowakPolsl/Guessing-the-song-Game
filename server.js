require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'client/dist')));
app.use(express.json());

const PORT = process.env.PORT || 3000;
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI;
const SONG_GUESS_SECONDS = 30;
const TIMELINE_GUESS_SECONDS = 30;

// ---------------------------------------------------------------------------
// STAN GRY W PAMIĘCI SERWERA
// ---------------------------------------------------------------------------
const rooms = {};

function generatePin() {
  let pin;
  do {
    pin = Math.floor(1000 + Math.random() * 9000).toString();
  } while (rooms[pin]);
  return pin;
}

function createRoom(hostSocketId) {
  const pin = generatePin();
  rooms[pin] = {
    pin,
    hostSocketId,
    hostSpotify: null,
    players: {},
    tracks: [],
    usedTrackIds: new Set(),
    currentTrack: null,
    deviceId: null,
    activeDeviceId: null,
    phase: 'lobby',
    buzzedPlayerId: null,
    excludedPlayerIds: new Set(),
    timer: null,
    timeLeft: 0,
  };
  return rooms[pin];
}

function publicPlayers(room) {
  return Object.values(room.players).map(p => ({
    id: p.id,
    name: p.name,
    cardCount: p.cards.length,
    cards: p.cards,
  }));
}

function startTimer(room, seconds, type) {
  clearRoomTimer(room);
  room.timeLeft = seconds;
  io.to(room.pin).emit('timer_start', { seconds, type });
  room.timer = setInterval(() => {
    room.timeLeft -= 1;
    if (room.timeLeft <= 0) {
      clearRoomTimer(room);
      room.phase = 'lobby';
      room.buzzedPlayerId = null;
      io.to(room.pin).emit('time_up', { type });
    }
  }, 1000);
}

function clearRoomTimer(room) {
  if (room.timer) {
    clearInterval(room.timer);
    room.timer = null;
  }
}

// ---------------------------------------------------------------------------
// SPOTIFY OAuth 2.0
// ---------------------------------------------------------------------------
app.get('/auth/login', (req, res) => {
  const { room } = req.query;
  if (!room || !rooms[room]) return res.status(400).send('Nieznany pokój. Wróć do gry i spróbuj ponownie.');
  const scope = [
    'streaming',
    'user-read-email',
    'user-read-private',
    'user-modify-playback-state',
    'user-read-playback-state',
  ].join(' ');
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope,
    redirect_uri: REDIRECT_URI,
    state: room,
  });
  res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
});

app.get('/auth/callback', async (req, res) => {
  const { code, state: pin, error } = req.query;
  if (error) return res.send(`Autoryzacja odrzucona: ${error}`);
  if (!pin || !rooms[pin]) return res.send('Pokój wygasł lub nie istnieje. Utwórz nowy pokój i spróbuj ponownie.');

  try {
    const tokenResp = await axios.post(
      'https://accounts.spotify.com/api/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
        },
      }
    );
    const { access_token, refresh_token, expires_in } = tokenResp.data;
    rooms[pin].hostSpotify = {
      access_token,
      refresh_token,
      expires_at: Date.now() + expires_in * 1000,
    };
    res.redirect(`/?room=${pin}&host=1&spotify=success`);
  } catch (err) {
    console.error('Błąd wymiany tokena Spotify:', err.response?.data || err.message);
    res.send('Błąd autoryzacji Spotify. Sprawdź Client ID/Secret oraz Redirect URI w Spotify Dashboard.');
  }
});

async function ensureFreshToken(room) {
  if (!room.hostSpotify) throw new Error('Host nie jest połączony ze Spotify.');
  if (Date.now() < room.hostSpotify.expires_at - 60000) return room.hostSpotify.access_token;
  const resp = await axios.post(
    'https://accounts.spotify.com/api/token',
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: room.hostSpotify.refresh_token,
    }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
      },
    }
  );
  room.hostSpotify.access_token = resp.data.access_token;
  room.hostSpotify.expires_at = Date.now() + resp.data.expires_in * 1000;
  if (resp.data.refresh_token) room.hostSpotify.refresh_token = resp.data.refresh_token;
  return room.hostSpotify.access_token;
}

app.get('/auth/token/:pin', async (req, res) => {
  const room = rooms[req.params.pin];
  if (!room) return res.status(404).json({ error: 'Pokój nie istnieje.' });
  try {
    const token = await ensureFreshToken(room);
    res.json({ access_token: token });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

function extractPlaylistId(input) {
  const trimmed = input.trim();
  const uriMatch = trimmed.match(/playlist[/:]([a-zA-Z0-9]+)/);
  if (uriMatch) return uriMatch[1];
  return trimmed;
}

// ---------------------------------------------------------------------------
// SOCKET.IO — LOGIKA GRY
// ---------------------------------------------------------------------------
io.on('connection', (socket) => {
  socket.on('create_room', (cb) => {
    const room = createRoom(socket.id);
    socket.join(room.pin);
    socket.data.role = 'host';
    socket.data.pin = room.pin;
    cb({ pin: room.pin });
  });

  socket.on('rejoin_host', ({ pin }, cb) => {
    const room = rooms[pin];
    if (!room) return cb && cb({ error: 'Pokój nie istnieje. Utwórz nowy.' });
    room.hostSocketId = socket.id;
    socket.join(pin);
    socket.data.role = 'host';
    socket.data.pin = pin;
    cb &&
      cb({
        success: true,
        pin,
        spotifyConnected: !!room.hostSpotify,
        tracksLoaded: room.tracks.length,
        players: publicPlayers(room),
      });
  });

  socket.on('join_room', ({ pin, name }, cb) => {
    const room = rooms[pin];
    if (!room) return cb({ error: 'Nie znaleziono pokoju o podanym numerze PIN.' });
    if (!name || !name.trim()) return cb({ error: 'Podaj swoje imię.' });
    const player = { id: socket.id, name: name.trim().substring(0, 20), cards: [] };
    room.players[socket.id] = player;
    socket.join(pin);
    socket.data.role = 'player';
    socket.data.pin = pin;
    cb({ success: true, pin });
    io.to(pin).emit('players_update', publicPlayers(room));
  });

  socket.on('load_playlist', async ({ pin, playlistUrl }, cb) => {
    const room = rooms[pin];
    if (!room || socket.id !== room.hostSocketId) return cb({ error: 'Brak uprawnień. Zostałeś rozłączony, odśwież stronę.' });
    try {
      const token = await ensureFreshToken(room);
      const playlistId = extractPlaylistId(playlistUrl);
      let tracks = [];
      let url = `https://api.spotify.com/v1/playlists/${playlistId}/items?limit=100`;
      let sawAnyItems = false;
      while (url && tracks.length < 300) {
        const resp = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
        const items = resp.data.items;
        if (!items) break; 
        sawAnyItems = true;
        for (const entry of items) {
          const t = entry.item || entry.track;
          if (!t || !t.uri || !t.id) continue;
          const yearStr = (t.album && t.album.release_date ? t.album.release_date : '').split('-')[0];
          const year = parseInt(yearStr, 10);
          if (!year) continue;
          tracks.push({
            id: t.id,
            uri: t.uri,
            title: t.name,
            artist: t.artists.map((a) => a.name).join(', '),
            year,
            imageUrl: t.album && t.album.images && t.album.images[0] ? t.album.images[0].url : null,
          });
        }
        url = resp.data.next;
      }

      if (!sawAnyItems) {
        return cb({
          error: 'Spotify nie zwrócił zawartości playlisty. Upewnij się, że masz do niej dostęp.',
        });
      }

      room.tracks = tracks;
      room.usedTrackIds = new Set();
      cb({ success: true, count: tracks.length });
    } catch (err) {
      console.error('Błąd pobierania playlisty:', err.response?.data || err.message);
      cb({ error: 'Nie udało się pobrać playlisty. Sprawdź link/URI.' });
    }
  });

  socket.on('set_device_id', ({ pin, deviceId }) => {
    const room = rooms[pin];
    if (room && socket.id === room.hostSocketId) {
      room.deviceId = deviceId;
      io.to(room.hostSocketId).emit('player_ready');
    }
  });

  socket.on('play_random_track', async ({ pin }, cb) => {
    const room = rooms[pin];
    if (!room || socket.id !== room.hostSocketId) return cb && cb({ error: 'Brak uprawnień. Odśwież stronę.' });
    
    const available = room.tracks.filter((t) => !room.usedTrackIds.has(t.id));
    if (available.length === 0) return cb && cb({ error: 'Wszystkie utwory z playlisty zostały już wykorzystane.' });

    const track = available[Math.floor(Math.random() * available.length)];
    room.usedTrackIds.add(track.id);
    room.currentTrack = track;
    room.phase = 'buzzer';
    room.buzzedPlayerId = null;
    room.excludedPlayerIds = new Set(); 

    try {
      const token = await ensureFreshToken(room);
      
      const devResp = await axios.get('https://api.spotify.com/v1/me/player/devices', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const devices = devResp.data.devices || [];

      // KOLEJKA PRIORYTETOWA - Nowy mechanizm wybudzania uśpionych apek!
      let devicesToTry = [];
      
      // 1. Najważniejsze: Próbujemy BEZ podawania ID. To zmusza serwery Spotify 
      // do wysłania cichego powiadomienia wybudzającego (push) na Twój telefon!
      devicesToTry.push(null);
      
      // 2. Jeśli serwer nie domyślił się urządzenia, próbujemy użyć tego z poprzedniej rundy
      if (room.activeDeviceId) devicesToTry.push(room.activeDeviceId);
      
      // 3. Aktywne urządzenie (jeśli widnieje)
      const active = devices.find(d => d.is_active);
      if (active && !devicesToTry.includes(active.id)) devicesToTry.push(active.id);
      
      // 4. Smartfony znalezione na liście
      const smartphones = devices.filter(d => d.type === 'Smartphone');
      for (let sp of smartphones) {
        if (!devicesToTry.includes(sp.id)) devicesToTry.push(sp.id); 
      }

      let played = false;
      let lastErrorMessage = '';

      for (let devId of devicesToTry) {
        try {
          const deviceQuery = devId ? `?device_id=${devId}` : '';
          await axios.put(
            `https://api.spotify.com/v1/me/player/play${deviceQuery}`,
            { uris: [track.uri] },
            { headers: { Authorization: `Bearer ${token}` } }
          );
          
          if (devId) room.activeDeviceId = devId; // Aktualizujemy działające ID
          played = true;
          break; // Odtwarza się! Uciekamy z pętli.
        } catch (err) {
          lastErrorMessage = err.response?.data?.error?.message || err.message;
          console.error(`Odrzucono na urządzeniu ${devId || 'domyślnym'}:`, lastErrorMessage);
        }
      }

      if (!played) {
        room.usedTrackIds.delete(track.id); // Cofamy piosenkę, żeby nie przepadła!
        room.phase = 'lobby';
        return cb && cb({ error: 'Urządzenie uśpiło odtwarzacz. Niestety musisz wejść na sekundę w aplikację Spotify.' });
      }

    } catch (err) {
      console.error('Główny błąd odtwarzania:', err.message);
      room.usedTrackIds.delete(track.id);
      room.phase = 'lobby';
      return cb && cb({ error: 'Błąd połączenia. Spróbuj ponownie.' });
    }
    
    io.to(pin).emit('round_started');
    io.to(room.hostSocketId).emit('now_playing_host', {
      title: track.title,
      artist: track.artist,
      year: track.year,
    });
    cb && cb({ success: true });
  });

  // Trik nr 2: Pauza i Play wysyłane W CIEMNO, bez sztywnego ID urządzenia.
  socket.on('toggle_playback', async ({ pin, action }) => {
    const room = rooms[pin];
    if (!room || socket.id !== room.hostSocketId) return;
    try {
      const token = await ensureFreshToken(room);
      const endpoint = action === 'pause' ? 'pause' : 'play';
      await axios.put(
        `https://api.spotify.com/v1/me/player/${endpoint}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (err) {
      console.error('Błąd play/pause:', err.response?.data || err.message);
    }
  });

  async function pauseSpotifyPlayback(room) {
    try {
      const token = await ensureFreshToken(room);
      await axios.put(
        `https://api.spotify.com/v1/me/player/pause`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (err) {
      console.error('Błąd automatycznej pauzy:', err.response?.data || err.message);
    }
  }

  socket.on('buzz', async ({ pin }) => {
    const room = rooms[pin];
    if (!room || room.phase !== 'buzzer') return;
    if (room.excludedPlayerIds.has(socket.id)) return;
    const player = room.players[socket.id];
    if (!player) return;
    room.phase = 'guessing_song';
    room.buzzedPlayerId = socket.id;
    io.to(pin).emit('buzzer_locked', { playerId: socket.id, playerName: player.name });
    startTimer(room, SONG_GUESS_SECONDS, 'song_guess');
    await pauseSpotifyPlayback(room); 
  });

  socket.on('judge_song', ({ pin, correct }) => {
    const room = rooms[pin];
    if (!room || socket.id !== room.hostSocketId || room.phase !== 'guessing_song') return;
    clearRoomTimer(room);
    const playerId = room.buzzedPlayerId;
    const player = room.players[playerId];

    if (correct && player) {
      room.phase = 'timeline';
      io.to(pin).emit('song_correct', { playerId, playerName: player.name });
      io.to(playerId).emit('enter_timeline_phase', {
        track: { title: room.currentTrack.title, artist: room.currentTrack.artist },
        myCards: player.cards,
      });
      io.to(room.hostSocketId).emit('enter_timeline_phase_host', {
        playerId,
        playerName: player.name,
        correctYear: room.currentTrack.year,
      });
      startTimer(room, TIMELINE_GUESS_SECONDS, 'timeline_guess');
    } else {
      room.excludedPlayerIds.add(playerId); 
      room.buzzedPlayerId = null;

      const activePlayers = Object.keys(room.players);
      const everyoneExcluded = activePlayers.length > 0 && activePlayers.every((id) => room.excludedPlayerIds.has(id));

      if (everyoneExcluded) {
        room.phase = 'lobby';
        io.to(pin).emit('round_result', {
          playerId: null,
          playerName: null,
          correct: false,
          track: room.currentTrack,
          players: publicPlayers(room),
        });
      } else {
        room.phase = 'buzzer';
        io.to(pin).emit('buzzer_unlocked', { excludedPlayerIds: [...room.excludedPlayerIds] });
      }
    }
  });

  socket.on('judge_timeline', ({ pin, correct }) => {
    const room = rooms[pin];
    if (!room || socket.id !== room.hostSocketId || room.phase !== 'timeline') return;
    clearRoomTimer(room);
    const playerId = room.buzzedPlayerId;
    const player = room.players[playerId];

    if (correct && player) {
      player.cards.push({ title: room.currentTrack.title, artist: room.currentTrack.artist, year: room.currentTrack.year });
      player.cards.sort((a, b) => a.year - b.year);
    }

    room.phase = 'lobby';
    room.buzzedPlayerId = null;

    io.to(pin).emit('round_result', {
      playerId,
      playerName: player ? player.name : null,
      correct,
      track: room.currentTrack,
      players: publicPlayers(room),
    });
  });

  socket.on('end_game', ({ pin }, cb) => {
    const room = rooms[pin];
    if (!room || socket.id !== room.hostSocketId) return cb && cb({ error: 'Brak uprawnien.' });

    clearRoomTimer(room);
    room.phase = 'lobby';
    room.buzzedPlayerId = null;

    const standings = publicPlayers(room)
      .map((p) => ({ id: p.id, name: p.name, cardCount: p.cardCount }))
      .sort((a, b) => b.cardCount - a.cardCount);

    const topScore = standings.length > 0 ? standings[0].cardCount : 0;
    const winners = standings.filter((p) => p.cardCount === topScore && topScore > 0);

    io.to(pin).emit('game_ended', {
      standings,
      winners,
    });

    cb && cb({ success: true });
  });

  socket.on('disconnect', () => {
    const pin = socket.data.pin;
    if (!pin || !rooms[pin]) return;
    const room = rooms[pin];
    if (socket.data.role === 'player') {
      delete room.players[socket.id];
      io.to(pin).emit('players_update', publicPlayers(room));
    }
  });
});

// --- OBSŁUGA FRONTENDU (REACT) ---
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/dist', 'index.html'));
});

server.listen(PORT, () => console.log(`Serwer Hitster działa na porcie ${PORT}`));