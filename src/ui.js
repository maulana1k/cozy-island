import * as THREE from 'three';

const HINT_KEYS = [['WASD', 'move'], ['Shift', 'walk / run'], ['Space', 'hop'], ['E', 'use'], ['X', 'sit'], ['F', 'join in'], ['C', 'free look'], ['J', 'journal'], ['Esc', 'pause']];

const MARKER_FILL = { use: '#ffffff', pickup: '#ffd04a', talk: '#9cc8f5' };
const markerTextures = {};
const markerKindOf = (kind) => (kind === 'pickup' || kind === 'find' ? 'pickup' : kind === 'villager' ? 'talk' : 'use');

// White (or tinted) rounded key cap with an "E", a dark outline, a little pointer and a soft shadow.
function markerTexture(fill) {
  if (markerTextures[fill]) return markerTextures[fill];
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const cap = () => { ctx.beginPath(); ctx.roundRect(24, 14, 80, 74, 18); ctx.moveTo(48, 86); ctx.lineTo(64, 110); ctx.lineTo(80, 86); };
  ctx.save(); ctx.filter = 'blur(4px)'; ctx.translate(0, 6); ctx.fillStyle = 'rgba(0,0,0,0.45)'; cap(); ctx.fill(); ctx.restore();
  cap(); ctx.lineJoin = 'round'; ctx.lineWidth = 9; ctx.strokeStyle = '#2b2a33'; ctx.stroke();
  ctx.fillStyle = fill; ctx.fill();
  ctx.fillStyle = '#2b2a33'; ctx.font = 'bold 52px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('E', 64, 53);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return (markerTextures[fill] = tex);
}

function drawIcon(ctx, icon) {
  ctx.save();
  ctx.translate(64, 60);
  if (icon === 'heart') {
    ctx.fillStyle = '#ff7f9c';
    ctx.beginPath();
    ctx.moveTo(0, 24);
    ctx.bezierCurveTo(-40, -4, -22, -34, 0, -14);
    ctx.bezierCurveTo(22, -34, 40, -4, 0, 24);
    ctx.fill();
  } else if (icon === 'note') {
    ctx.fillStyle = '#6aa9e0';
    ctx.beginPath(); ctx.ellipse(-8, 18, 12, 9, -0.35, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(0, -24, 6, 42);
    ctx.beginPath(); ctx.moveTo(6, -24); ctx.quadraticCurveTo(26, -18, 22, 2); ctx.quadraticCurveTo(20, -8, 6, -10); ctx.fill();
  } else if (icon === 'surprise') {
    ctx.fillStyle = '#ffb24a';
    ctx.beginPath(); ctx.roundRect(-7, -28, 14, 34, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(0, 20, 8, 0, Math.PI * 2); ctx.fill();
  } else { // star
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 12 : 28, a = -Math.PI / 2 + (i * Math.PI) / 5;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function makeIconTexture(icon) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  // A soft white speech bubble with a little tail.
  ctx.fillStyle = 'rgba(255, 252, 245, 0.96)';
  ctx.beginPath(); ctx.arc(64, 58, 50, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(48, 100); ctx.lineTo(64, 126); ctx.lineTo(80, 100); ctx.fill();
  drawIcon(ctx, icon);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createUI(scene) {
  const hintEl = document.getElementById('hint');
  const promptEl = document.getElementById('prompt');
  hintEl.innerHTML = HINT_KEYS.map(([k, v]) => `<span><kbd>${k}</kbd>${v}</span>`).join('');
  let hintTimer = null, currentPrompt = null;

  const textures = {};
  const emotes = [];

  // A key-cap badge over whatever E would use right now: faces the camera, draws over grass, fades in and out.
  const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: markerTexture(MARKER_FILL.use), transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false }));
  marker.renderOrder = 999;
  marker.visible = false;
  marker.onBeforeRender = (r, s, cam) => { markerCam = cam; };
  scene.add(marker);
  let markerBase = 0, markerCam = null, markerOn = false, markerKind = 'use';

  return {
    showHint() { hintEl.classList.remove('hidden'); },
    hideHint() { hintEl.classList.add('hidden'); },
    // Fades the hint a few seconds after the player starts pressing keys.
    hideHintSoon(seconds = 6) {
      if (hintTimer) return;
      hintTimer = setTimeout(() => hintEl.classList.add('hidden'), seconds * 1000);
    },
    setPrompt(text) {
      if (text === currentPrompt) return;
      currentPrompt = text;
      if (text) {
        // "E — ring bell" becomes a key cap followed by what it does.
        const [key, ...rest] = text.split(' — ');
        promptEl.innerHTML = `<kbd>${key}</kbd><span>${rest.join(' — ')}</span>`;
        promptEl.style.opacity = '1';
      }
      else promptEl.style.opacity = '0';
    },
    setMarker(x, y, z, kind) {
      if (x === null) { markerOn = false; return; }
      if (!markerOn && marker.material.opacity < 0.02) marker.position.set(x, y, z); // fresh appearance: no slide
      markerOn = true; marker.position.x = x; marker.position.z = z; markerBase = y;
      const k = markerKindOf(kind);
      if (k !== markerKind) { markerKind = k; marker.material.map = markerTexture(MARKER_FILL[k]); }
    },
    emote(position, icon) {
      if (!textures[icon]) textures[icon] = makeIconTexture(icon);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: textures[icon], transparent: true, depthWrite: false, fog: false }));
      sprite.position.copy(position);
      sprite.scale.setScalar(0.01);
      scene.add(sprite);
      emotes.push({ sprite, life: 0 });
    },
    update(dt, elapsed) {
      const m = marker.material;
      m.opacity += ((markerOn ? 1 : 0) - m.opacity) * (1 - Math.exp(-dt * (markerOn ? 12 : 8)));
      marker.visible = m.opacity > 0.01;
      if (marker.visible) {
        marker.position.y = markerBase + Math.sin(elapsed * 3) * 0.07;
        // Readable from afar: grows with distance, within limits, plus a slow pulse.
        const d = markerCam ? markerCam.position.distanceTo(marker.position) : 8;
        marker.scale.setScalar(Math.min(1.3, Math.max(0.55, d * 0.085)) * (1 + Math.sin(elapsed * 4.4) * 0.07) * (0.8 + 0.2 * m.opacity));
      }
      for (let i = emotes.length - 1; i >= 0; i--) {
        const e = emotes[i];
        e.life += dt;
        const t = e.life / 1.5;
        // Pop in, float up, fade out.
        const pop = Math.min(1, e.life / 0.15);
        e.sprite.scale.setScalar(0.75 * (0.4 + 0.6 * pop) * (1 + Math.sin(Math.min(1, e.life / 0.3) * Math.PI) * 0.15));
        e.sprite.position.y += dt * 0.45;
        e.sprite.material.opacity = t < 0.65 ? 1 : Math.max(0, 1 - (t - 0.65) / 0.35);
        if (t >= 1) { scene.remove(e.sprite); e.sprite.material.dispose(); emotes.splice(i, 1); }
      }
    },
  };
}
