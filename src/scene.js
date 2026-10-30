import * as THREE from 'three';

let current = null;

function resize({ camera, renderer }) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

// 1단계와 2단계가 같은 장면을 함께 쓴다. 처음 부를 때만 만들고 렌더 루프를 돌린다.
export function getScene() {
  if (current) return current;

  const canvas = document.getElementById('game-canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x10131a);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
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
