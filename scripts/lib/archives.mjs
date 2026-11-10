// Adapted from esl-likes 169aab9: scripts/lib/archives.mjs.
// Read only: source assets remain in the owner's external Unity package.
import { gunzipSync } from 'node:zlib';

export function readUnityPackage(buffer) {
  const tar = gunzipSync(buffer);
  const members = new Map();
  let longName = null;
  for (let offset = 0; offset + 512 <= tar.length;) {
    const field = (start, length) => tar.toString('utf8', offset + start, offset + start + length).replace(/\0.*$/, '');
    const name = field(0, 100);
    if (!name && !longName) break;
    const size = parseInt(field(124, 12).trim() || '0', 8);
    const type = field(156, 1);
    const data = tar.subarray(offset + 512, offset + 512 + size);
    if (type === 'L') longName = data.toString('utf8').replace(/\0.*$/, '');
    else {
      const prefix = field(345, 155);
      const member = longName ?? (prefix ? `${prefix}/${name}` : name);
      longName = null;
      if (type === '0' || type === '') members.set(member, data);
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  const assets = new Map();
  for (const [name, data] of members) {
    if (!name.endsWith('/pathname')) continue;
    const asset = members.get(`${name.slice(0, -9)}/asset`);
    if (asset) assets.set(data.toString('utf8').split('\n')[0].trim(), asset);
  }
  return assets;
}
