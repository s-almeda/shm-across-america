const KEY = "shm.comment.identity";

/* Inks that stay readable on green and yellow paper. */
const INKS = [
  "#1f3a93", "#7d2f8e", "#b03030", "#1d6b3a",
  "#8a4b00", "#2c5f7a", "#6b2d5b", "#3a4a1f",
];

export function randomInk() {
  return INKS[Math.floor(Math.random() * INKS.length)];
}

/* Private windows and blocked site data make localStorage throw on access,
   not just return null -- so every call is wrapped. */
export function loadIdentity() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const { name, color } = JSON.parse(raw);
    return { name: typeof name === "string" ? name : "", color: color || randomInk() };
  } catch {
    return null;
  }
}

export function saveIdentity({ name, color }) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ name, color }));
  } catch {
    // nothing to do -- they just retype their name next time
  }
}
