import * as THREE from 'three';
import { getScene } from './scene.js';
import { SWATTER, playClickMotion } from './cursors.js';

const HIT_RADIUS = 0.7;
const SWING_MS = 220;

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const hitSphere = new THREE.Sphere();

let canvas = null;
let target = null;
let getTargets = null;
let onCaught = null;

// 클릭 위치에서 파리채를 휘두르는 모션을 잠깐 보여준다 (맞든 빗나가든 같다).
// 그물 한가운데(클릭 지점)를 중심으로 크게 내리쳤다가 돌아오는 느낌으로 보이게 한다.
function playSwing(x, y) {
  playClickMotion(SWATTER, x, y, {
    scale: 1.4,
    ms: SWING_MS,
    frames: [
      { transform: 'rotate(-35deg) scale(1.25)', opacity: 1 },
      { transform: 'rotate(12deg) scale(0.9)', opacity: 1, offset: 0.65 },
      { transform: 'rotate(12deg) scale(0.9)', opacity: 0 },
    ],
  });
}

const hitPoint = new THREE.Vector3();

function onClick(event) {
  playSwing(event.clientX, event.clientY);

  // 잡을 수 있는 모기들: targets()가 있으면 그 목록, 없으면 예전처럼 mosquito 한 마리.
  const list = getTargets ? getTargets() : target ? [target] : [];
  if (list.length === 0) return;
  const { camera } = getScene();
  pointer.set((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);

  // 광선에 맞은 모기가 여럿이면 카메라에 가장 가까운 한 마리만 잡는다.
  let best = null;
  let bestDistance = Infinity;
  for (const mosquito of list) {
    hitSphere.set(mosquito.group.position, HIT_RADIUS);
    if (!raycaster.ray.intersectSphere(hitSphere, hitPoint)) continue;
    const distance = hitPoint.distanceTo(camera.position);
    if (distance < bestDistance) {
      best = mosquito;
      bestDistance = distance;
    }
  }
  if (best) onCaught?.(best);
}

// 인자 없이 부르면 커서만 파리채 모양으로 바꾼다. onCaught와 함께 targets(잡을 수 있는 모기 배열을 돌려주는 함수)나
// mosquito(한 마리)를 주면 클릭 판정도 한다.
export function enableSwatter({ targets = null, mosquito = null, onCaught: callback = null } = {}) {
  disableSwatter();
  canvas = document.getElementById('game-canvas');
  target = mosquito;
  getTargets = targets;
  onCaught = callback;
  canvas.style.cursor = SWATTER.cursor;
  canvas.addEventListener('click', onClick);
}

export function disableSwatter() {
  if (!canvas) return;
  canvas.removeEventListener('click', onClick);
  canvas.style.cursor = '';
  canvas = null;
  target = null;
  getTargets = null;
  onCaught = null;
}
