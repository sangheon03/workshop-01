import * as THREE from 'three';
import { getScene } from '../scene.js';

// ===== 직접 조절하는 값 (숫자만 바꾸고 저장한 뒤 브라우저를 새로고침하면 된다) =====
// 번쩍임이 너무 크거나 눈부시면 숫자를 줄이고, 약하면 늘린다.
const BOLT_RADIUS = 2.6; // 번개가 뻗는 최대 길이
const GLOW_NEAR_SIZE = 1.6; // 모기 바로 둘레 빛 무리 크기
const GLOW_FAR_SIZE = 3.4; // 넓게 퍼지는 빛 무리 크기
const GLOW_ENTRY_SIZE = 0.8; // 전기가 들어간 점의 빛 크기
const CURSOR_LIGHT_SCALE = 0.6; // 마우스 위 스파크 빛 크기 배율 (1이 원래 크기, 0.6이면 40% 작게)
const SCREEN_FLASH = 0.18; // 화면 전체 번쩍임의 최대 밝기 (0~1, 0이면 없음)
const LIGHT_POWER = 14; // 모기를 비추는 조명 세기
const FLICKER_MS = 90; // 깜빡이는 간격(ms). 클수록 덜 번쩍인다
// ===================================================================

const BOLT_COUNT = 30;
const BOLT_SEGMENTS = 14;
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
const ORIGIN = new THREE.Vector3();

// 모기를 클릭했다고 보는 반경(월드 단위). 파리채 판정과 같다.
// 터치 화면(손가락)은 마우스보다 부정확해서 모기를 누르는 판정 반경을 키운다.
const COARSE = window.matchMedia?.('(pointer: coarse)').matches ?? false;
const TOUCH_RADIUS = 0.7 * (COARSE ? 1.6 : 1);
// 커서 대신 떠 있는 스파크는 모기보다 카메라 쪽으로 이만큼 앞에 뜬다 (깊이감).
const CURSOR_FRONT = 1.2;
const CURSOR_BOLTS = 7;
const TRAIL_COUNT = 8;
// 모기를 클릭하면 스파크가 이 시간(ms) 동안 아크를 그리며 모기로 옮겨간다.
const TRANSFER_MS = 320;

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

// 전기가 튀는 연출 본체. 전기가 들어가는 점(모기 기준 좌표)은 getEntryLocal()로 받는다.
function shock(mosquito, getEntryLocal) {
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
  const glowNear = makeGlow(glowTexture, GLOW_NEAR_SIZE);
  const glowFar = makeGlow(glowTexture, GLOW_FAR_SIZE);
  // 전기가 들어가는 점에서도 작게 번쩍인다.
  const glowEntry = makeGlow(glowTexture, GLOW_ENTRY_SIZE);
  group.add(glowNear, glowFar, glowEntry);

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
      glowEntry.material.opacity = 0;
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
          flash.intensity = on ? LIGHT_POWER * (0.4 + 0.6 * power * Math.random()) : 0;
          overlay.style.opacity = on ? String(SCREEN_FLASH * (0.3 + 0.7 * power * Math.random())) : '0';
          glowNear.material.opacity = on ? 0.5 + 0.3 * Math.random() : 0.1;
          glowFar.material.opacity = on ? (0.15 + 0.25 * power) * Math.random() : 0;
          glowNear.scale.setScalar(GLOW_NEAR_SIZE * (0.8 + 0.4 * power * Math.random()));
          glowFar.scale.setScalar(GLOW_FAR_SIZE * (0.8 + 0.4 * power * Math.random()));
          // 3줄 중 1줄은 전기가 들어간 점에서 짧게 튀고, 나머지는 모기에서 뻗는다.
          const entryPoint = getEntryLocal();
          glowEntry.position.copy(entryPoint);
          glowEntry.material.opacity = on ? 0.8 + 0.2 * Math.random() : 0.2;
          bolts.forEach((b, i) => {
            b.visible = Math.random() < 0.7 + power * 0.3;
            if (!b.visible) return;
            const fromEntry = i % 3 === 0;
            b.position.copy(fromEntry ? entryPoint : ORIGIN);
            redrawBolt(b, fromEntry ? power * 0.55 : power);
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
      group.remove(flash, glowNear, glowFar, glowEntry, ...bolts, ...smoke);
      overlay.remove();
      glowTexture.dispose();
      [glowNear, glowFar, glowEntry].forEach((g) => g.material.dispose());
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

// 두 점 사이에 지직거리는 아크를 그린다. amount는 옆으로 흔들리는 정도(월드 단위).
function drawArc(line, from, to, amount) {
  const positions = line.geometry.attributes.position;
  const last = positions.count - 1;
  for (let i = 0; i <= last; i++) {
    const k = i / last;
    const wobble = i === 0 || i === last ? 0 : amount * Math.sin(k * Math.PI);
    positions.setXYZ(
      i,
      from.x + (to.x - from.x) * k + (Math.random() - 0.5) * wobble,
      from.y + (to.y - from.y) * k + (Math.random() - 0.5) * wobble,
      from.z + (to.z - from.z) * k + (Math.random() - 0.5) * wobble,
    );
  }
  positions.needsUpdate = true;
}

const easeIn = (x) => x * x * (3 - 2 * x);

// 전기충격을 고르면 커서에 작은 스파크가 계속 떠 있고, 원하는 모기를 클릭하면 전기가 그 모기로 옮겨가서 충격이 시작된다.
// candidates: 고를 수 있는 모기들(한 마리 객체도 가능). 클릭한 모기만 충격을 받고, 그 모기를 돌려준다.
// options.onCommit(mosquito): 대상을 정한 순간 부른다 (그 뒤에는 취소할 수 없다).
// options.signal: 대상을 정하기 전에 abort하면 정리하고 null을 돌려준다.
export function playElectric(candidates, { signal, onCommit } = {}) {
  const list = [].concat(candidates).filter(Boolean);
  if (list.length === 0 || signal?.aborted) return Promise.resolve(null);
  const world = list[0].group.parent;
  const { camera } = getScene();
  const canvas = document.getElementById('game-canvas');

  // 후보 모기마다 닿는 구. 모기들이 같은 깊이에 서 있으므로 스파크 평면은 첫 모기의 깊이를 쓴다.
  const spheres = list.map((mosquito) => ({
    mosquito,
    center: mosquito.group.position.clone(),
    sphere: new THREE.Sphere(mosquito.group.position.clone(), TOUCH_RADIUS),
  }));
  const middle = spheres.reduce((sum, e) => sum.add(e.center), new THREE.Vector3()).divideScalar(spheres.length);
  const sparkPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -(middle.z + CURSOR_FRONT));
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();

  const target = middle.clone().add(new THREE.Vector3(0, 1.6, CURSOR_FRONT));
  const sparkPos = target.clone();
  const entry = middle.clone();
  let chosen = null; // 클릭해서 고른 후보 { mosquito, center }
  let hovering = false;

  // 마우스 위치에서 카메라 광선을 쏜다.
  const aim = (event) => {
    ndc.set((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
  };
  // 광선이 닿은 후보 중 카메라에 가장 가까운 것.
  const hitPoint = new THREE.Vector3();
  const pickCandidate = () => {
    let best = null;
    let bestDistance = Infinity;
    for (const entryItem of spheres) {
      if (!raycaster.ray.intersectSphere(entryItem.sphere, hitPoint)) continue;
      const distance = hitPoint.distanceTo(camera.position);
      if (distance < bestDistance) {
        best = entryItem;
        bestDistance = distance;
      }
    }
    return best;
  };

  // 커서 스파크: 빛 알갱이 + 짧게 튀는 번개 + 꼬리(혜성처럼 따라오는 빛).
  const texture = makeGlowTexture();
  const spark = new THREE.Group();
  const core = makeGlow(texture, 0.7 * CURSOR_LIGHT_SCALE);
  const halo = makeGlow(texture, 1.6 * CURSOR_LIGHT_SCALE);
  const light = new THREE.PointLight(0xffe680, 6, 6);
  const mini = Array.from({ length: CURSOR_BOLTS }, makeBolt);
  mini.forEach((b) => {
    b.scale.setScalar(0.1);
    spark.add(b);
  });
  spark.add(core, halo, light);
  const trail = Array.from({ length: TRAIL_COUNT }, (_, i) => {
    const dot = makeGlow(texture, 0.55 * (1 - i / (TRAIL_COUNT + 1)));
    dot.material.opacity = 0.6 * (1 - i / TRAIL_COUNT);
    dot.position.copy(sparkPos);
    return dot;
  });
  // 모기로 옮겨갈 때 쓰는 아크 (14개 점을 잇는 번개 선).
  const arc = makeBolt();
  arc.children.forEach((line) => {
    line.geometry = new THREE.BufferGeometry();
    line.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(14 * 3), 3));
  });
  arc.visible = false;
  world.add(spark, arc, ...trail);

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
  hint.textContent = '스파크를 원하는 모기에 대고 클릭해서 전기를 옮기세요!';
  document.body.appendChild(hint);
  const previousCursor = canvas.style.cursor;
  canvas.style.cursor = 'none';

  let transferStart = null;
  let transferFrom = null;
  let lastBolt = -Infinity;

  const onMove = (event) => {
    if (transferStart !== null) return;
    aim(event);
    if (raycaster.ray.intersectPlane(sparkPlane, hit)) target.copy(hit);
    // 모기 위에 올라가면 스파크가 더 거세게 튄다.
    hovering = pickCandidate() !== null;
  };
  const onClick = (event) => {
    if (transferStart !== null) return;
    aim(event);
    const picked = pickCandidate();
    if (!picked) return;
    // 모기를 눌렀다: 그 모기로, 클릭한 점으로 전기가 옮겨간다.
    chosen = picked;
    const contactPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -picked.center.z);
    if (raycaster.ray.intersectPlane(contactPlane, hit)) entry.copy(hit);
    transferFrom = sparkPos.clone();
    transferStart = performance.now();
    hint.remove();
    onCommit?.(picked.mosquito);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerdown', onMove); // 터치는 대기만 하면 pointermove가 오지 않으므로 닿는 순간에도 스파크를 옮긴다
  canvas.addEventListener('click', onClick);

  const cleanup = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerdown', onMove);
    canvas.removeEventListener('click', onClick);
    hint.remove();
    world.remove(spark, arc, ...trail);
    texture.dispose();
    [core, halo, ...trail].forEach((o) => o.material.dispose());
    mini.forEach((b) => {
      b.children[0].geometry.dispose();
      b.children.forEach((line) => line.material.dispose());
    });
    arc.children.forEach((line) => {
      line.geometry.dispose();
      line.material.dispose();
    });
    light.dispose?.();
  };

  return new Promise((resolve) => {
    const ball = new THREE.Vector3();
    let cancelled = false;
    // 대상을 정하기 전에는 취소할 수 있다.
    signal?.addEventListener(
      'abort',
      () => {
        if (transferStart !== null || cancelled) return;
        cancelled = true;
        cleanup();
        canvas.style.cursor = previousCursor;
        resolve(null);
      },
      { once: true },
    );
    const tick = (now) => {
      if (cancelled) return;
      const t = now / 1000;

      if (transferStart === null) {
        // 커서를 부드럽게 따라가면서 깊이 방향으로도 살짝 일렁인다.
        sparkPos.lerp(target, 0.3);
        ball.set(
          sparkPos.x + Math.cos(t * 9) * 0.04,
          sparkPos.y + Math.sin(t * 11) * 0.04,
          sparkPos.z + Math.sin(t * 4) * 0.15,
        );
      } else {
        // 아크를 그리며 스파크가 모기 쪽으로 날아간다.
        const k = easeIn(Math.min((now - transferStart) / TRANSFER_MS, 1));
        ball.lerpVectors(transferFrom, entry, k);
        arc.visible = true;
        arc.children.forEach((line) => drawArc(line, transferFrom, ball, 0.5));
      }

      spark.position.copy(ball);
      const power = hovering || transferStart !== null ? 1 : 0.45;
      core.material.opacity = 0.85 + 0.15 * Math.random();
      halo.material.opacity = (0.4 + 0.3 * Math.random()) * (0.6 + power * 0.6);
      halo.scale.setScalar((1.3 + power * 0.9 + Math.random() * 0.3) * CURSOR_LIGHT_SCALE);
      light.intensity = 4 + power * 10 * Math.random();
      if (now - lastBolt > 55) {
        lastBolt = now;
        mini.forEach((b) => {
          b.visible = Math.random() < 0.35 + power * 0.5;
          if (b.visible) {
            redrawBolt(b, power);
            b.scale.setScalar(0.07 + power * 0.07);
          }
        });
      }

      // 꼬리: 앞의 점을 뒤따라오며 3D 공간에 곡선을 그린다.
      let prev = ball;
      for (const dot of trail) {
        dot.position.lerp(prev, 0.4);
        prev = dot.position;
      }

      if (transferStart !== null && now - transferStart >= TRANSFER_MS) {
        cleanup();
        // 전기가 들어간 점에서 번개가 튀도록 모기 기준 좌표로 넘긴다.
        const entryLocal = entry.clone().sub(chosen.center);
        shock(chosen.mosquito, () => entryLocal).then(() => {
          canvas.style.cursor = previousCursor;
          resolve(chosen.mosquito);
        });
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
