# AI 자동 번역 설정

메뉴·카테고리·옵션의 새 문구를 한국어, 베트남어, 중국어(간체), 영어로 자연스럽게 번역하도록 준비되어 있습니다. 번역 결과는 캐시에 저장되어 같은 문구를 매번 다시 번역하지 않습니다.

## 최초 1회 설정

1. OpenAI API 키를 준비합니다.
2. GitHub에서 `dabang` 저장소를 엽니다.
3. `Settings` → `Secrets and variables` → `Actions`로 이동합니다.
4. `New repository secret`을 누릅니다.
5. 이름은 `OPENAI_API_KEY`, 값은 발급받은 API 키로 저장합니다.
6. `Actions` → `CUKCUK menu sync` → `Run workflow`를 한 번 실행하거나, 30분 자동 실행을 기다립니다.
7. 관리자 화면에서 `AI 번역 결과 불러오기`를 누릅니다.

API 키는 HTML 파일, 소스 코드, 채팅에 붙여 넣지 마세요. GitHub Actions의 보안 Secret에만 저장해야 합니다.

## 작동 방식

- CUKCUK에서 새 메뉴·카테고리·옵션을 불러온 뒤 번역이 실행됩니다.
- 이미 번역된 문구는 캐시를 사용하고, 새 문구나 수정된 문구만 다시 번역합니다.
- 관리자가 직접 입력해 둔 번역은 덮어쓰지 않고 비어 있는 언어만 채웁니다.
- 현재 번역 모델은 `gpt-5.6-terra`이며 `.github/workflows/cukcuk-sync.yml`의 `OPENAI_TRANSLATION_MODEL`에서 바꿀 수 있습니다.

## 현재 범위

GitHub 동기화 데이터에 포함된 메뉴·카테고리·옵션을 자동 번역합니다. 브라우저 한 대의 관리자 화면에서만 새로 만든 로컬 옵션 템플릿은 아직 GitHub가 볼 수 없으므로 자동 번역 대상에 포함되지 않습니다. 이 항목까지 자동화하려면 관리자 저장 데이터를 서버에 보관하는 API가 추가로 필요합니다.
