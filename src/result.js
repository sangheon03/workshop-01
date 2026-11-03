import * as THREE from 'three';
import { showScreen } from './main.js';
import { getScene } from './scene.js';

const METHOD_NAMES = {
  electric: '전기충격',
  magnify: '돋보기화형',
  pluck: '신체뜯기',
};

// 처치가 끝난 장면에서 모기가 차지한 부분만 잘라 이미지(data URL)로 만든다.
// render() 직후 같은 틱에서 읽어야 캔버스 내용이 남아 있다.
function captureMosquito(mosquito) {
  const group = mosquito?.group;
  if (!group?.parent || !group.visible) return null;

  const { scene, camera, renderer } = getScene();
  group.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(group);
  if (box.isEmpty()) return null;

  camera.updateMatrixWorld();
  const src = renderer.domElement;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        const p = new THREE.Vector3(x, y, z).project(camera);
        const px = ((p.x + 1) / 2) * src.width;
        const py = ((1 - p.y) / 2) * src.height;
        minX = Math.min(minX, px);
        maxX = Math.max(maxX, px);
        minY = Math.min(minY, py);
        maxY = Math.max(maxY, py);
      }
    }
  }

  const padX = (maxX - minX) * 0.1;
  const padY = (maxY - minY) * 0.1;
  const sx = Math.max(0, Math.floor(minX - padX));
  const sy = Math.max(0, Math.floor(minY - padY));
  const sw = Math.min(src.width, Math.ceil(maxX + padX)) - sx;
  const sh = Math.min(src.height, Math.ceil(maxY + padY)) - sy;
  if (sw <= 0 || sh <= 0) return null;

  renderer.render(scene, camera);
  const out = document.createElement('canvas');
  out.width = sw;
  out.height = sh;
  out.getContext('2d').drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
  return out.toDataURL('image/png');
}

// methodIds: 쓴 처치 방법 id 배열(쓴 순서). 문자열 하나가 와도 받아 준다.
export function showResult({ methodIds, mosquito }) {
  const ids = [].concat(methodIds ?? []);
  document.getElementById('result-method').textContent =
    ids.map((id) => METHOD_NAMES[id] ?? id).join(' → ') || '-';

  const img = document.getElementById('result-mosquito');
  const url = captureMosquito(mosquito);
  img.hidden = !url;
  if (url) img.src = url;

  showScreen('result');
}
