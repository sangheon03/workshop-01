import * as THREE from 'three';

const DURATION = 3000;
const SHRINK_START = 0.75;
const GRAVITY = -6;

// 뜯을 수 있는 부위 묶음. 날개는 두 장을 함께 뜯는다.
function partGroups(parts) {
  return [
    [parts.wingL, parts.wingR],
    [...parts.legs],
    [parts.proboscis],
  ].map((list) => list.filter((obj) => obj && obj.parent));
}

export function playPluck(mosquito) {
  const { group, parts } = mosquito;
  const available = partGroups(parts).filter((list) => list.length > 0);
  if (available.length === 0) return Promise.resolve();

  const picked = available[Math.floor(Math.random() * available.length)];
  const world = group.parent;

  // 부위를 모기에서 떼어 장면에 직접 붙이고(위치 유지), 튕겨 나갈 속도를 준다.
  const flying = picked.map((obj) => {
    world.attach(obj);
    return {
      obj,
      scale: obj.scale.clone(),
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 3,
        1.5 + Math.random() * 1.5,
        (Math.random() - 0.5) * 3,
      ),
      spin: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
    };
  });

  return new Promise((resolve) => {
    const start = performance.now();
    let last = start;

    const tick = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      const t = Math.min((now - start) / DURATION, 1);

      for (const f of flying) {
        f.velocity.y += GRAVITY * dt;
        f.obj.position.addScaledVector(f.velocity, dt);
        f.obj.rotation.x += f.spin.x * dt;
        f.obj.rotation.y += f.spin.y * dt;
        f.obj.rotation.z += f.spin.z * dt;
        if (t > SHRINK_START) {
          const k = 1 - (t - SHRINK_START) / (1 - SHRINK_START);
          f.obj.scale.copy(f.scale).multiplyScalar(k);
        }
      }

      if (t < 1) {
        requestAnimationFrame(tick);
        return;
      }

      for (const f of flying) f.obj.removeFromParent();
      resolve();
    };
    requestAnimationFrame(tick);
  });
}
