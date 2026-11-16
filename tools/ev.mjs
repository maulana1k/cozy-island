// Loads the game with a query string, optionally runs JS, takes a screenshot, then prints the value of an expression.
// node tools/ev.mjs "<query>" "<expression to print>" [waitMs] [shot.jpg] ["<js run before the shot>"]
// e.g. node tools/ev.mjs "play&t=0.45&x=92&z=-42&freeze" "document.title" 6000 /tmp/a.jpg
// Set PORT=9xxx when several run at once. The browser is always closed afterwards.
import { openBrowser } from './browser.mjs';
const [query, expr = '1', wait = '6000', file, before] = process.argv.slice(2);
const b = await openBrowser();
await b.send('Page.navigate', { url: `http://localhost:5173/?${query}` }); await b.sleep(Number(wait));
if (before) { await b.evaluate(before); await b.sleep(2500); }
if (file) await b.shot(file);
console.log(JSON.stringify(await b.evaluate(expr), null, 1));
if (b.errors.length) console.log('PAGE ERRORS: ' + b.errors.join(' | ').slice(0, 800));
b.close(); process.exit(0);
