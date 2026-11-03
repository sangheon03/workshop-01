import * as THREE from 'three';
import { getScene } from '../scene.js';
import { TWEEZERS, playClickMotion } from '../cursors.js';

// 클릭 위치에서 부위 화면 좌표까지 이 거리(px) 안이면 그 부위를 누른 것으로 본다.
const PICK_RADIUS = 70;
const FALL_MS = 1100;
const SHRINK_START = 0.6;
const GRAVITY = -7;

// 이미 뜯긴 부위. 뜯으면 장면(world)에 붙여 떨어뜨리는데, 그때도 parent가 있어서 따로 기억해 둔다.
const gone = new WeakSet();

// 뜯을 수 있는 부위. 날개는 한 장씩, 다리는 한 개씩, 주둥이는 하나. (모기당 최대 9부위)
function pluckables(parts) {
  const units = [
    { name: 'wing', objs: [parts.wingL] },
    { name: 'wing', objs: [parts.wingR] },
    ...parts.legs.map((leg) => ({ name: 'leg', objs: [leg] })),
    { name: 'proboscis', objs: [parts.proboscis] },
  ];
  return units
    .map((u) => ({ ...u, objs: u.objs.filter((o) => o && o.parent && !gone.has(o)) }))
    .filter((u) => u.objs.length > 0);
}

// 이 모기에 아직 뜯을 부위가 남아 있는가.
export function canPluck(mosquito) {
  return pluckables(mosquito.parts).length > 0;
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
    gone.add(obj);
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

// 신체뜯기 도구. 켜 두면 아무 모기의 부위든 클릭하는 대로 바로 뜯기고, 모기를 바꿔 가며 계속 뜯을 수 있다.
// 끝나는 조건은 따로 없고, signal을 abort하거나 뜯을 부위가 하나도 안 남으면 끝난다.
// getTargets(): 지금 뜯을 수 있는 (살아 있는) 모기 배열을 돌려주는 함수. 클릭할 때마다 부른다.
// onHit(mosquito): 부위 하나를 뜯을 때마다 그 모기를 알려 준다. 피해량은 2단계가 정한다.
export function playPluck({ getTargets, onHit, signal } = {}) {
  if (signal?.aborted) return Promise.resolve();
  const { camera } = getScene();
  const canvas = document.getElementById('game-canvas');

  const hint = makeHint();
  hint.textContent = '원하는 모기의 날개·다리·주둥이를 클릭해서 뜯으세요! (한 번에 HP -10)';
  const previousCursor = canvas.style.cursor;
  canvas.style.cursor = TWEEZERS.cursor;
  const plucked = new Map(); // 모기 -> 지금까지 뜯은 부위 수 (떨림 세기에 쓴다)

  return new Promise((resolve) => {
    let ended = false;
    const end = () => {
      if (ended) return;
      ended = true;
      canvas.removeEventListener('click', onClick);
      canvas.style.cursor = previousCursor;
      hint.remove();
      resolve();
    };
    signal?.addEventListener('abort', end, { once: true });

    const onClick = (event) => {
      if (ended) return;
      // 클릭할 때마다 핀셋이 집는 듯 살짝 오므라들었다 돌아온다 (맞든 빗나가든 같다).
      playClickMotion(TWEEZERS, event.clientX, event.clientY, {
        ms: 200,
        frames: [
          { transform: 'rotate(-10deg) scale(1.15)', opacity: 1 },
          { transform: 'rotate(4deg) scale(0.92)', opacity: 1, offset: 0.6 },
          { transform: 'rotate(4deg) scale(0.92)', opacity: 0 },
        ],
      });
      // 모든 대상 모기의 부위 중 가장 가까운 것을 찾는다. 반경 밖이면 잘못 누른 것이므로 무시한다.
      let best = null;
      let bestDistance = PICK_RADIUS;
      for (const mosquito of getTargets()) {
        for (const unit of pluckables(mosquito.parts)) {
          const p = screenPosition(unit, camera);
          const d = Math.hypot(p.x - event.clientX, p.y - event.clientY);
          if (d < bestDistance) {
            best = { unit, mosquito };
            bestDistance = d;
          }
        }
      }
      if (!best) return;

      const { unit, mosquito } = best;
      const count = (plucked.get(mosquito) ?? 0) + 1;
      plucked.set(mosquito, count);
      // 뜯을 때마다 그 모기가 더 부들부들 떤다.
      mosquito.setTwitch?.(Math.min(1 + count * 0.8, 7));
      launch(unit, mosquito.group.parent);
      onHit?.(mosquito);

      // 뜯을 부위가 어느 모기에도 안 남았으면 도구를 끈다.
      if (!getTargets().some(canPluck)) end();
    };

    canvas.addEventListener('click', onClick);
  });
}
