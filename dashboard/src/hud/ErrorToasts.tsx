import { useStore } from '../store.js';

export function ErrorToasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  if (toasts.length === 0) return null;
  return (
    <div className="toasts" role="alert">
      {toasts.map((t) => (
        <div
          key={t.eventId}
          className="toast"
          data-testid={`error-toast-${t.eventId}`}
          onClick={() => dismiss(t.eventId)}
        >
          <strong>ERR</strong>{t.message}
        </div>
      ))}
    </div>
  );
}
