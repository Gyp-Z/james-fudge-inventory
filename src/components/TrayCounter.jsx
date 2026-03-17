export default function TrayCounter({ count, onChange, min = 0 }) {
  const lbs = (count * 6.5).toFixed(1)

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, count - 1))}
        className="w-11 h-11 rounded-xl bg-store-tan text-store-brown text-xl font-bold flex items-center justify-center hover:bg-store-green hover:text-white transition-colors active:scale-95"
      >
        −
      </button>
      <div className="text-center min-w-[64px]">
        <div className="text-2xl font-bold text-store-brown">{count}</div>
        <div className="text-xs text-store-brown-light">≈ {lbs} lbs</div>
      </div>
      <button
        type="button"
        onClick={() => onChange(count + 1)}
        className="w-11 h-11 rounded-xl bg-store-tan text-store-brown text-xl font-bold flex items-center justify-center hover:bg-store-green hover:text-white transition-colors active:scale-95"
      >
        +
      </button>
    </div>
  )
}
