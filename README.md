# 물가마을

React + Phaser 웹 클라이언트와 Cloudflare Worker/SQLite Durable Object 실시간 서버가 함께 실행되는 낚시 게임입니다. 가짜 플레이어나 localStorage 경제 저장을 사용하지 않습니다.

## 실행

Node.js 22 이상을 사용합니다.

```bash
npm ci
npm run build
npm run preview
```

브라우저에서 http://127.0.0.1:8787 을 엽니다. 서로 다른 브라우저 프로필 또는 시크릿 창에서 다른 이름으로 입장하면 같은 `world-v1`에서 만납니다. 일반 탭 두 개는 쿠키를 공유하므로 기존 연결이 종료됩니다. 브라우저의 쿠키로 자동 로그인하며, 쿠키 삭제·만료·다른 기기에서는 이름만으로 계정을 복구할 수 없습니다.

개발 시 `npm run dev:server`와 별도 터미널의 `npm run dev`를 실행하면 http://127.0.0.1:5173 에서 Vite HMR을 사용할 수 있습니다. 최초에는 정적 이미지와 assets 디렉터리를 만들기 위해 한 번 빌드해야 합니다. 로컬 데이터는 `.wrangler/state`에 영속 저장됩니다. 개발 서버 프로세스를 종료해도 계정과 진행 기록이 유지됩니다.

## 조작과 기능

- 이름 확인 → 남녀 캐릭터 → 게임 시작. 캐릭터는 귀여운 짧은 약 2등신입니다.
- 방향키 이동, Space 현재 행동, C 앉기/일어서기, I 가방, Esc 창 닫기/낚시 취소.
- 서쪽 연못, 북쪽·동쪽 강, 남동쪽 호수. 물가에서 의자 배치와 한 회 낚시를 시작합니다. 이미 사용한 미끼는 취소해도 반환하지 않습니다.
- 정확히 50종, 1~5성 각각 10종. 세 낚싯대는 1~3성 / 1~4성 / 1~5성을 허용합니다. 좋은 미끼도 낚싯대 제한을 넘지 않습니다.
- 중앙 상점에서 낚싯대·미끼 구입, 물고기 잠금·개별/선택/전체 판매. 가방에서 장착, 50칸 도감과 포획 자랑을 사용합니다.
- 순위는 최고 별과 그 별의 첫 포획 완료 시각·전역 순번 순입니다. 판매해도 기록이 유지됩니다.
- 정면 가까운 낚시 중인 상대를 발로 차면 즉시 취소됩니다. 미끼 반환과 예정 물고기 지급이 없습니다. 발차기·놀람·낚싯대 튕김·도주를 공유합니다. 방해는 최대 3회, 오프라인 포함 1시간당 1개 회복, 피해자는 60초 보호됩니다.
- 진행 중 접속을 끊어도 한 회 낚시는 계속되고, 캐릭터·의자는 완료/취소 전까지 방해 대상입니다. 자동 반복 낚시는 없습니다.
- 서버가 재화·난수·포획·방해·충전·순위를 확정합니다. SQLite 트랜잭션과 commandId로 중복 처리를 막습니다.

물가 판정은 `?debug=1` 주소에서 확인합니다. 게임은 PC 키보드 우선이며 모바일 터치 이동 패드는 이번 구현에 포함하지 않습니다.

## 검사

```bash
npm run check
npm test
npm run assets:check
npm run simulate
npm run build
npx wrangler deploy --env="" --dry-run
```

Workers 테스트는 Cloudflare의 실제 로컬 workerd 런타임에서 실행합니다. 환경에 따라 로컬 포트/소켓 권한이 필요합니다. 검증 범위와 실제 결과는 [docs/verification.md](docs/verification.md), 경제 기대값은 [docs/economy.md](docs/economy.md)에 있습니다.

50연결 부하 검증은 운영과 분리된 로컬 서버에만 실행합니다.

```bash
npx wrangler dev --port 8788 --inspector-port 9230 --persist-to .wrangler/load-test
# 별도 터미널
npm run test:load
```

## 이미지와 구조

`art/source`는 이미지 생성 도구의 원본, `art/references`는 기준과 검수 이미지, `public/assets`는 실제 런타임 PNG입니다. `art/manifest.json`에 상태·크기·프레임·앵커·레이어를 기록합니다. 재패킹은 `npm run assets:pack`입니다. 프롬프트와 검수 한계는 [docs/art-qa.md](docs/art-qa.md)에 있습니다. 미제작 항목을 placeholder로 숨기거나 완성 수로 세지 않습니다.

`src/client`는 게임/네트워크/UI, `src/server`는 Worker/DO/SQLite, `src/shared`는 카탈로그·규칙·메시지 스키마, `src/config`는 밸런스와 맵입니다. 구조 설명은 [docs/architecture.md](docs/architecture.md)를 참고하세요.

## Git / Cloudflare

독립 Git 저장소는 초기화되어 있습니다. 원격 Git 저장소는 https://github.com/kimkyutack/fishhook-game 이며 main 브랜치가 Cloudflare Worker fishhook-game에 연결되어 있습니다. [docs/deployment.md](docs/deployment.md)에 Git remote 설정, Workers Builds의 브랜치·빌드·배포 명령, staging과 production 분리 절차를 정리했습니다.

```bash
npm run deploy:staging
npm run deploy
```

위 명령은 인증된 Cloudflare 계정에 실제 배포하므로 로컬 검증 후 대상 계정을 확인하고 실행합니다. 단일 월드 목표 50명은 무제한 확장이나 일정 비용의 보장이 아닙니다.
