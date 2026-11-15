import * as THREE from 'three';

const HINT_TEXT = 'WASD move · Shift run · Space hop · E interact · M mute · Esc menu';

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
  hintEl.textContent = HINT_TEXT;
  let hintTimer = null, currentPrompt = null;

  const textures = {};
  const emotes = [];

  // A small bobbing marker over whatever E would use right now.
  const marker = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.13, 0),
    new THREE.MeshBasicMaterial({ color: 0xfff6c9, transparent: true, opacity: 0.95, fog: false }),
  );
  marker.visible = false;
  scene.add(marker);
  let markerBase = 0;

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
      if (text) { promptEl.textContent = text; promptEl.style.opacity = '1'; }
      else promptEl.style.opacity = '0';
    },
    setMarker(x, y, z) {
      if (x === null) { marker.visible = false; return; }
      marker.visible = true; marker.position.set(x, y, z); markerBase = y;
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
      if (marker.visible) {
        marker.position.y = markerBase + Math.sin(elapsed * 4) * 0.07;
        marker.rotation.y = elapsed * 2;
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
