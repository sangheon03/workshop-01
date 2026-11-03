import * as THREE from 'three';
import { getScene } from '../scene.js';

const BOLT_COUNT = 30;
const BOLT_SEGMENTS = 9;
const BOLT_RADIUS = 3.4;
// 번개 심지의 굵이(월드 단위, 뿌리 쪽 기준). 끝으로 갈수록 가늘어진다.
const CORE_WIDTH = 0.11;

// "치직! 칙!! 치직!" 박자: 번쩍이는 구간(펄스)과 그 사이의 정적. 단위는 ms, power는 세기(0~1).
// 뒤로 갈수록 더 세고, 펄스가 끝날 때마다 모기가 한 단계씩 더 까맣게 탄다.
const PULSES = [
  { at: 0, length: 380, power: 0.6 },
  { at: 700, length: 260, power: 0.8 },
  { at: 1250, length: 220, power: 0.95 },
  { at: 1700, length: 650, power: 1 },
];
const FLICKER_MS = 40;

// 다 탄 뒤: 탄 모기 위로 회색 연기가 한 줄로 피어오른다.
const SMOKE_START = 2400;
const SMOKE_EMIT_END = 3300;
const SMOKE_COUNT = 22;
const SMOKE_LIFE_MS = 1400;
const SMOKE_RISE = 2.6;
const END_AT = 3900;

// 번개 한 줄: 끝으로 갈수록 가늘어지는 노란 띠(심지) + 그 둘레의 은은한 빛 띠.
// 띠는 카메라를 향한 평면에 그려서 선이 얇아지는 WebGL 한계를 피한다.
function makeRibbon(material) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array((BOLT_SEGMENTS + 1) * 2 * 3), 3),
  );
  const index = [];
  for (let i = 0; i < BOLT_SEGMENTS; i++) {
    const a = i * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  geometry.setIndex(index);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}

function makeBolt() {
  const bolt = new THREE.Group();
  const glow = makeRibbon(
    new THREE.MeshBasicMaterial({
      color: 0xffb800,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  const core = makeRibbon(
    new THREE.MeshBasicMaterial({ color: 0xffe21a, side: THREE.DoubleSide, depthWrite: false }),
  );
  bolt.add(glow, core);
  return bolt;
}

// 점들을 따라 띠를 채운다. 폭은 시작에서 끝으로 가며 줄어든다.
function fillRibbon(mesh, points, startWidth, endWidth) {
  const positions = mesh.geometry.attributes.position;
  const last = points.length - 1;
  for (let i = 0; i <= last; i++) {
    const before = points[Math.max(i - 1, 0)];
    const after = points[Math.min(i + 1, last)];
    // 진행 방향에 수직인 화면 평면 방향으로 양옆을 벌린다.
    const nx = -(after.y - before.y);
    const ny = after.x - before.x;
    const len = Math.hypot(nx, ny) || 1;
    const half = (startWidth + (endWidth - startWidth) * (i / last)) / 2;
    const ox = (nx / len) * half;
    const oy = (ny / len) * half;
    positions.setXYZ(i * 2, points[i].x + ox, points[i].y + oy, points[i].z);
    positions.setXYZ(i * 2 + 1, points[i].x - ox, points[i].y - oy, points[i].z);
  }
  positions.needsUpdate = true;
}

const boltPoints = Array.from({ length: BOLT_SEGMENTS + 1 }, () => new THREE.Vector3());

// 모기에서 바깥쪽으로 뻗는 번개를 새로 그린다. 길이는 reach(0~1)에 비례한다.
// 마디마다 좌우로 번갈아 꺾어서 뾰족뾰족한 번개 모양을 만든다.
function redrawBolt(bolt, reach) {
  // 화면 평면(XY) 방향을 주로 쓰고, 깊이 방향은 조금만 섞는다.
  const angle = Math.random() * Math.PI * 2;
  const dir = new THREE.Vector3(Math.cos(angle), Math.sin(angle), (Math.random() - 0.5) * 0.4);
  const side = new THREE.Vector3(-dir.y, dir.x, 0);
  const radius = BOLT_RADIUS * (0.5 + 0.5 * reach) * (0.55 + Math.random() * 0.45);
  const jitter = (0.35 + 0.3 * reach) * (BOLT_RADIUS / BOLT_SEGMENTS) * 2;
  let sign = Math.random() < 0.5 ? 1 : -1;
  for (let i = 0; i <= BOLT_SEGMENTS; i++) {
    const d = (i / BOLT_SEGMENTS) * radius;
    // 뿌리는 모기에 붙어 있고, 마디마다 반대쪽으로 꺾인다.
    const bend = i === 0 ? 0 : sign * jitter * (0.4 + Math.random() * 0.6);
    sign = -sign;
    boltPoints[i].copy(dir).multiplyScalar(d).addScaledVector(side, bend);
  }
  const [glow, core] = bolt.children;
  fillRibbon(glow, boltPoints, CORE_WIDTH * 3, CORE_WIDTH * 1);
  fillRibbon(core, boltPoints, CORE_WIDTH, CORE_WIDTH * 0.25);
}

// 가운데가 밝고 가장자리로 퍼지는 빛 무리 텍스처.
function makeGlowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.25, 'rgba(160,215,255,0.75)');
  gradient.addColorStop(1, 'rgba(80,160,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

function makeGlow(texture, size) {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  sprite.scale.setScalar(size);
  return sprite;
}

function makeSmoke() {
  return Array.from({ length: SMOKE_COUNT }, () => {
    const puff = new THREE.Mesh(
      new THREE.SphereGeometry(0.16 + Math.random() * 0.08, 10, 10),
      new THREE.MeshBasicMaterial({
        color: 0x9a9a9a,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    puff.visible = false;
    puff.userData.born = -1;
    puff.userData.sway = Math.random() * Math.PI * 2;
    return puff;
  });
}

// 지금 시각이 몇 번째 펄스 안인지. 정적 구간이면 -1.
function activePulse(ms) {
  return PULSES.findIndex((p) => ms >= p.at && ms < p.at + p.length);
}

export function playElectric(mosquito) {
  const { group } = mosquito;
  const { camera } = getScene();

  const meshes = [];
  group.traverse((obj) => {
    if (obj.isMesh) meshes.push(obj);
  });
  // 재질은 모기마다 공유되므로 복제해서 쓴다. 안 그러면 다음 판 모기도 까맣게 나온다.
  meshes.forEach((m) => {
    m.material = m.material.clone();
  });
  const startColors = meshes.map((m) => m.material.color.clone());
  const black = new THREE.Color(0x000000);

  const flash = new THREE.PointLight(0xbfe6ff, 0, 30);
  group.add(flash);
  const bolts = Array.from({ length: BOLT_COUNT }, makeBolt);
  bolts.forEach((b) => {
    b.visible = false;
    group.add(b);
  });

  // 모기 주변이 넓게 번쩍이도록 빛 무리를 겹쳐 둔다.
  const glowTexture = makeGlowTexture();
  const glowNear = makeGlow(glowTexture, 4);
  const glowFar = makeGlow(glowTexture, 9);
  group.add(glowNear, glowFar);

  const smoke = makeSmoke();
  group.add(...smoke);

  // 화면에서 모기가 있는 자리를 중심으로 퍼지는 번쩍임. 캔버스 위에 막을 깔고 투명도를 바꾼다.
  const screenPoint = group.position.clone().project(camera);
  const px = ((screenPoint.x + 1) / 2) * window.innerWidth;
  const py = ((1 - screenPoint.y) / 2) * window.innerHeight;
  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    background: `radial-gradient(circle at ${px}px ${py}px, rgba(235,248,255,0.95) 0%, rgba(150,210,255,0.55) 30%, rgba(80,150,255,0) 70%)`,
    opacity: '0',
    pointerEvents: 'none',
    zIndex: '5',
  });
  document.body.appendChild(overlay);

  const origin = group.position.clone();
  const originRotZ = group.rotation.z;
  let lastFlicker = -Infinity;
  let nextPuffAt = SMOKE_START;
  let puffIndex = 0;

  return new Promise((resolve) => {
    const start = performance.now();

    const setDarkness = (amount) => {
      meshes.forEach((m, i) => m.material.color.lerpColors(startColors[i], black, amount));
    };
    const quiet = () => {
      flash.intensity = 0;
      overlay.style.opacity = '0';
      glowNear.material.opacity = 0;
      glowFar.material.opacity = 0;
      bolts.forEach((b) => {
        b.visible = false;
      });
    };

    const tick = (now) => {
      const ms = now - start;
      const index = activePulse(ms);

      // 맞을수록 단계적으로 까맣게 탄다. 마지막 펄스가 끝나면 거의 새까맣다.
      const passed = PULSES.filter((p) => ms >= p.at + p.length).length;
      const inside = index >= 0 ? (ms - PULSES[index].at) / PULSES[index].length : 0;
      setDarkness(((passed + inside * 0.6) / PULSES.length) * 0.97);

      if (index >= 0) {
        const power = PULSES[index].power;
        // 펄스 안에서도 아주 짧게 깜빡여서 "치직" 하는 느낌을 낸다.
        if (now - lastFlicker > FLICKER_MS) {
          lastFlicker = now;
          const on = Math.random() < 0.85;
          flash.intensity = on ? 20 + power * 50 * Math.random() : 0;
          overlay.style.opacity = on ? String(0.25 + power * 0.55 * Math.random()) : '0';
          glowNear.material.opacity = on ? 0.7 + 0.3 * Math.random() : 0.1;
          glowFar.material.opacity = on ? (0.25 + 0.45 * power) * Math.random() : 0;
          glowNear.scale.setScalar(3.5 + power * 2.5 * Math.random());
          glowFar.scale.setScalar(8 + power * 5 * Math.random());
          bolts.forEach((b) => {
            b.visible = Math.random() < 0.7 + power * 0.3;
            if (b.visible) redrawBolt(b, power);
          });
        }
        // 경련: 펄스가 셀수록 크게 떤다.
        const shake = 0.12 + power * 0.3;
        group.position.set(
          origin.x + (Math.random() - 0.5) * shake,
          origin.y + (Math.random() - 0.5) * shake,
          origin.z + (Math.random() - 0.5) * shake,
        );
        group.rotation.z = originRotZ + (Math.random() - 0.5) * power * 0.5;
      } else {
        // 정적: 번쩍임과 전기가 뚝 끊긴다.
        quiet();
        group.position.copy(origin);
        group.rotation.z = originRotZ;
      }

      // 연기: 탄 모기 위로 한 줄로 피어오른다. 일정 간격으로 하나씩 내보낸다.
      if (ms >= nextPuffAt && ms < SMOKE_EMIT_END) {
        const puff = smoke[puffIndex % SMOKE_COUNT];
        puffIndex += 1;
        puff.userData.born = ms;
        puff.visible = true;
        nextPuffAt += 55;
      }
      for (const puff of smoke) {
        if (puff.userData.born < 0) continue;
        const k = (ms - puff.userData.born) / SMOKE_LIFE_MS;
        if (k >= 1) {
          puff.visible = false;
          puff.userData.born = -1;
          continue;
        }
        // 위로 오르며 좌우로 살랑이고, 커지면서 옅어진다.
        puff.position.set(
          Math.sin(k * 5 + puff.userData.sway) * 0.12 * k,
          0.25 + k * SMOKE_RISE,
          0,
        );
        puff.scale.setScalar(0.8 + k * 2.2);
        puff.material.opacity = 0.6 * (1 - k);
      }

      if (ms < END_AT) {
        requestAnimationFrame(tick);
        return;
      }

      // 탄 모기는 장면에 남긴다 (결과 화면이 캡처한다). 효과만 치운다.
      group.position.copy(origin);
      group.rotation.z = originRotZ;
      setDarkness(0.97);
      group.remove(flash, glowNear, glowFar, ...bolts, ...smoke);
      overlay.remove();
      glowTexture.dispose();
      [glowNear, glowFar].forEach((g) => g.material.dispose());
      bolts.forEach((b) => {
        b.children.forEach((ribbon) => {
          ribbon.geometry.dispose();
          ribbon.material.dispose();
        });
      });
      smoke.forEach((p) => {
        p.geometry.dispose();
        p.material.dispose();
      });
      resolve();
    };
    requestAnimationFrame(tick);
  });
}
