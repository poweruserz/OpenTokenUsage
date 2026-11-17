/** Flat Windows colors (no gradients). */
const COLORS = ["#0078d4", "#ffb900", "#e74856", "#00cc6a", "#ff8c00", "#00b7c3"]
const LAYER_MS = 3_000

/**
 * Party mode (three clicks on the logo): confetti falls over the panel for a moment, then is
 * removed. Nothing under "reduce motion" (Windows' "Animation effects" off).
 */
export function partyConfetti(pieces = 80): void {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
  const layer = document.createElement("div")
  layer.setAttribute("aria-hidden", "true")
  layer.className = "party-layer"
  for (let i = 0; i < pieces; i++) {
    const piece = document.createElement("span")
    piece.className = "party-piece"
    piece.style.left = `${Math.random() * 100}%`
    piece.style.background = COLORS[i % COLORS.length]
    piece.style.animationDelay = `${Math.round(Math.random() * 400)}ms`
    piece.style.animationDuration = `${1400 + Math.round(Math.random() * 1000)}ms`
    piece.style.setProperty("--drift", `${Math.round((Math.random() - 0.5) * 140)}px`)
    piece.style.setProperty("--spin", `${Math.round((Math.random() - 0.5) * 1440)}deg`)
    layer.appendChild(piece)
  }
  document.body.appendChild(layer)
  window.setTimeout(() => layer.remove(), LAYER_MS)
}
