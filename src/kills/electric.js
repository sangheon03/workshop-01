import * as THREE from 'three';

const DURATION = 3000;
const BOLT_COUNT = 5;
const BOLT_SEGMENTS = 8;

function makeBolt() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array((BOLT_SEGMENTS + 1) * 3), 3),
  );
  const material = new THREE.LineBasicMaterial({ color: 0x9fd8ff });
  return new THREE.Line(geometry, material);
}

// 모기 둘레에서 바깥쪽으로 뻗는 들쭉날쭉한 번개 선을 새로 그린다.
function redrawBolt(bolt, radius) {
  const positions = bolt.geometry.attributes.position;
  const dir = new THREE.Vector3(
    Math.random() - 0.5,
    Math.random() - 0.5,
    Math.random() - 0.5,
  ).normalize();
  for (let i = 0; i <= BOLT_SEGMENTS; i++) {
    const d = (i / BOLT_SEGMENTS) * radius;
    positions.setXYZ(
      i,
      dir.x * d + (Math.random() - 0.5) * 0.15,
      dir.y * d + (Math.random() - 0.5) * 0.15,
      dir.z * d + (Math.random() - 0.5) * 0.15,
    );
  }
  positions.needsUpdate = true;
}

export function playElectric(mosquito) {
  const { group } = mosquito;

  const meshes = [];
  group.traverse((obj) => {
    if (obj.isMesh) meshes.push(obj);
  });
  const startColors = meshes.map((m) => m.material.color.clone());
  const black = new THREE.Color(0x000000);

  const flash = new THREE.PointLight(0xbfe6ff, 0, 20);
  group.add(flash);
  const bolts = Array.from({ length: BOLT_COUNT }, makeBolt);
  bolts.forEach((b) => group.add(b));

  const origin = group.position.clone();

  return new Promise((resolve) => {
    const start = performance.now();

    const tick = (now) => {
      const t = Math.min((now - start) / DURATION, 1);

      // 번쩍임: 무작위로 켜졌다 꺼졌다 한다.
      flash.intensity = Math.random() < 0.5 ? 0 : 8 + Math.random() * 8;
      bolts.forEach((b) => {
        b.visible = Math.random() < 0.7;
        if (b.visible) redrawBolt(b, 1.2);
      });

      // 떨림은 점점 잦아들고, 몸은 점점 까맣게 변한다.
      const shake = (1 - t) * 0.12;
      group.position.set(
        origin.x + (Math.random() - 0.5) * shake,
        origin.y + (Math.random() - 0.5) * shake,
        origin.z + (Math.random() - 0.5) * shake,
      );
      meshes.forEach((m, i) => m.material.color.lerpColors(startColors[i], black, t));

      if (t < 1) {
        requestAnimationFrame(tick);
        return;
      }

      group.position.copy(origin);
      group.remove(flash);
      bolts.forEach((b) => {
        group.remove(b);
        b.geometry.dispose();
        b.material.dispose();
      });
      resolve();
    };
    requestAnimationFrame(tick);
  });
}
