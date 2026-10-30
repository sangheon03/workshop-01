import * as THREE from 'three';

const DURATION = 3000;
const SMOKE_COUNT = 14;
// 렌즈는 모기 위쪽 상단에 떠 있고, 거기서 모기로 빛이 모인다.
const LENS_OFFSET = new THREE.Vector3(0, 2.0, 1.0);
const LENS_RADIUS = 1.0;
const HEAT = new THREE.Color(0xff4a10);

// 렌즈에서 모기까지 점점 좁아지는 빛줄기 (위가 넓고 아래가 뾰족하다).
function makeBeam(lensPos, target) {
  const dir = lensPos.clone().sub(target);
  const length = dir.length();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(LENS_RADIUS * 0.85, 0.03, length, 24, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xfff2b0,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  beam.position.copy(target).addScaledVector(dir, 0.5);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return beam;
}

function makeLens() {
  const lens = new THREE.Group();
  const glass = new THREE.Mesh(
    new THREE.CircleGeometry(LENS_RADIUS, 32),
    new THREE.MeshBasicMaterial({
      color: 0xbfe6ff,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
    }),
  );
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(LENS_RADIUS, 0.07, 12, 40),
    new THREE.MeshStandardMaterial({ color: 0x8a6a2f, metalness: 0.6, roughness: 0.4 }),
  );
  lens.add(glass, rim);
  return lens;
}

function makeSmoke() {
  return Array.from({ length: SMOKE_COUNT }, () => {
    const puff = new THREE.Mesh(
      new THREE.SphereGeometry(0.12 + Math.random() * 0.1, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0 }),
    );
    puff.userData.offset = new THREE.Vector3(
      (Math.random() - 0.5) * 0.6,
      0,
      (Math.random() - 0.5) * 0.6,
    );
    puff.userData.delay = Math.random() * 0.4;
    return puff;
  });
}

export function playMagnify(mosquito) {
  const { group } = mosquito;
  const world = group.parent;
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
  const startScale = group.scale.clone();
  const black = new THREE.Color(0x000000);

  const lens = makeLens();
  lens.position.copy(center).add(LENS_OFFSET);
  lens.scale.setScalar(0.01);

  const beam = makeBeam(lens.position, center);

  // 빛이 모이는 점: 모기 바로 앞의 광원과 작은 구 (모기가 가려지지 않도록 작게).
  const glow = new THREE.PointLight(0xfff2b0, 0, 8);
  glow.position.copy(center).add(new THREE.Vector3(0, 0.4, 0.8));
  const spot = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0 }),
  );
  spot.position.copy(center).add(new THREE.Vector3(0, 0.05, 0.3));

  const smoke = makeSmoke();
  smoke.forEach((p) => p.position.copy(center));

  world.add(lens, beam, glow, spot, ...smoke);

  return new Promise((resolve) => {
    const start = performance.now();

    const tick = (now) => {
      const t = Math.min((now - start) / DURATION, 1);

      // 0~0.25: 렌즈가 나타난다 / 0.25~0.7: 빛이 모여 모기가 탄다 / 0.7~1: 연기와 함께 사라진다.
      lens.scale.setScalar(Math.min(t / 0.25, 1) * 0.99 + 0.01);
      const focus = THREE.MathUtils.clamp((t - 0.25) / 0.45, 0, 1);
      const burn = THREE.MathUtils.clamp((t - 0.7) / 0.3, 0, 1);
      glow.intensity = focus * 10 * (1 - burn);
      beam.material.opacity = focus * 0.35 * (1 - burn);
      spot.material.opacity = focus * (1 - burn);
      spot.scale.setScalar(1 + focus * 1.5);
      // 빛이 모이면 모기가 먼저 붉게 달아오르고, 곧 까맣게 탄다.
      meshes.forEach((m, i) => {
        m.material.color.lerpColors(startColors[i], black, focus);
        m.material.emissive?.copy(HEAT).multiplyScalar(Math.sin(focus * Math.PI) * 0.9);
      });

      group.scale.copy(startScale).multiplyScalar(1 - burn);
      lens.scale.setScalar((1 - burn) * (Math.min(t / 0.25, 1) * 0.99 + 0.01));

      // 연기는 타기 시작할 때부터 위로 올라가며 옅어진다.
      const smokeT = THREE.MathUtils.clamp((t - 0.45) / 0.55, 0, 1);
      smoke.forEach((p) => {
        const k = THREE.MathUtils.clamp(smokeT - p.userData.delay, 0, 1);
        p.position.set(
          center.x + p.userData.offset.x,
          center.y + k * 2,
          center.z + p.userData.offset.z,
        );
        p.material.opacity = k > 0 ? 0.5 * (1 - k) : 0;
        p.scale.setScalar(1 + k * 2);
      });

      if (t < 1) {
        requestAnimationFrame(tick);
        return;
      }

      group.visible = false;
      group.scale.copy(startScale);
      world.remove(lens, beam, glow, spot, ...smoke);
      [lens, beam, spot, ...smoke].forEach((obj) =>
        obj.traverse((o) => {
          o.geometry?.dispose();
          o.material?.dispose();
        }),
      );
      resolve();
    };
    requestAnimationFrame(tick);
  });
}
