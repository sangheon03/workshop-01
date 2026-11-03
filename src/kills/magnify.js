import * as THREE from 'three';
import { getScene } from '../scene.js';

// 렌즈는 모기보다 카메라 쪽에 떠 있고, 렌즈 바로 아래(FOCUS_DROP)에 초점이 맺힌다.
const LENS_RADIUS = 0.9;
const LENS_FRONT = 1.3;
const FOCUS_DROP = 1.7;
const INTRO_MS = 800;
const OUTRO_MS = 450;
// 초점이 모기에서 이 거리(월드 단위) 안으로 들어와야 빛이 모이기 시작한다.
const FOCUS_RANGE = 1.1;
// 초점을 맞춰 이만큼(초) 비추면 다 탄다.
const BURN_SECONDS = 2.2;
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
    new THREE.MeshBasicMaterial({ color: ORANGE }),
  );
  // 손잡이: 테두리에서 오른쪽 아래(-35도)로 뻗는다.
  const handle = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.1, 1.1, 8, 16),
    new THREE.MeshBasicMaterial({ color: 0xff6200 }),
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

export function playMagnify(mosquito) {
  const { group } = mosquito;
  const world = group.parent;
  const { camera } = getScene();
  const canvas = document.getElementById('game-canvas');
  const center = group.position.clone();

  // 재질은 모기마다 공유되므로 복제해서 쓴다. 안 그러면 다음 판 모기도 타 버린 색으로 나온다.
  const meshes = [];
  group.traverse((obj) => {
    if (obj.isMesh) meshes.push(obj);
  });
  meshes.forEach((m) => {
    m.material = m.material.clone();
  });
  const startColors = meshes.map((m) => m.material.color.clone());
  const black = new THREE.Color(0x000000);

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
  const lensZ = center.z + LENS_FRONT;
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -lensZ);
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();
  // 처음에는 초점이 모기 바로 위에 오도록 렌즈를 놓는다.
  const aimed = new THREE.Vector3(center.x, center.y + FOCUS_DROP, lensZ);
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
  hint.textContent = '돋보기를 움직여 빛을 모기에 모으세요!';
  document.body.appendChild(hint);
  const previousCursor = canvas.style.cursor;
  canvas.style.cursor = 'none';

  const focus = new THREE.Vector3();
  const down = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const startTwitch = 1;
  let heat = 0; // 0~1, 1이면 다 탄 것
  let smokeClock = 0;
  let outroAt = null;

  return new Promise((resolve) => {
    const start = performance.now();
    let last = start;

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

      if (introDone) lensPos.lerp(target, 0.25);
      else lensPos.copy(aimed);
      lens.position.copy(lensPos);
      lens.rotation.z = (1 - intro) * 1.1;
      lens.scale.setScalar((0.2 + 0.8 * intro) * (1 - outro));

      // 초점: 렌즈 아래, 모기가 있는 평면 위의 점.
      focus.set(lensPos.x, lensPos.y - FOCUS_DROP, center.z);
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

      // 초점이 모기에 머무르는 동안 달아오르고, 벗어나면 조금씩 식는다.
      if (outroAt === null) {
        heat += closeness > 0.2 ? (closeness * dt) / BURN_SECONDS : -dt * 0.15;
        heat = THREE.MathUtils.clamp(heat, 0, 1);
        mosquito.setTwitch?.(startTwitch + heat * 3);
      }
      meshes.forEach((m, i) => {
        m.material.color.lerpColors(startColors[i], black, heat * 0.95);
        // 붉게 달아올랐다가 식으면서 까맣게 탄다.
        m.material.emissive?.copy(HEAT).multiplyScalar(Math.sin(Math.min(heat * 1.2, 1) * Math.PI) * 0.9);
      });

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
      meshes.forEach((m) => m.material.emissive?.setScalar(0));
      mosquito.setTwitch?.(1);
      cleanup();
      resolve();
    };
    requestAnimationFrame(tick);
  });
}
