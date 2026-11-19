# 위험률차손익 조기경보 · 가상 데이터 데모

가상 상품·채널·수치만으로 경보 후보를 훑고 세부 근거를 확인하는 한국어 대시보드입니다. 실제 보험사, 상품, 영업실적, 원본 CSV는 포함하지 않습니다. 이 데모의 경보는 예시 규칙이며 통계적 유의성 판단이나 운영 경보가 아닙니다.

## 실행 및 배포

- 로컬: `python -m http.server 8080 --directory public`을 실행한 뒤 `http://localhost:8080`을 엽니다.
- Cloudflare Workers: 배포 권한이 있는 계정에서 `npx wrangler deploy`를 실행합니다. `wrangler.jsonc`에는 이 데모 전용 Worker 이름과 정적 파일 디렉터리만 지정되어 있으며, 기존 라우트나 도메인을 변경하지 않습니다.
- Git 연동 없이 업로드할 경우 Workers & Pages에서 **Upload static files**로 `public` 폴더를 새 Worker에 올립니다.

## 확인

`node test/smoke.cjs`로 데이터 생성, A/B 판정, 상세 탐색, 기준월 전환과 초기화를 검증합니다.

## PC에 있는 CSV로 분석

운영 주소 또는 오프라인으로 저장한 `public/index.html`에서 **CSV 불러오기**를 누르고 2025년 4·5·6월 파일을 함께 선택합니다. 파일은 현재 탭의 브라우저 안에서만 읽으며 업로드하거나 저장하지 않습니다. 탭을 새로 열거나 합성 데이터로 돌아가면 파일을 다시 선택해야 합니다. 실제 자료 파일과 결과는 이 공개 저장소에 추가하지 마세요.

로컬 분석 전 CSV 형식과 집계 중복을 확인하며, 3개 마감월과 A/B 경보 규칙을 사용합니다. 별도로 검증하기 전에는 이 기능의 계산 결과를 기존 기준 대시보드나 통계적 검정 결과와 동일하다고 해석하지 마세요.

CSV 엔진 수정 후 `node tools/embed-worker.cjs`로 단일 HTML에 반영합니다. `node tools/embed-worker.cjs --check`, `node test/csv-core.cjs`, `node test/smoke.cjs`, `node test/import-wiring.cjs`로 확인합니다. 외부 서버나 CDN은 필요하지 않습니다.
