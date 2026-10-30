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

export function resetGame() {
  showScreen('start');
}

document.getElementById('btn-start').addEventListener('click', () => {
  showScreen('stage1');
});
