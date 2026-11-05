export function displayTime(timestamp) {
  if (timestamp === null || timestamp === undefined || timestamp === '') return 'Unavailable';
  const parsed = new Date(timestamp).getTime();
  const shifted = new Date(parsed + 9 * 60 * 60 * 1000);
  if (!Number.isFinite(shifted.getTime())) return 'Unavailable';
  return shifted.toISOString().replace('T', ' ').slice(0, 19);
}
