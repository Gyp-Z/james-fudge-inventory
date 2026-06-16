// Animates its children open/closed by transitioning grid-template-rows (0fr ↔ 1fr).
// No height measuring, no layout thrash. Used to ease reminder banners in/out in the
// Shift Report so the steppers below never snap-jump under a chef's finger mid-tap.
export default function Collapsible({ open, children, className = '' }) {
  return (
    <div className={`collapsible ${open ? 'is-open' : ''} ${className}`} aria-hidden={!open}>
      <div>{children}</div>
    </div>
  )
}
