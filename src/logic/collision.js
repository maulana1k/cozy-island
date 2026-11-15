// Colliders are circles {x, z, r} or boxes {x, z, hw, hd, rot} (half width, half depth, rotation about y).

function pushFromCircle(p, radius, c) {
  const dx = p.x - c.x, dz = p.z - c.z;
  const min = c.r + radius;
  const d = Math.hypot(dx, dz);
  if (d >= min) return;
  if (d < 1e-6) { p.x = c.x + min; return; } // dead centre: pick a direction
  p.x = c.x + (dx / d) * min;
  p.z = c.z + (dz / d) * min;
}

function pushFromBox(p, radius, b) {
  const cos = Math.cos(b.rot), sin = Math.sin(b.rot);
  const wx = p.x - b.x, wz = p.z - b.z;
  let lx = wx * cos - wz * sin, lz = wx * sin + wz * cos;
  const cx = Math.max(-b.hw, Math.min(b.hw, lx)), cz = Math.max(-b.hd, Math.min(b.hd, lz));
  const dx = lx - cx, dz = lz - cz;
  const d = Math.hypot(dx, dz);
  if (d >= radius) return;
  if (d > 1e-6) {
    // Outside the box but within reach of an edge or corner.
    lx = cx + (dx / d) * radius;
    lz = cz + (dz / d) * radius;
  } else {
    // Inside: leave through the nearest face.
    const toX = b.hw - Math.abs(lx), toZ = b.hd - Math.abs(lz);
    if (toX < toZ) lx = (lx >= 0 ? 1 : -1) * (b.hw + radius);
    else lz = (lz >= 0 ? 1 : -1) * (b.hd + radius);
  }
  p.x = b.x + lx * cos + lz * sin;
  p.z = b.z - lx * sin + lz * cos;
}

// Returns `pos` moved out of every collider it overlaps. Returns the same values when clear.
export function resolveCollisions(pos, radius, colliders) {
  const p = { x: pos.x, z: pos.z };
  for (let pass = 0; pass < 3; pass++) {
    const bx = p.x, bz = p.z;
    for (const c of colliders) {
      if (c.r !== undefined) pushFromCircle(p, radius, c);
      else pushFromBox(p, radius, c);
    }
    if (p.x === bx && p.z === bz) break;
  }
  return p;
}
