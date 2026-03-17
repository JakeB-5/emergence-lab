# 🧬 Emergence Lab

복잡한 지능은 단순한 규칙에서 태어난다. Emergence Lab은 4가지 고전 멀티에이전트 시뮬레이션을 통해 창발적 지능(emergent intelligence)을 직접 관찰하고 실험할 수 있는 인터랙티브 웹 플레이그라운드다. 각 에이전트는 오직 자신의 이웃만 인식하지만, 수백 개가 모이면 전역적인 패턴과 행동이 자연스럽게 나타난다. 파라미터를 실시간으로 조작하며 그 경계를 탐구할 수 있다.

![Emergence Lab](./docs/screenshot.png)

---

## 시뮬레이션 소개

### 🐦 Boids — 플로킹
Craig Reynolds가 1986년에 제안한 군집 비행 모델. 개별 boid는 **분리(Separation)**, **정렬(Alignment)**, **응집(Cohesion)** 세 가지 규칙만 따르지만, 집단 전체는 새 떼처럼 유기적으로 움직인다.

### 🐜 Ant Colony — 개미 군집 최적화
개미들은 먹이를 찾으면 페로몬을 뿌리며 귀소한다. 페로몬은 증발·확산하고, 더 짧은 경로일수록 강한 흔적이 남는다. 중앙 조율 없이 최적 경로가 집단적으로 수렴되는 **스티그머지(stigmergy)** 현상을 관찰할 수 있다.

### 🧊 Game of Life — 콘웨이의 생명 게임
각 셀은 살아있는 이웃의 수에 따라 생존·사망·탄생을 결정한다. 단 두 줄의 규칙에서 글라이더, 오실레이터, 정적 패턴 등 무한한 구조가 창발한다.

### 🎯 Particle Swarm — 입자 군집 최적화
Rastrigin 함수로 만든 다봉(multi-modal) 피트니스 랜드스케이프 위에서 입자들이 개인 최적점과 전체 최적점 정보를 공유하며 전역 최솟값을 탐색한다. PSO 알고리즘의 탐색(exploration)과 활용(exploitation) 균형을 시각적으로 확인할 수 있다.

---

## 기술 스택

| 항목 | 선택 |
|------|------|
| 번들러 | Vite 6 |
| 언어 | TypeScript 5 |
| 렌더링 | HTML5 Canvas API |
| 런타임 의존성 | **없음** (zero external runtime dependencies) |

---

## 시작하기

```bash
git clone https://github.com/your-username/emergence-lab.git
cd emergence-lab
npm install
npm run dev       # 개발 서버 (http://localhost:5173)
npm run build     # 프로덕션 빌드 → dist/
```

---

## 프로젝트 구조

```
src/
├── main.ts                  # 앱 진입점, 애니메이션 루프
├── types.ts                 # Simulation 인터페이스 및 공용 타입
├── engine/
│   └── SpatialHash.ts       # 공간 분할 자료구조
├── renderer/
│   └── CanvasRenderer.ts    # Canvas 렌더러 래퍼
├── ui/
│   ├── Controls.ts          # 파라미터 슬라이더 UI
│   └── Metrics.ts           # 실시간 메트릭 패널
└── simulations/
    ├── Boids.ts
    ├── AntColony.ts
    ├── GameOfLife.ts
    └── ParticleSwarm.ts
```

---

## 핵심 설계

- **`Simulation` 인터페이스**: `init / update / render / setParam / getMetrics / reset / destroy`를 강제하는 플러그인 아키텍처. 새 시뮬레이션은 인터페이스만 구현하면 자동으로 UI에 등록된다.
- **`SpatialHash`**: 캔버스를 고정 셀 격자로 분할해 이웃 탐색을 O(n²) → O(1)에 근접하게 단축. Boids의 시각 범위 쿼리에 사용된다.
- **`putImageData` 픽셀 렌더링**: AntColony의 페로몬 그리드와 GameOfLife의 셀 격자는 Canvas 2D 드로우 API 대신 `ImageData`를 직접 조작해 픽셀 단위 렌더링 성능을 확보한다.
- **`requestAnimationFrame` + deltaTime 루프**: 프레임 타이밍을 경과 시간(초)으로 정규화하고 최대 50ms로 클램핑해, 탭 전환이나 프레임 드롭 시에도 시뮬레이션 속도가 일정하게 유지된다.

---

## 특이사항

이 프로젝트는 AI(Claude)가 자율적으로 목표를 설정하고, 기술을 선택하고, 구현까지 수행한 실험입니다. 사람은 어떠한 기술적 결정에도 관여하지 않았습니다.

---

## 라이선스

MIT
