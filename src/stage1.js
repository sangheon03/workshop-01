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

// 날아다니는 모기 수 규칙: 시작은 START_COUNT마리, 최대 MAX_FLYING마리, 최소 1마리.
const START_COUNT = 2;
const MAX_FLYING = 3;
// 잡혀서 MAX_FLYING보다 적어지면 이 시간(ms) 사이의 랜덤한 뒤에 한 마리를 채운다. 잡자마자 바로 채우지 않는다.
const RESPAWN_MS = [2000, 5000];
// 새 모기는 화면 가장자리 바깥으로 이만큼 떨어진 곳에서 날아 들어온다.
const SPAWN_MARGIN = 1.6;

// 날아다니는 모기들. 마리마다 목표·속도·기울기를 따로 가진다.
let flyers = []; // { mosquito, target, velocity, bank, phase }
let respawnTimer = null;
let running = false;
let handleCaught = null;
let frameId = null;
let lastTime = 0;
let elapsed = 0;

// 깊이 z에서 카메라에 보이는 범위의 절반. margin이 양수면 안쪽으로, 음수면 바깥쪽으로 넓힌다.
function visibleHalf(z, margin) {
  const { camera } = getScene();
  const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * (camera.position.z - z) - margin;
  return { halfH, halfW: halfH * camera.aspect };
}

// 카메라에 보이는 범위 안에서 무작위 목표 지점을 고른다.
function randomTarget(out) {
  const z = THREE.MathUtils.randFloat(Z_RANGE[0], Z_RANGE[1]);
  const { halfH, halfW } = visibleHalf(z, MARGIN);
  return out.set(
    THREE.MathUtils.randFloatSpread(halfW * 2),
    THREE.MathUtils.randFloatSpread(halfH * 2),
    z,
  );
}

// 화면 바깥 가장자리 근처의 무작위 지점. 새 모기는 여기서 시작해서 화면 안으로 날아 들어온다.
function outsidePoint(out) {
  const z = THREE.MathUtils.randFloat(Z_RANGE[0], Z_RANGE[1]);
  const { halfH, halfW } = visibleHalf(z, -SPAWN_MARGIN);
  // 좌우로 더 자주 들어오고, 위쪽도 가끔, 아래쪽은 드물게.
  const side = [0, 0, 1, 1, 2, 2, 3][Math.floor(Math.random() * 7)];
  if (side === 0) return out.set(-halfW, THREE.MathUtils.randFloatSpread(halfH * 1.2), z);
  if (side === 1) return out.set(halfW, THREE.MathUtils.randFloatSpread(halfH * 1.2), z);
  if (side === 2) return out.set(THREE.MathUtils.randFloatSpread(halfW * 1.2), halfH, z);
  return out.set(THREE.MathUtils.randFloatSpread(halfW * 1.2), -halfH, z);
}

// 다음 목표: 지금 날아가던 방향에서 너무 급하게 되돌아가는 곳은 피한다 (몇 번 골라 보고 안 되면 그냥 쓴다).
const heading = new THREE.Vector3();
const toNew = new THREE.Vector3();
function pickTarget(flyer) {
  const from = flyer.mosquito.group.position;
  const moving = flyer.velocity.lengthSq() > 0.01;
  if (moving) heading.copy(flyer.velocity).normalize();
  for (let i = 0; i < 8; i++) {
    randomTarget(flyer.target);
    if (!moving) return;
    toNew.copy(flyer.target).sub(from).normalize();
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
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const origin = new THREE.Vector3(); // (0, 0, 0). 속도 방향을 바라보는 회전을 구할 때 기준점

// 모기 한 마리를 화면 밖에서 만들어 날려 보낸다. 처음부터 목표 쪽으로 속도를 줘서 곧바로 날아 들어온다.
function spawnFlyer() {
  const { scene } = getScene();
  const mosquito = createMosquito();
  const flyer = {
    mosquito,
    target: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    bank: 0,
    phase: Math.random() * 10,
  };
  outsidePoint(mosquito.group.position);
  randomTarget(flyer.target);
  flyer.velocity.copy(flyer.target).sub(mosquito.group.position).normalize().multiplyScalar(SPEED * 0.8);
  scene.add(mosquito.group);
  flyers.push(flyer);
  return flyer;
}

// 날아다니는 수가 MAX_FLYING보다 적으면 2~5초 뒤에 한 마리 채우도록 타이머를 건다.
// 타이머는 한 번에 하나만 돌고, 채운 뒤에도 모자라면 다음 타이머를 건다.
function scheduleRespawn() {
  if (!running || respawnTimer !== null || flyers.length >= MAX_FLYING) return;
  const ms = THREE.MathUtils.randFloat(RESPAWN_MS[0], RESPAWN_MS[1]);
  respawnTimer = setTimeout(() => {
    respawnTimer = null;
    if (!running) return;
    spawnFlyer();
    scheduleRespawn();
  }, ms);
}

function tick(now) {
  frameId = requestAnimationFrame(tick);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  elapsed += dt;

  const { camera } = getScene();

  for (const flyer of flyers) {
    const { mosquito, target, velocity } = flyer;
    const { group, parts } = mosquito;

    if (group.position.distanceTo(target) < ARRIVE_DIST) pickTarget(flyer);

    // 깊이에 따라 속도를 보정해서, 화면에서 보이는 움직임이 비슷하게 느껴지게 한다.
    const depthScale = THREE.MathUtils.clamp(Math.abs(camera.position.z - group.position.z) / REF_DEPTH, 0.5, 1.5);

    // 원하는 속도로 한 번에 바꾸지 않고, 가속도 한도 안에서 서서히 휘어진다.
    desired.copy(target).sub(group.position).normalize().multiplyScalar(SPEED * depthScale);
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
      flyer.bank += (bankTarget - flyer.bank) * Math.min(TURN_RATE * dt, 1);
      rollQuat.setFromAxisAngle(zAxis, -flyer.bank);
      lookQuat.multiply(rollQuat);
      group.quaternion.slerp(lookQuat, Math.min(TURN_RATE * dt, 1));
    }

    const flap = Math.sin((elapsed + flyer.phase) * WING_FLAP_HZ * Math.PI * 2) * WING_FLAP_ANGLE;
    parts.wingR.rotation.z = flap;
    parts.wingL.rotation.z = -flap;
  }
}

// 모기가 잡혔다: 날아다니는 목록에서 빼고 그 자리에서 움찔하게 둔다. 그 뒤 모자란 만큼 리스폰을 건다.
function caught(mosquito) {
  const index = flyers.findIndex((flyer) => flyer.mosquito === mosquito);
  if (index < 0) return;
  flyers.splice(index, 1);
  mosquito.setTwitch?.(1);
  // 화면에 한 마리도 없으면 최소 1마리 규칙에 따라 바로 한 마리를 채운다. 그 밖에는 항상 2~5초 뒤에 채운다.
  if (flyers.length === 0) spawnFlyer();
  scheduleRespawn();
  handleCaught?.(mosquito);
}

// 모기가 잡힐 때마다 onCaught(mosquito)를 부른다. 한 마리가 잡혀도 1단계는 끝나지 않는다.
export function startStage1({ onCaught }) {
  stopStage1();
  running = true;
  handleCaught = onCaught ?? null;

  for (let i = 0; i < START_COUNT; i++) spawnFlyer();
  scheduleRespawn();

  lastTime = performance.now();
  frameId = requestAnimationFrame(tick);

  enableSwatter({
    targets: () => flyers.map((flyer) => flyer.mosquito),
    onCaught: caught,
  });
}

// 비행·입력·리스폰 타이머를 멈추고, 아직 날아다니던 모기는 장면에서 치운다. 이미 잡힌 모기는 남긴다.
export function stopStage1() {
  running = false;
  if (frameId !== null) cancelAnimationFrame(frameId);
  frameId = null;
  if (respawnTimer !== null) clearTimeout(respawnTimer);
  respawnTimer = null;
  for (const flyer of flyers) flyer.mosquito.group.parent?.remove(flyer.mosquito.group);
  flyers = [];
  handleCaught = null;
  disableSwatter();
}
