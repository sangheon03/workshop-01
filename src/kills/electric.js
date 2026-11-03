import * as THREE from 'three';
import { getScene } from '../scene.js';

const BOLT_COUNT = 30;
const BOLT_SEGMENTS = 14;
const BOLT_RADIUS = 3.4;
// 번개 한 줄을 겹친 선 3개로 그려서 굵게 보이게 한다 (WebGL 선 굵기는 1px로 고정이라서).
const BOLT_THICKNESS = 0.045;

// "치직! 칙!! 치직!" 박자: 번쩍이는 구간(펄스)과 그 사이의 정적. 단위는 ms, power는 세기(0~1).
// 뒤로 갈수록 더 세고, 펄스가 끝날 때마다 모기가 한 단계씩 더 까맣게 탄다.
const PULSES = [
  { at: 0, length: 380, power: 0.6 },
  { at: 700, length: 260, power: 0.8 },
  { at: 1250, length: 220, power: 0.95 },
  { at: 1700, length: 650, power: 1 },
];
const FLICKER_MS = 40;
const ORIGIN = new THREE.Vector3();

// 모기에 손가락이 닿았다고 보는 반경(월드 단위). 파리채 판정과 같다.
const TOUCH_RADIUS = 0.7;
// 검지손가락으로 삿대질하는 손 모양 커서. 손가락 끝(32, 2)이 마우스 위치다.
const FINGER_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <g fill="#f6cba5" stroke="#8a5a3b" stroke-width="2.5" stroke-linejoin="round">
    <rect x="26" y="2" width="12" height="34" rx="6"/>
    <rect x="14" y="30" width="38" height="30" rx="11"/>
    <rect x="38" y="30" width="10" height="16" rx="5"/>
    <rect x="46" y="34" width="8" height="14" rx="4"/>
    <path d="M16 38 C6 36 4 46 12 50 L18 50 Z"/>
  </g>
  <path d="M30 14v14M34 14v14" stroke="#e8b38a" stroke-width="1.5" opacity=".6"/>
</svg>`;
const FINGER_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(FINGER_SVG)}") 32 2, pointer`;

// 다 탄 뒤: 탄 모기 위로 회색 연기가 한 줄로 피어오른다.
const SMOKE_START = 2400;
const SMOKE_EMIT_END = 3300;
const SMOKE_COUNT = 22;
const SMOKE_LIFE_MS = 1400;
const SMOKE_RISE = 2.6;
const END_AT = 3900;

function makeBolt() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array((BOLT_SEGMENTS + 1) * 3), 3),
  );
  const bolt = new THREE.Group();
  for (const color of [0xffee55, 0xffc400, 0xffc400]) {
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    bolt.add(new THREE.Line(geometry, material));
  }
  return bolt;
}

// 모기에서 바깥쪽으로 뻗는 들쭉날쭉한 번개를 새로 그린다. 길이는 reach(0~1)에 비례한다.
function redrawBolt(bolt, reach) {
  const positions = bolt.children[0].geometry.attributes.position;
  const dir = new THREE.Vector3(
    Math.random() - 0.5,
    Math.random() - 0.5,
    Math.random() - 0.5,
  ).normalize();
  const radius = BOLT_RADIUS * (0.5 + 0.5 * reach) * (0.55 + Math.random() * 0.45);
  const jitter = 0.3 + 0.35 * reach;
  for (let i = 0; i <= BOLT_SEGMENTS; i++) {
    const d = (i / BOLT_SEGMENTS) * radius;
    const wobble = i === 0 ? 0 : jitter;
    positions.setXYZ(
      i,
      dir.x * d + (Math.random() - 0.5) * wobble,
      dir.y * d + (Math.random() - 0.5) * wobble,
      dir.z * d + (Math.random() - 0.5) * wobble,
    );
  }
  positions.needsUpdate = true;
  // 가운데 선은 그대로, 나머지 둘은 살짝 비켜 놓아 굵어 보이게 한다.
  bolt.children.forEach((line, i) => {
    if (i === 0) return;
    line.position.set(
      (Math.random() - 0.5) * BOLT_THICKNESS * 2,
      (Math.random() - 0.5) * BOLT_THICKNESS * 2,
      (Math.random() - 0.5) * BOLT_THICKNESS * 2,
    );
  });
}

// 가운데가 밝고 가장자리로 퍼지는 빛 무리 텍스처.
function makeGlowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,250,200,1)');
  gradient.addColorStop(0.25, 'rgba(255,225,80,0.75)');
  gradient.addColorStop(1, 'rgba(255,170,0,0)');
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

// 전기가 튀는 연출 본체. 손가락 끝(모기 기준 좌표)은 getFingerLocal()로 받는다.
function shock(mosquito, getFingerLocal) {
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

  const flash = new THREE.PointLight(0xffe680, 0, 30);
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
  // 손가락 끝에서도 작게 번쩍인다.
  const glowFinger = makeGlow(glowTexture, 1.8);
  group.add(glowNear, glowFar, glowFinger);

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
    background: `radial-gradient(circle at ${px}px ${py}px, rgba(255,250,215,0.95) 0%, rgba(255,215,90,0.55) 30%, rgba(255,170,0,0) 70%)`,
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
      glowFinger.material.opacity = 0;
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
          // 3줄 중 1줄은 손가락 끝에서 짧게 튀고, 나머지는 모기에서 뻗는다.
          const finger = getFingerLocal();
          glowFinger.position.copy(finger);
          glowFinger.material.opacity = on ? 0.8 + 0.2 * Math.random() : 0.2;
          bolts.forEach((b, i) => {
            b.visible = Math.random() < 0.7 + power * 0.3;
            if (!b.visible) return;
            const fromFinger = i % 3 === 0;
            b.position.copy(fromFinger ? finger : ORIGIN);
            redrawBolt(b, fromFinger ? power * 0.55 : power);
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
      group.remove(flash, glowNear, glowFar, glowFinger, ...bolts, ...smoke);
      overlay.remove();
      glowTexture.dispose();
      [glowNear, glowFar, glowFinger].forEach((g) => g.material.dispose());
      bolts.forEach((b) => {
        b.children[0].geometry.dispose();
        b.children.forEach((line) => line.material.dispose());
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

// 손가락 커서를 모기에 가져다 대면 전기충격이 일어난다.
export function playElectric(mosquito) {
  const { group } = mosquito;
  const { camera } = getScene();
  const canvas = document.getElementById('game-canvas');

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const sphere = new THREE.Sphere(group.position.clone(), TOUCH_RADIUS);
  // 손가락 끝이 가리키는 곳을 모기가 있는 깊이의 평면 위 월드 좌표로 바꾼다.
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -group.position.z);
  const tip = group.position.clone();
  const fingerLocal = new THREE.Vector3();
  let started = false;

  const aim = (event) => {
    ndc.set((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    raycaster.ray.intersectPlane(plane, tip);
    return raycaster.ray.intersectsSphere(sphere);
  };

  const hint = document.createElement('p');
  hint.className = 'hint';
  Object.assign(hint.style, {
    position: 'fixed',
    left: '50%',
    bottom: '90px',
    transform: 'translateX(-50%)',
    pointerEvents: 'none',
    zIndex: '5',
  });
  hint.textContent = '손가락을 모기에 가져다 대세요!';
  document.body.appendChild(hint);
  const previousCursor = canvas.style.cursor;
  canvas.style.cursor = FINGER_CURSOR;

  return new Promise((resolve) => {
    // 손가락 끝은 연출 중에도 계속 따라간다. 처음 닿는 순간 전기충격을 시작한다.
    const onMove = (event) => {
      const touching = aim(event);
      if (started || !touching) return;
      started = true;
      hint.remove();
      shock(mosquito, () => fingerLocal.copy(tip).sub(sphere.center)).then(() => {
        window.removeEventListener('pointermove', onMove);
        canvas.style.cursor = previousCursor;
        resolve();
      });
    };
    window.addEventListener('pointermove', onMove);
  });
}
