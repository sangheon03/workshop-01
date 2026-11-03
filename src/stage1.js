import * as THREE from 'three';
import { getScene } from './scene.js';
import { createMosquito } from './mosquito.js';
import { enableSwatter, disableSwatter } from './swatter.js';

const SPEED = 3;
const REF_DEPTH = 8; // 카메라와의 기준 거리. 가까울수록 느리게, 멀수록 빠르게 보정한다.
const ACCEL = 9; // 속도를 바꿀 수 있는 최대 가속도. 클수록 급하게 방향을 튼다.
const TURN_RATE = 8; // 몸이 진행 방향을 따라가는 속도
const ARRIVE_DIST = 1.2; // 목표에 이만큼 다가가면 멈추지 않고 곧바로 다음 목표를 고른다.
const MAX_TURN_COS = -0.2; // 새 목표가 진행 방향과 이보다 더 반대(약 100° 이상)면 다시 고른다.
const BANK = 0.12; // 휠 때 몸이 기우는 정도
const MAX_BANK = 0.7;
const WING_FLAP_HZ = 35;
const WING_FLAP_ANGLE = 0.6;
const MARGIN = 0.8;
// 카메라(z=8)와의 거리 약 3.5~14. 가까이 올 때 크게, 멀어질 때 작게 보이되 화면을 다 가리지는 않는다.
const Z_RANGE = [-6, 4.5];

let mosquito = null;
let target = new THREE.Vector3();
const velocity = new THREE.Vector3();
let bank = 0;
let frameId = null;
let lastTime = 0;
let elapsed = 0;

// 카메라에 보이는 범위 안에서 무작위 목표 지점을 고른다.
function randomTarget(out) {
  const { camera } = getScene();
  const z = THREE.MathUtils.randFloat(Z_RANGE[0], Z_RANGE[1]);
  const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * (camera.position.z - z) - MARGIN;
  const halfW = halfH * camera.aspect;
  return out.set(
    THREE.MathUtils.randFloatSpread(halfW * 2),
    THREE.MathUtils.randFloatSpread(halfH * 2),
    z,
  );
}

// 다음 목표: 지금 날아가던 방향에서 너무 급하게 되돌아가는 곳은 피한다 (몇 번 골라 보고 안 되면 그냥 쓴다).
const heading = new THREE.Vector3();
const toNew = new THREE.Vector3();
function pickTarget() {
  const from = mosquito?.group.position;
  const moving = from && velocity.lengthSq() > 0.01;
  if (moving) heading.copy(velocity).normalize();
  for (let i = 0; i < 8; i++) {
    randomTarget(target);
    if (!moving) return;
    toNew.copy(target).sub(from).normalize();
    if (toNew.dot(heading) > MAX_TURN_COS) return;
  }
}

const lookMatrix = new THREE.Matrix4();
const lookQuat = new THREE.Quaternion();
const rollQuat = new THREE.Quaternion();
const up = new THREE.Vector3(0, 1, 0);
const zAxis = new THREE.Vector3(0, 0, 1);
const desired = new THREE.Vector3();
const dv = new THREE.Vector3();
const prevVelocity = new THREE.Vector3();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const origin = new THREE.Vector3(); // (0, 0, 0). 속도 방향을 바라보는 회전을 구할 때 기준점

function tick(now) {
  frameId = requestAnimationFrame(tick);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  elapsed += dt;

  const { group, parts } = mosquito;
  const { camera } = getScene();

  if (group.position.distanceTo(target) < ARRIVE_DIST) pickTarget();

  // 깊이에 따라 속도를 보정해서, 화면에서 보이는 움직임이 비슷하게 느껴지게 한다.
  const depthScale = THREE.MathUtils.clamp(Math.abs(camera.position.z - group.position.z) / REF_DEPTH, 0.5, 1.5);

  // 원하는 속도로 한 번에 바꾸지 않고, 가속도 한도 안에서 서서히 휘어진다.
  desired.copy(target).sub(group.position).normalize().multiplyScalar(SPEED * depthScale);
  prevVelocity.copy(velocity);
  dv.copy(desired).sub(velocity);
  const maxDv = ACCEL * depthScale * dt;
  if (dv.length() > maxDv) dv.setLength(maxDv);
  velocity.add(dv);
  group.position.addScaledVector(velocity, dt);

  // 몸은 실제로 가는 방향을 본다.
  if (velocity.lengthSq() > 0.0001) {
    lookMatrix.lookAt(velocity, origin, up);
    lookQuat.setFromRotationMatrix(lookMatrix);
    // 기울기: 옆으로 가속되는 만큼(휘는 쪽으로) 몸을 기울인다.
    forward.copy(velocity).normalize();
    right.crossVectors(up, forward).normalize();
    const lateral = dt > 0 ? dv.dot(right) / dt : 0;
    const bankTarget = THREE.MathUtils.clamp(lateral * BANK, -MAX_BANK, MAX_BANK);
    bank += (bankTarget - bank) * Math.min(TURN_RATE * dt, 1);
    rollQuat.setFromAxisAngle(zAxis, -bank);
    lookQuat.multiply(rollQuat);
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
  velocity.set(0, 0, 0);
  bank = 0;
  randomTarget(target);
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
