export async function fetchFiles() {
  const res = await fetch('/api/files');
  if (!res.ok) throw new Error('Failed to fetch file list');
  return res.json();
}

export async function fetchQuestions(filename) {
  const res = await fetch(`/api/questions?file=${encodeURIComponent(filename)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to load questions');
  return data;
}
