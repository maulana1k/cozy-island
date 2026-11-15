// Keyboard and mouse state. Targets are injected so this can be tested without a browser.

const MOVE_KEYS = {
  KeyW: [0, 1], ArrowUp: [0, 1],
  KeyS: [0, -1], ArrowDown: [0, -1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

export function createInput(keyTarget, pointerTarget) {
  const held = new Set();
  let hop = false, interact = false, mute = false, sit = false;
  let dragging = false, lookX = 0, lookY = 0, zoom = 0;
  let anyKey = false, freeLook = false;

  keyTarget.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    anyKey = true;
    if (e.code in MOVE_KEYS || e.code === 'Space') e.preventDefault?.();
    if (e.repeat) return;
    held.add(e.code);
    if (e.code === 'Space') hop = true;
    if (e.code === 'KeyE') interact = true;
    if (e.code === 'KeyM') mute = true;
    if (e.code === 'KeyX') sit = true;
  });
  keyTarget.addEventListener('keyup', (e) => {
    held.delete(e.code);
    // macOS sends no keyup for other keys while Cmd is down, so releasing Cmd drops everything.
    if (e.code === 'MetaLeft' || e.code === 'MetaRight' || e.key === 'Meta') held.clear();
  });
  // A key held while the window loses focus never sends keyup, so drop everything.
  keyTarget.addEventListener('blur', () => { held.clear(); dragging = false; });

  // Capturing the pointer keeps a drag alive when the cursor slides over a button or off the picture.
  pointerTarget.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    try { e.target?.setPointerCapture?.(e.pointerId); } catch { /* not every target can capture */ }
  });
  const stopDrag = () => { dragging = false; };
  pointerTarget.addEventListener('pointerup', stopDrag);
  pointerTarget.addEventListener('pointercancel', stopDrag);
  pointerTarget.addEventListener('dragstart', (e) => { e.preventDefault?.(); });
  pointerTarget.addEventListener('pointermove', (e) => {
    // In free look the mouse turns the camera without any button held.
    if (!dragging && !freeLook) return;
    lookX += e.movementX || 0;
    lookY += e.movementY || 0;
  });
  pointerTarget.addEventListener('contextmenu', (e) => { e.preventDefault?.(); });
  pointerTarget.addEventListener('wheel', (e) => { zoom += e.deltaY || 0; e.preventDefault?.(); }, { passive: false });

  const take = (get, reset) => () => { const v = get(); reset(); return v; };

  return {
    get move() {
      let x = 0, z = 0;
      for (const code of held) { const m = MOVE_KEYS[code]; if (m) { x += m[0]; z += m[1]; } }
      const len = Math.hypot(x, z);
      return len > 0 ? { x: x / len, z: z / len } : { x: 0, z: 0 };
    },
    get run() { return held.has('ShiftLeft') || held.has('ShiftRight'); },
    get anyKeyPressed() { return anyKey; },
    // Turned on while the mouse is captured for free look.
    setFreeLook(on) { freeLook = !!on; },
    consumeHop: take(() => hop, () => { hop = false; }),
    consumeInteract: take(() => interact, () => { interact = false; }),
    consumeMute: take(() => mute, () => { mute = false; }),
    consumeSit: take(() => sit, () => { sit = false; }),
    consumeLook: take(() => ({ dx: lookX, dy: lookY }), () => { lookX = 0; lookY = 0; }),
    consumeZoom: take(() => zoom, () => { zoom = 0; }),
  };
}
