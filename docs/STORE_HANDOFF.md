# 매장 노트북 인계 — 다방 테이블오더

> 최신 상태는 바로 아래 `2026-08-30 진행 상태`다. 그 아래의 2026-08-29 내용은 당시 기록으로 보존한다.

## 2026-08-30 진행 상태

- 작업 기준 `main`: `7f8609a` (`Update CUKCUK published data`)
- 작업 브랜치: `tablet-menu-content-options-20260830`
- 사진·캐시 배포 커밋: `da9be9e` (`Refresh tablet menu photos and offline cache`)
- 상태: **CUKCUK 옵션·앱 옵션·전체 사진 보강을 `main`에 배포 완료**

### 돈까스 플레이트·튀김 옵션 완료

`CUKCUK 수정` 작업에서 관리자 저장 후 다시 열어 규칙을 확인했고, 공개 동기화도 실제 Addition ID를 받아 완료했다.

- HCX 돈까스 플레이트: `안 매운맛`, `매운맛 반 + 안 매운맛 반` 중 정확히 1개 필수
- T10 튀김: 기존 10종 중 최소 1개·최대 10개 필수
- 사리 추가: 기존 6종 중 최소 1개·최대 5개 필수
- S08 윙봉 떠까: 7가지 맛 중 정확히 4개 필수
- W01 반반 윙봉: 7가지 맛 중 정확히 2개 필수
- KX01 반반치킨: 뼈/순살 1개와 맛 2개 필수
- T06 다방 떡볶이: 매운맛 1개 필수, 토핑 최대 3개
- A02 사포로 생맥주: 330cc·640cc·3300cc 중 최소 1개·최대 3개
- 단품 `디진다 돈까스`는 사용자의 최신 지시에 따라 변경하지 않았다.

로컬 안전 미리보기에서 돈까스 플레이트와 튀김 모두 메뉴를 누르면 옵션 창으로 들어가고, 필수 선택 전에는 `장바구니 담기`가 비활성화되는 것을 다시 확인했다. 실제 주문·결제·주방 영수증 출력은 수행하지 않았다.

### 메뉴 사진 36개 보강

세트·다방치킨·날개치킨·분식·신메뉴·안주·건어물·음료·피자를 전수 재검토해 36개 파일을 교체하거나 새 JPEG로 연결했다.

- 세트 8개: 치킨/통닭/윙봉 떡볶이 세트, 순살/윙봉 떠까, 치피 M/L, 국물닭발 세트
- 치킨·윙봉 13개: 후라이드·양념·매운양념·파닭·고추마늘간장·스리라차·짭코바·반반치킨, 간장/허니/레드/반반 윙봉, 스노윙
- 분식·신메뉴 8개: 라볶이·로제 떡볶이·쫄면·화덕통닭·유린기·치밥 키트·아이스크림 110ml·마라 감자 웨지
- 기타 7개: 버터 먹태구이·어묵탕·치즈 오븐 스파게티·나랑드 제로·코카콜라 390ml·펩시 제로 390ml·망고 에이드

음식 본체·조각 수·소스·제품 라벨을 바꾸는 생성형 후보는 폐기했다. 펩시 제로는 잘못된 500ml 사진을 제거하고 `Không calo`, `Chai 390ML`이 실제로 표시된 베트남 390ml 제품 사진으로 교체했다. 원본은 Git에 넣지 않는 `work/original-menu-images-20260830`에 보존했다.

정확한 매장 사진이 없어 임의 교체하지 않은 핵심 항목:

- 반마리치킨, 윙봉 반마리, 로제 짭코바, 마니치, 불쫄면
- 무뼈닭발 세트, 한신포차 세트
- 참이슬 프레시, 선양 소주, 선양 오크 소주
- 조미 오징어, 촉촉 반건조 오징어, 클래식 쥐포

사진 투입 폴더: `F:\OneDrive\수회\Documents\매장운영총괄\사진_추가로_필요한_메뉴`

### 캐시·화면 안전

- 서비스워커: `dabang-tablet-v14`
- 이미지 레지스트리: `assets/menu-images.js?v=20260830-content-v5`
- 이미지 URL: `asset=20260830-full-refresh-v5`와 카탈로그 revision을 별도 쿼리로 결합

같은 UUID 파일을 교체해도 설치형 태블릿이 예전 사진을 먼저 재사용하지 않도록 이미지 자체 주소까지 갱신했다.

### 챌린지 제한시간

정확한 제한시간의 근거를 찾지 못했으므로 숫자는 넣지 않았다. `디진다 돈까스 챌린지`에는 `제한시간 안에 다 먹으면 무료!`까지만 유지한다. 돈까스 자료의 5~6분은 튀김 조리시간이므로 챌린지 제한시간으로 사용하지 않는다.

### 최신 검증

- 메뉴 112, 이미지 매핑 133, 이미지 파일 161
- 이미지 누락 0, 고아 0
- 옵션·레이아웃·주문 보호 테스트 37개 통과, 실패 0
- 돈까스 플레이트 2개 중 정확히 1개, 튀김 10개 중 1~10개 선택 창 확인
- 장바구니 0개 유지, 실제 주문 제출 0건

### 공개 링크

- 안전 미리보기: https://kimsuhoe01-creator.github.io/dabang/tablet-preview.html?preview=1&deploy=da9be9e
- 관리자 화면: https://kimsuhoe01-creator.github.io/dabang/admin-v2.html?deploy=da9be9e
- GitHub 저장소: https://github.com/kimsuhoe01-creator/dabang
- CUKCUK 동기화: https://github.com/kimsuhoe01-creator/dabang/actions/workflows/cukcuk-sync.yml
- 주문 워커 상태: https://dabang-cukcuk-order-api.kimsuhoe01.workers.dev/health

물리 영수증의 줄바꿈과 한글·베트남어 출력은 사용자 현장 승인 후 매장 시험 주문 1건으로 별도 확인해야 한다.

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
