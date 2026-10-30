import { showScreen } from './main.js';

const METHOD_NAMES = {
  electric: '전기충격',
  magnify: '돋보기화형',
  pluck: '신체뜯기',
};

export function showResult({ seconds, methodId }) {
  document.getElementById('result-time').textContent = `${seconds.toFixed(1)}초`;
  document.getElementById('result-method').textContent = METHOD_NAMES[methodId] ?? methodId;
  showScreen('result');
}
