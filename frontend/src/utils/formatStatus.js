// Human-readable Title Case for status/label values stored lowercase and/or
// hyphenated in the database (e.g. 'in-progress' -> 'In Progress'). Database
// values are left as-is — this only affects what's displayed.
export function formatStatus(status) {
  if (!status) return 'Unknown';
  return status
    .toString()
    .replace(/[-_]/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
