import * as THREE from 'three';
import { getScene } from './scene.js';
import { playElectric } from './kills/electric.js';
import { playPluck, canPluck } from './kills/pluck.js';
import { playMagnify } from './kills/magnify.js';

const MAX_HP = 100;
// 처치 방법.
// - shot: 대상을 고르면 한 번 충격이 들어가는 방법. 한 모기에 한 번만 쓸 수 있다. damage는 그 한 번의 피해.
// - tool: 켜 두는 도구. 켜 두면 아무 모기에게나 계속 쓸 수 있고, 모기를 바꿔 가며 쓸 수 있다.
//   damage는 쓸 때마다(신체뜯기는 부위 하나, 돋보기는 0.3초) 주는 피해.
const METHODS = [
  { id: 'electric', label: '전기충격', kind: 'shot', damage: 50, play: playElectric },
  { id: 'pluck', label: '신체뜯기', kind: 'tool', damage: 10, play: playPluck },
  { id: 'magnify', label: '돋보기화형', kind: 'tool', damage: 5, play: playMagnify },
];
// 마지막 모기가 죽은 뒤 잠깐 보여 주고 결과로 넘어간다.
const DEATH_PAUSE_MS = 900;

let frameId = null; // 자리로 옮기는 루프
let barFrameId = null; // HP 바가 모기를 따라다니는 루프

function stopIdleLoop() {
  if (frameId !== null) {
    cancelAnimationFrame(frameId);
    frameId = null;
  }
}

function stopBarLoop() {
  if (barFrameId !== null) {
    cancelAnimationFrame(barFrameId);
    barFrameId = null;
  }
}

// 잡은 모기들이 서 있을 자리. 3마리까지는 한 줄, 그보다 많으면 위아래 두 줄로 가운데에 모은다.
const SLOT_SPACING_X = 2.4;
const SLOT_SPACING_Y = 2.2;
function slotPositions(count) {
  if (count <= 3) {
    return Array.from({ length: count }, (_, i) => new THREE.Vector3((i - (count - 1) / 2) * SLOT_SPACING_X, 0, 0));
  }
  const top = Math.ceil(count / 2);
  const rows = [top, count - top];
  const slots = [];
  rows.forEach((n, row) => {
    for (let i = 0; i < n; i++) {
      slots.push(new THREE.Vector3((i - (n - 1) / 2) * SLOT_SPACING_X, row === 0 ? SLOT_SPACING_Y / 2 : -SLOT_SPACING_Y / 2, 0));
    }
  });
  return slots;
}

// 모기들을 각자의 자리로 옮긴다. 움찔거림은 mosquito.setTwitch가 맡고,
// 없을 때(구현 전)만 예전처럼 날개를 떤다.
function startIdleLoop(mosquitoes, slots) {
  const start = performance.now();

  const tick = (now) => {
    mosquitoes.forEach(({ group, parts, setTwitch }, i) => {
      group.position.lerp(slots[i], 0.08);
      if (typeof setTwitch !== 'function') {
        const tremble = Math.sin(((now - start) / 1000) * 8) * 0.15;
        parts.wingL.rotation.z = tremble;
        parts.wingR.rotation.z = -tremble;
      }
    });
    frameId = requestAnimationFrame(tick);
  };
  frameId = requestAnimationFrame(tick);
}

// 모기마다 머리 위에 HP 바를 띄우고, 모기를 따라다니게 한다.
const BAR_LIFT = 1.15; // 모기 위치에서 바까지 월드 단위로 위로 띄우는 높이
function createHpBars(container, units) {
  const layer = document.createElement('div');
  layer.id = 'stage2-hp';
  layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
  for (const unit of units) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;width:96px;transform:translate(-50%,-100%);text-align:center;font-size:0.8rem;';
    const label = document.createElement('div');
    label.style.cssText = 'margin-bottom:2px;text-shadow:0 1px 4px rgba(0,0,0,0.7);';
    const track = document.createElement('div');
    track.style.cssText =
      'height:9px;border-radius:5px;background:rgba(0,0,0,0.55);overflow:hidden;border:1px solid rgba(255,255,255,0.4);';
    const fill = document.createElement('div');
    fill.style.cssText =
      'height:100%;width:100%;background:linear-gradient(90deg,#ff5252,#ff9f43);transition:width 0.5s ease-out;';
    track.appendChild(fill);
    wrap.append(label, track);
    layer.appendChild(wrap);
    unit.bar = { wrap, label, fill };
  }
  container.appendChild(layer);

  const { camera } = getScene();
  const point = new THREE.Vector3();
  const follow = () => {
    for (const unit of units) {
      point.copy(unit.mosquito.group.position);
      point.y += BAR_LIFT;
      point.project(camera);
      unit.bar.wrap.style.left = `${((point.x + 1) / 2) * window.innerWidth}px`;
      unit.bar.wrap.style.top = `${((1 - point.y) / 2) * window.innerHeight}px`;
    }
    barFrameId = requestAnimationFrame(follow);
  };
  follow();
  return layer;
}

function showHp(unit) {
  unit.bar.label.textContent = unit.hp > 0 ? `HP ${unit.hp}` : '처치 완료';
  unit.bar.fill.style.width = `${(unit.hp / MAX_HP) * 100}%`;
  unit.bar.wrap.style.opacity = unit.hp > 0 ? '1' : '0.6';
}

function createButtons(container, onPick) {
  const bar = document.createElement('div');
  bar.id = 'stage2-buttons';
  bar.style.cssText =
    'position:absolute;left:0;right:0;bottom:24px;display:flex;justify-content:center;gap:16px;';

  const buttons = new Map();
  for (const method of METHODS) {
    const button = document.createElement('button');
    button.textContent = method.label;
    button.addEventListener('click', () => onPick(method));
    bar.appendChild(button);
    buttons.set(method.id, button);
  }
  container.appendChild(bar);

  // busy: 전기충격 연출 중이라 모두 막는다. armed: 지금 켜 둔(대상을 고르는 중이거나 도구를 쓰는 중인) 방법은 강조한다.
  // 쓸 수 있는 모기가 하나도 없는 방법은 막는다.
  const refresh = ({ busy, armed, available }) => {
    for (const [id, button] of buttons) {
      button.disabled = busy || available(id) === 0;
      button.style.opacity = button.disabled ? '0.45' : '1';
      button.style.cursor = button.disabled ? 'default' : 'pointer';
      button.style.outline = armed === id ? '3px solid #fff' : 'none';
    }
  };
  return { el: bar, refresh };
}

// mosquitoes: 잡은 모기 배열(모기 한 마리 객체도 가능). 모기마다 HP를 따로 가진다.
// 처치 방법을 고른 뒤 원하는 모기를 직접 골라 처치한다. 모든 모기가 죽으면 onDone(methodIds)를 부른다.
export function startStage2(mosquitoes, { onDone }) {
  const list = [].concat(mosquitoes).filter(Boolean);
  const slots = slotPositions(list.length);
  const container = document.getElementById('screen-stage2');
  container.querySelector('#stage2-buttons')?.remove();
  container.querySelector('#stage2-hp')?.remove();
  stopIdleLoop();
  stopBarLoop();

  // 모기마다 HP와 (전기충격처럼 한 번만 쓰는) 쓴 방법을 따로 가진다.
  const units = list.map((mosquito) => ({ mosquito, hp: MAX_HP, used: [], bar: null }));
  const usedOrder = []; // 결과 화면에 보여 줄, 처음 쓴 순서의 방법 id (중복 없음)
  let busy = false;
  let armed = null; // 지금 켜 둔 방법 id
  let controller = null;
  let session = 0;
  let positioned = false;
  let finished = false;

  // 잡히면 움찔거리기 시작한다. 죽은 뒤에도 계속 유지된다.
  list.forEach((m) => m.setTwitch?.(1));
  startIdleLoop(list, slots);
  createHpBars(container, units);
  units.forEach(showHp);

  const alive = () => units.filter((u) => u.hp > 0);
  // 이 방법으로 지금 처치할 수 있는 모기: 살아 있고, 한 번만 쓰는 방법이면 아직 안 쓴 모기, 신체뜯기면 뜯을 부위가 남은 모기.
  const candidatesOf = (method) =>
    alive()
      .filter((u) => (method.kind === 'shot' ? !u.used.includes(method.id) : true))
      .filter((u) => (method.id === 'pluck' ? canPluck(u.mosquito) : true))
      .map((u) => u.mosquito);
  const refresh = () =>
    buttons.refresh({
      busy,
      armed,
      available: (id) => candidatesOf(METHODS.find((m) => m.id === id)).length,
    });

  // 모기 하나에 피해를 준다. 모든 모기가 죽었으면 결과로 넘어간다.
  const damage = (mosquito, method) => {
    const unit = units.find((u) => u.mosquito === mosquito);
    if (!unit || unit.hp <= 0 || finished) return;
    if (method.kind === 'shot') unit.used.push(method.id);
    unit.hp = Math.max(0, unit.hp - method.damage);
    showHp(unit);
    if (!usedOrder.includes(method.id)) usedOrder.push(method.id);
    if (alive().length === 0) finish();
    else refresh();
  };

  // 모든 모기가 죽었다: 켜 둔 도구를 끄고 버튼을 치운 뒤 잠깐 있다가 결과로. 죽은 모기는 장면에 그대로 둔다.
  const finish = () => {
    finished = true;
    controller?.abort();
    controller = null;
    buttons.el.remove();
    setTimeout(() => {
      stopBarLoop();
      onDone([...usedOrder]);
    }, DEATH_PAUSE_MS + 500);
  };

  const buttons = createButtons(container, async (method) => {
    if (busy || finished) return;
    // 켜 둔 것이 있으면 끈다. 같은 버튼을 다시 누르면 끄기만 하고, 다른 버튼이면 그 방법으로 바꾼다.
    const wasSame = armed === method.id;
    controller?.abort();
    controller = null;
    if (wasSame) {
      armed = null;
      refresh();
      return;
    }

    if (!positioned) {
      // 첫 연출부터는 자리로 옮기는 동작을 멈춘다 (연출이 위치를 직접 다룬다). 아직 이동 중이면 자리로 바로 옮겨 둔다.
      positioned = true;
      stopIdleLoop();
      list.forEach((m, i) => m.group.position.copy(slots[i]));
    }

    armed = method.id;
    const mine = ++session;
    controller = new AbortController();
    refresh();

    if (method.kind === 'shot') {
      const target = await method.play(candidatesOf(method), {
        signal: controller.signal,
        // 대상이 정해졌다: 이제 취소할 수 없고, 연출이 끝날 때까지 다른 버튼도 막는다.
        onCommit: () => {
          busy = true;
          refresh();
        },
      });
      // 취소됐거나 다른 방법으로 바뀐 경우: 이 호출은 상태를 건드리지 않는다.
      if (target === null || mine !== session) return;
      busy = false;
      armed = null;
      controller = null;
      damage(target, method);
      refresh();
      return;
    }

    // 켜 두는 도구: 끌 때까지(또는 쓸 수 있는 모기가 없어질 때까지) 계속 쓴다. 쓸 때마다 onHit로 피해를 준다.
    await method.play({
      getTargets: () => candidatesOf(method),
      onHit: (mosquito) => damage(mosquito, method),
      signal: controller.signal,
    });
    if (mine === session && !finished) {
      armed = null;
      controller = null;
      refresh();
    }
  });
  refresh();
}
