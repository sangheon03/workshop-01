// 마우스 커서와 클릭 모션에 쓰는 이미지. 파리채(1단계)와 핀셋(신체뜯기)이 함께 쓴다.
// 이미지는 assets/cursors/ 에 있고, 커서는 128px 이하여야 해서 줄인 파일(1x, 2x)을 쓴다.

const url = (name) => new URL(`../assets/cursors/${name}`, import.meta.url).href;

// 커서 이미지 하나를 CSS cursor 값으로 만든다. (hotX, hotY)는 클릭이 찍히는 이미지 안의 점(1x 기준 px).
// 이미지를 못 불러오면 fallback 모양이 쓰인다.
function cursorValue(name, hotX, hotY, fallback) {
  return `-webkit-image-set(url("${url(`${name}.png`)}") 1x, url("${url(`${name}@2x.png`)}") 2x) ${hotX} ${hotY}, ${fallback}`;
}

// 파리채: 그물 한가운데가 클릭 지점이다. 이미지는 234x231(1x). 2x 파일을 줄여서 보여 준다.
// 커서 이미지는 128px까지만 되는데 파리채는 그보다 커서, 커서 대신 followCursor()로 마우스를 따라다니게 그린다.
export const SWATTER = {
  cursor: 'none',
  image: url('swatter@2x.png'),
  width: 234,
  height: 231,
  hot: { x: 52, y: 52 },
};

// 핀셋: 두 날의 뾰족한 끝이 클릭 지점이다. 이미지는 103x120(1x).
export const TWEEZERS = {
  cursor: cursorValue('tweezers', 5, 5, 'pointer'),
  image: url('tweezers@2x.png'),
  width: 103,
  height: 120,
  hot: { x: 5, y: 5 },
};

// 128px보다 큰 도구 이미지를 커서처럼 마우스에 붙여 보여 준다. 부르면 따라다니기 시작하고, 돌려받은 함수를 부르면 멈춘다.
// 이 이미지는 클릭을 가로채지 않는다(pointer-events: none).
export function followCursor(tool) {
  const el = document.createElement('img');
  el.src = tool.image;
  Object.assign(el.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: `${tool.width}px`,
    height: `${tool.height}px`,
    pointerEvents: 'none',
    zIndex: 9,
    // 첫 마우스 움직임이 있기 전에는 숨겨 둔다.
    display: 'none',
  });
  document.body.appendChild(el);

  const onMove = (event) => {
    el.style.display = 'block';
    el.style.transform = `translate(${event.clientX - tool.hot.x}px, ${event.clientY - tool.hot.y}px)`;
  };
  const onLeave = () => {
    el.style.display = 'none';
  };
  window.addEventListener('pointermove', onMove);
  document.addEventListener('pointerleave', onLeave);
  return () => {
    window.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerleave', onLeave);
    el.remove();
  };
}

// 클릭한 자리에 커서와 같은 크기로 이미지를 잠깐 겹쳐 보여 주는 모션 (맞든 빗나가든 같다).
// scale: 이미지 크기 배율, frames: Web Animations 키프레임, ms: 길이.
export function playClickMotion(tool, x, y, { scale = 1, frames, ms }) {
  const w = tool.width * scale;
  const h = tool.height * scale;
  const el = document.createElement('img');
  el.src = tool.image;
  Object.assign(el.style, {
    position: 'fixed',
    left: `${x - tool.hot.x * scale}px`,
    top: `${y - tool.hot.y * scale}px`,
    width: `${w}px`,
    height: `${h}px`,
    pointerEvents: 'none',
    zIndex: 10,
    // 클릭 지점을 기준으로 돌고 커지게 해서, 모션 중에도 지점이 어긋나지 않는다.
    transformOrigin: `${tool.hot.x * scale}px ${tool.hot.y * scale}px`,
  });
  document.body.appendChild(el);
  el.animate(frames, { duration: ms, easing: 'ease-in' });
  setTimeout(() => el.remove(), ms);
}
