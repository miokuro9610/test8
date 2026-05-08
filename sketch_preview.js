const SIZE = 1080;
const BG_R = 0;
const BG_G = 80;
const BG_B = 255;

const TEXT_SIZE = 720;
const TEXT_Y = SIZE / 2 - 60;

let holes = [];

let lastSpawnX = 0;
let lastSpawnY = 0;
let framesSinceSpawn = 0;
let hasLastSpawn = false;

let prevMouseOverA = false;

const SPAWN_DIST_MIN = 40;
const SPAWN_FRAMES_MIN = 15;
const SPAWN_MOVE_MIN = 12;

const RADIUS_LERP = 0.02;
const TARGET_TO_MAX_LERP = 0.012;
const TARGET_SHRINK_LERP = 0.018;

function setup() {
  createCanvas(SIZE, SIZE);
  pixelDensity(1);
}

function draw() {
  background(BG_R, BG_G, BG_B);

  const isOverA = isMouseOverA();

  if (!isOverA) {
    for (const h of holes) {
      h.phase = "shrink";
    }
    hasLastSpawn = false;
    framesSinceSpawn = 0;
  } else {
    trySpawnHole(isOverA);
  }

  updateHoles();

  prevMouseOverA = isOverA;

  drawWhiteA();

  for (const h of holes) {
    drawOrganicHole(h);
  }
}

function trySpawnHole(isOverA) {
  if (!isOverA) {
    return;
  }

  if (holes.length === 0) {
    pushHole(mouseX, mouseY);
    return;
  }

  const d = hasLastSpawn ? dist(mouseX, mouseY, lastSpawnX, lastSpawnY) : 1e9;
  framesSinceSpawn++;

  const byDistance = d >= SPAWN_DIST_MIN;
  const byInterval = framesSinceSpawn >= SPAWN_FRAMES_MIN && d >= SPAWN_MOVE_MIN;
  const firstOnA = !prevMouseOverA;

  if (firstOnA || byDistance || byInterval) {
    pushHole(mouseX, mouseY);
  }
}

function pushHole(x, y) {
  holes.push({
    x,
    y,
    radius: 1,
    targetRadius: 1,
    maxR: random(120, 180),
    phase: "grow",
    life: 0,
    seed: random(1000, 9999)
  });
  lastSpawnX = x;
  lastSpawnY = y;
  framesSinceSpawn = 0;
  hasLastSpawn = true;
}

function updateHoles() {
  for (let i = holes.length - 1; i >= 0; i--) {
    const h = holes[i];
    h.life += 1;

    if (h.phase === "grow") {
      h.targetRadius = lerp(h.targetRadius, h.maxR, TARGET_TO_MAX_LERP);
      if (h.targetRadius >= h.maxR - 0.75) {
        h.phase = "shrink";
      }
    } else {
      h.targetRadius = lerp(h.targetRadius, 0, TARGET_SHRINK_LERP);
    }

    h.radius = lerp(h.radius, h.targetRadius, RADIUS_LERP);

    if (h.radius < 0.45 && h.targetRadius < 2) {
      holes.splice(i, 1);
    }
  }
}

function configureAText() {
  textAlign(CENTER, CENTER);
  textFont("Arial Black");
  textStyle(NORMAL);
  textSize(TEXT_SIZE);
}

function isMouseOverA() {
  if (mouseX < 0 || mouseX > width || mouseY < 0 || mouseY > height) {
    return false;
  }
  configureAText();
  const cx = SIZE / 2;
  const cy = TEXT_Y;
  const w = textWidth("A") + 28;
  const h = textAscent() + textDescent() + 28;
  return abs(mouseX - cx) <= w / 2 && abs(mouseY - cy) <= h / 2;
}

function drawWhiteA() {
  fill(255);
  noStroke();
  configureAText();
  drawingContext.font = `${TEXT_SIZE}px "Arial Black", "Helvetica Neue", Helvetica, sans-serif`;
  text("A", SIZE / 2, TEXT_Y);
}

function drawOrganicHole(hole) {
  const r = hole.radius;
  if (r < 0.5) {
    return;
  }

  fill(BG_R, BG_G, BG_B);
  noStroke();
  push();
  translate(hole.x, hole.y);
  beginShape();
  const seg = 72;
  const s = hole.seed * 0.001;
  for (let i = 0; i <= seg; i++) {
    const a = TWO_PI * (i / seg);
    const nx = cos(a) * 0.85 + s + 12.3;
    const ny = sin(a) * 0.85 + s * 1.17 + 8.7;
    const n = noise(nx, ny);
    const rr = r * (0.87 + 0.13 * n);
    vertex(cos(a) * rr, sin(a) * rr);
  }
  endShape(CLOSE);
  pop();
}
