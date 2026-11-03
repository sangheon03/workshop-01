import { startStage1, stopStage1 } from './stage1.js';
import { startStage2 } from './stage2.js';
import { showResult } from './result.js';

const SCREEN_NAMES = ['start', 'stage1', 'stage2', 'result'];
// 잡은 모기가 이만큼 모이면 자동으로 고문 단계로 넘어간다.
const MAX_CAPTURED = 6;

export function showScreen(name) {
  if (!SCREEN_NAMES.includes(name)) {
    throw new Error(`알 수 없는 화면 이름: ${name}`);
  }
  for (const screenName of SCREEN_NAMES) {
    const el = document.getElementById(`screen-${screenName}`);
    el.classList.toggle('active', screenName === name);
  }
}

// 지금까지 잡은 모기들. 1단계에서 잡힐 때마다 여기에 담고, '고문 시작'을 누르면 2단계로 넘긴다.
let captured = [];

function updateCatchHud() {
  document.getElementById('catch-count').textContent = String(captured.length);
  document.getElementById('btn-torture').disabled = captured.length === 0;
}

export function resetGame() {
  stopStage1();
  // 날아다니던 모기는 stopStage1이 치우고, 잡은 모기는 여기서 치운다.
  for (const mosquito of captured) mosquito.group?.parent?.remove(mosquito.group);
  captured = [];
  updateCatchHud();
  showScreen('start');
}

// 잡은 모기들을 한꺼번에 고문하는 2단계로 넘어간다.
function startTorture() {
  if (captured.length === 0) return;
  const mosquitoes = captured;
  stopStage1();
  showScreen('stage2');
  startStage2(mosquitoes, {
    onDone: (methodIds) => showResult({ methodIds, mosquitoes }),
  });
}

function startGame() {
  captured = [];
  updateCatchHud();
  showScreen('stage1');
  startStage1({
    onCaught: (mosquito) => {
      if (captured.includes(mosquito)) return;
      captured.push(mosquito);
      updateCatchHud();
      if (captured.length >= MAX_CAPTURED) startTorture();
    },
  });
}

document.getElementById('btn-start').addEventListener('click', startGame);

document.getElementById('btn-torture').addEventListener('click', startTorture);

document.getElementById('btn-retry').addEventListener('click', resetGame);
