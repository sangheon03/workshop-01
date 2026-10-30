import * as THREE from 'three';
import { getScene } from './scene.js';
import { createMosquito } from './mosquito.js';

const SPEED = 3;
const TURN_RATE = 6;
const WING_FLAP_HZ = 35;
const WING_FLAP_ANGLE = 0.6;
const MARGIN = 0.8;
const Z_RANGE = [-2, 2];

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
    group.position.addScaledVector(toTarget.normalize(), Math.min(SPEED * dt, dist));
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
}

export function stopStage1() {
  if (frameId !== null) cancelAnimationFrame(frameId);
  frameId = null;
}
