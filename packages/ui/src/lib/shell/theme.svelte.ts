const STORAGE_KEY = "muleta.theme"
const DEFAULT: Theme = "muleta-dark"

export type Theme = "muleta-dark" | "muleta-light"

function readInitial(): Theme {
  if (typeof window === "undefined") return DEFAULT
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored === "muleta-light" || stored === "muleta-dark" ? stored : DEFAULT
}

let current = $state<Theme>(readInitial())

export const theme = {
  get value() {
    return current
  },
  set(next: Theme) {
    current = next
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", next)
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, next)
    }
  },
  toggle() {
    this.set(current === "muleta-dark" ? "muleta-light" : "muleta-dark")
  },
}
