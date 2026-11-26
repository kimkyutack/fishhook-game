# Cloudflare / Git 배포

## 2026-11-26 운영 반영

두 실제 브라우저에서 방해 → 서 있기 → 49.815초 대기 → 새로고침 → 수동 낚시 재개를 확인한 뒤 로컬 Wrangler CLI로 배포했다. 운영 버전은 `d5e96c4a-4dbc-458f-bce5-d774d1f461b6`이며, 운영 HTTP/API/이미지 해시와 브라우저 입장·이동·자동 로그인·위치 저장을 확인했다. `--keep-vars`로 기존 변수는 보존했다. 이번 배포는 Git commit/push 및 Workers Builds 실행과 별개다. 검증 증거는 [검증 기록](verification.md)에 있다.

GitHub [kimkyutack/fishhook-game](https://github.com/kimkyutack/fishhook-game)의 `main` 브랜치가 Cloudflare `fishhook-game` Worker에 연결되어 있다. 실제 Worker 이름과 wrangler.jsonc의 name을 동일하게 유지한다. 기본 게임 주소는 `https://fishhook-game.ddr1323.workers.dev`이며 활성화와 배포 결과는 Cloudflare에서 확인한다.

2026-11-25 최초 빌드 #0d1908d2는 scripts/simulate.ts에서 가격 변수가 리터럴 유니온 타입으로 추론돼 0을 넣을 수 없는 TS2322 오류로 실패했다. 가격 변수를 number로 명시해 수정했고, 코드의 기본 Worker 이름도 연결 대상에 맞춰 수정했다.

Workers Builds 설정:

|항목|값|
|---|---|
|Production branch|main|
|Root directory|/|
|Install|npm ci (자동 설치)|
|Build command|npm run build|
|Deploy command|npx wrangler deploy --env=""|
|Worker name|fishhook-game|

설정 변경 후 커밋과 push로 자동 빌드를 시작한다. `npm run build`, `npm test`, `npm run assets:check`를 먼저 확인한다. 이 저장소는 의존성 잠금 파일과 생성한 런타임 이미지를 포함한다. Cloudflare CI에서 이미지 생성 API를 호출하지 않는다.

CLI 배포는 인증된 계정과 대상을 확인한 뒤 실행한다.

```bash
npm ci
npm run build
npx wrangler deploy --env="" --dry-run
npm run deploy:staging
npm run deploy
```

staging은 `fishhook-game-staging`이라는 별도 Worker/DO 데이터 공간이다. GAME_WORLD 바인딩과 v1 new_sqlite_classes 마이그레이션은 설정 파일에 있다. D1/R2/외부 이미지 API 키는 필요하지 않다. 로컬 .wrangler/state, 테스트 런타임, staging, production은 데이터를 공유하지 않는다. 개발용 세션과 검증 계정을 운영으로 업로드하지 않는다.

배포 후 HTTPS 쿠키·자동 로그인·WebSocket 업그레이드·SQLite API를 확인한다. 운영에서는 여러 지역의 RTT, 장시간 동시 접속과 비용을 추가 검증한다. 단일 월드 최대 50명은 애플리케이션의 초기 제한이며 무제한 확장이나 고정 비용 보장이 아니다. 유휴 Hibernation 외에 저장 공간 등의 비용이 발생할 수 있고, 이동/메시지가 계속되면 요청·연산·전송 비용이 발생한다.

원본 이미지는 art/source에 보존하고 런타임 약 9.3MiB를 Static Assets에 배포한다. VITE_ASSET_BASE로 이미지 경로를 분리할 수 있으나 현재 UI CSS의 /assets 경로는 CDN 전환 시 함께 변경해야 한다.

[Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/) · [빌드 문제 해결](https://developers.cloudflare.com/workers/ci-cd/builds/troubleshoot/) · [Static Assets](https://developers.cloudflare.com/workers/static-assets/)
