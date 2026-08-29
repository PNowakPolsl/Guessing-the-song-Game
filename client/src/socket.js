import { io } from 'socket.io-client';

// Pojedyncza, wspoldzielona instancja polaczenia Socket.IO.
// Bez URL -> laczy sie z tego samego originu, na ktorym dziala frontend
// (w dev dzieki proxy w vite.config.js trafia do backendu na porcie 3000,
// w produkcji frontend jest serwowany bezposrednio przez ten sam serwer Express).
export const socket = io();
