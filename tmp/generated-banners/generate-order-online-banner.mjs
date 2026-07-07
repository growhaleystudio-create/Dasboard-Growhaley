import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Resvg } from '@resvg/resvg-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const width = 1600;
const height = 600;
const orange = '#FF7A2F';
const orangeDark = '#D76A22';
const teal = '#0A9B8E';
const blush = '#FF8FA7';
const line = '#262626';
const gray0 = '#FAFAFA';
const gray1 = '#F2F2F2';
const gray2 = '#E3E3E3';
const gray3 = '#CDCED3';
const gray4 = '#B8BAC0';
const shadow = 'rgba(0, 0, 0, 0.1)';

function panelBackground(x, y, w, h) {
  return `
    <g opacity="0.9">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="36" fill="${gray1}" transform="rotate(-4 ${x + w / 2} ${y + h / 2})" />
      <rect x="${x + 26}" y="${y + 22}" width="${w - 40}" height="${h - 34}" rx="32" fill="white" opacity="0.66" />
    </g>
  `;
}

function plant(x, y, scale = 1) {
  return `
    <g transform="translate(${x} ${y}) scale(${scale})">
      <ellipse cx="44" cy="98" rx="32" ry="10" fill="${gray2}" />
      <path d="M24 90 H64 L60 124 H28 Z" fill="${gray3}" stroke="${gray4}" stroke-width="2" />
      <path d="M42 90 V44" stroke="${gray4}" stroke-width="3" stroke-linecap="round" />
      <path d="M42 58 C24 42, 16 24, 26 10 C44 18, 48 40, 42 58 Z" fill="white" stroke="${gray3}" stroke-width="2" />
      <path d="M42 62 C60 48, 68 30, 58 12 C40 22, 36 42, 42 62 Z" fill="white" stroke="${gray3}" stroke-width="2" />
      <path d="M42 70 C24 62, 14 52, 18 34 C34 38, 42 50, 42 70 Z" fill="white" stroke="${gray3}" stroke-width="2" />
    </g>
  `;
}

function storefront(x, y, scale = 1) {
  return `
    <g transform="translate(${x} ${y}) scale(${scale})" opacity="0.45">
      <rect x="0" y="28" width="220" height="146" rx="12" fill="${gray1}" stroke="${gray2}" stroke-width="2" />
      <rect x="12" y="0" width="196" height="32" rx="10" fill="${gray3}" />
      <path d="M18 0 H44 L50 32 H24 Z M60 0 H86 L90 32 H66 Z M102 0 H128 L132 32 H108 Z M144 0 H170 L176 32 H150 Z" fill="white" opacity="0.88" />
      <rect x="26" y="66" width="90" height="74" rx="8" fill="white" />
      <rect x="132" y="56" width="54" height="84" rx="8" fill="white" />
      <path d="M124 112 H188" stroke="${gray2}" stroke-width="6" stroke-linecap="round" />
    </g>
  `;
}

function homeInterior(x, y, scale = 1) {
  return `
    <g transform="translate(${x} ${y}) scale(${scale})" opacity="0.42">
      <rect x="0" y="0" width="250" height="160" rx="12" fill="none" stroke="${gray2}" stroke-width="5" />
      <rect x="24" y="20" width="66" height="50" rx="4" fill="white" stroke="${gray2}" stroke-width="4" />
      <path d="M118 122 H210" stroke="${gray2}" stroke-width="16" stroke-linecap="round" />
      <path d="M128 122 V150 H196 V122" stroke="${gray2}" stroke-width="8" fill="none" stroke-linecap="round" />
      <rect x="184" y="28" width="42" height="10" rx="5" fill="${gray2}" />
      <rect x="176" y="40" width="58" height="8" rx="4" fill="${gray2}" />
      <path d="M188 0 C202 24, 196 32, 182 42 C170 34, 166 24, 178 0 Z" fill="${gray2}" />
    </g>
  `;
}

function speedLines(cx, cy) {
  return `
    <g stroke="${orange}" stroke-width="6" stroke-linecap="round">
      <path d="M${cx - 112} ${cy - 70} L${cx - 138} ${cy - 102}" />
      <path d="M${cx - 86} ${cy - 90} L${cx - 94} ${cy - 132}" />
      <path d="M${cx - 48} ${cy - 92} L${cx - 24} ${cy - 132}" />
      <path d="M${cx - 128} ${cy - 18} L${cx - 170} ${cy - 26}" />
    </g>
  `;
}

function card(cx, cy) {
  return `
    <g transform="translate(${cx} ${cy}) rotate(-18)">
      <rect x="-34" y="-20" width="68" height="40" rx="10" fill="#6CC9F4" stroke="#259FD7" stroke-width="3" />
      <rect x="-12" y="-6" width="20" height="14" rx="4" fill="white" opacity="0.88" />
      <path d="M-24 -2 L-20 8 M-8 -8 L-4 2 M10 -10 L14 0" stroke="#5B626E" stroke-width="3" stroke-linecap="round" />
    </g>
  `;
}

function receipt(cx, cy) {
  return `
    <g transform="translate(${cx} ${cy}) rotate(-10)">
      <rect x="-34" y="-50" width="68" height="100" rx="12" fill="white" stroke="${gray4}" stroke-width="3" />
      <path d="M-16 -24 H16 M-20 -4 H18 M-16 16 H12" stroke="${gray3}" stroke-width="4" stroke-linecap="round" />
      <circle cx="-16" cy="-32" r="4" fill="${gray3}" />
      <path d="M-12 50 L-4 42 L4 50 L12 42 L20 50" fill="none" stroke="${gray4}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
    </g>
  `;
}

function phone(cx, cy, scale = 1, angle = -12) {
  return `
    <g transform="translate(${cx} ${cy}) rotate(${angle}) scale(${scale})">
      <rect x="-34" y="-64" width="68" height="128" rx="14" fill="#2E2E2E" />
      <rect x="-28" y="-56" width="56" height="112" rx="10" fill="white" />
      <rect x="-10" y="-50" width="20" height="4" rx="2" fill="${gray3}" />
      <circle cx="0" cy="42" r="4" fill="${gray2}" />
      <rect x="-20" y="-26" width="40" height="26" rx="6" fill="${gray1}" />
      <circle cx="-4" cy="-14" r="10" fill="${gray3}" />
      <rect x="-18" y="2" width="36" height="6" rx="3" fill="${gray3}" />
      <rect x="-18" y="14" width="30" height="6" rx="3" fill="${gray3}" />
      <rect x="-18" y="28" width="40" height="10" rx="5" fill="${orange}" />
    </g>
  `;
}

function face(cx, cy, wink = false) {
  const leftEye = wink
    ? `<path d="M${cx - 18} ${cy - 4} Q ${cx - 8} ${cy - 14} ${cx + 2} ${cy - 4}" stroke="${line}" stroke-width="4" fill="none" stroke-linecap="round" />`
    : `<circle cx="${cx - 12}" cy="${cy - 8}" r="5.2" fill="${line}" />`;
  const rightEye = `<circle cx="${cx + 18}" cy="${cy - 8}" r="5.2" fill="${line}" />`;
  return `
    <g>
      <ellipse cx="${cx - 34}" cy="${cy + 10}" rx="11" ry="6" fill="${blush}" />
      <ellipse cx="${cx + 34}" cy="${cy + 10}" rx="11" ry="6" fill="${blush}" />
      ${leftEye}
      ${rightEye}
      <path d="M${cx - 22} ${cy - 26} Q ${cx - 10} ${cy - 34} ${cx + 2} ${cy - 24}" stroke="${line}" stroke-width="4" fill="none" stroke-linecap="round" />
      <path d="M${cx + 8} ${cy - 32} Q ${cx + 20} ${cy - 38} ${cx + 30} ${cy - 26}" stroke="${line}" stroke-width="4" fill="none" stroke-linecap="round" />
      <path d="M${cx} ${cy - 2} Q ${cx + 7} ${cy + 10} ${cx - 2} ${cy + 16}" stroke="${line}" stroke-width="4" fill="none" stroke-linecap="round" />
      <path d="M${cx - 12} ${cy + 30} Q ${cx + 8} ${cy + 44} ${cx + 26} ${cy + 18}" stroke="${line}" stroke-width="4" fill="none" stroke-linecap="round" />
    </g>
  `;
}

function body(baseX, baseY, scale = 1) {
  return `
    <g transform="translate(${baseX} ${baseY}) scale(${scale})">
      <path d="M100 126 C70 98, 56 52, 88 20 C120 -4, 180 -2, 214 30 C242 56, 250 102, 224 134 C202 160, 124 162, 100 126 Z" fill="${orange}" />
      <path d="M108 114 C116 54, 148 20, 176 18 C142 8, 108 22, 88 48 C74 68, 72 94, 82 118 Z" fill="${teal}" />
      <ellipse cx="156" cy="88" rx="62" ry="60" fill="#FFE7D4" />
      ${face(156, 88, true)}
      <path d="M114 142 C136 156, 180 156, 206 136" stroke="#FF9A4B" stroke-width="8" fill="none" stroke-linecap="round" />
      <path d="M118 160 C144 174, 184 174, 210 156" stroke="#FF9A4B" stroke-width="8" fill="none" stroke-linecap="round" />
      <path d="M98 174 C118 190, 176 194, 224 164" stroke="#FF9A4B" stroke-width="7" fill="none" stroke-linecap="round" />
      <path d="M88 170 C62 202, 54 252, 54 332 V462 H246 V296 C246 244, 228 208, 198 176" fill="${orange}" />
      <path d="M96 214 C70 246, 48 272, 16 288 C6 292, -2 286, 4 274 C28 234, 46 210, 74 188" fill="${orange}" />
      <path d="M246 234 C274 250, 296 264, 320 290 C328 298, 334 310, 330 320 C324 332, 308 328, 294 314 C272 294, 256 280, 232 270" fill="${orange}" />
      <path d="M26 290 C10 288, 4 304, 12 318 C20 334, 34 344, 46 336 C54 330, 54 314, 48 302" fill="#FFE7D4" />
      <circle cx="160" cy="310" r="5" fill="${orangeDark}" />
      <circle cx="160" cy="364" r="5" fill="${orangeDark}" />
      <circle cx="160" cy="418" r="5" fill="${orangeDark}" />
      <path d="M216 462 C212 398, 228 338, 272 298" stroke="${orangeDark}" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.9" />
    </g>
  `;
}

function heroScene() {
  return `
    <g>
      ${panelBackground(120, 92, 540, 400)}
      ${homeInterior(228, 162, 1.25)}
      ${plant(116, 390, 1.1)}
      ${body(250, 52, 0.9)}
      ${phone(435, 312, 1.15, -10)}
      ${speedLines(440, 270)}
      ${card(395, 134)}
      ${receipt(488, 142)}
    </g>
  `;
}

function smallCharacter(x, y, scale = 1) {
  return `
    <g transform="translate(${x} ${y}) scale(${scale})">
      <path d="M38 52 C18 34, 10 0, 34 -18 C58 -34, 102 -34, 126 -8 C144 10, 150 40, 130 60 C112 78, 56 76, 38 52 Z" fill="${orange}" />
      <path d="M46 44 C52 0, 80 -22, 98 -22 C72 -30, 44 -18, 30 2 C20 16, 20 32, 28 48 Z" fill="${teal}" />
      <ellipse cx="82" cy="22" rx="40" ry="38" fill="#FFE7D4" />
      ${face(82, 20, false)}
    </g>
  `;
}

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none">
  <rect width="${width}" height="${height}" fill="${gray0}" />
  <circle cx="1540" cy="90" r="120" fill="white" opacity="0.6" />
  <circle cx="70" cy="80" r="70" fill="white" opacity="0.7" />

  ${heroScene()}

  <g transform="translate(850 108)">
    <text x="0" y="0" font-family="Arial, Helvetica, sans-serif" font-size="68" font-weight="800" fill="#1E1E1E">Order online jadi lebih siap</text>
    <text x="0" y="62" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="500" fill="#666A73">Kelola pemesanan, data pelanggan, dan transaksi dari HP dengan tampilan yang ramah dan mudah dipahami.</text>

    <g transform="translate(0 114)">
      <rect x="0" y="0" width="246" height="62" rx="31" fill="${orange}" />
      <text x="34" y="40" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" fill="white">Mulai Jualan Online</text>
    </g>

    <g transform="translate(284 120)">
      <rect x="0" y="0" width="182" height="48" rx="24" fill="white" stroke="${gray2}" stroke-width="2" />
      <text x="28" y="31" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="#4D5562">Order via mobile</text>
    </g>

    <g transform="translate(0 232)">
      <rect x="0" y="0" width="640" height="184" rx="28" fill="white" stroke="${gray2}" stroke-width="2" />
      <g transform="translate(28 32)">
        <rect x="0" y="0" width="180" height="120" rx="20" fill="#FFF4EC" />
        <path d="M40 56 H140" stroke="${orange}" stroke-width="12" stroke-linecap="round" />
        <path d="M40 84 H112" stroke="#F3B286" stroke-width="12" stroke-linecap="round" />
        <path d="M40 112 H126" stroke="#F7D3BE" stroke-width="12" stroke-linecap="round" />
      </g>
      <g transform="translate(236 40)">
        <circle cx="18" cy="18" r="18" fill="#6CC9F4" />
        <text x="48" y="26" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700" fill="#232323">Terima pesanan lebih cepat</text>
        <circle cx="18" cy="72" r="18" fill="#92D36E" />
        <text x="48" y="80" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700" fill="#232323">Pantau status dari satu layar</text>
        <circle cx="18" cy="126" r="18" fill="#FFC95A" />
        <text x="48" y="134" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700" fill="#232323">Cocok untuk UMKM dan toko lokal</text>
      </g>
    </g>
  </g>

  <g transform="translate(102 48)">
    <ellipse cx="0" cy="46" rx="84" ry="42" fill="white" />
    <path d="M54 70 L78 98 L82 62" fill="white" />
    <text x="-42" y="56" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="800" fill="#111111">Siap!</text>
  </g>

  <g opacity="0.24">
    ${storefront(1180, 76, 1.05)}
    ${smallCharacter(1250, 164, 0.75)}
  </g>
</svg>
`;

const png = new Resvg(svg, {
  fitTo: { mode: 'width', value: width },
  background: 'white',
}).render().asPng();

const svgPath = path.join(__dirname, 'banner-order-online-web.svg');
const pngPath = path.join(__dirname, 'banner-order-online-web.png');

await writeFile(svgPath, svg, 'utf8');
await writeFile(pngPath, png);

console.log(JSON.stringify({ svgPath, pngPath }, null, 2));
