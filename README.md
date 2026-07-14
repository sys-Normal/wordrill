# Wordrill

내부 테스트를 위한 Next.js 기반 실시간 채팅 서비스 프로토타입입니다.

## 로컬 실행

```bash
npm install
docker compose up -d
npm run db:migrate
npm run db:seed
npm run dev
```

`http://localhost:3001`에서 시작 방식을 선택할 수 있습니다. 실제 실시간 채팅은 Google 계정 또는 로컬 테스트 계정으로 로그인한 뒤 회원 채팅방에서 테스트합니다. `Guest로 체험하기`는 현재 공개 채팅방 진입 흐름을 확인하기 위한 UI 프로토타입이며 실제 메시지 전송은 아직 연결되어 있지 않습니다.

## 데이터베이스 설정

로컬 개발은 Docker Compose의 PostgreSQL을 사용합니다. `.env.local`에 아래 값을 설정합니다.

```bash
DATABASE_URL=postgresql://wordrill:wordrill@localhost:5432/wordrill
```

프로젝트의 DB 스크립트는 Next.js와 같은 방식으로 `.env.local`을 읽은 뒤 Prisma CLI를 실행합니다.

## 로그인 설정

Google Cloud Console에서 OAuth 2.0 웹 클라이언트를 만들고 아래 주소를 등록합니다.

- Authorized JavaScript origins: `http://localhost`, `http://localhost:3001`
- Authorized redirect URIs: `http://localhost:3001/api/auth/callback/google`

`.env.local.example`을 참고해 로컬 환경 변수 파일을 준비합니다. 실제 `.env.local`은 저장소에 커밋하지 않습니다.

## 테스트 계정

로컬 테스트용 계정 로그인은 아래 값으로 사용할 수 있습니다.

- `tester1` 또는 `tester1@wordrill.local` / `wordrill1`
- `tester2` 또는 `tester2@wordrill.local` / `wordrill2`

테스트 계정은 `npm run db:seed`로 로컬 DB에 생성합니다. 비밀번호는 해시로 저장되며, production 환경에서는 seed가 실행되지 않습니다.

## 주요 경로

- `/`: 게스트 체험 또는 로그인을 선택하는 시작 화면
- `/guest`: 임시 게스트 Auth ID와 공개 채팅방 목록 UI 프로토타입
- `/login`: Google OAuth 또는 로컬 테스트 계정 로그인
- `/rooms`: 로그인한 사용자가 가입한 채팅방 목록과 채팅방 생성
- `/rooms/[roomId]`: DB의 `Room.id`로 식별하는 개별 실시간 채팅방
- `/users`: 현재 앱에 접속 중인 사용자를 실시간으로 보여주는 화면
- `/settings`: 로그인 사용자 설정

독립 화면은 클라이언트 상태만 교체하지 않고 Next.js App Router 경로로 분리합니다. 따라서 URL 공유, 새로고침, 브라우저 앞뒤 이동을 지원합니다.

## 스크립트

- `npm run dev`: 로컬 Next.js 및 Socket.IO 서버를 시작합니다
- `npm run db:migrate`: Prisma 마이그레이션을 적용하고 client를 생성합니다
- `npm run db:generate`: Prisma client를 생성합니다
- `npm run build`: 배포용 Next.js 빌드를 생성합니다
- `npm start`: 커스텀 서버를 시작합니다

## 현재 범위

- Next.js App Router 기반 화면
- Socket.IO를 사용한 실시간 메시지
- Auth.js 기반 Google OAuth 및 로컬 테스트 계정 로그인
- 로그인 사용자의 채팅방 생성과 가입 채팅방 목록
- 채팅방별 닉네임과 온라인·오프라인 사용자 목록
- 접속 상태와 실제 채팅방 가입을 분리한 presence 처리
- 멤버별 마지막 읽음 시점을 이용한 메시지 미확인 인원 표시
- 최근 메시지 50개를 PostgreSQL에서 불러오기
- 세션에 임시 Auth ID를 발급하는 게스트 공개방 UI 프로토타입
- 브라우저에 저장되는 라이트·다크 테마와 아이콘 토글
- ISC 라이선스의 Lucide 아이콘 사용
- `/health` 상태 확인 엔드포인트

## 프로젝트 구조

- `app/`: App Router 페이지, API, 채팅 UI와 전역 스타일
- `auth.ts`: Auth.js Google 및 Credentials Provider 설정
- `docs/product-plan.md`: 방 유형, 게스트 계정, 데이터 수명주기 관련 제품 기획 기록
- `prisma/schema.prisma`: 사용자, 채팅방, 방 멤버와 메시지 데이터 모델
- `server.ts`: Socket.IO 이벤트를 포함한 커스텀 Next.js 서버
- `next.config.js`: Next.js 설정

## 외부 테스트 전 다음 작업

- 서버가 검증하는 실제 게스트 인증과 공개방 메시지 연결
- 공개방, 회원방, 비밀방, 임시방 권한 모델 추가
- Socket.IO 회원 식별을 서버 검증 세션 또는 서명 토큰으로 강화
- 게스트 계정의 회원 전환 및 장기 미사용 계정 정리 작업 추가
- 기본적인 모더레이션 및 신고 기능 추가
- 임대 서버 배포 설정 추가
