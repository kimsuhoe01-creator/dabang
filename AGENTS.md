# 다방 테이블오더 저장소 작업 지침

## 프로젝트 범위

- 이 저장소는 박닌 다방의 고객용 테이블·태블릿 메뉴와 CUKCUK 주문 연동을 배포한다.
- 고객용 루트와 태블릿 메뉴는 같은 `tablet-preview.html` 화면을 사용한다.
- 메뉴 원본은 `data/cukcuk-menu.json`, 테이블 원본은 `data/cukcuk-tables.json`, UUID별 이미지 연결은 `assets/menu-images.js`, 이미지 파일은 `assets/menu/`에 있다.
- 현재 작업 상태와 매장 인계는 `docs/STORE_HANDOFF.md`를 먼저 읽는다.

## 작업을 시작할 때

- 먼저 `git status`, 현재 브랜치, `origin`을 확인하고 `git fetch origin --prune`으로 최신 원격 상태를 확인한다.
- `.github/workflows/cukcuk-sync.yml`이 CUKCUK 메뉴 데이터를 주기적으로 `main`에 커밋하므로, 변경은 최신 `origin/main`에서 새 브랜치를 만들어 진행한다.
- 통합 직전 다시 원격을 확인하고 자동 동기화가 만든 최신 `data/` 변경을 되돌리지 않는다.
- `main`이나 다른 공유 브랜치에 강제 푸시하지 않는다.
- 사용자 변경과 무관한 파일을 삭제·복원·덮어쓰지 않는다.

## 실제 주문 안전

- 화면 QA는 `https://kimsuhoe01-creator.github.io/dabang/tablet-preview.html?preview=1`을 사용한다.
- `preview=1`이 없는 고객 화면은 실제 CUKCUK 주문을 전송할 수 있다. 사용자가 그 실행을 명시적으로 허가하지 않는 한 실제 주문 제출을 하지 않는다.
- 브라우저의 `dabangTabletPreview` 로컬 저장값이 메뉴 숨김·이름·카테고리·판매상태를 덮어쓸 수 있으므로 기준 화면은 시크릿 창에서도 확인한다.
- 기기 간 로컬 표시 설정을 옮길 때는 관리자 화면의 `설정 백업`과 `설정 복원`을 사용한다. 복원 전에 대상 브라우저의 기존 설정을 보존해야 하는지 사용자에게 확인하고 필요하면 먼저 별도 백업한다.
- 브라우저 프로필이나 localStorage 전체를 복사하지 않는다.
- CUKCUK 원본 품목을 삭제하거나 판매중지하고, 가격·카테고리를 바꾸는 작업은 사용자의 명시적 확인 후 수행한다.
- 비밀키, 토큰, 쿠키, `.env`, `.dev.vars`, 개인 Codex 세션 파일을 저장소에 넣지 않는다.

## 메뉴와 이미지 변경

- 메뉴 UUID를 파일명과 매핑의 기준으로 유지한다. 이름만 보고 다른 UUID의 이미지를 덮어쓰지 않는다.
- 원본 사진은 보존하고, 배포용 결과만 `assets/menu/`의 해당 UUID 파일에 반영한다.
- 메뉴 수가 과거 기준과 다르면 무조건 되돌리지 말고 최신 CUKCUK 원본과 비교해 추가·삭제·변경 사유를 보고한다.
- 막걸리처럼 이름이 비슷한 품목도 UUID가 다르면 사용자 확인 없이 합치지 않는다.

## 필수 검증

- 이미지 또는 메뉴 변경 후 저장소 루트에서 다음을 실행한다.

  `powershell -ExecutionPolicy Bypass -File .\scripts\audit-menu-images.ps1`

- 주문 워커를 변경했으면 `cloudflare-order-worker`에서 다음을 실행한다.

  `npm test`

- 공개 배포 후 안전 미리보기를 시크릿 창에서 열어 모든 카테고리, 변경 이미지, 브라우저 오류를 확인한다.
- 메뉴 품목 점검은 UUID, 메뉴명, 가격, 카테고리, 판매상태 순서로 CUKCUK 실데이터와 대조한다.
- 완료 시 검증 결과, 배포 링크, 새 커밋, 남은 현장 확인을 `docs/STORE_HANDOFF.md`에 갱신한다.
