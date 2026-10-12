// Sidebar collapsed/expanded, remembered per browser. Read through useSyncExternalStore so the
// server render (always expanded) and first client render agree.
const KEY = "AYUSH_SIDEBAR_COLLAPSED";
const listeners = new Set<() => void>();

export const sidebarPref = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => { listeners.delete(l); };
  },
  get: () => {
    try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
  },
  getServer: () => false,
  toggle() {
    try { localStorage.setItem(KEY, sidebarPref.get() ? "0" : "1"); } catch {}
    listeners.forEach(l => l());
  },
};
