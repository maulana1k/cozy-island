// A picture of one model on the bare preview stage (kit.html).
// node tools/kitshot.mjs "<kit=farm&fn=buildGoat&dist=4&h=1.6&a=0.7&look=0.5&mode=walk>" out.jpg [waitMs]
import { openBrowser } from './browser.mjs';
const [query, file, wait = '3500'] = process.argv.slice(2);
const b = await openBrowser({ width: 1200, height: 800, scale: 1 });
await b.send('Page.navigate', { url: `http://localhost:5173/kit.html?${query}` }); await b.sleep(Number(wait));
await b.shot(file);
console.log(await b.evaluate('document.title'), b.errors.length ? 'PAGE ERRORS: ' + b.errors.join(' | ').slice(0, 800) : 'no errors');
b.close(); process.exit(0);
