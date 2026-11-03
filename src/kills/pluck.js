import * as THREE from 'three';
import { getScene } from '../scene.js';

// 이번 처치에서 뜯어야 하는 부위 수. 다 뜯으면 끝난다.
const REQUIRED = 3;
// 클릭 위치에서 부위 화면 좌표까지 이 거리(px) 안이면 그 부위를 누른 것으로 본다.
const PICK_RADIUS = 70;
const FALL_MS = 1100;
const SHRINK_START = 0.6;
const GRAVITY = -7;

// 뜯을 수 있는 부위. 날개는 두 장을 함께, 다리는 한 개씩, 주둥이는 하나.
function pluckables(parts) {
  const units = [
    { name: 'wings', objs: [parts.wingL, parts.wingR] },
    ...parts.legs.map((leg) => ({ name: 'leg', objs: [leg] })),
    { name: 'proboscis', objs: [parts.proboscis] },
  ];
  return units
    .map((u) => ({ ...u, objs: u.objs.filter((o) => o && o.parent) }))
    .filter((u) => u.objs.length > 0);
}

// 부위의 화면 좌표(px). 부위 전체 상자의 가운데를 쓴다.
const box = new THREE.Box3();
const center = new THREE.Vector3();
function screenPosition(unit, camera) {
  box.makeEmpty();
  unit.objs.forEach((o) => box.expandByObject(o));
  box.getCenter(center).project(camera);
  return {
    x: ((center.x + 1) / 2) * window.innerWidth,
    y: ((1 - center.y) / 2) * window.innerHeight,
  };
}

function makeHint() {
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
  document.body.appendChild(hint);
  return hint;
}

// 뜯긴 부위를 모기에서 떼어 장면에 붙이고, 튕겨 나가 떨어지다 사라지게 한다.
function launch(unit, world) {
  const flying = unit.objs.map((obj) => {
    world.attach(obj);
    return {
      obj,
      scale: obj.scale.clone(),
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 3,
        2 + Math.random() * 1.5,
        1 + Math.random() * 2,
      ),
      spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8),
    };
  });

  return new Promise((resolve) => {
    const start = performance.now();
    let last = start;
    const tick = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      const t = Math.min((now - start) / FALL_MS, 1);
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

export function playPluck(mosquito) {
  const { group, parts } = mosquito;
  const world = group.parent;
  const { camera } = getScene();
  const canvas = document.getElementById('game-canvas');

  let remaining = pluckables(parts);
  const goal = Math.min(REQUIRED, remaining.length);
  if (goal === 0) return Promise.resolve();

  const hint = makeHint();
  let plucked = 0;
  const updateHint = () => {
    hint.textContent = `모기의 날개·다리·주둥이를 클릭해서 뜯으세요! (${plucked}/${goal})`;
  };
  updateHint();
  const previousCursor = canvas.style.cursor;
  canvas.style.cursor = 'pointer';

  return new Promise((resolve) => {
    let lastFall = Promise.resolve();

    const finish = async () => {
      canvas.removeEventListener('click', onClick);
      canvas.style.cursor = previousCursor;
      await lastFall;
      hint.remove();
      mosquito.setTwitch?.(1);
      resolve();
    };

    const onClick = (event) => {
      // 가장 가까운 부위를 찾는다. 반경 밖이면 잘못 누른 것이므로 무시한다.
      let best = null;
      let bestDistance = PICK_RADIUS;
      for (const unit of remaining) {
        const p = screenPosition(unit, camera);
        const d = Math.hypot(p.x - event.clientX, p.y - event.clientY);
        if (d < bestDistance) {
          best = unit;
          bestDistance = d;
        }
      }
      if (!best) return;

      remaining = remaining.filter((u) => u !== best);
      plucked += 1;
      updateHint();
      // 뜯을 때마다 모기가 더 부들부들 떤다.
      mosquito.setTwitch?.(1 + plucked * 1.5);
      lastFall = launch(best, world);

      if (plucked >= goal) finish();
    };

    canvas.addEventListener('click', onClick);
  });
}
