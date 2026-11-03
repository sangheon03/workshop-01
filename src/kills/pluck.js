import * as THREE from 'three';
import { getScene } from '../scene.js';
import { TWEEZERS, playClickMotion } from '../cursors.js';

// 이번 처치에서 뜯어야 하는 부위 수. 다 뜯으면 끝난다.
const REQUIRED = 3;
// 클릭 위치에서 부위 화면 좌표까지 이 거리(px) 안이면 그 부위를 누른 것으로 본다.
// 터치 화면(손가락)은 마우스보다 부정확해서 집는 반경을 키운다.
const COARSE = window.matchMedia?.('(pointer: coarse)').matches ?? false;
const PICK_RADIUS = 70 * (COARSE ? 1.5 : 1);
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

// candidates: 고를 수 있는 모기들(한 마리 객체도 가능). 첫 클릭이 대상 모기를 정하고, 그 뒤로는 그 모기의 부위만 뜯는다.
// options.onCommit(mosquito): 대상을 정한 순간 부른다 (그 뒤에는 취소할 수 없다).
// options.signal: 대상을 정하기 전에 abort하면 정리하고 null을 돌려준다.
// 다 뜯으면 대상이었던 모기를 돌려준다.
export function playPluck(candidates, { signal, onCommit } = {}) {
  const list = [].concat(candidates).filter(Boolean);
  if (list.length === 0 || signal?.aborted) return Promise.resolve(null);
  const world = list[0].group.parent;
  const { camera } = getScene();
  const canvas = document.getElementById('game-canvas');

  // 모기마다 뜯을 수 있는 부위. 어느 모기의 부위인지(owner)를 같이 기억한다.
  let remaining = list.flatMap((mosquito) => pluckables(mosquito.parts).map((unit) => ({ ...unit, owner: mosquito })));
  if (remaining.length === 0) return Promise.resolve(null);

  const hint = makeHint();
  let chosen = null; // 첫 클릭으로 고른 모기
  let goal = 0;
  let plucked = 0;
  const updateHint = () => {
    hint.textContent = chosen
      ? `모기의 날개·다리·주둥이를 클릭해서 뜯으세요! (${plucked}/${goal})`
      : '뜯고 싶은 모기의 날개·다리·주둥이를 클릭하세요!';
  };
  updateHint();
  const previousCursor = canvas.style.cursor;
  canvas.style.cursor = TWEEZERS.cursor;

  return new Promise((resolve) => {
    let lastFall = Promise.resolve();
    let finished = false;

    const finish = async () => {
      finished = true;
      canvas.removeEventListener('click', onClick);
      canvas.style.cursor = previousCursor;
      await lastFall;
      hint.remove();
      chosen.setTwitch?.(1);
      resolve(chosen);
    };

    // 대상을 정하기 전에는 취소할 수 있다.
    signal?.addEventListener(
      'abort',
      () => {
        if (chosen || finished) return;
        finished = true;
        canvas.removeEventListener('click', onClick);
        canvas.style.cursor = previousCursor;
        hint.remove();
        resolve(null);
      },
      { once: true },
    );

    const onClick = (event) => {
      if (finished) return;
      // 클릭할 때마다 핀셋이 집는 듯 살짝 오므라들었다 돌아온다 (맞든 빗나가든 같다).
      playClickMotion(TWEEZERS, event.clientX, event.clientY, {
        ms: 200,
        frames: [
          { transform: 'rotate(-10deg) scale(1.15)', opacity: 1 },
          { transform: 'rotate(4deg) scale(0.92)', opacity: 1, offset: 0.6 },
          { transform: 'rotate(4deg) scale(0.92)', opacity: 0 },
        ],
      });
      // 가장 가까운 부위를 찾는다. 반경 밖이면 잘못 누른 것이므로 무시한다.
      // 대상을 정한 뒤에는 그 모기의 부위만 후보다.
      let best = null;
      let bestDistance = PICK_RADIUS;
      for (const unit of remaining) {
        if (chosen && unit.owner !== chosen) continue;
        const p = screenPosition(unit, camera);
        const d = Math.hypot(p.x - event.clientX, p.y - event.clientY);
        if (d < bestDistance) {
          best = unit;
          bestDistance = d;
        }
      }
      if (!best) return;

      if (!chosen) {
        // 첫 부위를 누른 모기가 이번 처치의 대상이다. 그 모기의 부위만 남기고 목표 개수를 정한다.
        chosen = best.owner;
        remaining = remaining.filter((unit) => unit.owner === chosen);
        goal = Math.min(REQUIRED, remaining.length);
        onCommit?.(chosen);
      }

      remaining = remaining.filter((u) => u !== best);
      plucked += 1;
      updateHint();
      // 뜯을 때마다 그 모기가 더 부들부들 떤다.
      chosen.setTwitch?.(1 + plucked * 1.5);
      lastFall = launch(best, world);

      if (plucked >= goal) finish();
    };

    canvas.addEventListener('click', onClick);
  });
}
