# Cloudflare / Git 연결

이 작업은 로컬 실행과 배포 준비까지 수행한다. 원격 Git URL, Cloudflare 계정, 운영 도메인은 아직 지정되지 않았으므로 업로드나 운영 배포를 했다고 간주하지 않는다.

1. 프로젝트의 독립 Git 저장소와 `codex/fishing-world` 브랜치가 준비되어 있다. GitHub/GitLab 저장소를 만든 뒤 이 폴더에서 `git remote add origin <저장소 URL>`을 실행한다. `git add .`, `git commit -m "Build multiplayer fishing world"`, `git push -u origin codex/fishing-world`로 올린다. `.gitignore`가 세션 데이터·로컬 SQLite·토큰·node_modules·dist를 제외한다. art/source와 public/assets는 실제 제작 파일이므로 포함한다.
2. Cloudflare Workers & Pages에서 기존 Worker 또는 새 Worker를 만들고 Git 저장소를 Workers Builds에 연결한다. Worker 이름은 wrangler.jsonc와 동일한 `waterside-village`로 설정한다.
3. Production branch는 `codex/fishing-world`를 선택하거나 리뷰 후 main으로 옮긴다. Root directory는 저장소 루트, Install command는 `npm ci`, Build command는 `npm run build`, Deploy command는 `npx wrangler deploy`다. Node 22 이상을 사용한다.
4. Workers 유료 환경과 SQLite Durable Objects 사용 가능 여부를 계정에서 확인한다. `GAME_WORLD` 바인딩과 v1 `new_sqlite_classes` 마이그레이션은 설정에 있다. D1/R2/외부 API 키는 필요하지 않다. Git 연결의 배포 권한은 Cloudflare에서 관리한다.
5. CLI 배포는 대상 계정 인증을 확인한 뒤 `npm run deploy:staging`으로 별도 Worker/DO 공간을 먼저 올리고 두 브라우저로 검수한다. 운영은 `npm run deploy`다. 환경 간 바인딩을 공유하지 않는다. 로컬 `.wrangler/state`, 테스트 런타임, staging, production은 다른 데이터 공간이다.
6. 배포 후 HTTPS 쿠키·자동 로그인·두 브라우저 포획/방해·새 연결의 이전 연결 종료·재시작 후 낚시 완료를 다시 확인한다. 로컬 workerd 결과는 원격 엣지·실제 네트워크 성능을 보장하지 않는다.

Workers Static Assets: https://developers.cloudflare.com/workers/static-assets/
Workers Builds: https://developers.cloudflare.com/workers/ci-cd/builds/
Durable Objects WebSockets: https://developers.cloudflare.com/durable-objects/best-practices/websockets/

단일 월드 최대 50명은 애플리케이션의 초기 제한이다. 여러 월드나 무제한 확장은 구현하지 않았다. 유휴 Hibernation에서도 저장 공간 등 별도 비용이 있으며, 이동/메시지가 계속되면 요청·연산·전송 비용이 발생할 수 있다. 정해진 비용이나 무제한 처리량을 보장하지 않는다. 운영에서는 관측 로그·트레이스와 실제 지역별 RTT, 장시간 동시 접속을 확인해 제한을 조정한다.

원본 이미지는 배포 경로 밖 art/source에 있고 런타임 이미지 약 10MiB만 Static Assets에 포함된다. `VITE_ASSET_BASE`로 향후 외부 이미지 경로를 분리할 수 있다. 현재 UI CSS 경로는 /assets 고정이므로 외부 CDN 전환 시 함께 변경해야 한다.
