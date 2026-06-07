export function generateId(prefix: string = ''): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${prefix}${timestamp}${random}`;
}

export function formatDate(date?: Date): string {
  const d = date || new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export function calculateChecksum(content: string): string {
  let sum = 0;
  for (let i = 0; i < content.length; i++) {
    sum = ((sum << 5) - sum + content.charCodeAt(i)) | 0;
  }
  return Math.abs(sum).toString(16).padStart(8, '0');
}

export function isSameLocation(loc1: any, loc2: any): boolean {
  if (!loc1 || !loc2) return false;
  return (
    loc1.building === loc2.building &&
    loc1.floor === loc2.floor &&
    loc1.room === loc2.room &&
    (loc1.position || '') === (loc2.position || '')
  );
}

export function getLocationDifference(expected: any, actual: any): any {
  const diff: any = {};
  if (expected.building !== actual.building) diff.building = true;
  if (expected.floor !== actual.floor) diff.floor = true;
  if (expected.room !== actual.room) diff.room = true;
  if ((expected.position || '') !== (actual.position || '')) diff.position = true;
  return diff;
}

export function formatLocation(loc: any): string {
  if (!loc) return '';
  const parts = [loc.building, loc.floor, loc.room];
  if (loc.position) parts.push(loc.position);
  return parts.filter(Boolean).join('-');
}
