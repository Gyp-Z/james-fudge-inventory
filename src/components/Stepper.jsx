export default function Stepper({ value, onChange, min = 0, max = 999 }) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="w-12 h-12 rounded-xl bg-store-tan text-store-brown text-2xl font-bold flex items-center justify-center active:scale-95 transition-transform select-none touch-manipulation"
        aria-label="Decrease"
      >
        −
      </button>
      <span className="w-10 text-center text-2xl font-bold text-store-brown tabular-nums select-none">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        className="w-12 h-12 rounded-xl bg-store-tan text-store-brown text-2xl font-bold flex items-center justify-center active:scale-95 transition-transform select-none touch-manipulation"
        aria-label="Increase"
      >
        +
      </button>
    </div>
  )
}
