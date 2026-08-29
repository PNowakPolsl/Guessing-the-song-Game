export default function GameSummaryModal({ visible, standings, winners }) {
  if (!visible) return null;

  const hasWinners = winners && winners.length > 0;
  const isTie = winners && winners.length > 1;

  return (
    <div className="winner-banner">
      <p className="winner-emoji">🏁</p>

      {hasWinners ? (
        <p className="winner-text">
          {isTie ? 'Remis!' : 'Zwyciezca:'} {winners.map((w) => w.name).join(' i ')}
          {!isTie && ' 🏆'}
        </p>
      ) : (
        <p className="winner-text">Koniec gry</p>
      )}

      <div className="panel summary-panel">
        <p className="panel-label" style={{ textAlign: 'center' }}>
          Wyniki koncowe
        </p>
        <table className="scoreboard-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Gracz</th>
              <th>Karty</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((p, i) => {
              const isWinner = hasWinners && winners.some((w) => w.id === p.id);
              return (
                <tr key={p.id} className={isWinner ? 'winner-row' : ''}>
                  <td>{i + 1}</td>
                  <td>
                    {isWinner && '🏆 '}
                    {p.name}
                  </td>
                  <td>{p.cardCount}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button className="btn btn-primary" onClick={() => (window.location.href = '/')}>
        Nowa gra
      </button>
    </div>
  );
}
