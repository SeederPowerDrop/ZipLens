#!/usr/bin/env node
// One vector drawing, recolored by archive family. No application badge overlay.
// Renderer: sharp, resolved locally or from ZIPLENS_NODE_MODULES.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(process.env.ZIPLENS_NODE_MODULES
  ? path.join(process.env.ZIPLENS_NODE_MODULES, 'package.json') : import.meta.url);
const sharp = require('sharp');
const output = path.join(root, 'src-tauri/icons');
const palette = {
  zip: ['ZIP', '#1498C9'], '7z': ['7Z', '#8057D6'], rar: ['RAR', '#E77732'],
  tar: ['TAR', '#AD841D'], gzip: ['GZIP', '#24976C'], bzip2: ['BZIP2', '#3D65BD'],
  xz: ['XZ', '#BF4C9E'], zstd: ['ZSTD', '#148C95'], legacy: ['ALZ / EGG', '#AD5464'],
  generic: ['ARCHIVE', '#64758C'],
};

function artwork(color) {
  const lens = 'M232 478 Q512 278 792 478 Q512 678 232 478Z';
  const paper = 'M196 60H676L864 248V912Q864 960 816 960H196Q152 960 152 916V104Q152 60 196 60Z';
  const thickness = x => 100 * (1 - ((x - 512) / 280) ** 2);
  const rays = [296, 368, 440, 512, 584, 656, 728].map(x => {
    const exit = 512 + (x - 512) * 0.94;
    return `<path d="M${x} 266V${(478 - thickness(x)).toFixed(2)}L${exit.toFixed(2)} ${(478 + thickness(exit)).toFixed(2)}L512 826"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="paper" x1=".12" y1="0" x2=".92" y2="1" gradientUnits="objectBoundingBox"><stop stop-color="#FFF"/><stop offset=".6" stop-color="#FAFCFE"/><stop offset="1" stop-color="#E8EDF4"/></linearGradient>
    <linearGradient id="fold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#D5DFEA"/><stop offset=".68" stop-color="#F4F8FD"/><stop offset="1" stop-color="#FFF"/></linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${color}" stop-opacity=".22"/><stop offset=".3" stop-color="#FFF" stop-opacity=".86"/><stop offset=".62" stop-color="${color}" stop-opacity=".35"/><stop offset="1" stop-color="${color}" stop-opacity=".6"/></linearGradient>
    <radialGradient id="focus"><stop stop-color="#FFF"/><stop offset=".14" stop-color="${color}" stop-opacity=".9"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>
    <radialGradient id="wash"><stop stop-color="${color}" stop-opacity=".11"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>
    <filter id="shadow" x="-25%" y="-25%" width="150%" height="155%"><feDropShadow dx="0" dy="14" stdDeviation="12" flood-color="#101D36" flood-opacity=".22"/></filter>
    <filter id="glow" x="-25%" y="-25%" width="150%" height="150%"><feGaussianBlur stdDeviation="5"/></filter>
    <clipPath id="pageClip"><path d="${paper}"/></clipPath>
  </defs>
  <path d="${paper}" fill="url(#paper)" stroke="#CDD6E1" stroke-width="2" filter="url(#shadow)"/>
  <g clip-path="url(#pageClip)">
    <ellipse cx="512" cy="556" rx="370" ry="365" fill="url(#wash)"/>
    <path d="M676 60V209Q676 248 716 248H864" fill="url(#fold)" stroke="#C5D1DE" stroke-width="2"/>
    <path d="M684 75V205Q684 240 720 240H849" fill="none" stroke="#FFF" stroke-width="3" opacity=".92"/>
    <path d="M296 478H728L512 826Z" fill="${color}" opacity=".055"/>
    <g fill="none" stroke="${color}" stroke-width="11" stroke-linecap="round" opacity=".18" filter="url(#glow)">${rays}</g>
    <g fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity=".91">${rays}</g>
    <path d="${lens}" fill="url(#glass)" stroke="${color}" stroke-width="3.8"/>
    <path d="M247 476Q512 292 777 476" fill="none" stroke="#FFF" stroke-width="5.5" opacity=".96"/>
    <path d="M250 485Q512 661 774 485" fill="none" stroke="#FFF" stroke-width="2.4" opacity=".75"/>
    <path d="M273 475Q512 368 751 475" fill="none" stroke="#FFF" stroke-width="16" opacity=".22"/>
    <circle cx="512" cy="826" r="31" fill="url(#focus)"/>
    <circle cx="512" cy="826" r="6" fill="#FFF" stroke="${color}" stroke-width="2.5"/>
  </g>
  </svg>`;
}

function icnsChunk(type, png) {
  const header = Buffer.alloc(8);
  header.write(type, 0, 4, 'ascii'); header.writeUInt32BE(png.length + 8, 4);
  return Buffer.concat([header, png]);
}

await fs.mkdir(output, { recursive: true });
const variants = [];
for (const [family, [label, color]] of Object.entries(palette)) {
  const svg = artwork(color);
  const name = `archive-${family}`;
  await fs.writeFile(path.join(output, `${name}.svg`), svg);
  const images = new Map();
  for (const size of [16, 32, 64, 128, 256, 512, 1024]) {
    images.set(size, await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer());
  }
  await fs.writeFile(path.join(output, `${name}.png`), images.get(1024));
  // Modern PNG-backed ICNS representations, including Retina point sizes.
  const entries = [['icp4',16],['icp5',32],['icp6',64],['ic07',128],['ic08',256],
    ['ic09',512],['ic10',1024],['ic11',32],['ic12',64],['ic13',256],['ic14',512]];
  const chunks = entries.map(([type, size]) => icnsChunk(type, images.get(size)));
  const header = Buffer.alloc(8); header.write('icns');
  header.writeUInt32BE(8 + chunks.reduce((n, chunk) => n + chunk.length, 0), 4);
  await fs.writeFile(path.join(output, `${name}.icns`), Buffer.concat([header, ...chunks]));
  variants.push({ family, label, color, svg });
}

// Review sheet is separate from the transparent document icons.
const columns = 5;
const cards = variants.map(({label, svg}, index) => {
  const x = 20 + (index % columns) * 204;
  const y = 14 + Math.floor(index / columns) * 238;
  const inner = svg.replace(/<svg[^>]*>/, '').replace('</svg>', '');
  // Separate nested SVG scopes keep each icon's paint references local.
  const unique = inner.replace(/id="([^"]+)"/g, (_, id) => `id="v${index}-${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_, id) => `url(#v${index}-${id})`);
  return `<svg x="${x}" y="${y}" width="184" height="184" viewBox="0 0 1024 1024">${unique}</svg><text x="${x+92}" y="${y+207}" fill="#DFE6F0" font-family="Arial,sans-serif" font-size="17" font-weight="600" text-anchor="middle">${label}</text>`;
}).join('');
const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="1040" height="480"><rect width="1040" height="480" rx="20" fill="#18212D"/>${cards}</svg>`;
const preview = path.join(root, 'docs/screenshots/archive-icons.png');
await fs.mkdir(path.dirname(preview), { recursive: true });
await sharp(Buffer.from(sheet)).png().toFile(preview);
console.log(`Generated ${variants.length} SVG/PNG/ICNS icon families and ${preview}`);
