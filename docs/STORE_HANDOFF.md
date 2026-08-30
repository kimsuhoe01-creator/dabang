# 매장 노트북 인계 — 다방 테이블오더

> 최신 상태는 바로 아래 `2026-08-30 진행 상태`다. 그 아래의 2026-08-29 내용은 당시 기록으로 보존한다.

## 2026-08-30 진행 상태

- 현재 라이브 `main`: `6849071` (`Update CUKCUK published data`)
- 검증된 기능 브랜치: `tablet-menu-content-options-20260830`
- 핵심 변경 커밋: `3d14dbc` (`Polish tablet menu and add safe CUKCUK option sync`)
- 상태: **기능 브랜치 검증·원격 백업 완료, 라이브 `main` 배포 승인 대기**

### 앱·콘텐츠 완료

- 카테고리 14개, 메뉴 112개를 유지했다. 추천 메뉴는 기본으로 닫혀 있다.
- 테이블은 이름 기준 `A → B → C → D → Z → 배달`, 각 구역은 1번부터 자연 숫자순이다.
- 하이볼을 최상단에 두고 신메뉴·주류·건어물·브랜드 인접 메뉴의 순서를 정리했다.
- 메뉴명은 굵은 검정, 가격은 빨간 가격 배지로 분리해 가독성을 높였다.
- 다방치킨 로고를 테이블 선택과 메뉴 상단에 배치했다.
- `돈까스 플레이트 (안 매운맛)`을 포함한 이름과 주요 메뉴 설명을 한국어·베트남어·중국어·영어로 넣었다.
- 치밥 키트·불쫄면 등 강한 매운맛 경고는 빨간색으로 표시한다.
- 품절 안내는 “인기가 많아 품절되었습니다. 최대한 빨리 다시 찾아뵙겠습니다”의 4개 언어 문구로 바꿨다.
- 코카콜라·펩시 제로 `(390ml)`, 나랑드 제로 `(500ml)`, 펩시 제로 라임 `(1.5L)`, 하노이 생맥주 `KEG (1L)`를 표시한다.
- 서비스워커는 `dabang-tablet-v9`, 이미지 레지스트리는 `assets/menu-images.js?v=20260830-content-v2`를 쓴다.

### CUKCUK 관리자 저장 완료

`CUKCUK 수정` 작업에서 저장 후 재열기와 테이블 QR 노출을 확인했다.

- A02 사포로 생맥주: 330cc·640cc·3300cc, 최소 1개 필수·최대 3개
- T10 튀김: 기존 10종, 최소 1개 필수·최대 10개
- HCX 돈까스 플레이트: 아래 2개 중 정확히 1개 필수
  - `안 매운맛 | KHÔNG CAY`
  - `매운맛 반 + 안 매운맛 반 | NỬA SIÊU CAY DIJINDA + NỬA KHÔNG CAY`
- S08 윙봉떠까: 한·베 병기 0원 맛 7개 중 정확히 4개 필수
- W01 반반윙봉: 같은 7개 중 정확히 2개 필수
- KX01 반반치킨: 뼈/순살 1개와 맛 2개 필수
- T06 다방 떡볶이: 매운맛 1개 필수, 토핑 최대 3개

실제 주문·결제·주방 영수증 출력은 수행하지 않았다. 물리 영수증의 줄바꿈·한글/베트남어 출력은 매장에서 시험 주문 1건으로 확인해야 한다.

### 공개 동기화 보강과 안전 보호

기존 고객 메뉴 API는 이름 없는 `Khác` 옵션 그룹을 누락했다. 그래서 관리자에서는 정상인 HCX/S08/W01/A02/T10 옵션이 공개 JSON에는 0개로 나타났다.

기능 브랜치에는 다음 보강을 구현했다.

- CUKCUK `inventoryitems/detail/<menu UUID>`에서 실제 `AdditionCategories[].Additions[]`를 가져온다.
- 실제 Addition UUID·설명·가격을 검증해 공개 옵션으로 병합한다.
- 예상 그룹 수·값 수가 다르면 배포를 실패 처리한다.
- 메뉴에 붙지 않은 옵션, 다른 그룹 값, 중복 값, 최소·최대 선택 수 위반을 주문 워커가 거부한다.
- `KO | VI` 옵션명은 `receiptNames`에 보존하고 주방 주문 payload에 `VI / KO`로 넣는다.
- 내부 템플릿 ID는 `cukcuk-detail:<menu UUID>:<그룹 번호>`다. CUKCUK에 실제 전송하는 값은 상세 API에서 받은 Addition UUID다.

첫 상세 동기화가 끝날 때까지 HCX/S08/W01/A02/T10 다섯 메뉴는 기능 브랜치에서 품절로 보호한다. 이 중간 상태는 아직 라이브에 배포하지 않았다.

### 변경 이미지와 추가로 필요한 사진

커밋에 포함된 변경 자산:

- 비빔만두: 음식 누끼와 새 배경
- 어묵꼬치 우동: 오른쪽 잘림을 줄인 배경·구도
- 수박: 수박 껍질 그릇 안의 큐브 수박
- 짭코바 반마리: 실제 매장 사진
- 반반 윙봉: 실제 보유 사진
- 하노이 생맥주 KEG 1L: 실제 제품 사진
- 펩시 제로 라임 1.5L: 실제 초록 포인트 제품 사진
- 다방치킨 로고: `assets/brand/dabang-logo.png`

음식 본체를 AI로 다시 그리는 방식은 중단했다. 아래 3개는 실제 매장 사진을 받아야 하므로 임의 교체하지 않았다.

- 반마리 치킨
- 윙봉 반마리
- 후라이드 치킨

사진 투입 폴더: `F:\OneDrive\수회\Documents\매장운영총괄\사진_추가로_필요한_메뉴`

### 챌린지 제한시간

정확한 분 수는 로컬 근거에서 찾지 못해 숫자를 넣지 않았다.

- 저장소 Git 이력·reflog·dangling 객체 1,115개
- `F:\OneDrive\수회\Documents\매장운영총괄` 418개 파일
- `F:\OneDrive\수회\매장운영자료` 2,018개 파일
- Office 내부 XML 97개, PDF 208개·268쪽
- `디진다1.png`, `디진다2.png`, `크림떡볶이 디진다.png`, 현재 챌린지 이미지

모든 자료에 제한시간 숫자가 없었다. 돈까스 자료의 5~6분은 튀김 조리시간이라 무관하다. 사용자가 정확한 분 수를 알려주기 전에는 `제한시간 안에 다 먹으면 무료!`까지만 유지한다.

### 최신 검증

- 주문 워커·레이아웃·상세 옵션 병합 테스트: 36개 통과, 실패 0
- 이미지 감사: 메뉴 112, 매핑 133, 이미지 파일 136, 누락 0, 고아 0
- 로컬 안전 미리보기 이미지 요소 225개, 깨진 이미지 0
- 실제 주문 제출: 0건

### 기능 브랜치 링크

- 기능 브랜치: https://github.com/kimsuhoe01-creator/dabang/tree/tablet-menu-content-options-20260830
- PR 생성 화면: https://github.com/kimsuhoe01-creator/dabang/pull/new/tablet-menu-content-options-20260830
- 현재 라이브 안전 미리보기: https://kimsuhoe01-creator.github.io/dabang/tablet-preview.html?preview=1&deploy=6849071
- CUKCUK 동기화: https://github.com/kimsuhoe01-creator/dabang/actions/workflows/cukcuk-sync.yml
- 주문 워커 상태: https://dabang-cukcuk-order-api.kimsuhoe01.workers.dev/health

### `main` 승인 후 순서

1. 기능 브랜치를 최신 `main`에 fast-forward 배포한다.
2. 첫 상세 동기화에서 HCX 2개, S08/W01 각 7개, A02 3개, T10 10개의 실제 Addition UUID와 가격을 확인한다.
3. 검증된 내부 템플릿에 메뉴별 규칙을 연결하고 다섯 메뉴의 품절 보호를 해제한다.
4. 전체 테스트·이미지 감사를 다시 실행한다.
5. 최종 커밋을 `main`에 배포하고 Pages·주문 워커·안전 미리보기를 재검증한다.
6. 매장 시험 주문은 사용자 현장 승인 하에서만 수행한다.

기준일: 2026-08-29

앱 변경 기준 커밋: `5fb276d` (`Polish tablet menu layout and images`)

카탈로그 기준: `cukcuk-table-qr-2026-08-29-977c992bdbcc-menu-polish-v2`

## 현재 완료 상태

- 태블릿 앱은 카테고리 14개, 메뉴 112개다. 고객에게 보이는 순서는 `하이볼 → 신메뉴 → 세트 → 반마리 치킨 → 다방치킨 → 통닭 → 날개치킨 → 다방분식 → 스페이스 피자 → 안주 → 건어물 → 음료 → 주류`다.
- `요일별 할인`은 데이터에는 남아 있지만 현재 메뉴가 0개라 카테고리 레일에서 자동으로 감춰진다. 추천 메뉴도 기본 숨김이다.
- 신메뉴는 돈까스 3종, 콤보·치킨, 닭발·분식, 아이스크림 순으로 다시 정리했다.
- `반마리 치킨` 앱 카테고리를 만들고 반마리 메뉴 5개를 모았다.
- `건어물` 앱 카테고리를 만들고 건어물 메뉴 6개를 모았다.
- 다방치킨 이름은 `후라이드 치킨`, `양념 치킨`, `매운 양념 치킨`, `고추마늘간장 치킨`, `스리라차 어니언 치킨`으로 고정했다. `파닭`은 유지했다.
- 잘못 표시되던 빙수 품목은 `수박 | Dưa hấu | 西瓜 | Watermelon`으로 고정했다.
- 메뉴명은 20px 굵은 검정, 가격은 16px 굵은 빨강으로 위계를 분리했다.
- 가로·세로 사진은 흐린 확장 배경과 여백 축소로 카드가 덜 비어 보이게 했다.
- 동일 UUID 사진을 교체해도 예전 캐시가 먼저 보이지 않도록 카탈로그 revision 쿼리와 서비스워커 캐시 v8을 적용했다.
- 옵션 선택지는 앱에서 추가금 0원 선택지를 모두 먼저, 유료 선택지를 그 뒤에 표시한다. 치피 SET (L) 미리보기에서 무료 5개 뒤 유료 4개 순서를 확인했다.
- 테이블 선택 화면은 테이블 이름 기준 `A → B → C → D → Z(PC) → 배달` 순이며 각 구역 안에서는 1번부터 자연 숫자순이다.
- 최신 자동 동기화 커밋 `b7d96e8`의 메뉴 동기화 시각과 실시간 테이블 사용 상태를 보존한 위에 앱 변경을 반영했다.
- 활성 메뉴 112개 모두 사진이 연결돼 있다. 사진 레지스트리와 파일은 133개이며, 현재 미노출 메뉴의 보관 사진 21개는 삭제하지 않았다.
- 주문 워커와 레이아웃·QR·옵션 순서 테스트는 총 23개 통과, 실패 0이다.

## CUKCUK 관리자 반영 상태

- 마지막으로 확인된 CUKCUK 테이블 QR 원본은 12개 카테고리, 112개 메뉴다.
- 앱의 `반마리 치킨`과 `건어물`은 현재 앱용 분리 카테고리다. CUKCUK 관리자에도 같은 카테고리를 만들고 메뉴를 이동해야 14개 구조가 완전히 같아진다.
- 기존 Codex 작업 `CUKCUK 수정`에 반마리·건어물 카테고리 생성, 하이볼 최상단, 신메뉴 정렬, 치킨 메뉴명 변경, 피자 옵션 무료 우선 정렬을 전달했다.
- CUKCUK 전용 Chrome은 창은 열려 있으나 제어 탭을 찾지 못했고, 인앱 브라우저는 로그인 세션이 없어 관리자 저장을 하지 못했다.
- 따라서 CUKCUK 관리자 실제 변경은 현재 0건이며 반영 대기다. 가격·판매상태·이미지·실제 주문은 건드리지 않았다.

CUKCUK 관리자가 열리면 앱과 같은 14개 구조로 저장하고, 테이블 QR에서 메뉴명·카테고리·옵션 순서를 다시 읽어 확인해야 한다.

## 태블릿 앱 카테고리 순서

1. 하이볼 — 8개
2. 신메뉴 — 15개
3. 요일별 할인 — 0개, 앱 레일에서 숨김
4. 세트 — 10개
5. 반마리 치킨 — 5개
6. 다방치킨 — 10개
7. 통닭 — 1개
8. 날개치킨 — 5개
9. 다방분식 — 12개
10. 스페이스 피자 — 8개
11. 안주 — 7개
12. 건어물 — 6개
13. 음료 — 7개
14. 주류 — 18개

현재 CUKCUK QR에서 품절로 확인된 메뉴는 다음 2개다.

- 딥치즈 & 나초칩 — 코드 `(M04) nacho cham phomai`
- 쥬시큘 — 코드 `CC`

## 이번 묶음에서 교체한 메뉴 사진 15개

Codex 내장 이미지 생성 기능으로 메뉴 카드용 1:1 사진을 만들거나 보정하고 육안 검수했다.

- 디진다 돈까스
- 반마리치킨
- 후라이드 치킨
- 윙봉 반마리
- 반반 윙봉
- 수박
- 펩시 제로 1.5L
- 하노이 생맥주 1L
- 사포로 1+1 (640cc)
- 사포로 생맥주
- 사포로 블랙 생맥주
- 코로나 병맥주
- 코로나 5병 세트
- 타이거 병맥주
- 사이공 캔맥주

최종 파일은 모두 `assets/menu/<CUKCUK UUID>.<확장자>`에 반영돼 있다. 반마리치킨과 후라이드 치킨은 너겟처럼 보이지 않도록 뼈 있는 조각 구성으로 다시 만들었고, 윙봉 반마리는 반반 윙봉과 카드 속 바구니 크기를 맞추되 수량이 적게 보이도록 보정했다.

## 공개 링크

- 안전 미리보기: https://kimsuhoe01-creator.github.io/dabang/tablet-preview.html?preview=1&deploy=5fb276d
- 관리자 화면: https://kimsuhoe01-creator.github.io/dabang/admin-v2.html?deploy=5fb276d
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

> `C:\Codex\repos\dabang`에서 `docs\STORE_HANDOFF.md`와 `AGENTS.md`를 먼저 읽고, 현재 태블릿 앱 14개 카테고리·112개 메뉴 상태와 CUKCUK 관리자 반영 대기 항목을 안전 미리보기에서 점검해 줘. 실제 주문은 보내지 마.

## 검증 명령

저장소 루트:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\audit-menu-images.ps1
```

주문 워커 및 QR/테이블 레이아웃 테스트:

```powershell
C:\Users\Admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --test .\cloudflare-order-worker\test\*.test.js
```

정상 기준:

- 메뉴 112
- 활성 메뉴 사진 누락 0
- 옵션 템플릿 누락 0
- 버거 메뉴 0
- 테스트 23개 통과
- 브라우저 메뉴 카드 112개, 이미지 112개, 깨진 이미지 0

## 구조 변경 시 주의

공식 CUKCUK OpenPlatform 메뉴·카테고리 API에는 테이블 QR 노출 여부와 수동 표시 순서가 없다. 가격·일반 판매상태·테이블 목록은 자동 갱신되지만, 고객 노출 구조와 순서는 `data/cukcuk-table-qr-layout.json`으로 고정한다.

- `optionOrdering`은 무료 선택지를 먼저 두는 검증된 옵션 순서를 보존한다.
- `menuNameOverrides`는 동기화가 치킨 이름과 수박 이름을 예전 원문으로 덮지 못하게 한다.
- 레이아웃 생성기는 위 두 설정을 보존하고, 카테고리 이름만 바뀌어도 revision이 바뀌게 한다.
- 현재 앱용 가상 카테고리는 CUKCUK 관리자 반영 후 새 캡처로 교체해야 한다.
- CUKCUK 테이블 QR이 바뀌면 원본 캡처를 Git에 포함되지 않는 `work/`에 두고 `scripts/build-table-qr-layout.mjs`로 재생성한 뒤 전체 테스트와 이미지 감사를 실행한다.
- 비밀키는 GitHub Secret/Cloudflare Secret에서만 사용한다. HTML, 문서, 로컬 인계 파일에 비밀값을 저장하지 않는다.
