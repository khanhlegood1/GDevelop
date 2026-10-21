/* Render GON SVG masters to PNG with resvg.
   Setup once:  npm --prefix tools install
   Run:         node tools/render_pngs.js .        (from branding/GON-GameOfNurture/) */
const fs = require('fs'), path = require('path');
let Resvg;
try { ({ Resvg } = require('@resvg/resvg-js')); }
catch { ({ Resvg } = require('/tmp/resvg/node_modules/@resvg/resvg-js')); }
const root = process.argv[2] || '.';
function render(svgFile, outFile, width) {
  const svg = fs.readFileSync(svgFile);
  const opts = width ? { fitTo: { mode: 'width', value: width } } : {};
  const r = new Resvg(svg, opts);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, r.render().asPng());
  console.log('png', outFile);
}
for (const f of fs.readdirSync(path.join(root, '01-Logo/svg')).filter(x => x.endsWith('.svg')).sort())
  render(path.join(root, '01-Logo/svg', f), path.join(root, '01-Logo/png', f.replace('.svg', '@512.png')), 512);
for (const f of fs.readdirSync(path.join(root, '01-Logo/exploration/svg')).filter(x => x.endsWith('.svg')).sort())
  render(path.join(root, '01-Logo/exploration/svg', f), path.join(root, '01-Logo/exploration/png', f.replace('.svg', '@640.png')), 640);
/* multi-size app / favicon set */
for (const [name, sizes] of [['gon-icon', [1024, 256, 128, 64, 32]], ['gon-app-icon', [1024, 512, 192, 180]], ['gon-app-icon-green', [1024]], ['gon-favicon', [64, 32, 16]]])
  for (const s of sizes)
    render(path.join(root, '01-Logo/svg', name + '.svg'), path.join(root, '01-Logo/png', `${name}@${s}.png`), s);
for (const f of fs.readdirSync(path.join(root, '04-Templates/svg')).filter(x => x.endsWith('.svg')).sort())
  render(path.join(root, '04-Templates/svg', f), path.join(root, '04-Templates/png', f.replace('.svg', '.png')), null);
