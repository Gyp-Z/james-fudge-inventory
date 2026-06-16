// Large-tap-target counter for the kitchen tablet. The number bumps when it
// changes (keyed remount replays the animation) for tactile feedback.
export default function Stepper({ value, onChange, min = 0, max = 999 }) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="press w-12 h-12 rounded-xl bg-store-green/10 text-store-green text-2xl font-bold flex items-center justify-center select-none touch-manipulation hover:bg-store-green/20 disabled:opacity-40 disabled:pointer-events-none"
        aria-label="Decrease"
      >
        −
      </button>
      <span className="w-10 text-center text-2xl font-bold text-store-brown tabular-nums select-none overflow-hidden">
        <span key={value} className="inline-block animate-bump">{value}</span>
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        className="press w-12 h-12 rounded-xl bg-store-green text-white text-2xl font-bold flex items-center justify-center select-none touch-manipulation hover:bg-store-green-dark shadow-sm"
        aria-label="Increase"
      >
        +
      </button>
    </div>
  )
}
