// A bare stage for looking at one model on its own, away from the game.
// /kit.html?kit=ferry&fn=buildFerry&dist=12&h=5&a=0.6&look=1.5&night=0&mode=walk&speed=1
// `kit` is a file in src/kit/, `fn` one of its exported builders. /kit.html?townkit is the modern town kit's lineup
// (kit=town&fn=townLineup, framed wide; add fn=townStreet, townCivic or townProps for one scene). A builder returns a THREE.Group, or
// { group, animate(elapsed, opts) } / { group, update(dt, elapsed) }. The tab title shows draw calls and triangles.
import * as THREE from 'three';

const q = new URLSearchParams(location.search), num = (k, d) => (q.has(k) ? Number(q.get(k)) : d);
const town = q.has('townkit'); // the town kit: a wide stage
if (town) { if (!q.has('kit')) q.set('kit', 'town'); if (!q.has('fn')) q.set('fn', 'townLineup'); }
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.toneMapping = THREE.NeutralToneMapping;
const scene = new THREE.Scene(), night = num('night', 0);
scene.background = new THREE.Color(night ? 0x0e142c : 0xbfe3f2);
const sun = new THREE.DirectionalLight(night ? 0x8fa4e6 : 0xfff2dc, night ? 0.25 : 2.2); sun.position.set(14, 22, 9); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); const sc = sun.shadow.camera; const SR = town ? 60 : 25; sc.left = sc.bottom = -SR; sc.right = sc.top = SR; sc.far = town ? 160 : 80; if (town) { sun.position.set(30, 50, 22); sun.shadow.mapSize.set(4096, 4096); }
scene.add(sun, new THREE.HemisphereLight(night ? 0x56669f : 0xdff1ff, night ? 0x1a1f33 : 0xe6c56f, night ? 0.35 : 1.1));
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: q.get('ground') === 'water' ? 0x8cc3d2 : 0xe6c56f, roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
// A 1.05 m scout-sized post for scale.
const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.05, 0.2), new THREE.MeshStandardMaterial({ color: 0xf2785a })); post.position.set(num('postx', -2), 0.525, num('postz', 2)); post.castShadow = true; scene.add(post);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 500);
const dist = num('dist', town ? 62 : 8), h = num('h', town ? 34 : 3), a = num('a', 0.6), look = num('look', town ? 2 : 1);
camera.position.set(Math.sin(a) * dist, h, Math.cos(a) * dist); camera.lookAt(0, look, 0);

const mod = await import(`./${q.get('kit')}.js`);
const made = mod[q.get('fn')](), group = made.isObject3D ? made : made.group;
scene.add(group);
const opts = { mode: q.get('mode') || undefined, speed: num('speed', 0), night };
let last = performance.now(), elapsed = num('t0', 0);
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now; elapsed += dt;
  if (made.animate) made.animate(elapsed, opts);
  if (made.update) made.update(dt, elapsed, opts);
  renderer.render(scene, camera);
  document.title = JSON.stringify({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles });
}
requestAnimationFrame(frame);
window.__kit = { scene, camera, made, group };
