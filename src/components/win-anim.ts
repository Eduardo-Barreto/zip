// Staggered entrance for win-overlay children (win-element keyframes live in
// the global CSS). Lives outside the component files so Fast Refresh can
// preserve their state (react-doctor/only-export-components).
export function el(delay: number): React.CSSProperties {
  return { animation: `win-element 420ms cubic-bezier(0.23, 1, 0.32, 1) ${delay}ms both` }
}
