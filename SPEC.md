# 모기 잡기 3D — SPEC

브라우저에서 한 화면으로 진행되는 3D 모기 잡기 게임. HTML / CSS / JavaScript(Three.js).
팀: Leader `sangheon03`, Builder `fernwehs`, `jooyeonpark822` · 목표 시간 60분

## 범위 조정 (60분에 맞춰 줄인 내용)

원안(처치 방법 9종)은 60분에 비해 크다. 아래처럼 줄였다.

| 항목 | 원안 | 이번 범위 |
| --- | --- | --- |
| 처치 방법 | 9종 | **2종 확정**: 전기충격, 신체뜯기 / **돋보기화형은 시간이 남으면** (마지막 순서) |
| 신체뜯기 | 날개/다리/주둥이 각각 | **부위 중 하나만 랜덤**으로 뜯음 |
| 모기 모델 | 미정 | 임시: 코드로 조립한 도형 (모델은 나중에 교체, 아래 참고) |
| 모기 수 | - | 1마리 |

## 게임 규칙

### 1단계 — 잡기
- 화면 안을 모기 1마리가 자유롭게 날아다닌다 (3D 공간 안에서 무작위로 목표 지점을 바꿔 가며 이동).
- 마우스 커서가 **파리채 모양**으로 바뀐다.
- **클릭 한 번**에 모기를 맞히면 잡힌다. 빗나가도 감점은 없고, 파리채 휘두르는 모션만 나온다.
- 시간 제한은 없다. (걸린 시간은 재지 않는다.)

### 2단계 — 처치
- 잡힌 모기가 화면 가운데로 와서 멈춘다 (날개만 천천히 떨림).
- 화면 하단에 처치 버튼이 나온다: **전기충격 / 신체뜯기**. **돋보기화형**은 마지막 순서의 조건부 작업이라, 만들어지면 버튼 3개가 되고 안 만들어지면 2개로 끝난다.
- 버튼을 누르면 해당 연출이 자동으로 재생된다 (마우스 조작 없음, 약 3초).
  - 전기충격: 번쩍이는 전기 효과, 모기가 떨다가 까맣게 변함.
  - 돋보기화형: 렌즈가 나타나 빛이 모기에 모이고, 연기와 함께 타서 사라짐.
  - 신체뜯기: 날개 / 다리 / 주둥이 중 **랜덤 한 부위**가 떨어져 나감.
- 연출이 끝나면 결과 화면으로 넘어간다.

## 화면 흐름 (시작 → 진행 → 끝)

```
[시작 화면] --시작 버튼--> [1단계: 잡기] --모기 잡힘--> [2단계: 처치] --연출 끝--> [결과 화면]
     ^                                                                              |
     +-------------------------------- 다시하기 --------------------------------------+
```

- 시작 화면: 제목, 간단한 설명, 시작 버튼
- 결과 화면: 상단에 죽은 모기 이미지, 사용한 처치 방법(쓴 순서), 다시하기 버튼 (누르면 시작 화면으로). 잡는 데 걸린 시간은 기록하지 않는다 (2차 개선에서 뺌).

## 이번에 만들지 않을 것

- 나머지 처치 방법 6종: 날개 뜯기·다리 뜯기·주둥이 뜯기(개별), 손바닥, 미니단두대, 물내리기, 압착기
- 모기 여러 마리 / 라운드 반복 / 누적 점수 / 랭킹
- 1단계 시간 제한과 실패 화면
- 난이도 설정, 효과음·배경음 (시간이 남으면 추가)
- 모바일·터치 지원
- 외부 3D 모델 파일(glTF) 사용
- 돋보기를 마우스로 직접 조작하는 방식

## 기술 방침

- 빌드 도구 없음. 정적 파일만 사용하고, Three.js는 `index.html`의 importmap으로 CDN(고정 버전)에서 불러온다.
- ES 모듈을 쓰므로 로컬에서는 서버로 연다: `python3 -m http.server 8000`
- 화면은 하나의 `<canvas>`(3D) 위에 HTML 화면(시작·버튼·결과)을 겹쳐서 보여준다.

## 역할과 파일 (한 파일에 주인은 한 명)

| 담당 | 맡을 영역 | 파일 |
| --- | --- | --- |
| **sangheon03** (Leader) | 뼈대, 화면 전환, 결과 화면, SPEC·이슈·합치기·리뷰 | `index.html`, `style.css`, `src/main.js`, `src/result.js` |
| **fernwehs** (Builder A) | 3D 장면, 모기, 비행, 파리채, 1단계 | `src/scene.js`, `src/mosquito.js`, `src/stage1.js`, `src/swatter.js` |
| **jooyeonpark822** (Builder B) | 2단계 화면, 처치 연출 (전기충격·신체뜯기, 돋보기화형은 조건부) | `src/stage2.js`, `src/kills/electric.js`, `src/kills/magnify.js`, `src/kills/pluck.js` |

- 위에 없는 파일을 만들거나 남의 파일을 고쳐야 하면 먼저 Leader에게 이슈로 요청한다.
- 모기 모델을 나중에 교체할 때는 `src/mosquito.js`만 바꾼다 (담당: fernwehs).

## 서로를 부를 때 쓰는 이름

이 이름과 모양은 합의된 약속이다. 바꾸려면 Leader에게 먼저 말한다.

### 3D 장면 — `src/scene.js` (fernwehs)
- `getScene()` → `{ scene, camera, renderer }` : 1단계와 2단계가 같은 장면을 함께 쓴다.

### 모기 — `src/mosquito.js` (fernwehs)
- `createMosquito()` → `{ group, parts, setTwitch }`
  - `group`: Three.js `Group`. 장면에 `scene.add(group)`로 넣는다.
  - `parts`: `{ body, wingL, wingR, legs, proboscis }` (각각 `Object3D`, `legs`는 배열). 신체뜯기가 이 이름으로 부위를 찾는다.
  - `setTwitch(level)`: 잡힌 모기의 움찔거림 세기. `0`은 멈춤, `1`은 기본 움찔, 클수록 부들부들 격하게 떤다. 한 번 켜면 `level`을 바꾸기 전까지 계속 유지된다. (2차 개선에서 추가, 구현은 `mosquito.js`)

### 1단계 — `src/stage1.js` (fernwehs)
- `startStage1({ onCaught })` : 모기를 날리고 파리채 입력을 켠다. 잡히면 `onCaught(mosquito)`를 호출한다 (`mosquito`는 `createMosquito()`의 반환값).
- `stopStage1()` : 비행과 입력을 멈춘다 (모기는 장면에 남겨 둔다).

### 파리채 — `src/swatter.js` (fernwehs)
- `enableSwatter({ mosquito, onCaught })` / `disableSwatter()` : 파리채 커서를 켜고 끈다. `stage1.js`가 호출한다. `mosquito`와 `onCaught`는 선택 인자이고, 주면 클릭 판정도 한다 (PR #20에서 확인, Leader 승인).

### 2단계 — `src/stage2.js` (jooyeonpark822)
- `startStage2(mosquito, { onDone })` : 모기를 가운데로 옮기고 처치 버튼 3개를 보여준다. 모기의 HP가 0이 되면 `onDone(methodIds)`를 호출한다.
- `methodIds`는 쓴 처치 방법 id의 배열(쓴 순서). id는 `'electric' | 'magnify' | 'pluck'` 중 하나. (2차 개선 전에는 문자열 하나였다. `main.js`는 문자열 하나도 받아 준다.)
- 모기가 죽은 뒤에도 **모기를 장면에서 지우지 않는다.** 결과 화면이 그 모습을 캡처해 쓴다.

### 처치 연출 — `src/kills/*.js` (jooyeonpark822)
- `playElectric(mosquito)` / `playMagnify(mosquito)` / `playPluck(mosquito)` → `Promise` (연출이 끝나면 resolve).
- 장면은 `getScene()`으로 가져온다.

### 화면 전환·결과 — `src/main.js`, `src/result.js` (Leader)
- `showScreen(name)` : `name`은 `'start' | 'stage1' | 'stage2' | 'result'`.
- `showResult({ methodIds, mosquito })` : 결과 화면을 채우고 보여준다. `mosquito`의 현재 모습을 캡처해 상단에 띄운다.
- `resetGame()` : 장면의 모기를 치우고 시작 화면으로 돌아간다.

### 화면 이름(HTML `id`) — `index.html` (Leader)
`screen-start`, `screen-stage1`, `screen-stage2`, `screen-result`, 3D 캔버스는 `game-canvas`. 2단계 버튼은 `stage2.js`가 `screen-stage2` 안에 직접 만든다.

## 일정 (60분)

| 시간 | 할 일 |
| --- | --- |
| 0–8분 | Leader: 뼈대와 빈 함수(위 이름 그대로) 올리기 → Builder들이 받아서 시작 |
| 8–38분 | fernwehs / jooyeonpark822 병렬 작업 (돋보기화형은 이슈 1~9가 빠르게 끝났을 때만) |
| 38–52분 | Leader: 합치기, 전체 흐름 시험, 버그 정리 |
| 52–60분 | 마무리와 여유 시간 (모기 모델 교체 등. 못 하면 포기) |

## 이슈 목록 (먼저 할 것부터)

| # | 담당 | 제목 | 설명 |
| --- | --- | --- | --- |
| 1 | sangheon03 | 프로젝트 뼈대와 빈 함수 만들기 | `index.html`(importmap, 4개 화면, 캔버스), `style.css`, `src/main.js`(화면 전환)와 위 인터페이스의 빈 함수. **이게 끝나야 나머지가 시작된다.** |
| 2 | fernwehs | 3D 장면과 임시 모기 | `scene.js`(장면·카메라·렌더 루프), `mosquito.js`(도형 조립 모기, `parts` 이름 지키기) |
| 3 | fernwehs | 모기 비행 | 3D 공간에서 무작위 목표를 바꾸며 날아다니고 날개를 퍼덕임 (`startStage1`/`stopStage1`) |
| 4 | fernwehs | 파리채 커서와 클릭 잡기 | `swatter.js`, 레이캐스트로 클릭 판정, 잡히면 `onCaught(mosquito)` 호출 |
| 5 | jooyeonpark822 | 2단계 화면과 처치 버튼 | `stage2.js`: 모기를 가운데로 옮기고 하단에 처치 버튼(처음엔 전기충격·신체뜯기 2개), 누르면 해당 연출 호출, 끝나면 `onDone(methodId)` (모기는 임시 도형 `createMosquito()`로 시험) |
| 6 | jooyeonpark822 | 전기충격 연출 | `kills/electric.js` |
| 7 | jooyeonpark822 | 신체뜯기 연출 | `kills/pluck.js` (날개/다리/주둥이 중 랜덤 1부위) |
| 8 | sangheon03 | 결과 화면과 다시하기 | `result.js`, 걸린 시간·처치 방법 표시, `resetGame()` |
| 9 | sangheon03 | 전체 흐름 연결과 시험 | 시작 → 1단계 → 2단계 → 결과 → 다시하기까지 한 번에 돌려 보고 버그 정리 |
| 10 | fernwehs | 모기 모델 교체 (미정, 조건부) | 모델이 정해지고 시간이 남으면 `mosquito.js`만 교체. `parts` 이름은 유지 |
| 11 | jooyeonpark822 | 돋보기화형 연출 (조건부, **맨 마지막**) | `kills/magnify.js`와 `stage2.js`의 세 번째 버튼. **다른 작업이 빠르게 끝나서 시간이 남을 때만 시작.** 시간이 모자라면 하지 않는다 |

2차 개선의 이슈는 GitHub 이슈 목록에서 `lane-A`, `lane-B`, `lane-L` 라벨로 확인한다.

## 2차 개선 (워크숍 이후 추가한 규칙)

위의 "이번에 만들지 않을 것" 중 일부가 바뀌었다. 충돌하면 이 절이 우선한다.

- **Z축 비행**: 모기가 앞뒤(깊이)로도 크게 움직여서 가까이 왔다 멀어졌다 하는 느낌이 난다.
- **배경**: 반투명한 유리창 너머로 바다와 하늘이 보인다 (`assets/reference/background-window.png`). 배경은 `style.css`의 CSS 레이어이고, 3D 캔버스는 투명해야 한다.
- **HP**: 잡힌 모기의 HP는 100. 처치 방법 하나로는 죽지 않고, **2~3가지**를 쓰면 HP 0이 되어 죽는다 (예: 전기충격 50 · 돋보기 50 · 신체뜯기 40). 이미 쓴 방법은 다시 쓰지 못한다. 화면에 HP 바를 보여준다.
- **움찔거림**: 잡힌 모기는 처치 중에도, 죽은 뒤에도 계속 움찔거린다 (`setTwitch`).
- **돋보기화형**: 돋보기를 마우스로 움직일 수 있고, 움직임에 따라 빛이 모기에 모인다 (`assets/reference/magnify.png`). 손잡이가 보이는 사실적인 모양. 시작할 때 각도를 돌리며 초점을 맞추는 짧은 연출(1초 이내)이 앞에 붙는다.
- **전기충격**: "치직! 칙!! 치직!" 하는 끊어지는 박자로 임팩트 있게. 전기 줄기를 더 크고 많이. 맞을수록 모기가 점점 까맣게 탄다.
- **신체뜯기**: 자동으로 떨어지지 않고, 플레이어가 모기의 부위를 누를 때마다 하나씩 떨어진다. 누를 때마다 모기가 부들부들 떤다.
- **결과 화면**: 시간 기록 없음, 상단에 죽은 모기 이미지.

## 정해지지 않은 것

- 모기 모델의 최종 모양 (임시 도형으로 시작하고 나중에 입력받아 교체)
