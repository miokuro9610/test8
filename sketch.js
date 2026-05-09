/**
 * メリヤス編み構造のレタリング（マスク内のみ線描画）
 * 調整は冒頭の変数ブロックを変更してください。
 */

// —— 調整用変数（指定どおり） ——————————————————————————————————
let letter = 'A';

const stitchWidth = 11;
const stitchHeight = 30;

let stitchStrokeWeight = 2.1;

/** 大きいほど編みが早く進む（段ウェーブ・1目の描画時間の両方に効く） */
const knitSpeed = 3.6;

/** 完成後の全体の揺らぎの強さ（ピクセル目安） */
const wiggleAmount = 2.4;

const textSize = 700;

/** 文字の縦位置オフセット（中央からのずれ） */
const textY = 6;

/** サンセリフの太さ・ボリューム感（マスク用ストローク。大きいほど文字が太く見える） */
const textWeightAdjust = 14;

/** 完成表示のあと、ループ先頭に戻るまでの待ちフレーム（約60≒1秒@60fps） */
const loopPause = 62;

// —— 追加の微調整 ————————————————————————————————————————————
/** 最初に背景だけを見せるフレーム数 */
const knitStartDelay = 10;

/** 格子の不規則さ（ピクセル） */
const gridIrregular = 0.85;

/** 1目の幾何の揺らぎ（noise スケール） */
const stitchNoiseAmp = 0.55;

// —— 固定 ——————————————————————————————————————————————————
const W = 1080;
const H = 1080;
const BG = [0, 0, 255];
const YARN = [255, 255, 255];

const MASK_SAMPLE_THRESHOLD = 128;
/** 1目の糸が伸びるフレーム数の基準（knitSpeed で割る） */
const STITCH_DRAW_FRAMES_BASE = 12;
/** 下の段から上へウェーブする間隔の基準フレーム（knitSpeed で割る。大きいほど完成まで長くなる） */
const ROW_WAVE_BASE = 18.5;
/** 同一段内の横方向の微細なずれ（フレーム） */
const COL_MICRO_SPREAD = 0.22;

let maskG;
/** @type {{ gx:number, gy:number, cx:number, cy:number, appearFrame:number, hasRight:boolean, seed:number }[]} */
let stitches = [];
let maxStitchGy = 0;
/** 上の段から先に描く（下の段が手前に見える） */
let drawOrder = [];
let cycleLength = 1;

function setup() {
  createCanvas(W, H);
  pixelDensity(1);
  textFont('Arial Black');

  maskG = createGraphics(W, H);
  maskG.pixelDensity(1);
  drawLetterMask();

  const marginX = stitchWidth;
  const marginY = stitchHeight;
  const set = new Set();
  maxStitchGy = 0;

  for (let gy = 0, y = marginY; y < H - marginY; gy++, y += stitchHeight) {
    for (let gx = 0, x = marginX; x < W - marginX; gx++, x += stitchWidth) {
      const cx = x + stitchWidth * 0.5;
      const cy = y + stitchHeight * 0.5;
      if (!cellInsideLetter(cx, cy, gx, gy)) continue;

      const jx = (noise(gx * 1.4 + 40, gy * 1.2) - 0.5) * gridIrregular;
      const jy = (noise(gx * 1.1, gy * 1.7 + 20) - 0.5) * gridIrregular;

      stitches.push({
        gx,
        gy,
        cx: cx + jx,
        cy: cy + jy,
        appearFrame: 0,
        hasRight: false,
        seed: noise(gx * 12.9898, gy * 78.233) * 10000,
      });
      set.add(`${gx},${gy}`);
      if (gy > maxStitchGy) maxStitchGy = gy;
    }
  }

  for (const s of stitches) {
    s.hasRight = set.has(`${s.gx + 1},${s.gy}`);
  }

  scheduleAppearances();
  cycleLength = maxAppearEnd() + loopPause;

  drawOrder = stitches.slice().sort((a, b) => {
    if (a.gy !== b.gy) return a.gy - b.gy;
    return a.gx - b.gx;
  });
}

function draw() {
  background(BG[0], BG[1], BG[2]);

  const t = frameCount % max(1, cycleLength);
  const buildEnd = cycleLength - loopPause;
  const allDone = t >= buildEnd;
  const wPhase = frameCount * 0.055;

  stroke(YARN[0], YARN[1], YARN[2]);
  strokeWeight(stitchStrokeWeight);
  strokeCap(ROUND);
  strokeJoin(ROUND);
  noFill();

  for (const s of drawOrder) {
    const prog = stitchProgress(s, t);
    const wOx = allDone ? wiggleOffset(s, wPhase, 1.0) : wiggleOffset(s, wPhase, prog * 0.35);
    drawKnitStitch(s, prog, wOx);
  }
}

// —— マスク ———————————————————————————————————————————————————

function drawLetterMask() {
  maskG.background(0);
  maskG.textAlign(CENTER, CENTER);
  maskG.textStyle(BOLD);
  maskG.textSize(textSize);
  maskG.textFont('Arial Black');

  const tx = W * 0.5;
  const ty = H * 0.5 + textY;

  maskG.fill(255);
  maskG.noStroke();
  maskG.text(letter, tx, ty);

  maskG.noFill();
  maskG.stroke(255);
  maskG.strokeWeight(textWeightAdjust);
  maskG.text(letter, tx, ty);
}

function cellInsideLetter(cx, cy, gx, gy) {
  const pts = [
    [cx, cy],
    [cx, cy - stitchHeight * 0.38],
    [cx, cy + stitchHeight * 0.38],
    [cx - stitchWidth * 0.42, cy],
    [cx + stitchWidth * 0.42, cy],
  ];
  let ok = 0;
  for (const [x, y] of pts) {
    const c = maskG.get(constrain(floor(x), 0, W - 1), constrain(floor(y), 0, H - 1));
    if (c[0] > MASK_SAMPLE_THRESHOLD) ok++;
  }
  return ok >= 4;
}

// —— 出現スケジュール（下→上の段ウェーブ＋横はわずかに流れる。複数目が同時に立ち上がる） ——

function scheduleAppearances() {
  const rowStep = ROW_WAVE_BASE / max(0.35, knitSpeed);
  const spd = max(0.35, knitSpeed);

  for (const s of stitches) {
    const rowFromBottom = maxStitchGy - s.gy;
    const colJ =
      (noise(s.gx * 0.41 + s.seed * 0.001, s.gy * 0.19) - 0.5) * 4.2;
    s.appearFrame =
      knitStartDelay +
      rowFromBottom * rowStep +
      s.gx * COL_MICRO_SPREAD +
      colJ / spd;
  }
}

function maxAppearEnd() {
  let m = 0;
  const drawDur = STITCH_DRAW_FRAMES_BASE / max(0.25, knitSpeed);
  for (const s of stitches) {
    const e = s.appearFrame + drawDur;
    if (e > m) m = e;
  }
  return ceil(m) + 8;
}

function stitchProgress(s, cycleT) {
  const drawDur = STITCH_DRAW_FRAMES_BASE / max(0.25, knitSpeed);
  if (cycleT < s.appearFrame) return 0;
  if (cycleT >= s.appearFrame + drawDur) return 1;
  return (cycleT - s.appearFrame) / drawDur;
}

// —— 揺らぎ ———————————————————————————————————————————————————

function wiggleOffset(s, wPhase, strength) {
  const a = wiggleAmount * strength;
  const ox =
    (noise(s.seed * 0.01, wPhase * 0.31, s.gx * 0.2) - 0.5) * 2 * a;
  const oy =
    (noise(s.seed * 0.02, wPhase * 0.29, s.gy * 0.22) - 0.5) * 2 * a;
  return { ox, oy };
}

function nudge(x, y, gx, gy, side) {
  const s = stitchNoiseAmp;
  const nx = (noise(gx * 2.2 + side * 3.1, gy * 1.9, x * 0.02) - 0.5) * s;
  const ny = (noise(gx * 1.7, gy * 2.3 + side, y * 0.02) - 0.5) * s;
  return { x: x + nx, y: y + ny };
}

// —— 幾何：V字寄りの左右ループ＋渡り糸（以前の版） ——————————————————

function stitchPolyline(s, w) {
  const { cx, cy, gx, gy, hasRight } = s;
  const hw = stitchWidth * 0.46;
  const hh = stitchHeight * 0.5;
  const topY = cy - hh;
  const botY = cy + hh;
  const y1 = cy - stitchHeight * 0.22;
  const y2 = cy;
  const y3 = cy + stitchHeight * 0.18;

  const pts = [];

  const L0 = nudge(cx - hw * 0.08, topY, gx, gy, 1);
  const La = nudge(cx - hw * 0.52, y1, gx, gy, 1);
  const Lb = nudge(cx - hw * 0.9, y2 - stitchHeight * 0.04, gx, gy, 1);
  const Lc = nudge(cx - hw * 0.26, y2 + stitchHeight * 0.07, gx, gy, 1);
  const Ld = nudge(cx - hw * 0.36, botY, gx, gy, 1);

  cubicChain(
    pts,
    L0,
    nudge(cx - hw * 0.34, topY + stitchHeight * 0.15, gx, gy, 1),
    nudge(cx - hw * 0.7, y1 + stitchHeight * 0.05, gx, gy, 1),
    La,
    12
  );
  cubicChain(
    pts,
    La,
    nudge(cx - hw * 0.8, y1 + stitchHeight * 0.1, gx, gy, 1),
    nudge(cx - hw * 0.92, (y1 + y2) * 0.5 - stitchHeight * 0.02, gx, gy, 1),
    Lb,
    12
  );
  cubicChain(
    pts,
    Lb,
    nudge(cx - hw * 0.64, y2 + stitchHeight * 0.03, gx, gy, 1),
    nudge(cx - hw * 0.36, y3, gx, gy, 1),
    Lc,
    12
  );
  cubicChain(
    pts,
    Lc,
    nudge(cx - hw * 0.3, (Lc.y + Ld.y) * 0.5 + stitchHeight * 0.02, gx, gy, 1),
    nudge(cx - hw * 0.34, botY - stitchHeight * 0.1, gx, gy, 1),
    Ld,
    12
  );

  const R0 = nudge(cx + hw * 0.08, topY, gx, gy, 2);
  const Ra = nudge(cx + hw * 0.52, y1, gx, gy, 2);
  const Rb = nudge(cx + hw * 0.9, y2 - stitchHeight * 0.04, gx, gy, 2);
  const Rc = nudge(cx + hw * 0.26, y2 + stitchHeight * 0.07, gx, gy, 2);
  const Rd = nudge(cx + hw * 0.36, botY, gx, gy, 2);

  cubicChain(
    pts,
    R0,
    nudge(cx + hw * 0.34, topY + stitchHeight * 0.15, gx, gy, 2),
    nudge(cx + hw * 0.7, y1 + stitchHeight * 0.05, gx, gy, 2),
    Ra,
    12
  );
  cubicChain(
    pts,
    Ra,
    nudge(cx + hw * 0.8, y1 + stitchHeight * 0.1, gx, gy, 2),
    nudge(cx + hw * 0.92, (y1 + y2) * 0.5 - stitchHeight * 0.02, gx, gy, 2),
    Rb,
    12
  );
  cubicChain(
    pts,
    Rb,
    nudge(cx + hw * 0.64, y2 + stitchHeight * 0.03, gx, gy, 2),
    nudge(cx + hw * 0.36, y3, gx, gy, 2),
    Rc,
    12
  );
  cubicChain(
    pts,
    Rc,
    nudge(cx + hw * 0.3, (Rc.y + Rd.y) * 0.5 + stitchHeight * 0.02, gx, gy, 2),
    nudge(cx + hw * 0.34, botY - stitchHeight * 0.1, gx, gy, 2),
    Rd,
    12
  );

  if (hasRight) {
    const bridgeY = botY - stitchHeight * 0.06;
    const b0 = nudge(cx + hw * 0.5, bridgeY, gx, gy, 3);
    const b1 = nudge(cx + stitchWidth * 0.96, bridgeY + stitchHeight * 0.03, gx, gy, 3.4);
    cubicChain(
      pts,
      Rd,
      nudge((Rd.x + b0.x) * 0.5 + stitchWidth * 0.04, (Rd.y + b0.y) * 0.5, gx, gy, 3.1),
      nudge(b0.x + stitchWidth * 0.06, b0.y, gx, gy, 3.15),
      b0,
      10
    );
    cubicChain(
      pts,
      b0,
      nudge((b0.x + b1.x) * 0.5, (b0.y + b1.y) * 0.5 - 1, gx, gy, 3.2),
      nudge(b1.x - stitchWidth * 0.04, b1.y - 2, gx, gy, 3.25),
      b1,
      10
    );
  }

  for (let i = 0; i < pts.length; i++) {
    pts[i].x += w.ox;
    pts[i].y += w.oy;
  }

  return pts;
}

function cubicChain(pts, p0, c1, c2, p1, steps = 12) {
  if (pts.length === 0) {
    pts.push({ x: p0.x, y: p0.y });
  } else {
    const last = pts[pts.length - 1];
    if (dist(last.x, last.y, p0.x, p0.y) > 0.08) {
      pts.push({ x: p0.x, y: p0.y });
    }
  }
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    pts.push({
      x: bezierPoint(p0.x, c1.x, c2.x, p1.x, t),
      y: bezierPoint(p0.y, c1.y, c2.y, p1.y, t),
    });
  }
}

function polylinePartialLength(pts, progress) {
  if (pts.length < 2 || progress <= 0) return [];
  let total = 0;
  const segLen = [];
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
    segLen.push(d);
    total += d;
  }
  const target = total * constrain(progress, 0, 1);
  const out = [{ x: pts[0].x, y: pts[0].y }];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const L = segLen[i - 1];
    if (acc + L <= target + 1e-6) {
      out.push({ x: pts[i].x, y: pts[i].y });
      acc += L;
    } else {
      const rem = target - acc;
      const t = L > 0 ? rem / L : 1;
      out.push({
        x: lerp(pts[i - 1].x, pts[i].x, t),
        y: lerp(pts[i - 1].y, pts[i].y, t),
      });
      break;
    }
  }
  return out;
}

// —— 描画：奥行きのため2パス（わずかにずらして重なりを表現） —————————

function drawKnitStitch(s, progress, w) {
  if (progress <= 0) return;

  const base = stitchPolyline(s, w);
  const back = offsetPolyline(base, -0.35 * (stitchStrokeWeight + 0.5));
  const front = offsetPolyline(base, 0.45 * (stitchStrokeWeight + 0.5));

  const pBack = polylinePartialLength(back, progress);
  const pFront = polylinePartialLength(front, progress);

  stroke(YARN[0], YARN[1], YARN[2], 210);
  strokeWeight(max(0.8, stitchStrokeWeight * 0.82));
  drawPolylineVertices(pBack);

  stroke(YARN[0], YARN[1], YARN[2], 255);
  strokeWeight(stitchStrokeWeight);
  drawPolylineVertices(pFront);
}

function offsetPolyline(pts, delta) {
  if (pts.length < 2) return pts.map((p) => ({ x: p.x, y: p.y }));
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    let dx = 0;
    let dy = 0;
    if (i === 0) {
      dx = pts[1].x - pts[0].x;
      dy = pts[1].y - pts[0].y;
    } else if (i === pts.length - 1) {
      dx = pts[i].x - pts[i - 1].x;
      dy = pts[i].y - pts[i - 1].y;
    } else {
      dx = pts[i + 1].x - pts[i - 1].x;
      dy = pts[i + 1].y - pts[i - 1].y;
    }
    const len = sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    out.push({ x: pts[i].x + nx * delta, y: pts[i].y + ny * delta });
  }
  return out;
}

function drawPolylineVertices(pts) {
  if (pts.length < 2) return;
  beginShape();
  for (const p of pts) vertex(p.x, p.y);
  endShape();
}
