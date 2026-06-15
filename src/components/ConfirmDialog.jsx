// Reusable confirmation modal. Used on every destructive / irreversible Audit & Edit
// action (revert, delete, direct overwrite). `summary` optionally renders a preview of
// exactly what the action will deduct/refund before it commits.
export default function ConfirmDialog({
  open,
  title,
  message,
  summary,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDangerous = false,
  busy = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4"
      onClick={busy ? undefined : onCancel}
    >
      <div
        className="bg-white rounded-2xl border border-store-tan shadow-xl max-w-sm w-full p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-bold text-store-brown text-lg mb-2" style={{ fontFamily: 'var(--font-display)' }}>
          {title}
        </h3>
        {message && <p className="text-sm text-store-brown-light mb-3 leading-snug">{message}</p>}
        {summary && (
          <div className="bg-store-cream border border-store-tan rounded-xl px-3 py-2.5 mb-4 text-xs text-store-brown space-y-1">
            {summary}
          </div>
        )}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            disabled={busy}
            className="text-sm text-store-brown-light hover:text-store-brown px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`text-sm font-semibold px-4 py-2 rounded-xl transition-colors disabled:opacity-50 ${
              isDangerous
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-store-green text-white hover:bg-store-green-dark'
            }`}
          >
            {busy ? 'Working…' : confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
