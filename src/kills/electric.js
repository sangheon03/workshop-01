import * as THREE from 'three';

const BOLT_COUNT = 16;
const BOLT_SEGMENTS = 12;
const BOLT_RADIUS = 2.6;

// "치직! 칙!! 치직!" 박자: 번쩍이는 구간(펄스)과 그 사이의 정적. 단위는 ms, power는 세기(0~1).
// 뒤로 갈수록 더 세고, 펄스가 끝날 때마다 모기가 한 단계씩 더 까맣게 탄다.
const PULSES = [
  { at: 0, length: 380, power: 0.5 },
  { at: 700, length: 260, power: 0.75 },
  { at: 1250, length: 220, power: 0.9 },
  { at: 1700, length: 650, power: 1 },
];
const END_AT = 2600;
const FLICKER_MS = 45;

function makeBolt() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array((BOLT_SEGMENTS + 1) * 3), 3),
  );
  const material = new THREE.LineBasicMaterial({
    color: 0xcfeaff,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  return new THREE.Line(geometry, material);
}

// 모기에서 바깥쪽으로 뻗는 들쭉날쭉한 번개 선을 새로 그린다. 길이는 reach(0~1)에 비례한다.
function redrawBolt(bolt, reach) {
  const positions = bolt.geometry.attributes.position;
  const dir = new THREE.Vector3(
    Math.random() - 0.5,
    Math.random() - 0.5,
    Math.random() - 0.5,
  ).normalize();
  const radius = BOLT_RADIUS * (0.45 + 0.55 * reach) * (0.6 + Math.random() * 0.4);
  const jitter = 0.18 + 0.22 * reach;
  for (let i = 0; i <= BOLT_SEGMENTS; i++) {
    const d = (i / BOLT_SEGMENTS) * radius;
    const wobble = i === 0 ? 0 : jitter;
    positions.setXYZ(
      i,
      dir.x * d + (Math.random() - 0.5) * wobble,
      dir.y * d + (Math.random() - 0.5) * wobble,
      dir.z * d + (Math.random() - 0.5) * wobble,
    );
  }
  positions.needsUpdate = true;
}

// 지금 시각이 몇 번째 펄스 안인지. 정적 구간이면 -1.
function activePulse(ms) {
  return PULSES.findIndex((p) => ms >= p.at && ms < p.at + p.length);
}

export function playElectric(mosquito) {
  const { group } = mosquito;

  const meshes = [];
  group.traverse((obj) => {
    if (obj.isMesh) meshes.push(obj);
  });
  // 재질은 모기마다 공유되므로 복제해서 쓴다. 안 그러면 다음 판 모기도 까맣게 나온다.
  meshes.forEach((m) => {
    m.material = m.material.clone();
  });
  const startColors = meshes.map((m) => m.material.color.clone());
  const black = new THREE.Color(0x000000);

  const flash = new THREE.PointLight(0xbfe6ff, 0, 24);
  group.add(flash);
  const bolts = Array.from({ length: BOLT_COUNT }, makeBolt);
  bolts.forEach((b) => {
    b.visible = false;
    group.add(b);
  });

  // 화면 전체가 번쩍이는 효과. 캔버스 위에 흰색 막을 깔고 투명도를 바꾼다.
  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    background: '#dff1ff',
    opacity: '0',
    pointerEvents: 'none',
    zIndex: '5',
  });
  document.body.appendChild(overlay);

  const origin = group.position.clone();
  const originRotZ = group.rotation.z;
  let lastFlicker = -Infinity;

  return new Promise((resolve) => {
    const start = performance.now();

    const setDarkness = (amount) => {
      meshes.forEach((m, i) => m.material.color.lerpColors(startColors[i], black, amount));
    };

    const tick = (now) => {
      const ms = now - start;
      const index = activePulse(ms);

      // 맞을수록 단계적으로 까맣게 탄다. 마지막 펄스가 끝나면 거의 새까맣다.
      const passed = PULSES.filter((p) => ms >= p.at + p.length).length;
      const inside = index >= 0 ? (ms - PULSES[index].at) / PULSES[index].length : 0;
      setDarkness(((passed + inside * 0.6) / PULSES.length) * 0.97);

      if (index >= 0) {
        const power = PULSES[index].power;
        // 펄스 안에서도 아주 짧게 깜빡여서 "치직" 하는 느낌을 낸다.
        if (now - lastFlicker > FLICKER_MS) {
          lastFlicker = now;
          const on = Math.random() < 0.8;
          flash.intensity = on ? 10 + power * 30 * Math.random() : 0;
          overlay.style.opacity = on ? String(0.12 + power * 0.4 * Math.random()) : '0';
          bolts.forEach((b) => {
            b.visible = Math.random() < 0.55 + power * 0.4;
            if (b.visible) {
              redrawBolt(b, power);
              b.material.opacity = 0.6 + Math.random() * 0.4;
            }
          });
        }
        // 경련: 펄스가 셀수록 크게 떤다.
        const shake = 0.1 + power * 0.25;
        group.position.set(
          origin.x + (Math.random() - 0.5) * shake,
          origin.y + (Math.random() - 0.5) * shake,
          origin.z + (Math.random() - 0.5) * shake,
        );
        group.rotation.z = originRotZ + (Math.random() - 0.5) * power * 0.5;
      } else {
        // 정적: 번쩍임과 전기가 뚝 끊기고 모기는 잠깐 축 처진다.
        flash.intensity = 0;
        overlay.style.opacity = '0';
        bolts.forEach((b) => {
          b.visible = false;
        });
        group.position.copy(origin);
        group.rotation.z = originRotZ;
      }

      if (ms < END_AT) {
        requestAnimationFrame(tick);
        return;
      }

      // 탄 모기는 장면에 남긴다 (결과 화면이 캡처한다). 효과만 치운다.
      group.position.copy(origin);
      group.rotation.z = originRotZ;
      setDarkness(0.97);
      group.remove(flash);
      overlay.remove();
      bolts.forEach((b) => {
        group.remove(b);
        b.geometry.dispose();
        b.material.dispose();
      });
      resolve();
    };
    requestAnimationFrame(tick);
  });
}
