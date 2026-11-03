import * as THREE from 'three';
import { getScene } from '../scene.js';

// 렌즈는 모기보다 카메라 쪽에 떠 있고, 렌즈 바로 아래(FOCUS_DROP)에 초점이 맺힌다.
const LENS_RADIUS = 0.9;
const LENS_FRONT = 1.3;
const FOCUS_DROP = 1.7;
// 렌즈에서 초점까지 거리. 처음 놓인 자리(위로 FOCUS_DROP, 앞으로 LENS_FRONT)와 같은 길이다.
const FOCUS_LENGTH = Math.hypot(FOCUS_DROP, LENS_FRONT);
// 움직임에 따라 렌즈가 기울어지는 최대 각도(라디안).
const MAX_TILT = 0.5;
const INTRO_MS = 800;
const OUTRO_MS = 450;
// 초점이 모기에서 이 거리(월드 단위) 안으로 들어오면 그 모기에 빛이 모인다.
const FOCUS_RANGE = 1.1;
// 초점이 모기에 닿아 있는 동안 이 시간(ms)마다 한 번씩 피해를 준다. 피해량은 2단계가 정한다 (지금은 HP -5).
const HIT_MS = 300;
// 한 번 맞을 때마다 그 모기가 더 까맣게 타는 정도 (0~1). HP -5가 100 중 5%인 것과 맞춘다.
const BURN_PER_HIT = 0.05;
const SMOKE_COUNT = 18;
const ORANGE = 0xff7a00;
const HEAT = new THREE.Color(0xff4a10);

// 렌즈 + 손잡이. 레퍼런스처럼 주황 테두리와 오른쪽 아래로 뻗은 손잡이를 가진다.
function makeLens() {
  const lens = new THREE.Group();
  const glass = new THREE.Mesh(
    new THREE.CircleGeometry(LENS_RADIUS, 40),
    new THREE.MeshBasicMaterial({
      color: 0xfff3b0,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(LENS_RADIUS, 0.1, 16, 48),
    new THREE.MeshStandardMaterial({ color: ORANGE, roughness: 0.35, metalness: 0.1 }),
  );
  // 손잡이: 테두리에서 오른쪽 아래(-35도)로 뻗는다.
  const handle = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.1, 1.1, 8, 16),
    new THREE.MeshStandardMaterial({ color: 0xff6200, roughness: 0.4, metalness: 0.1 }),
  );
  const angle = -0.62;
  const reach = LENS_RADIUS + 0.55;
  handle.position.set(Math.cos(angle) * reach, Math.sin(angle) * reach, 0);
  handle.rotation.z = angle - Math.PI / 2;
  lens.add(glass, rim, handle);
  return { lens, glass };
}

// 렌즈에서 초점까지 이어지는 원뿔 빛. 높이 1짜리 원뿔을 만들어 두고 매 프레임 길이만 늘인다.
function makeBeam() {
  const geometry = new THREE.CylinderGeometry(LENS_RADIUS * 0.85, 0.03, 1, 32, 1, true);
  const material = new THREE.MeshBasicMaterial({
    color: 0xfff2b0,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  return new THREE.Mesh(geometry, material);
}

function makeSmoke() {
  return Array.from({ length: SMOKE_COUNT }, () => {
    const puff = new THREE.Mesh(
      new THREE.SphereGeometry(0.12 + Math.random() * 0.1, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0 }),
    );
    puff.userData.life = 1; // 1이면 쉬는 중, 0~1이면 올라가는 중
    return puff;
  });
}

const easeOut = (x) => 1 - (1 - x) ** 3;

// 돋보기 도구. 켜 두면 렌즈를 마우스로 움직여 빛을 모으고, 초점이 닿은 모기가 HIT_MS마다 한 번씩 피해를 받는다 (지속 피해).
// 렌즈를 다른 모기로 옮기면 그 모기가 맞는다. 끝나는 조건은 따로 없고, signal을 abort하면 렌즈가 사라지며 끝난다.
// getTargets(): 지금 태울 수 있는 (살아 있는) 모기 배열을 돌려주는 함수. 매 프레임 부른다.
// onHit(mosquito): 피해를 줄 때마다 그 모기를 알려 준다. 피해량은 2단계가 정한다.
export function playMagnify({ getTargets, onHit, signal } = {}) {
  const initial = getTargets();
  if (initial.length === 0 || signal?.aborted) return Promise.resolve();
  const world = initial[0].group.parent;
  const { camera } = getScene();
  const canvas = document.getElementById('game-canvas');
  const black = new THREE.Color(0x000000);

  // 모기마다 탄 정도(burn)와 색을 따로 가진다. 재질은 모기마다 공유되므로 처음 쓸 때 복제한다.
  // 안 그러면 다음 판 모기도 타 버린 색으로 나온다.
  const entries = new Map();
  const entryOf = (mosquito) => {
    let entry = entries.get(mosquito);
    if (!entry) {
      const meshes = [];
      mosquito.group.traverse((obj) => {
        if (obj.isMesh) meshes.push(obj);
      });
      meshes.forEach((m) => {
        m.material = m.material.clone();
      });
      entry = { mosquito, meshes, startColors: meshes.map((m) => m.material.color.clone()), burn: 0 };
      entries.set(mosquito, entry);
    }
    return entry;
  };
  initial.forEach(entryOf);
  const middle = initial.reduce((sum, m) => sum.add(m.group.position), new THREE.Vector3()).divideScalar(initial.length);

  const { lens } = makeLens();
  const beam = makeBeam();
  const glow = new THREE.PointLight(0xfff2b0, 0, 8);
  const spot = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0 }),
  );
  const smoke = makeSmoke();
  world.add(lens, beam, glow, spot, ...smoke);

  // 마우스 위치를 렌즈가 떠 있는 평면 위의 월드 좌표로 바꾼다.
  const lensZ = middle.z + LENS_FRONT;
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -lensZ);
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();
  // 처음에는 초점이 모기들의 가운데 위에 오도록 렌즈를 놓는다.
  const aimed = new THREE.Vector3(middle.x, middle.y + FOCUS_DROP, lensZ);
  const target = aimed.clone();
  const lensPos = aimed.clone();

  const onMove = (event) => {
    ndc.set((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    if (raycaster.ray.intersectPlane(plane, hit)) target.copy(hit);
  };
  window.addEventListener('pointermove', onMove);

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
  hint.textContent = '돋보기를 움직여 빛을 모으세요! 닿아 있는 모기는 0.3초마다 HP -5 (다른 모기로 옮겨도 돼요)';
  document.body.appendChild(hint);
  const previousCursor = canvas.style.cursor;
  canvas.style.cursor = 'none';

  const focus = new THREE.Vector3();
  const down = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const forward = new THREE.Vector3(0, 0, 1);
  const baseAxis = new THREE.Vector3(0, FOCUS_DROP, LENS_FRONT).normalize();
  const axis = new THREE.Vector3();
  const prevPos = new THREE.Vector3();
  const tiltEuler = new THREE.Euler();
  const introEuler = new THREE.Euler();
  const introQuat = new THREE.Quaternion();
  let tiltYaw = 0;
  let tiltPitch = 0;
  let smokeClock = 0;
  let hitClock = 0; // 지금 초점이 닿은 모기를 얼마나(ms) 비췄는지
  let focused = null; // 지금 초점이 닿아 있는 모기
  let outroAt = null; // 끄는 중이면 시작 시각

  return new Promise((resolve) => {
    const start = performance.now();
    let last = start;

    const stop = () => {
      if (outroAt === null) outroAt = performance.now();
    };
    signal?.addEventListener('abort', stop, { once: true });

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      canvas.style.cursor = previousCursor;
      hint.remove();
      world.remove(lens, beam, glow, spot, ...smoke);
      [lens, beam, spot, ...smoke].forEach((obj) =>
        obj.traverse((o) => {
          o.geometry?.dispose();
          o.material?.dispose();
        }),
      );
    };

    const tick = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const ms = now - start;

      // 앞단 연출: 렌즈가 커지면서 기울어진 각도를 돌려 초점을 맞춘다 (1초 이내).
      const intro = easeOut(Math.min(ms / INTRO_MS, 1));
      const introDone = ms >= INTRO_MS;
      const outro = outroAt === null ? 0 : Math.min((now - outroAt) / OUTRO_MS, 1);

      prevPos.copy(lensPos);
      if (introDone) lensPos.lerp(target, 0.25);
      else lensPos.copy(aimed);
      lens.position.copy(lensPos);
      lens.scale.setScalar((0.2 + 0.8 * intro) * (1 - outro));

      // 렌즈를 손으로 쥐고 움직이는 것처럼, 움직이는 방향으로 기울어진다.
      const vx = (lensPos.x - prevPos.x) / Math.max(dt, 0.001);
      const vy = (lensPos.y - prevPos.y) / Math.max(dt, 0.001);
      tiltYaw += (THREE.MathUtils.clamp(vx * 0.06, -MAX_TILT, MAX_TILT) - tiltYaw) * 0.15;
      tiltPitch += (THREE.MathUtils.clamp(-vy * 0.06, -MAX_TILT, MAX_TILT) - tiltPitch) * 0.15;
      // 빛줄기의 축(초점 → 렌즈 방향). 렌즈 면은 이 축에 수직이라 빛줄기와 같은 각도로 보인다.
      axis.copy(baseAxis).applyEuler(tiltEuler.set(tiltPitch, tiltYaw, 0));
      lens.quaternion.setFromUnitVectors(forward, axis);
      // 시작 연출: 옆으로 돌아 있던 렌즈가 제 각도로 돌아오며(좌우·앞뒤·평면 회전) 초점을 맞춘다.
      lens.quaternion.multiply(
        introQuat.setFromEuler(
          introEuler.set((1 - intro) * 0.7, (1 - intro) * 1.0, (1 - intro) * 1.1),
        ),
      );

      // 초점: 렌즈에서 빛줄기 축 반대 방향으로 일정 거리 떨어진 점. 가장 가까운 모기에 빛이 모인다.
      focus.copy(lensPos).addScaledVector(axis, -FOCUS_LENGTH);
      let nearest = null;
      let nearestDistance = Infinity;
      for (const mosquito of getTargets()) {
        const d = focus.distanceTo(mosquito.group.position);
        if (d < nearestDistance) {
          nearest = mosquito;
          nearestDistance = d;
        }
      }
      const closeness =
        nearest && introDone && outroAt === null ? 1 - THREE.MathUtils.clamp(nearestDistance / FOCUS_RANGE, 0, 1) : 0;
      const hitting = closeness > 0.2 ? nearest : null;

      // 지속 피해: 초점이 한 모기에 닿아 있는 동안 HIT_MS마다 한 번씩 피해를 준다. 다른 모기로 옮기면 처음부터 다시 잰다.
      if (hitting !== focused) {
        focused?.setTwitch?.(1);
        focused = hitting;
        hitClock = 0;
        focused?.setTwitch?.(3);
      }
      if (focused) {
        hitClock += dt * 1000;
        while (hitClock >= HIT_MS) {
          hitClock -= HIT_MS;
          const entry = entryOf(focused);
          entry.burn = Math.min(1, entry.burn + BURN_PER_HIT);
          onHit?.(focused);
        }
      }

      // 렌즈에서 초점까지 원뿔 빛을 늘여 붙인다. 초점이 모기에 가까울수록 밝다.
      down.copy(lensPos).sub(focus);
      const length = down.length();
      beam.position.copy(focus).addScaledVector(down, 0.5);
      beam.quaternion.setFromUnitVectors(up, down.normalize());
      beam.scale.set(1, length, 1);
      beam.material.opacity = (0.12 + 0.45 * closeness) * intro * (1 - outro);

      spot.position.copy(focus);
      spot.material.opacity = (0.3 + 0.7 * closeness) * intro * (1 - outro);
      spot.scale.setScalar(1 + closeness * 2.5);
      glow.position.set(focus.x, focus.y, focus.z + 0.6);
      glow.intensity = closeness * 12 * (1 - outro);

      // 맞은 만큼 까맣게 타고, 지금 빛을 받는 모기는 붉게 달아오른다.
      for (const entry of entries.values()) {
        entry.meshes.forEach((m, i) => {
          m.material.color.lerpColors(entry.startColors[i], black, entry.burn * 0.95);
          const glowing = entry.mosquito === focused ? 0.35 + 0.55 * closeness : 0;
          m.material.emissive?.copy(HEAT).multiplyScalar(glowing);
        });
      }

      // 연기: 빛을 받는 동안 그 모기에서 하나씩 올라간다.
      smokeClock += dt;
      if (focused && smokeClock > 0.12) {
        smokeClock = 0;
        const idle = smoke.find((p) => p.userData.life >= 1);
        if (idle) {
          idle.userData.life = 0;
          idle.userData.base = focused.group.position
            .clone()
            .add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.1, (Math.random() - 0.5) * 0.5));
        }
      }
      for (const p of smoke) {
        if (p.userData.life >= 1) {
          p.material.opacity = 0;
          continue;
        }
        p.userData.life = Math.min(p.userData.life + dt / 1.2, 1);
        const k = p.userData.life;
        p.position.copy(p.userData.base);
        p.position.y += k * 1.8;
        p.material.opacity = 0.5 * (1 - k);
        p.scale.setScalar(1 + k * 2);
      }

      if (outro < 1) {
        requestAnimationFrame(tick);
        return;
      }

      // 끝: 탄 색은 남기고 효과(렌즈·빛·연기)만 치운다.
      entries.forEach((entry) => {
        entry.meshes.forEach((m) => m.material.emissive?.setScalar(0));
        entry.mosquito.setTwitch?.(1);
      });
      cleanup();
      resolve();
    };
    requestAnimationFrame(tick);
  });
}
