# Wordrill

내부 테스트를 위한 Next.js 기반 실시간 채팅 서비스 프로토타입입니다.

## 로컬 실행

```bash
npm install
docker compose up -d
npm run db:migrate
npm run dev
```

브라우저 창 두 개에서 `http://localhost:3001`을 열고 서로 다른 닉네임으로 입장하면 실시간 채팅을 테스트할 수 있습니다.

## 데이터베이스 설정

로컬 개발은 Docker Compose의 PostgreSQL을 사용합니다. `.env.local`에 아래 값을 설정합니다.

```bash
DATABASE_URL=postgresql://wordrill:wordrill@localhost:5432/wordrill
```

프로젝트의 DB 스크립트는 Next.js와 같은 방식으로 `.env.local`을 읽은 뒤 Prisma CLI를 실행합니다.

## Google 로그인 설정

Google Cloud Console에서 OAuth 2.0 웹 클라이언트를 만들고 아래 주소를 등록합니다.

- Authorized JavaScript origins: `http://localhost`, `http://localhost:3001`
- Authorized redirect URIs: `http://localhost:3001/api/auth/callback/google`

`.env.local.example`을 참고해 로컬 환경 변수 파일을 준비합니다. 실제 `.env.local`은 저장소에 커밋하지 않습니다.

## 스크립트

- `npm run dev`: 로컬 Next.js 및 Socket.IO 서버를 시작합니다
- `npm run db:migrate`: Prisma 마이그레이션을 적용하고 client를 생성합니다
- `npm run db:generate`: Prisma client를 생성합니다
- `npm run build`: 배포용 Next.js 빌드를 생성합니다
- `npm start`: 커스텀 서버를 시작합니다

## 현재 범위

- Next.js App Router 기반 화면
- Socket.IO를 사용한 실시간 메시지
- Auth.js와 Google OAuth 기반 로그인
- 닉네임 기반 채팅방 입장
- 온라인 사용자 목록
- 입장 및 퇴장 시스템 메시지
- 최근 메시지 50개를 PostgreSQL에서 불러오기
- `/health` 상태 확인 엔드포인트

## 프로젝트 구조

- `app/`: 채팅 UI와 전역 스타일
- `auth.ts`: Auth.js Google Provider 설정
- `prisma/schema.prisma`: 사용자, 채팅방, 메시지 데이터 모델
- `server.ts`: Socket.IO 이벤트를 포함한 커스텀 Next.js 서버
- `next.config.js`: Next.js 설정

## 외부 테스트 전 다음 작업

- 계정 및 세션 인증 추가
- 채팅방 또는 채널 기능 추가
- 기본적인 모더레이션 및 신고 기능 추가
- 임대 서버 배포 설정 추가
