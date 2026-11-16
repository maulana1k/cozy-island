// A fixed-camera picture of the real game.
// node tools/cam.mjs <out.jpg> <camx> <camy> <camz> <tx> <ty> <tz> [timeOfDay=0.45] [playerx] [playerz] [extra query]
import { openBrowser } from './browser.mjs';
const [file, cx, cy, cz, tx, ty, tz, t = '0.45', px, pz, extra = ''] = process.argv.slice(2);
const b = await openBrowser();
await b.send('Page.navigate', { url: `http://localhost:5173/?play&t=${t}&freeze&x=${px ?? tx}&z=${pz ?? tz}${extra}` }); await b.sleep(6000);
await b.evaluate(`(() => { const g = __game; g.rig.update = () => {}; setInterval(() => { g.camera.position.set(${cx}, ${cy}, ${cz}); g.camera.lookAt(${tx}, ${ty}, ${tz}); }, 16); })()`);
await b.sleep(2500); await b.shot(file);
console.log(await b.evaluate('document.title'), b.errors.length ? 'PAGE ERRORS: ' + b.errors.join(' | ').slice(0, 800) : 'no errors');
b.close(); process.exit(0);
