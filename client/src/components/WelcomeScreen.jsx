import { useEffect, useState } from 'react';

export default function WelcomeScreen({ onCreateRoom, onJoinRoom, joinError, prefillPin }) {
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');

  useEffect(() => {
    if (prefillPin) setPin(prefillPin);
  }, [prefillPin]);

  return (
    <section className="screen screen-center">
      <button className="btn btn-primary" onClick={onCreateRoom}>
        Stworz pokoj (Host)
      </button>

      <div className="divider" />

      <div className="panel">
        <input
          className="input"
          type="text"
          placeholder="Twoje imie"
          maxLength={20}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="input input-pin"
          type="text"
          placeholder="Kod PIN (4 cyfry)"
          maxLength={4}
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
        />
        <button className="btn btn-outline-green" onClick={() => onJoinRoom(name.trim(), pin.trim())}>
          Dolacz do pokoju
        </button>
        {joinError && <p className="error-text">{joinError}</p>}
      </div>
    </section>
  );
}
