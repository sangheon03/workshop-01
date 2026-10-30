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

// 지금 장면에 있는 모기. 1단계에서 잡힌 모기를 이 변수에 담는다 (이슈 #9에서 연결).
let currentMosquito = null;

export function resetGame() {
  currentMosquito?.group?.parent?.remove(currentMosquito.group);
  currentMosquito = null;
  showScreen('start');
}

document.getElementById('btn-start').addEventListener('click', () => {
  showScreen('stage1');
});

document.getElementById('btn-retry').addEventListener('click', resetGame);
