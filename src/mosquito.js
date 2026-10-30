import * as THREE from 'three';

const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.6 });
const wingMat = new THREE.MeshStandardMaterial({
  color: 0xcfe8ff,
  transparent: true,
  opacity: 0.55,
  side: THREE.DoubleSide,
});
const legMat = new THREE.MeshStandardMaterial({ color: 0x222222 });

// 임시 모기: 도형을 조립해서 만든다. 나중에 모델로 바꿀 때도 parts 이름은 유지한다.
export function createMosquito() {
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
