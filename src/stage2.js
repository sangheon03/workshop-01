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

// 모기를 화면 가운데로 옮긴다. 움찔거림은 mosquito.setTwitch가 맡고,
// 없을 때(구현 전)만 예전처럼 날개를 떤다.
function startIdleLoop(mosquito) {
  const { group, parts } = mosquito;
  const center = new THREE.Vector3(0, 0, 0);
  const start = performance.now();
  const useWingFallback = typeof mosquito.setTwitch !== 'function';

  const tick = (now) => {
    group.position.lerp(center, 0.08);
    if (useWingFallback) {
      const tremble = Math.sin(((now - start) / 1000) * 8) * 0.15;
      parts.wingL.rotation.z = tremble;
      parts.wingR.rotation.z = -tremble;
    }
    frameId = requestAnimationFrame(tick);
  };
  frameId = requestAnimationFrame(tick);
}

function createHpBar(container) {
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
    label.textContent = `모기 HP ${hp} / ${MAX_HP}`;
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
    button.textContent = `${method.label} (-${method.damage})`;
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

export function startStage2(mosquito, { onDone }) {
  const container = document.getElementById('screen-stage2');
  container.querySelector('#stage2-buttons')?.remove();
  container.querySelector('#stage2-hp')?.remove();
  stopIdleLoop();

  let hp = MAX_HP;
  const used = [];
  let busy = false;

  // 잡히면 움찔거리기 시작한다. 죽은 뒤에도 계속 유지된다.
  mosquito.setTwitch?.(1);
  startIdleLoop(mosquito);

  const hpBar = createHpBar(container);
  const buttons = createButtons(container, async (method) => {
    if (busy || used.includes(method.id)) return;
    busy = true;
    buttons.refresh({ busy, used });
    // 첫 연출부터는 모기를 가운데로 옮기는 동작을 멈춘다 (연출이 위치를 직접 다룬다).
    stopIdleLoop();

    await method.play(mosquito);

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
