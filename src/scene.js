import * as THREE from 'three';

let current = null;

const BASE_FOV = 60; // 가로로 넓은 화면(가로 >= 세로)에서의 세로 시야각
const MAX_FOV = 100; // 세로 화면에서 시야각이 이보다 넓어지면 가장자리가 너무 휘어 보인다

function resize({ camera, renderer }) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  // 세로 화면(폰)에서는 가로 시야각이 BASE_FOV 그대로가 되도록 세로 시야각을 넓힌다.
  // 이렇게 해야 모기가 너무 크게 보이지 않고, 2단계에서 여러 마리가 화면 밖에 놓이지 않는다.
  // 가로 화면(PC)은 BASE_FOV 그대로라 달라지지 않는다.
  camera.fov =
    camera.aspect >= 1
      ? BASE_FOV
      : Math.min(MAX_FOV, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2)) / camera.aspect)));
  camera.updateProjectionMatrix();
}

// 1단계와 2단계가 같은 장면을 함께 쓴다. 처음 부를 때만 만들고 렌더 루프를 돌린다.
export function getScene() {
  if (current) return current;

  const canvas = document.getElementById('game-canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // 폰의 3배 화면은 부담이 커서 2배까지만

  const scene = new THREE.Scene();
  scene.background = null;

  const camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.1, 100);
  camera.position.set(0, 0, 8);

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const light = new THREE.DirectionalLight(0xffffff, 1.2);
  light.position.set(3, 5, 6);
  scene.add(light);

  current = { scene, camera, renderer };
  resize(current);
  window.addEventListener('resize', () => resize(current));

  renderer.setAnimationLoop(() => renderer.render(scene, camera));

  return current;
}
