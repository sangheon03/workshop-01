import * as THREE from 'three';
import { showScreen } from './main.js';
import { getScene } from './scene.js';

const METHOD_NAMES = {
  electric: '전기충격',
  magnify: '돋보기화형',
  pluck: '신체뜯기',
};

// 처치가 끝난 장면에서 모기 한 마리만 크게 찍어 이미지(data URL)로 만든다. others는 같이 잡은 다른 모기들이다.
// 게임 카메라는 그대로 두고, 복제한 카메라를 모기 쪽으로 당겨서 다시 그린다.
// render() 직후 같은 틱에서 읽어야 캔버스 내용이 남아 있다.
function captureMosquito(mosquito, others = []) {
  const group = mosquito?.group;
  if (!group?.parent || !group.visible) return null;

  const { scene, camera, renderer } = getScene();
  group.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(group);
  if (box.isEmpty()) return null;

  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const view = camera.clone();
  const direction = camera.position.clone().sub(sphere.center).normalize();
  // 세로·가로 중 더 좁은 쪽 시야각에 맞춰 모기가 프레임에 들어오는 거리를 구한다.
  const halfV = THREE.MathUtils.degToRad(view.fov) / 2;
  const halfH = Math.atan(Math.tan(halfV) * view.aspect);
  const distance = (sphere.radius / Math.sin(Math.min(halfV, halfH))) * 1.25;
  view.position.copy(sphere.center).addScaledVector(direction, distance);
  view.lookAt(sphere.center);
  view.updateMatrixWorld();

  const src = renderer.domElement;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        const p = new THREE.Vector3(x, y, z).project(view);
        const px = ((p.x + 1) / 2) * src.width;
        const py = ((1 - p.y) / 2) * src.height;
        minX = Math.min(minX, px);
        maxX = Math.max(maxX, px);
        minY = Math.min(minY, py);
        maxY = Math.max(maxY, py);
      }
    }
  }

  const padX = (maxX - minX) * 0.08;
  const padY = (maxY - minY) * 0.08;
  const sx = Math.max(0, Math.floor(minX - padX));
  const sy = Math.max(0, Math.floor(minY - padY));
  const sw = Math.min(src.width, Math.ceil(maxX + padX)) - sx;
  const sh = Math.min(src.height, Math.ceil(maxY + padY)) - sy;
  if (sw <= 0 || sh <= 0) return null;

  // 이웃 모기가 같이 찍히지 않도록 이 모기만 남기고 그리고, 곧바로 되돌린다.
  const hidden = others.filter((m) => m !== mosquito && m.group?.visible);
  hidden.forEach((m) => {
    m.group.visible = false;
  });
  renderer.render(scene, view);
  hidden.forEach((m) => {
    m.group.visible = true;
  });
  const out = document.createElement('canvas');
  out.width = sw;
  out.height = sh;
  out.getContext('2d').drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
  return out.toDataURL('image/png');
}

// methodIds: 쓴 처치 방법 id 배열(쓴 순서). 문자열 하나가 와도 받아 준다.
// mosquitoes: 잡은 모기 배열. 모기 한 마리(mosquito)만 와도 받아 준다.
export function showResult({ methodIds, mosquitoes, mosquito }) {
  const list = [].concat(mosquitoes ?? mosquito ?? []).filter(Boolean);
  const ids = [].concat(methodIds ?? []);
  document.getElementById('result-method').textContent =
    ids.map((id) => METHOD_NAMES[id] ?? id).join(' → ') || '-';
  document.getElementById('result-count').textContent = `${list.length}마리`;

  const box = document.getElementById('result-mosquitoes');
  box.replaceChildren();
  for (const m of list) {
    const url = captureMosquito(m, list);
    if (!url) continue;
    const img = new Image();
    img.alt = '죽은 모기';
    img.src = url;
    box.append(img);
  }
  // 찍은 뒤에는 장면 속 모기를 숨긴다 (결과 글자 뒤로 겹쳐 보이지 않게). 치우는 건 resetGame이 한다.
  for (const m of list) if (m.group) m.group.visible = false;

  showScreen('result');
}
