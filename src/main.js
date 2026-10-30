import { startStage1, stopStage1 } from './stage1.js';
import { startStage2 } from './stage2.js';
import { showResult } from './result.js';

const SCREEN_NAMES = ['start', 'stage1', 'stage2', 'result'];

export function showScreen(name) {
  if (!SCREEN_NAMES.includes(name)) {
    throw new Error(`알 수 없는 화면 이름: ${name}`);
  }
  for (const screenName of SCREEN_NAMES) {
    const el = document.getElementById(`screen-${screenName}`);
    el.classList.toggle('active', screenName === name);
  }
}

// 지금 장면에 있는 모기. 1단계에서 잡힌 모기를 이 변수에 담는다.
let currentMosquito = null;

export function resetGame() {
  stopStage1();
  currentMosquito?.group?.parent?.remove(currentMosquito.group);
  currentMosquito = null;
  showScreen('start');
}

function startGame() {
  const startedAt = performance.now();
  showScreen('stage1');
  startStage1({
    onCaught: (mosquito) => {
      const seconds = (performance.now() - startedAt) / 1000;
      currentMosquito = mosquito;
      stopStage1();
      showScreen('stage2');
      startStage2(mosquito, {
        onDone: (methodId) => showResult({ seconds, methodId }),
      });
    },
  });
}

document.getElementById('btn-start').addEventListener('click', startGame);

document.getElementById('btn-retry').addEventListener('click', resetGame);
