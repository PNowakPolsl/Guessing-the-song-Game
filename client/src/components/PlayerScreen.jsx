export default function PlayerScreen({
  status,
  buzzerDisabled,
  onBuzz,
  timelineVisible,
  currentGuessText,
  myTimelineCards,
  timer,
  myCardCount,
  myCardsDisplay,
}) {
  return (
    <section className="screen screen-center" style={{ alignItems: 'center' }}>
      <p className="status-text" style={{ fontSize: 18, color: '#fff' }}>
        {status}
      </p>
      {timer !== null && <p className="timer-text">{timer}</p>}

      <button
        className={`buzzer-btn${!buzzerDisabled ? ' pulse' : ''}`}
        disabled={buzzerDisabled}
        onClick={onBuzz}
      >
        BUZZER
      </button>

      {timelineVisible && (
        <div className="panel" style={{ width: '100%' }}>
          <p style={{ textAlign: 'center', fontWeight: 700 }}>Powiedz: PRZED, PO czy POMIEDZY Twoimi kartami?</p>
          <p className="status-text">{currentGuessText}</p>
          <p className="panel-label" style={{ marginTop: 6 }}>
            Twoja os czasu
          </p>
          <div className="pill-row">
            {myTimelineCards.map((c, i) => (
              <span className="card-pill" key={i}>
                {c.year}
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{ width: '100%' }}>
        <p className="panel-label" style={{ marginBottom: 8, textAlign: 'center' }}>
          Moje karty ({myCardCount}/10)
        </p>
        <div className="pill-row">
          {myCardsDisplay.map((c, i) => (
            <span className="card-pill mine" key={i}>
              {c.year} · {c.title}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
