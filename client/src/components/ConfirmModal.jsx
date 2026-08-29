export default function ConfirmModal({ visible, title, message, confirmLabel, cancelLabel, onConfirm, onCancel }) {
  if (!visible) return null;
  return (
    <div className="modal-overlay">
      <div className="modal-box">
        {title && <p className="modal-title">{title}</p>}
        {message && <p className="modal-message">{message}</p>}
        <div className="row-2">
          <button className="btn btn-ghost" onClick={onCancel}>
            {cancelLabel || 'Anuluj'}
          </button>
          <button className="btn btn-danger" onClick={onConfirm}>
            {confirmLabel || 'Potwierdz'}
          </button>
        </div>
      </div>
    </div>
  );
}
