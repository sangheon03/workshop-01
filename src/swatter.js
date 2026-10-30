import * as THREE from 'three';
import { getScene } from './scene.js';

const HIT_RADIUS = 0.7;
const SWING_MS = 180;

const SWATTER_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <rect x="29" y="30" width="6" height="32" rx="3" fill="#8a5a2b"/>
  <rect x="8" y="2" width="48" height="32" rx="8" fill="#e85d5d" stroke="#7a1f1f" stroke-width="3"/>
  <path d="M16 8v20M24 8v20M32 8v20M40 8v20M48 8v20M12 14h40M12 22h40" stroke="#7a1f1f" stroke-width="1.5" opacity=".6"/>
</svg>`;
const SWATTER_URL = `data:image/svg+xml,${encodeURIComponent(SWATTER_SVG)}`;

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const hitSphere = new THREE.Sphere();

let canvas = null;
let target = null;
let onCaught = null;

// 클릭 위치에서 파리채를 휘두르는 모션을 잠깐 보여준다 (맞든 빗나가든 같다).
function playSwing(x, y) {
  const el = document.createElement('img');
  el.src = SWATTER_URL;
  Object.assign(el.style, {
    position: 'fixed',
    left: `${x - 32}px`,
    top: `${y - 4}px`,
    width: '64px',
    height: '64px',
    pointerEvents: 'none',
    zIndex: 10,
    transformOrigin: '50% 100%',
  });
  document.body.appendChild(el);
  el.animate(
    [
      { transform: 'rotate(-60deg)', opacity: 1 },
      { transform: 'rotate(35deg)', opacity: 1, offset: 0.7 },
      { transform: 'rotate(35deg)', opacity: 0 },
    ],
    { duration: SWING_MS, easing: 'ease-in' },
  );
  setTimeout(() => el.remove(), SWING_MS);
}

function onClick(event) {
  playSwing(event.clientX, event.clientY);

  if (!target) return;
  const { camera } = getScene();
  pointer.set((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  hitSphere.set(target.group.position, HIT_RADIUS);
  if (raycaster.ray.intersectsSphere(hitSphere)) onCaught?.(target);
}

// 인자 없이 부르면 커서만 파리채 모양으로 바꾼다. mosquito와 onCaught를 주면 클릭 판정도 한다.
export function enableSwatter({ mosquito = null, onCaught: callback = null } = {}) {
  disableSwatter();
  canvas = document.getElementById('game-canvas');
  target = mosquito;
  onCaught = callback;
  canvas.style.cursor = `url("${SWATTER_URL}") 32 4, crosshair`;
  canvas.addEventListener('click', onClick);
}

export function disableSwatter() {
  if (!canvas) return;
  canvas.removeEventListener('click', onClick);
  canvas.style.cursor = '';
  canvas = null;
  target = null;
  onCaught = null;
}
