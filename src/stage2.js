import * as THREE from 'three';
import { playElectric } from './kills/electric.js';
import { playPluck } from './kills/pluck.js';
import { playMagnify } from './kills/magnify.js';

const MAX_HP = 100;
// 방법별 피해량. 어떤 조합이든 2~3가지를 쓰면 HP가 0이 된다.
const METHODS = [
  { id: 'electric', label: '전기충격', damage: 50, play: playElectric },
  { id: 'pluck', label: '신체뜯기', damage: 40, play: playPluck },
  { id: 'magnify', label: '돋보기화형', damage: 50, play: playMagnify },
];
// 마지막 연출이 끝난 뒤 죽은 모기를 잠깐 보여 주고 결과로 넘어간다.
const DEATH_PAUSE_MS = 900;

let frameId = null;

function stopIdleLoop() {
  if (frameId !== null) {
    cancelAnimationFrame(frameId);
    frameId = null;
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

// 처치 연출을 모든 모기에게 적용한다.
// 연출이 여러 마리를 한꺼번에 받을 수 있으면(`play.multi`가 true) 배열째로 한 번에 부르고,
// 아직 한 마리만 받는 연출이면 모기마다 차례로 적용한다. (모두 한꺼번에 하는 연출은 #60~#62에서 `multi`로 바뀐다.)
async function playOnAll(method, mosquitoes) {
  if (method.play.multi) {
    await method.play(mosquitoes);
    return;
  }
  for (const mosquito of mosquitoes) await method.play(mosquito);
}

function createHpBar(container, count) {
  const wrap = document.createElement('div');
  wrap.id = 'stage2-hp';
  wrap.style.cssText =
    'position:absolute;top:72px;left:50%;transform:translateX(-50%);width:min(420px,80vw);';

  const label = document.createElement('div');
  label.style.cssText = 'font-size:0.95rem;margin-bottom:4px;text-align:left;';
  const track = document.createElement('div');
  track.style.cssText =
    'height:16px;border-radius:8px;background:rgba(0,0,0,0.55);overflow:hidden;border:1px solid rgba(255,255,255,0.35);';
  const fill = document.createElement('div');
  fill.style.cssText =
    'height:100%;width:100%;background:linear-gradient(90deg,#ff5252,#ff9f43);transition:width 0.6s ease-out;';
  track.appendChild(fill);
  wrap.append(label, track);
  container.appendChild(wrap);

  const set = (hp) => {
    label.textContent = `${count > 1 ? `모기 ${count}마리 ` : '모기 '}HP ${hp} / ${MAX_HP}`;
    fill.style.width = `${(hp / MAX_HP) * 100}%`;
  };
  set(MAX_HP);
  return { el: wrap, set };
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

  // 연출 중에는 전부 막고, 이미 쓴 방법은 계속 막는다.
  const refresh = ({ busy, used }) => {
    for (const [id, button] of buttons) {
      button.disabled = busy || used.includes(id);
      button.style.opacity = button.disabled ? '0.45' : '1';
      button.style.cursor = button.disabled ? 'default' : 'pointer';
    }
  };
  return { el: bar, refresh };
}

// mosquitoes: 잡은 모기 배열. 모기 한 마리 객체도 받아 준다. 모든 모기가 HP 하나를 공유한다.
export function startStage2(mosquitoes, { onDone }) {
  const list = [].concat(mosquitoes).filter(Boolean);
  const slots = slotPositions(list.length);
  const container = document.getElementById('screen-stage2');
  container.querySelector('#stage2-buttons')?.remove();
  container.querySelector('#stage2-hp')?.remove();
  stopIdleLoop();

  let hp = MAX_HP;
  const used = [];
  let busy = false;

  // 잡히면 움찔거리기 시작한다. 죽은 뒤에도 계속 유지된다.
  list.forEach((m) => m.setTwitch?.(1));
  startIdleLoop(list, slots);

  const hpBar = createHpBar(container, list.length);
  const buttons = createButtons(container, async (method) => {
    if (busy || used.includes(method.id)) return;
    busy = true;
    buttons.refresh({ busy, used });
    // 첫 연출부터는 자리로 옮기는 동작을 멈춘다 (연출이 위치를 직접 다룬다). 아직 이동 중이면 자리로 바로 옮겨 둔다.
    stopIdleLoop();
    list.forEach((m, i) => m.group.position.copy(slots[i]));

    await playOnAll(method, list);

    used.push(method.id);
    hp = Math.max(0, hp - method.damage);
    hpBar.set(hp);
    busy = false;

    if (hp > 0) {
      buttons.refresh({ busy, used });
      return;
    }

    // HP 0: 버튼을 치우고 잠깐 뒤 결과로. 죽은 모기는 장면에 그대로 둔다.
    buttons.el.remove();
    setTimeout(() => onDone([...used]), DEATH_PAUSE_MS);
  });
  buttons.refresh({ busy, used });
}
