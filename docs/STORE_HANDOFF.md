# 매장 노트북 인계 — 다방 테이블오더

기준일: 2026-08-29

기준 커밋: `aeea3c7` (`Keep CUKCUK free options first`)

카탈로그 기준: `cukcuk-table-qr-2026-08-29-95357aa1ca69-option-order-v2`

## 현재 완료 상태

- 권한이 있는 기존 Codex 작업 `CUKCUK 수정`에서 CUKCUK 관리자 화면을 읽기 전용으로 확인했다. 실제 주문이나 CUKCUK 설정 변경은 하지 않았다.
- CUKCUK `Bán hàng Online > Gọi món tại bàn > Thực đơn`의 고객 노출 기준은 카테고리 12개, 메뉴 112개다.
- 앱의 카테고리와 메뉴를 CUKCUK 테이블 QR의 상품코드 및 표시 순서와 112/112 일치시켰다.
- CUKCUK에는 등록돼 있지만 테이블 QR에 노출되지 않는 버거 2종(`SPACE6`, `SPACE7`)은 앱에서 제외했다.
- 추천 메뉴는 기본 숨김이다. 관리자가 의도적으로 다시 켜기 전에는 첫 카테고리가 맨 위에 나온다.
- 테이블 선택 화면은 테이블 이름 기준 `A → B → C → D → Z(PC) → 배달` 순이며 각 구역 안에서는 1번부터 자연 숫자순이다.
- 현재 테이블 파일 기준 첫 네 구역은 `A-1~6`, `B-01~13`, `C-1~9`, `D-1~6`이다.
- 예전 브라우저 저장 배치는 레이아웃 버전 3으로 자동 갱신된다. 새 CUKCUK 테이블은 같은 구역에 합쳐진다.
- 5분 자동 동기화는 전체 활성 재고에 상품코드를 붙인 뒤 테이블 QR 허용 목록 112개만 남긴다. 상품코드 중복, 메뉴 누락, 옵션 템플릿 누락, 잘못된 가격이 있으면 공개 파일을 갱신하지 않고 실패한다.
- 2026-08-20 CUKCUK 관리자에서 실제 저장한 옵션 순서를 앱 동기화 설정에도 고정했다. 대상 10개 메뉴의 옵션 그룹 순서와 7개 템플릿의 선택지 순서를 그대로 적용한다.
- 모든 옵션 템플릿은 무료 선택지가 유료 선택지보다 먼저 나온다. 별도 확인 기록이 없는 템플릿은 무료/유료 각 구간 안의 기존 순서를 유지한다.
- 치피 SET M/L은 `치킨 선택 → 피자 옵션 → 피자 엣지 변경` 순이다. 피자 옵션은 `고구마 → 옥수수 → 불닭 → 하와이안 → 치킨 데리야끼` 무료 5종 뒤에 유료 4종이 나온다.
- 이 규칙은 5분 CUKCUK 자동 동기화와 QR 캡처 설정 재생성 후에도 유지되며, 카탈로그 revision을 올려 매장 태블릿의 예전 로컬 옵션 순서도 새 기준으로 갱신한다.
- 활성 메뉴 112개 모두 사진이 연결돼 있다. 사진 레지스트리와 파일은 133개이며, 현재 미노출 메뉴의 보관 사진 21개는 삭제하지 않았다.
- 주문 워커와 레이아웃·QR·옵션 순서 테스트는 총 23개 통과, 실패 0이다.

## CUKCUK 테이블 QR 카테고리 순서

1. 신메뉴 — 15개
2. 요일별 할인 — 0개
3. 세트 — 10개
4. 다방치킨 — 14개
5. 통닭 — 1개
6. 날개치킨 — 6개
7. 다방분식 — 12개
8. 스페이스 피자 — 8개
9. 안주 — 13개
10. 음료 — 7개
11. 주류 — 18개
12. 하이볼 — 8개

`요일별 할인`은 관리자에서 활성 카테고리지만 현재 고객 노출 메뉴가 0개라 태블릿의 카테고리 레일에서는 자동으로 감춰진다.

현재 CUKCUK QR에서 품절로 확인된 메뉴는 다음 2개다.

- 딥치즈 & 나초칩 — 코드 `(M04) nacho cham phomai`
- 쥬시큘 — 코드 `CC`

## 이번에 추가한 QR 전용 메뉴 사진 9개

원드라이브/기존 앱 원본 사용:

- 디진다 돈까스 챌린지
- 참숯불닭
- 화덕통닭
- 마니치
- 불쫄면
- 튀김
- 사리 추가

AI 생성 후 육안 검수:

- 폴드 치킨 퀘사디아
- 펩시 제로 1.5L

두 생성 이미지는 Codex 내장 이미지 생성 기능을 사용했으며 최종 파일은 다른 메뉴 사진과 같이 `assets/menu/<CUKCUK UUID>.png`에 포함돼 있다.

## 공개 링크

- 안전 미리보기: https://kimsuhoe01-creator.github.io/dabang/tablet-preview.html?preview=1&deploy=aeea3c7
- 관리자 화면: https://kimsuhoe01-creator.github.io/dabang/admin-v2.html?deploy=aeea3c7
- 공개 메뉴 JSON: https://kimsuhoe01-creator.github.io/dabang/data/cukcuk-menu.json
- 공개 테이블 JSON: https://kimsuhoe01-creator.github.io/dabang/data/cukcuk-tables.json
- GitHub 저장소: https://github.com/kimsuhoe01-creator/dabang
- CUKCUK 동기화 실행 기록: https://github.com/kimsuhoe01-creator/dabang/actions/workflows/cukcuk-sync.yml
- 주문 워커 상태: https://dabang-cukcuk-order-api.kimsuhoe01.workers.dev/health

`preview=1`이 없는 주소에서는 실제 주문이 전송될 수 있다. 사용자 허가 없이 주문 제출 테스트를 하지 않는다. 화면 검토는 시크릿 창과 `?preview=1` 주소를 사용한다.

## 매장 노트북에서 이어서 작업

코드는 OneDrive가 아니라 로컬 저장소 `C:\Codex\repos\dabang`에서 작업한다.

저장소가 이미 있으면 삭제하거나 다시 clone하지 않는다.

```powershell
cd C:\Codex\repos\dabang
git status
git fetch origin --prune
git switch main
git pull --ff-only origin main
```

저장소가 없을 때만 다음을 실행한다.

```powershell
git clone https://github.com/kimsuhoe01-creator/dabang.git C:\Codex\repos\dabang
cd C:\Codex\repos\dabang
```

매장 Codex에는 다음과 같이 말하면 된다.

> `C:\Codex\repos\dabang`에서 `docs\STORE_HANDOFF.md`와 `AGENTS.md`를 먼저 읽고, 현재 CUKCUK QR 12개 카테고리·112개 메뉴 상태를 안전 미리보기에서 점검해 줘. 실제 주문은 보내지 마.

## 검증 명령

저장소 루트:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\audit-menu-images.ps1
```

주문 워커 및 QR/테이블 레이아웃 테스트:

```powershell
C:\Users\Admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --test .\cloudflare-order-worker\test\image-edit.test.js .\cloudflare-order-worker\test\order.test.js .\cloudflare-order-worker\test\sales-report.test.js .\cloudflare-order-worker\test\table-layout.test.js
```

정상 기준:

- 메뉴 112
- 활성 메뉴 사진 누락 0
- 옵션 템플릿 누락 0
- 버거 메뉴 0
- 테스트 23개 통과

## 구조 변경 시 주의

공식 CUKCUK OpenPlatform 메뉴·카테고리 API에는 테이블 QR 노출 여부와 수동 표시 순서가 없다. 따라서 가격·일반 판매상태·테이블 목록은 5분마다 자동 갱신되지만, 카테고리/메뉴 구조와 순서는 `data/cukcuk-table-qr-layout.json`의 2026-08-29 관리자 캡처를 기준으로 잠겨 있다. 같은 파일의 `optionOrdering`에는 2026-08-20 CUKCUK 관리자에서 저장 완료한 메뉴별 옵션 그룹 및 선택지 순서가 들어 있다.

CUKCUK 테이블 QR에서 품목이나 순서를 바꾼 경우에는 관리자 화면을 다시 읽기 전용으로 캡처하고 다음 순서로 갱신한다.

1. 원본 캡처 JSON을 로컬 `work/`에 둔다. `work/`는 Git에 포함하지 않는다.
2. `scripts/build-table-qr-layout.mjs`로 `data/cukcuk-table-qr-layout.json`을 다시 만든다. 생성기는 기존 `optionOrdering`을 보존한다.
3. CUKCUK에서 옵션 순서 자체도 바꿨다면 `optionOrdering`의 메뉴 코드·템플릿/선택지 UUID를 별도 확인 기록에 맞춰 갱신한다. 없는 선택지를 새로 만들지 않는다.
4. 전체 테스트와 이미지 감사를 실행한다.
5. `main`에 반영한 뒤 `CUKCUK menu sync` 성공과 최종 공개 JSON을 확인한다.

비밀키는 GitHub Secret/Cloudflare Secret에서만 사용한다. HTML, 문서, 로컬 인계 파일에 비밀값을 저장하지 않는다.
