import * as THREE from 'three';
import { getScene } from './scene.js';
import { createMosquito } from './mosquito.js';
import { enableSwatter, disableSwatter } from './swatter.js';

const SPEED = 3;
const REF_DEPTH = 8; // 카메라와의 기준 거리. 가까울수록 느리게, 멀수록 빠르게 보정한다.
const TURN_RATE = 6;
const WING_FLAP_HZ = 35;
const WING_FLAP_ANGLE = 0.6;
const MARGIN = 0.8;
// 카메라(z=8)와의 거리 약 3.5~14. 가까이 올 때 크게, 멀어질 때 작게 보이되 화면을 다 가리지는 않는다.
const Z_RANGE = [-6, 4.5];

let mosquito = null;
let target = new THREE.Vector3();
let frameId = null;
let lastTime = 0;
let elapsed = 0;

// 카메라에 보이는 범위 안에서 무작위 목표 지점을 고른다.
function pickTarget() {
  const { camera } = getScene();
  const z = THREE.MathUtils.randFloat(Z_RANGE[0], Z_RANGE[1]);
  const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * (camera.position.z - z) - MARGIN;
  const halfW = halfH * camera.aspect;
  target.set(
    THREE.MathUtils.randFloatSpread(halfW * 2),
    THREE.MathUtils.randFloatSpread(halfH * 2),
    z,
  );
}

const lookMatrix = new THREE.Matrix4();
const lookQuat = new THREE.Quaternion();
const up = new THREE.Vector3(0, 1, 0);

function tick(now) {
  frameId = requestAnimationFrame(tick);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  elapsed += dt;

  const { group, parts } = mosquito;
  const toTarget = target.clone().sub(group.position);
  const dist = toTarget.length();
  if (dist < 0.3) {
    pickTarget();
  } else {
    // 깊이에 따라 속도를 보정해서, 화면에서 보이는 움직임이 비슷하게 느껴지게 한다.
    const { camera } = getScene();
    const depthScale = THREE.MathUtils.clamp(Math.abs(camera.position.z - group.position.z) / REF_DEPTH, 0.5, 1.5);
    group.position.addScaledVector(toTarget.normalize(), Math.min(SPEED * depthScale * dt, dist));
    lookMatrix.lookAt(target, group.position, up);
    lookQuat.setFromRotationMatrix(lookMatrix);
    group.quaternion.slerp(lookQuat, Math.min(TURN_RATE * dt, 1));
  }

  const flap = Math.sin(elapsed * WING_FLAP_HZ * Math.PI * 2) * WING_FLAP_ANGLE;
  parts.wingR.rotation.z = flap;
  parts.wingL.rotation.z = -flap;
}

export function startStage1({ onCaught }) {
  stopStage1();
  const { scene } = getScene();
  mosquito?.group.parent?.remove(mosquito.group);

  mosquito = createMosquito();
  pickTarget();
  mosquito.group.position.copy(target);
  pickTarget();
  scene.add(mosquito.group);

  lastTime = performance.now();
  frameId = requestAnimationFrame(tick);

  enableSwatter({
    mosquito,
    onCaught: (caught) => {
      stopStage1();
      onCaught?.(caught);
    },
  });
}

export function stopStage1() {
  if (frameId !== null) cancelAnimationFrame(frameId);
  frameId = null;
  disableSwatter();
}
