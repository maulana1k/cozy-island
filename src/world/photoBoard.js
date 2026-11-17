// INTERNAL. Photo prints pinned on the camp notice board (src/world/areas/storyCast.js builds the board): up to four
// small paper prints from the camera's album (src/story/album.js), newest on top, each with a red pin. Rebuilt when
// the album changes. Cost: at most four small meshes (one draw each) near the board.
import * as THREE from 'three';
import { album } from '../story/album.js';

// Where prints go on the cork (board space: x across, y up; the cork face is at z 0.05), newest first.
const SLOTS = [[0.12, 1.13, 0.05], [0.56, 1.52, -0.08], [-0.3, 1.2, 0.1], [-0.6, 1.56, -0.06]];
const PAPER = new THREE.MeshStandardMaterial({ color: 0xfbf8ef, roughness: 1 });
const PIN = new THREE.MeshStandardMaterial({ color: 0xe8503a, roughness: 0.6 });
const loader = new THREE.TextureLoader();

// board: { x, z, rot } (its foot), groundAt.
export function createPhotoBoard(scene, board, groundAt) {
  const root = new THREE.Group();
  root.position.set(board.x, groundAt(board.x, board.z), board.z); root.rotation.y = board.rot;
  scene.add(root);
  const paperGeo = new THREE.PlaneGeometry(0.3, 0.26), picGeo = new THREE.PlaneGeometry(0.27, 0.2025), pinGeo = new THREE.SphereGeometry(0.018, 6, 4);
  let made = [];
  function rebuild() {
    for (const m of made) { root.remove(m); m.traverse((o) => { if (o.material && o.material.map) { o.material.map.dispose(); o.material.dispose(); } }); }
    made = [];
    // Oldest first, so the newest is drawn on top (and sits a hair further out).
    const prints = album.prints().slice(0, SLOTS.length);
    prints.slice().reverse().forEach((p, k) => {
      const i = prints.length - 1 - k, [x, y, r] = SLOTS[i];
      const g = new THREE.Group(); g.position.set(x, y, 0.07 + (SLOTS.length - i) * 0.003); g.rotation.z = r;
      const paper = new THREE.Mesh(paperGeo, PAPER);
      const tex = loader.load(p.thumb); tex.colorSpace = THREE.SRGBColorSpace;
      const pic = new THREE.Mesh(picGeo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })); pic.position.set(0, 0.015, 0.001);
      const pin = new THREE.Mesh(pinGeo, PIN); pin.position.set(0, 0.11, 0.012);
      g.add(paper, pic, pin); root.add(g); made.push(g);
    });
  }
  album.onChange(rebuild);
  rebuild();
  return { rebuild };
}
