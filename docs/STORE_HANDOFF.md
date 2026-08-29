# 매장 노트북 인계 — 다방 테이블오더

기준일: 2026-08-29

기준 커밋: `8713310254c409b1b39971620f98511f5b30142b`

## 현재 완료 상태

- 최종 메뉴 이미지 19개를 교체해 GitHub Pages에 배포했다.
- 공개 서버의 교체 이미지 19개가 로컬 결과와 SHA-256 기준 19/19 일치했다.
- CUKCUK 고객 메뉴 85개와 활성 주류 39개를 합친 124개를 앱 메뉴 124개와 UUID 단위로 대조했다.
- 누락 0, 예상하지 않은 추가 0, 메뉴명·가격·카테고리·판매상태 핵심 불일치 0이다.
- 이미지 매핑 124, 이미지 파일 124이며 누락·깨짐·오래된 매핑·고아 파일은 0이다.
- 고객 웹 테이블 메뉴와 태블릿 메뉴는 모두 `tablet-preview.html` 및 `data/cukcuk-menu.json`을 사용하므로 별도 품목 목록이 아니다.
- 주문 워커 테스트는 10개 통과, 0개 실패였다.
- 공개 브라우저에서 모든 카테고리와 새 이미지를 확인했고 콘솔 오류는 0이었다.

## 공개 링크

- 안전 미리보기: https://kimsuhoe01-creator.github.io/dabang/tablet-preview.html?preview=1&deploy=8713310
- 실제 주문 루트: https://kimsuhoe01-creator.github.io/dabang/
- 관리자 화면: https://kimsuhoe01-creator.github.io/dabang/admin-v2.html
- 공개 메뉴 JSON: https://kimsuhoe01-creator.github.io/dabang/data/cukcuk-menu.json
- 공개 테이블 JSON: https://kimsuhoe01-creator.github.io/dabang/data/cukcuk-tables.json
- CUKCUK 고객 메뉴 소스: https://dabang-tablet-admin.kimsuhoe.chatgpt.site/api/cukcuk/menu
- 주문 워커 상태: https://dabang-cukcuk-order-api.kimsuhoe01.workers.dev/health
- GitHub Pages 배포: https://github.com/kimsuhoe01-creator/dabang/actions/runs/33243582327

`preview=1`이 없는 주소에서는 실제 주문이 전송될 수 있으므로 사용자 허가 없이 주문 제출 테스트를 하지 않는다. 기존 로컬 저장 설정을 피하려면 시크릿 창에서 검토한다.

## 이번에 교체한 19개 이미지

- 간장계란밥, 주먹밥, 계란찜, 고르곤졸라 피자, 치즈 오븐 스파게티, 딥치즈 & 나초칩
- 크리스피 윙봉, 윙봉 반마리, 파마산 치즈가루, 망고 에이드, 데킬라 샷
- 촉촉 반건조 오징어, 조미 오징어, 버터 먹태구이, 반건조 노가리, 건어물 떠까, 클래식 쥐포
- 막걸리, 막걸리 1

## 가장 먼저 할 현장 작업

집 PC에서 발견한 예전 박닌 QR은 `https://kimsuhoe.qrplanet.com/042yla`였고 현재 404다. OneDrive 매장 이미지와 디자인 이미지 1,748장을 검사했지만 현행 박닌 테이블 주문 QR은 찾지 못했다.

매장에 도착하면 다음을 수행한다.

1. 테이블에 현재 붙은 QR을 정면에서 선명하게 촬영한다.
2. OneDrive 최상위의 `다방_테이블오더_매장인계/10_현장QR_사진_여기에`에 사진을 넣는다.
3. QR을 로컬에서 해독해 최종 URL을 확인한다.
4. 실제 QR 화면과 최신 CUKCUK 원본, 공개 메뉴 JSON을 UUID·메뉴명·가격·카테고리·판매상태별로 전수 대조한다.
5. 구형 404 QR이 아직 붙어 있으면 새 메뉴 주소용 QR로 교체한다.

## CUKCUK 원본에서 사용자 확인이 필요한 항목

- 서로 다른 UUID의 `하노이 생맥주 1L` 2개
- 0원 품목 `사포로 생맥주`, `사이공 캔맥주 서비스`
- 배달·서비스용으로 보이는 `배달) 참이슬`, `배달) 진로`, `배달) 새로`, `배달) 사포로 생맥주`, `배달) 선양소주`, `사이공 캔맥주 서비스`
- 서로 다른 UUID의 `막걸리`, `막걸리 1`
- 카테고리 UUID가 없어 런타임 `기타`로 표시되는 `페퍼로니 (SP02)`, `쉬림프 피자`, `불고기 피자`, `고구마 베이컨 피자`, `고구마 피자`

이 항목들은 앱이 임의로 만든 것이 아니라 점검 시점의 CUKCUK 원본/활성 재고에 존재했다. 사용자 확인 없이 삭제하거나 합치지 않는다.

## 매장 노트북에서 시작

코드는 OneDrive 안이 아니라 로컬 작업 폴더에 둔다.

```powershell
git clone https://github.com/kimsuhoe01-creator/dabang.git C:\Codex\repos\dabang
cd C:\Codex\repos\dabang
git fetch origin --prune
git switch -c store-menu-review-YYYYMMDD origin/main
```

이미 저장소가 있으면 clone하거나 삭제하지 말고 `git status`와 변경 파일부터 확인한다. 원격 `main`은 CUKCUK 자동 동기화로 계속 갱신될 수 있으므로 기준 커밋보다 최신이어도 정상이다.

## 검증 명령

저장소 루트:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\audit-menu-images.ps1
```

주문 워커 변경 시:

```powershell
cd cloudflare-order-worker
npm test
```

## OneDrive 인계 폴더

논리적 위치:

`OneDrive 최상위 > 다방_테이블오더_매장인계`

이 폴더에는 휴대폰용 안내, 매장 Codex에 붙여 넣을 지시문, 링크, 124개 전수 대조표, 점검 시점의 JSON, 현장 QR 및 새 사진 투입 폴더가 있다. 원본 후보 사진 전체와 개인 Codex 세션은 옮기지 않는다.

`30_관리자설정백업/dabang-tablet-settings-2026-08-29.json`은 집 브라우저의 관리자 화면에서 내보낸 메뉴 표시·카테고리·테이블 배치 설정이다. 매장 관리자 화면의 `설정 복원`으로 불러올 수 있다. 복원은 매장 브라우저의 기존 로컬 설정을 바꿀 수 있으므로, 기존 설정을 보존해야 하면 매장 브라우저에서도 먼저 별도 백업한다.
