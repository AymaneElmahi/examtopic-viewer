const key = f => `et-pos-${f}`;

export function saveProgress(filename, idx) {
  if (!filename) return;
  if (idx <= 0) {
    localStorage.removeItem(key(filename));
  } else {
    localStorage.setItem(key(filename), String(idx));
  }
}

export function loadProgress(filename) {
  const v = localStorage.getItem(key(filename));
  return v ? parseInt(v, 10) : 0;
}

export function clearProgress(filename) {
  localStorage.removeItem(key(filename));
}
