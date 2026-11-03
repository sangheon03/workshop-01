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
// 초점이 모기에서 이 거리(월드 단위) 안으로 들어와야 빛이 모이기 시작한다.
const FOCUS_RANGE = 1.1;
// 초점을 맞춰 이만큼(초) 비추면 다 탄다.
const BURN_SECONDS = 2.2;
const SMOKE_COUNT = 18;
// 초점이 닿은 모기의 열이 이 값을 넘으면 그 모기가 이번 처치의 대상으로 정해진다 (그 뒤에는 취소할 수 없다).
const COMMIT_HEAT = 0.2;
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

// candidates: 고를 수 있는 모기들(한 마리 객체도 가능). 돋보기 초점을 모아 달아오르기 시작한 모기가 대상이 된다.
// options.onCommit(mosquito): 대상이 정해진 순간 부른다 (그 뒤에는 취소할 수 없다).
// options.signal: 대상이 정해지기 전에 abort하면 정리하고 null을 돌려준다.
// 다 태우면 대상이었던 모기를 돌려준다.
export function playMagnify(candidates, { signal, onCommit } = {}) {
  const list = [].concat(candidates).filter(Boolean);
  if (list.length === 0 || signal?.aborted) return Promise.resolve(null);
  const world = list[0].group.parent;
  const { camera } = getScene();
  const canvas = document.getElementById('game-canvas');
  const black = new THREE.Color(0x000000);

  // 재질은 모기마다 공유되므로 복제해서 쓴다. 안 그러면 다음 판 모기도 타 버린 색으로 나온다.
  // 후보 모기마다 열(heat)과 색을 따로 가진다.
  const entries = list.map((mosquito) => {
    const meshes = [];
    mosquito.group.traverse((obj) => {
      if (obj.isMesh) meshes.push(obj);
    });
    meshes.forEach((m) => {
      m.material = m.material.clone();
    });
    return {
      mosquito,
      center: mosquito.group.position.clone(),
      meshes,
      startColors: meshes.map((m) => m.material.color.clone()),
      heat: 0, // 0~1, 1이면 다 탄 것
    };
  });
  // 초점이 가장 가까운 모기(대상이 정해진 뒤에는 그 모기). 처음에는 첫 번째.
  let current = entries[0];
  let committed = null;
  const middle = entries.reduce((sum, e) => sum.add(e.center), new THREE.Vector3()).divideScalar(entries.length);

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
  window.addEventListener('pointerdown', onMove); // 터치는 대기만 하면 pointermove가 오지 않으므로 닿는 순간에도 렌즈를 옮긴다

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
  hint.textContent = '돋보기를 움직여 태우고 싶은 모기에 빛을 모으세요!';
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
  const startTwitch = 1;
  let smokeClock = 0;
  let outroAt = null;

  return new Promise((resolve) => {
    const start = performance.now();
    let last = start;

    let cancelled = false;
    // 대상이 정해지기 전에는 취소할 수 있다. 달아오르던 색은 되돌린다.
    signal?.addEventListener(
      'abort',
      () => {
        if (committed || cancelled) return;
        cancelled = true;
        for (const e of entries) {
          e.meshes.forEach((m, i) => {
            m.material.color.copy(e.startColors[i]);
            m.material.emissive?.setScalar(0);
          });
          e.mosquito.setTwitch?.(1);
        }
        cleanup();
        resolve(null);
      },
      { once: true },
    );

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onMove);
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
      if (cancelled) return;
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

      // 초점: 렌즈에서 빛줄기 축 반대 방향으로 일정 거리 떨어진 점.
      focus.copy(lensPos).addScaledVector(axis, -FOCUS_LENGTH);
      // 대상이 정해지기 전에는 초점에 가장 가까운 모기가 현재 모기다.
      if (!committed && introDone) {
        let nearest = current;
        let nearestDistance = Infinity;
        for (const e of entries) {
          const d = focus.distanceTo(e.center);
          if (d < nearestDistance) {
            nearest = e;
            nearestDistance = d;
          }
        }
        current = nearest;
      }
      const { center } = current;
      const distance = focus.distanceTo(center);
      const closeness = introDone && outroAt === null ? 1 - THREE.MathUtils.clamp(distance / FOCUS_RANGE, 0, 1) : 0;

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

      // 초점이 모기에 머무르는 동안 달아오르고, 벗어나면 조금씩 식는다. 현재 모기가 아닌 후보는 식는다.
      if (outroAt === null) {
        for (const e of entries) {
          if (e === current) {
            e.heat += closeness > 0.2 ? (closeness * dt) / BURN_SECONDS : -dt * 0.15;
          } else if (!committed) {
            e.heat -= dt * 0.3;
          } else {
            e.heat = 0;
          }
          e.heat = THREE.MathUtils.clamp(e.heat, 0, 1);
          e.mosquito.setTwitch?.(startTwitch + e.heat * 3);
        }
        // 달아오르기 시작한 모기가 이번 처치의 대상으로 정해진다.
        if (!committed && current.heat > COMMIT_HEAT) {
          committed = current;
          onCommit?.(committed.mosquito);
        }
      }
      for (const e of entries) {
        e.meshes.forEach((m, i) => {
          m.material.color.lerpColors(e.startColors[i], black, e.heat * 0.95);
          // 붉게 달아올랐다가 식으면서 까맣게 탄다.
          m.material.emissive?.copy(HEAT).multiplyScalar(Math.sin(Math.min(e.heat * 1.2, 1) * Math.PI) * 0.9);
        });
      }
      const heat = current.heat;

      // 연기: 달아오른 동안 모기에서 하나씩 올라간다.
      smokeClock += dt;
      if (heat > 0.25 && smokeClock > 0.12) {
        smokeClock = 0;
        const idle = smoke.find((p) => p.userData.life >= 1);
        if (idle) {
          idle.userData.life = 0;
          idle.userData.base = center
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

      if (heat >= 1 && outroAt === null) outroAt = now;

      if (outro < 1) {
        requestAnimationFrame(tick);
        return;
      }

      // 타 버린 모기는 장면에 까맣게 남겨 둔다 (결과 화면이 캡처한다). 효과만 치운다.
      entries.forEach((e) => e.meshes.forEach((m) => m.material.emissive?.setScalar(0)));
      entries.forEach((e) => e.mosquito.setTwitch?.(1));
      cleanup();
      resolve(committed.mosquito);
    };
    requestAnimationFrame(tick);
  });
}
