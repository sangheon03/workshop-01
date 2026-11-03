import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.6 });
const wingMat = new THREE.MeshStandardMaterial({
  color: 0xcfe8ff,
  transparent: true,
  opacity: 0.55,
  side: THREE.DoubleSide,
});
const legMat = new THREE.MeshStandardMaterial({ color: 0x222222 });

const MODEL_URL = new URL('../assets/mosquito_reference.gltf', import.meta.url).href;
const BODY_LENGTH = 1.2;
// 모델은 머리가 +x를 향하고 게임의 모기는 +z를 향하므로 y축으로 돌려 맞춘다.
const TURN = new THREE.Matrix4().makeRotationY(-Math.PI / 2);

// 모델을 부위별로 나눠 둔다 (원본 노드와 각 부위의 회전축 위치). 불러오지 못하면 null이고 임시 도형을 쓴다.
// 최상위 await라서 이 모듈을 쓰는 쪽은 모델 로딩이 끝난 뒤에 시작된다.
const model = await loadModel();

async function loadModel() {
  try {
    const { scene } = await new GLTFLoader().loadAsync(MODEL_URL);
    scene.updateMatrixWorld(true);
    return splitModel(scene);
  } catch (error) {
    console.warn('모기 모델을 불러오지 못해 임시 모기를 씁니다.', error);
    return null;
  }
}

function splitModel(scene) {
  const groups = { body: [], wingL: [], wingR: [], proboscis: [], legs: new Map() };
  scene.traverse((node) => {
    if (!node.isMesh) return;
    const name = node.name;
    const leg = name.match(/^Leg_(Left|Right)_(Hind|Middle|Front)/);
    if (name.startsWith('Wing_Left')) groups.wingL.push(node);
    else if (name.startsWith('Wing_Right')) groups.wingR.push(node);
    else if (/^(Proboscis|Mouthparts)/.test(name)) groups.proboscis.push(node);
    else if (leg) {
      const key = `${leg[1]}_${leg[2]}`;
      if (!groups.legs.has(key)) groups.legs.set(key, []);
      groups.legs.get(key).push(node);
    } else groups.body.push(node);
  });

  const box = (nodes) => nodes.reduce((b, n) => b.expandByObject(n), new THREE.Box3());
  const center = (nodes) => box(nodes).getCenter(new THREE.Vector3());
  // 날개는 몸통에 붙은 쪽 끝을 축으로 퍼덕인다.
  const wingRoot = (nodes, side) => {
    const b = box(nodes);
    return new THREE.Vector3((b.min.x + b.max.x) / 2, b.min.y, side > 0 ? b.min.z : b.max.z);
  };

  const bodyBox = box([...groups.body, ...groups.proboscis]);
  const origin = bodyBox.getCenter(new THREE.Vector3());
  const length = bodyBox.max.x - bodyBox.min.x;

  const parts = [
    { key: 'body', nodes: groups.body, pivot: origin },
    { key: 'wingL', nodes: groups.wingL, pivot: wingRoot(groups.wingL, 1) },
    { key: 'wingR', nodes: groups.wingR, pivot: wingRoot(groups.wingR, -1) },
    { key: 'proboscis', nodes: groups.proboscis, pivot: center(groups.proboscis) },
    ...[...groups.legs.values()].map((nodes) => ({ key: 'leg', nodes, pivot: center(nodes) })),
  ];
  return { parts, origin, scale: BODY_LENGTH / length };
}

// 모델에서 모기를 한 마리 만든다. 부위마다 회전축 위치에 pivot을 두고, 그 안에 원본 메시를 복제해 넣는다.
function createModelMosquito() {
  const { parts: specs, origin, scale } = model;
  const group = new THREE.Group();
  const parts = { legs: [] };

  // 모델 좌표 p를 게임 좌표로: scale * TURN * (p - origin)
  const toGame = (p) => p.clone().sub(origin).applyMatrix4(TURN).multiplyScalar(scale);

  for (const { key, nodes, pivot: at } of specs) {
    const pivot = new THREE.Group();
    pivot.position.copy(toGame(at));

    const inner = new THREE.Group();
    inner.rotation.y = -Math.PI / 2;
    inner.scale.setScalar(scale);
    inner.position.copy(at.clone().applyMatrix4(TURN).multiplyScalar(-scale));
    for (const node of nodes) {
      const mesh = node.clone();
      mesh.material = node.material.clone();
      inner.add(mesh);
    }
    pivot.add(inner);
    group.add(pivot);

    if (key === 'leg') parts.legs.push(pivot);
    else parts[key] = pivot;
  }
  return { group, parts };
}

export function createMosquito() {
  const mosquito = model ? createModelMosquito() : createTempMosquito();
  mosquito.setTwitch = createTwitch(mosquito);
  return mosquito;
}

// 잡힌 모기의 움찔거림. level 0은 멈춤, 1은 기본, 클수록 격하게 떤다. 바꾸기 전까지 계속 유지된다.
// 매 프레임 "지난 프레임에 더한 흔들림"을 먼저 빼고 새 흔들림을 더하는 방식이라,
// 다른 코드가 위치·날개를 옮겨도 모기가 밀려나지 않고 원래 자리를 기준으로 흔들린다.
// 모기가 장면에서 빠지면(resetGame 등) 스스로 멈춘다. 부위가 없거나 떨어져 나가도 에러 없이 건너뛴다.
function createTwitch(mosquito) {
  const { group } = mosquito;
  const shake = new THREE.Vector3();
  const lastShake = new THREE.Vector3();
  const lastRot = new Map(); // 부위 -> 지난 프레임에 더한 회전(z)
  let level = 0;
  let frameId = null;
  let seed = Math.random() * 100;

  const rotating = () => {
    const { parts } = mosquito;
    return [parts.wingL, parts.wingR, ...(parts.legs ?? [])].filter(Boolean);
  };

  function apply(offset, rotFor) {
    group.position.sub(lastShake).add(offset);
    lastShake.copy(offset);
    const next = new Map();
    for (const part of rotating()) {
      const rot = rotFor(part);
      part.rotation.z += rot - (lastRot.get(part) ?? 0);
      next.set(part, rot);
    }
    lastRot.clear();
    for (const [part, rot] of next) lastRot.set(part, rot);
  }

  function tick(now) {
    if (!group.parent) {
      frameId = null;
      return;
    }
    frameId = requestAnimationFrame(tick);
    const t = now / 1000 + seed;
    const power = Math.min(level, 10);
    const amp = 0.015 * power;
    const hz = 18 + 4 * power;
    shake.set(
      Math.sin(t * hz * 6.28) * amp,
      Math.sin(t * hz * 5.1 + 1) * amp,
      Math.sin(t * hz * 4.3 + 2) * amp * 0.5,
    );
    apply(shake, (part) => Math.sin(t * hz * 7 + part.id) * 0.08 * power);
  }

  return function setTwitch(next) {
    level = Math.max(0, Number(next) || 0);
    if (level > 0) {
      if (frameId === null) frameId = requestAnimationFrame(tick);
    } else {
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = null;
      apply(shake.set(0, 0, 0), () => 0);
    }
  };
}

// 임시 모기: 도형을 조립해서 만든다. 모델을 불러오지 못했을 때만 쓴다. parts 이름은 모델 모기와 같다.
function createTempMosquito() {
  const group = new THREE.Group();

  // 몸통 (앞쪽이 +z)
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), bodyMat);
  body.scale.set(0.7, 0.7, 1.8);
  group.add(body);

  // 날개: 몸통 양옆, 한쪽 끝을 축으로 퍼덕일 수 있도록 pivot 그룹에 담는다.
  const wingGeo = new THREE.CircleGeometry(0.45, 16);
  wingGeo.scale(1, 0.4, 1);
  wingGeo.rotateX(-Math.PI / 2);
  wingGeo.translate(0.45, 0, 0);

  const wingL = new THREE.Group();
  const wingLMesh = new THREE.Mesh(wingGeo, wingMat);
  wingLMesh.scale.x = -1;
  wingL.add(wingLMesh);
  wingL.position.set(-0.12, 0.2, 0);
  group.add(wingL);

  const wingR = new THREE.Group();
  wingR.add(new THREE.Mesh(wingGeo, wingMat));
  wingR.position.set(0.12, 0.2, 0);
  group.add(wingR);

  // 다리 6개: 몸통 아래에서 양옆으로 뻗는다.
  const legs = [];
  const legGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6);
  legGeo.rotateZ(Math.PI / 2);
  legGeo.translate(0.3, 0, 0);
  for (const z of [-0.2, 0, 0.2]) {
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(0, -0.15, z);
      leg.scale.x = side;
      leg.rotation.z = side * -0.5;
      group.add(leg);
      legs.push(leg);
    }
  }

  // 주둥이: 몸통 앞쪽으로 뻗은 가는 원뿔
  const proboscis = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.6, 8), legMat);
  proboscis.rotation.x = Math.PI / 2;
  proboscis.position.set(0, 0, 0.85);
  group.add(proboscis);

  return { group, parts: { body, wingL, wingR, legs, proboscis } };
}
