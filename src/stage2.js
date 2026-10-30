import * as THREE from 'three';
import { playElectric } from './kills/electric.js';
import { playPluck } from './kills/pluck.js';

const METHODS = [
  { id: 'electric', label: '전기충격', play: playElectric },
  { id: 'pluck', label: '신체뜯기', play: playPluck },
];

let frameId = null;

function stopIdleLoop() {
  if (frameId !== null) {
    cancelAnimationFrame(frameId);
    frameId = null;
  }
}

// 모기를 화면 가운데로 옮기고, 날개만 천천히 떨게 한다.
function startIdleLoop(mosquito) {
  const { group, parts } = mosquito;
  const center = new THREE.Vector3(0, 0, 0);
  const start = performance.now();

  const tick = (now) => {
    group.position.lerp(center, 0.08);
    const t = (now - start) / 1000;
    const tremble = Math.sin(t * 8) * 0.15;
    parts.wingL.rotation.z = tremble;
    parts.wingR.rotation.z = -tremble;
    frameId = requestAnimationFrame(tick);
  };
  frameId = requestAnimationFrame(tick);
}

function createButtons(container, onPick) {
  const bar = document.createElement('div');
  bar.id = 'stage2-buttons';
  bar.style.cssText =
    'position:absolute;left:0;right:0;bottom:24px;display:flex;justify-content:center;gap:16px;';

  for (const method of METHODS) {
    const button = document.createElement('button');
    button.textContent = method.label;
    button.addEventListener('click', () => onPick(method, bar));
    bar.appendChild(button);
  }

  container.appendChild(bar);
  return bar;
}

export function startStage2(mosquito, { onDone }) {
  const container = document.getElementById('screen-stage2');
  container.querySelector('#stage2-buttons')?.remove();

  startIdleLoop(mosquito);

  createButtons(container, async (method, bar) => {
    // 연출 중에는 버튼을 다시 누를 수 없게 치운다.
    bar.remove();
    stopIdleLoop();
    await method.play(mosquito);
    onDone(method.id);
  });
}
