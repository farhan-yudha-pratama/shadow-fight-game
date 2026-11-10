/**
 * renderer.js - 2D Canvas procedural graphics, 2-bone Inverse Kinematics, particles, and shaders.
 */
import { CANVAS_WIDTH, CANVAS_HEIGHT, GROUND_Y, ATK, SETTINGS, getDPR, clamp, randomRange } from './config.js?v=2.4.3';
import { solve2BoneIK, calculatePose, getFighterHurtboxes, getFighterAttackHitbox } from './physics.js?v=2.4.3';

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.DPR = getDPR();
    this.updateDimensions();

    this.sparksList = [];
    this.embersList = [];
    this.bgCanvas = null;
    this.currentPalette = null;
    this.shake = 0;
  }

  updateDimensions() {
    this.DPR = getDPR();
    this.cv.width = CANVAS_WIDTH * this.DPR;
    this.cv.height = CANVAS_HEIGHT * this.DPR;
  }

  initEmbers() {
    this.embersList = [];
    for (let i = 0; i < 36; i++) {
      this.embersList.push({
        x: randomRange(0, CANVAS_WIDTH),
        y: randomRange(0, CANVAS_HEIGHT),
        vx: randomRange(-0.2, 0.35),
        vy: randomRange(-0.5, -0.1),
        r: randomRange(0.8, 2.2),
        ph: randomRange(0, 6.3)
      });
    }
  }

  addSparks(x, y, count, color, direction) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.random() - 0.5) * 2.2 + (direction > 0 ? 0 : Math.PI);
      const speed = randomRange(2, 7);
      this.sparksList.push({
        k: 's',
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1,
        life: randomRange(10, 20),
        maxLife: 20,
        color
      });
    }
    this.sparksList.push({
      k: 'r',
      x,
      y,
      life: 9,
      maxLife: 9,
      color,
      vx: 0,
      vy: 0
    });
  }

  generateBackground(palette, seed) {
    this.currentPalette = palette;
    const c = document.createElement('canvas');
    c.width = CANVAS_WIDTH;
    c.height = CANVAS_HEIGHT;
    const g = c.getContext('2d');
    const rng = mulberry32(seed);

    // Sky gradient
    const sky = g.createLinearGradient(0, 0, 0, GROUND_Y);
    sky.addColorStop(0, palette.sky0);
    sky.addColorStop(0.62, palette.sky1);
    sky.addColorStop(1, palette.sky2);
    g.fillStyle = sky;
    g.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Night stars
    if (palette.stars) {
      g.fillStyle = 'rgba(255, 255, 255, .7)';
      for (let i = 0; i < 70; i++) {
        g.fillRect(rng() * CANVAS_WIDTH, rng() * GROUND_Y * 0.55, 1.4, 1.4);
      }
    }

    // Sun / Moon with radial glow
    const sx = CANVAS_WIDTH * 0.62;
    const sy = GROUND_Y - 125;
    const sr = 78;

    const sunGlow = g.createRadialGradient(sx, sy, sr * 0.6, sx, sy, 320);
    sunGlow.addColorStop(0, palette.glow);
    sunGlow.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sunGlow;
    g.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    g.fillStyle = palette.sun;
    g.beginPath();
    g.arc(sx, sy, sr, 0, Math.PI * 2);
    g.fill();

    // Sun stripes
    g.save();
    g.beginPath();
    g.arc(sx, sy, sr, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = palette.sky2;
    for (let i = 0; i < 6; i++) {
      g.fillRect(sx - sr, sy + 8 + i * 13, sr * 2, 1.5 + i * 1.5);
    }
    g.restore();

    // Mountain ridges
    const drawRidge = (base, amp, col, shift) => {
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(0, CANVAS_HEIGHT);
      for (let x = 0; x <= CANVAS_WIDTH + 16; x += 16) {
        const y = base - amp * (0.55 * (1 - Math.abs(Math.sin(x * 0.007 + shift))) + 0.3 * (1 - Math.abs(Math.sin(x * 0.019 + shift * 2))) + 0.15 * rng());
        g.lineTo(x, y);
      }
      g.lineTo(CANVAS_WIDTH + 16, CANVAS_HEIGHT);
      g.closePath();
      g.fill();
    };

    drawRidge(GROUND_Y - 100, 80, palette.m0, seed * 0.3 + 1);
    drawRidge(GROUND_Y - 62, 62, palette.m1, seed * 0.5 + 4);

    // Pagoda on a cliff
    g.fillStyle = palette.m1;
    g.beginPath();
    g.ellipse(132, GROUND_Y - 62, 78, 26, 0, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 4; i++) {
      const w = 50 - i * 9;
      const y = GROUND_Y - 82 - i * 20;
      g.fillRect(132 - w * 0.28, y, w * 0.56, 20);
      g.beginPath();
      g.moveTo(132 - w * 0.7, y + 2);
      g.lineTo(132 - w * 0.42, y - 7);
      g.lineTo(132 + w * 0.42, y - 7);
      g.lineTo(132 + w * 0.7, y + 2);
      g.closePath();
      g.fill();
    }
    g.fillRect(131, GROUND_Y - 170, 2, 22);

    drawRidge(GROUND_Y - 18, 36, palette.m2, seed * 0.7 + 9);

    // Dojo floor & mist
    const floor = g.createLinearGradient(0, GROUND_Y, 0, CANVAS_HEIGHT);
    floor.addColorStop(0, palette.g0);
    floor.addColorStop(1, palette.g1);
    g.fillStyle = floor;
    g.fillRect(0, GROUND_Y, CANVAS_WIDTH, CANVAS_HEIGHT - GROUND_Y);

    const mist = g.createLinearGradient(0, GROUND_Y - 60, 0, GROUND_Y);
    mist.addColorStop(0, 'rgba(0,0,0,0)');
    mist.addColorStop(1, palette.mist);
    g.fillStyle = mist;
    g.fillRect(0, GROUND_Y - 60, CANVAS_WIDTH, 60);

    g.fillStyle = palette.edge;
    g.fillRect(0, GROUND_Y, CANVAS_WIDTH, 1.5);

    // Floor lines
    g.strokeStyle = 'rgba(255, 255, 255, .05)';
    g.lineWidth = 1;
    for (let i = 1; i < 5; i++) {
      const y = GROUND_Y + 6 + i * i * 3.4;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(CANVAS_WIDTH, y);
      g.stroke();
    }

    // Vignette
    const vig = g.createRadialGradient(CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.55, CANVAS_HEIGHT * 0.35, CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.55, CANVAS_WIDTH * 0.62);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,.6)');
    g.fillStyle = vig;
    g.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    this.bgCanvas = c;
  }

  drawPoly(pts, width) {
    this.ctx.lineWidth = width;
    this.ctx.beginPath();
    this.ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      this.ctx.lineTo(pts[i][0], pts[i][1]);
    }
    this.ctx.stroke();
  }

  drawHitboxes(f) {
    if (!f) return;
    this.ctx.save();

    // Draw Hurtboxes in cyan/green outline
    const hurtboxes = getFighterHurtboxes(f);
    this.ctx.strokeStyle = f.isP ? 'rgba(0, 255, 128, 0.7)' : 'rgba(0, 200, 255, 0.7)';
    this.ctx.lineWidth = 1.5;

    for (const hb of hurtboxes) {
      if (hb.type === 'circle') {
        this.ctx.beginPath();
        this.ctx.arc(hb.x, hb.y, hb.r, 0, Math.PI * 2);
        this.ctx.stroke();
      } else if (hb.type === 'capsule') {
        this.ctx.beginPath();
        this.ctx.arc(hb.p1[0], hb.p1[1], hb.r, 0, Math.PI * 2);
        this.ctx.arc(hb.p2[0], hb.p2[1], hb.r, 0, Math.PI * 2);
        this.ctx.moveTo(hb.p1[0], hb.p1[1]);
        this.ctx.lineTo(hb.p2[0], hb.p2[1]);
        this.ctx.stroke();
      }
    }

    // Draw active attack hitbox in vibrant red/yellow
    const attackBox = getFighterAttackHitbox(f);
    if (attackBox) {
      this.ctx.strokeStyle = 'rgba(255, 60, 60, 0.9)';
      this.ctx.fillStyle = 'rgba(255, 60, 60, 0.25)';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.arc(attackBox.x, attackBox.y, attackBox.r, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.fill();
    }

    this.ctx.restore();
  }

  drawFighter(f) {
    const p = calculatePose(f);
    const accent = f.isP ? this.currentPalette.you : this.currentPalette.foe;
    const air = GROUND_Y - f.y;

    // Ground shadow
    this.ctx.fillStyle = 'rgba(0,0,0,.42)';
    this.ctx.beginPath();
    this.ctx.ellipse(f.x, GROUND_Y + 4, Math.max(14, 30 - air * 0.08), 6, 0, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.save();
    this.ctx.translate(f.x, f.y);

    if (f.ko) {
      const k = Math.min(1, f.koT / 20);
      this.ctx.translate(0, -5 * k);
      this.ctx.rotate(-f.face * k * 1.5);
    }

    this.ctx.scale(f.face, 1);
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    const legF = solve2BoneIK(p.hip, p.fF, 28, 28, -1);
    const legB = solve2BoneIK(p.hip, p.fB, 28, 28, -1);
    const armF = solve2BoneIK(p.S, p.hF, 22, 22, 1);
    const armB = solve2BoneIK(p.S, p.hB, 22, 22, 1);

    // Fluttering scarf
    const mv = clamp(f.vx * f.face, -3, 4);
    const N = [p.S[0] - 1, p.S[1] - 4];
    const wave = f.t * 0.22;

    this.ctx.strokeStyle = accent;
    this.ctx.lineWidth = 4.4;
    this.ctx.beginPath();
    this.ctx.moveTo(N[0], N[1]);
    this.ctx.quadraticCurveTo(N[0] - 16 - mv * 3, N[1] + 4 + Math.sin(wave) * 4, N[0] - 36 - mv * 6, N[1] + 9 + Math.sin(wave + 1.3) * 7);
    this.ctx.stroke();

    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.moveTo(N[0] - 2, N[1] + 3);
    this.ctx.quadraticCurveTo(N[0] - 14 - mv * 2, N[1] + 12 + Math.sin(wave + 0.8) * 3, N[0] - 26 - mv * 4, N[1] + 20 + Math.sin(wave + 2) * 5);
    this.ctx.stroke();

    // Body passes
    for (let pass = 0; pass < 2; pass++) {
      const ex = pass ? 0 : 3.2;
      const col = pass ? (f.flash > 0 ? '#ffe7df' : '#08060d') : accent;
      this.ctx.strokeStyle = col;
      this.ctx.fillStyle = col;
      this.ctx.globalAlpha = pass ? 1 : 0.92;

      this.drawPoly([p.hip, legB.k, legB.e], 8.5 + ex);
      this.drawPoly([legB.e, [legB.e[0] + 8, legB.e[1]]], 5 + ex);
      this.drawPoly([p.S, armB.k, armB.e], 6.5 + ex);
      this.drawPoly([p.hip, p.S], 13 + ex);
      this.drawPoly([p.S, p.Hd], 6 + ex);

      this.ctx.beginPath();
      this.ctx.arc(p.Hd[0], p.Hd[1], 10.5 + ex / 2, 0, Math.PI * 2);
      this.ctx.fill();

      this.drawPoly([p.hip, legF.k, legF.e], 8.5 + ex);
      this.drawPoly([legF.e, [legF.e[0] + 8, legF.e[1]]], 5 + ex);
      this.drawPoly([p.S, armF.k, armF.e], 6.5 + ex);
    }

    // Glowing eye
    this.ctx.globalAlpha = 1;
    this.ctx.shadowColor = accent;
    this.ctx.shadowBlur = SETTINGS.gfx === 'hi' ? 9 : 0;
    this.ctx.fillStyle = accent;
    this.ctx.beginPath();
    this.ctx.ellipse(p.Hd[0] + 5.5, p.Hd[1] - 1.5, 2.5, 1.5, 0, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.shadowBlur = 0;

    // Attack sweep trail
    if (f.atk) {
      const A = ATK[f.atk.type];
      if (f.atk.f > A.su && f.atk.f <= A.su + A.ac + 2) {
        this.ctx.globalAlpha = 0.4;
        this.ctx.strokeStyle = accent;
        if (f.atk.type === 'punch') this.drawPoly([p.S, armF.e], 10);
        else this.drawPoly([p.hip, legF.e], 12);
        this.ctx.globalAlpha = 1;
      }
    }

    this.ctx.restore();
  }

  updateParticles(tick) {
    for (const q of this.sparksList) {
      q.x += q.vx;
      q.y += q.vy;
      if (q.k === 's') q.vy += 0.25;
      q.life--;
    }
    this.sparksList = this.sparksList.filter(q => q.life > 0);

    for (const m of this.embersList) {
      m.x += m.vx + Math.sin((tick + m.ph * 40) * 0.02) * 0.2;
      m.y += m.vy;
      if (m.y < -5) {
        m.y = CANVAS_HEIGHT + 5;
        m.x = randomRange(0, CANVAS_WIDTH);
      }
      if (m.x > CANVAS_WIDTH + 5) m.x = -5;
      if (m.x < -5) m.x = CANVAS_WIDTH + 5;
    }
    this.shake *= 0.85;
  }

  render(fighterP, fighterE, tick) {
    this.ctx.setTransform(this.DPR, 0, 0, this.DPR, 0, 0);
    this.ctx.save();

    if (SETTINGS.shake && this.shake > 0.3) {
      this.ctx.translate((Math.random() - 0.5) * this.shake * 2, (Math.random() - 0.5) * this.shake * 2);
    }

    if (this.bgCanvas) {
      this.ctx.drawImage(this.bgCanvas, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }

    // Embers
    if (SETTINGS.gfx === 'hi' && this.currentPalette) {
      for (const m of this.embersList) {
        this.ctx.fillStyle = `rgba(${this.currentPalette.ember},${0.35 + 0.25 * Math.sin(tick * 0.05 + m.ph)})`;
        this.ctx.beginPath();
        this.ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }

    if (fighterP) this.drawFighter(fighterP);
    if (fighterE) this.drawFighter(fighterE);

    if (SETTINGS.debugHitboxes) {
      if (fighterP) this.drawHitboxes(fighterP);
      if (fighterE) this.drawHitboxes(fighterE);
    }

    // Sparks & Shockwaves
    for (const q of this.sparksList) {
      const a = q.life / q.maxLife;
      this.ctx.globalAlpha = a;
      this.ctx.strokeStyle = q.color;
      if (q.k === 's') {
        this.ctx.lineWidth = 2.4;
        this.ctx.beginPath();
        this.ctx.moveTo(q.x, q.y);
        this.ctx.lineTo(q.x - q.vx * 1.8, q.y - q.vy * 1.8);
        this.ctx.stroke();
      } else {
        this.ctx.lineWidth = 3 * a;
        this.ctx.beginPath();
        this.ctx.arc(q.x, q.y, (1 - a) * 34 + 6, 0, Math.PI * 2);
        this.ctx.stroke();
      }
    }

    this.ctx.globalAlpha = 1;
    this.ctx.restore();
  }
}
