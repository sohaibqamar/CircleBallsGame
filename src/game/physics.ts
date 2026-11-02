export interface Ball {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

export const BALL_RADIUS_FRAC = 0.072;
export const FILL_AREA_RATIO = 0.64;
export const SPEED_MIN_FRAC = 0.55;
export const SPEED_MAX_FRAC = 0.95;

function pairKey(idA: number, idB: number): string {
  return idA < idB ? `${idA}:${idB}` : `${idB}:${idA}`;
}

export function ballCoverageRatio(balls: Ball[], arenaRadius: number): number {
  if (arenaRadius <= 0) return 0;
  const circleArea = Math.PI * arenaRadius * arenaRadius;
  let ballsArea = 0;
  for (const b of balls) {
    ballsArea += Math.PI * b.r * b.r;
  }
  return ballsArea / circleArea;
}

export function createInitialBalls(
  arenaRadius: number,
  ballRadius: number,
  nextId: () => number,
): Ball[] {
  const spread = Math.min(arenaRadius * 0.38, arenaRadius - ballRadius * 2.5);
  return [
    {
      id: nextId(),
      x: -spread,
      y: 0,
      vx: 0,
      vy: 0,
      r: ballRadius,
    },
    {
      id: nextId(),
      x: spread,
      y: 0,
      vx: 0,
      vy: 0,
      r: ballRadius,
    },
  ];
}

export function assignRandomVelocities(
  balls: Ball[],
  arenaRadius: number,
): void {
  const vmin = arenaRadius * SPEED_MIN_FRAC;
  const vmax = arenaRadius * SPEED_MAX_FRAC;
  for (const b of balls) {
    const angle = Math.random() * Math.PI * 2;
    const speed = vmin + Math.random() * (vmax - vmin);
    b.vx = Math.cos(angle) * speed;
    b.vy = Math.sin(angle) * speed;
  }
}

function clampSpeed(b: Ball, arenaRadius: number): void {
  const vmin = arenaRadius * SPEED_MIN_FRAC * 0.35;
  const vmax = arenaRadius * SPEED_MAX_FRAC * 1.35;
  let speed = Math.hypot(b.vx, b.vy);
  if (speed < vmin && speed > 0) {
    b.vx = (b.vx / speed) * vmin;
    b.vy = (b.vy / speed) * vmin;
    speed = vmin;
  }
  if (speed > vmax && speed > 0) {
    b.vx = (b.vx / speed) * vmax;
    b.vy = (b.vy / speed) * vmax;
  }
}

function resolveWall(b: Ball, arenaBoundary: number): void {
  const d = Math.hypot(b.x, b.y);
  const maxCenterDist = Math.max(0, arenaBoundary - b.r);
  if (d <= maxCenterDist || d === 0) {
    return;
  }
  const nx = b.x / d;
  const ny = b.y / d;
  b.x = nx * maxCenterDist;
  b.y = ny * maxCenterDist;
  const vn = b.vx * nx + b.vy * ny;
  if (vn > 0) {
    b.vx -= 2 * vn * nx;
    b.vy -= 2 * vn * ny;
  }
}

function resolveBallPair(a: Ball, b: Ball): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let dist = Math.hypot(dx, dy);
  const minDist = a.r + b.r;
  if (dist === 0) {
    dist = 0.0001;
  }
  if (dist >= minDist) {
    return;
  }
  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = minDist - dist;
  const corr = overlap / 2 + 0.01;
  a.x -= nx * corr;
  a.y -= ny * corr;
  b.x += nx * corr;
  b.y += ny * corr;

  const vnx_a = a.vx * nx + a.vy * ny;
  const vnx_b = b.vx * nx + b.vy * ny;
  const approach = vnx_b - vnx_a;
  if (approach < 0) {
    const vnx_a_new = vnx_b;
    const vnx_b_new = vnx_a;
    const vtx_a = a.vx - vnx_a * nx;
    const vty_a = a.vy - vnx_a * ny;
    const vtx_b = b.vx - vnx_b * nx;
    const vty_b = b.vy - vnx_b * ny;
    a.vx = vtx_a + vnx_a_new * nx;
    a.vy = vty_a + vnx_a_new * ny;
    b.vx = vtx_b + vnx_b_new * nx;
    b.vy = vty_b + vnx_b_new * ny;
  }
}

export interface StepResult {
  newCollisionPairs: Array<[Ball, Ball]>;
}

export function stepSimulation(
  balls: Ball[],
  arenaBoundaryRadius: number,
  dt: number,
  pairWasTouching: Record<string, boolean>,
): StepResult {
  const newCollisionPairs: Array<[Ball, Ball]> = [];

  for (const b of balls) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }

  for (const b of balls) {
    resolveWall(b, arenaBoundaryRadius);
  }

  const touchingSnapshot: Record<string, boolean> = {};

  for (let i = 0; i < balls.length; i++) {
    for (let j = i + 1; j < balls.length; j++) {
      const a = balls[i];
      const b = balls[j];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const key = pairKey(a.id, b.id);
      const touching = dist < a.r + b.r + 0.5;
      touchingSnapshot[key] = touching;
      if (touching && !pairWasTouching[key]) {
        newCollisionPairs.push([a, b]);
      }
    }
  }

  for (let iter = 0; iter < 4; iter++) {
    for (let i = 0; i < balls.length; i++) {
      for (let j = i + 1; j < balls.length; j++) {
        resolveBallPair(balls[i], balls[j]);
      }
    }
    for (const b of balls) {
      resolveWall(b, arenaBoundaryRadius);
    }
  }

  for (const b of balls) {
    clampSpeed(b, arenaBoundaryRadius);
  }

  for (const key of Object.keys(pairWasTouching)) {
    delete pairWasTouching[key];
  }
  for (const [key, v] of Object.entries(touchingSnapshot)) {
    pairWasTouching[key] = v;
  }

  return { newCollisionPairs };
}

export function trySpawnBall(
  balls: Ball[],
  arenaBoundaryRadius: number,
  ballRadius: number,
  nextId: () => number,
): Ball | null {
  const attempts = 72;
  const speedMin = arenaBoundaryRadius * SPEED_MIN_FRAC;
  const speedMax = arenaBoundaryRadius * SPEED_MAX_FRAC;
  for (let k = 0; k < attempts; k++) {
    const angle = Math.random() * Math.PI * 2;
    const maxDist = arenaBoundaryRadius - ballRadius - 1;
    const dist = Math.random() * maxDist;
    const x = Math.cos(angle) * dist;
    const y = Math.sin(angle) * dist;
    let ok = true;
    for (const b of balls) {
      const d = Math.hypot(x - b.x, y - b.y);
      if (d < b.r + ballRadius + 1) {
        ok = false;
        break;
      }
    }
    if (!ok) {
      continue;
    }
    const va = Math.random() * Math.PI * 2;
    const sp = speedMin + Math.random() * (speedMax - speedMin);
    return {
      id: nextId(),
      x,
      y,
      vx: Math.cos(va) * sp,
      vy: Math.sin(va) * sp,
      r: ballRadius,
    };
  }
  return null;
}
