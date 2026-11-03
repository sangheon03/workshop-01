// 마우스 커서와 클릭 모션에 쓰는 이미지. 파리채(1단계)와 핀셋(신체뜯기)이 함께 쓴다.
// 이미지는 assets/cursors/ 에 있고, 커서는 128px 이하여야 해서 줄인 파일(1x, 2x)을 쓴다.

const url = (name) => new URL(`../assets/cursors/${name}`, import.meta.url).href;

// 커서 이미지 하나를 CSS cursor 값으로 만든다. (hotX, hotY)는 클릭이 찍히는 이미지 안의 점(1x 기준 px).
// 이미지를 못 불러오면 fallback 모양이 쓰인다.
function cursorValue(name, hotX, hotY, fallback) {
  return `-webkit-image-set(url("${url(`${name}.png`)}") 1x, url("${url(`${name}@2x.png`)}") 2x) ${hotX} ${hotY}, ${fallback}`;
}

// 파리채: 그물 한가운데가 클릭 지점이다. 이미지는 112x108(1x).
export const SWATTER = {
  cursor: cursorValue('swatter', 33, 27, 'crosshair'),
  image: url('swatter@2x.png'),
  width: 112,
  height: 108,
  hot: { x: 33, y: 27 },
};

// 핀셋: 뾰족한 끝이 클릭 지점이다. 이미지는 96x96(1x).
export const TWEEZERS = {
  cursor: cursorValue('tweezers', 22, 17, 'pointer'),
  image: url('tweezers@2x.png'),
  width: 96,
  height: 96,
  hot: { x: 22, y: 17 },
};

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
