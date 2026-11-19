# 위험률차손익 조기경보 · 가상 데이터 데모

가상 상품·채널·수치만으로 경보 후보를 훑고 세부 근거를 확인하는 한국어 대시보드입니다. 실제 보험사, 상품, 영업실적, 원본 CSV는 포함하지 않습니다. 이 데모의 경보는 예시 규칙이며 통계적 유의성 판단이나 운영 경보가 아닙니다.

## 실행 및 배포

- 로컬: `python -m http.server 8080 --directory public`을 실행한 뒤 `http://localhost:8080`을 엽니다.
- Cloudflare Workers: 배포 권한이 있는 계정에서 `npx wrangler deploy`를 실행합니다. `wrangler.jsonc`에는 이 데모 전용 Worker 이름과 정적 파일 디렉터리만 지정되어 있으며, 기존 라우트나 도메인을 변경하지 않습니다.
- Git 연동 없이 업로드할 경우 Workers & Pages에서 **Upload static files**로 `public` 폴더를 새 Worker에 올립니다.

## 확인

`node test/smoke.cjs`로 데이터 생성, A/B 판정, 상세 탐색, 기준월 전환과 초기화를 검증합니다.
