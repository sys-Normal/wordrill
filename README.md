# Wordrill

Wordrill은 내부 기능 검증을 위한 실시간 채팅 서비스 프로토타입입니다. Next.js App Router와 Socket.IO로 화면과 실시간 통신을 구성하고, Auth.js와 PostgreSQL로 로그인 및 채팅 데이터를 관리합니다.

## 주요 기능

- Google OAuth 및 로컬 테스트 계정 로그인
- 채팅방 생성과 가입한 채팅방 목록의 실시간 갱신
- 채팅방별 실시간 메시지와 커서 기반 과거 메시지 조회
- 네트워크 재시도 시 클라이언트 메시지 ID를 이용한 중복 저장 방지
- 채팅방별 닉네임 및 온라인·오프라인 사용자 표시
- 멤버별 마지막 읽음 시점을 이용한 메시지 미확인 인원 표시
- 접속 상태와 실제 채팅방 입장을 구분하는 presence 처리
- 현재 앱 접속자 목록
- 브라우저에 저장되는 라이트·다크 테마
- 임시 Auth ID를 사용하는 게스트 공개방 UI 프로토타입
- `/health` 상태 확인 엔드포인트

게스트 화면은 현재 진입 흐름을 검증하기 위한 UI 프로토타입입니다. 실제 공개방 메시지 송수신은 아직 연결되어 있지 않습니다.

## 기술 구성

- Next.js 15, React 19, TypeScript
- Socket.IO
- Auth.js
- Prisma, PostgreSQL 16
- Lucide React

## 로컬 실행

### 요구 사항

- Node.js 20 이상
- npm
- Docker 및 Docker Compose

### 실행 순서

1. 의존성을 설치합니다.

   ```bash
   npm install
   ```

2. `.env.local.example`을 복사해 `.env.local`을 만들고 필요한 값을 입력합니다.

3. PostgreSQL을 시작하고 데이터베이스를 준비합니다.

   ```bash
   docker compose up -d
   npm run db:migrate
   npm run db:seed
   ```

4. 개발 서버를 시작합니다.

   ```bash
   npm run dev
   ```

5. 브라우저에서 `http://localhost:3001`에 접속합니다.

## 환경 변수

`.env.local.example`은 다음 설정을 포함합니다.

| 변수 | 용도 |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Google OAuth 클라이언트 ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 클라이언트 보안 비밀번호 |
| `AUTH_SECRET` | Auth.js 세션 및 토큰 서명 키 |
| `AUTH_URL` | Auth.js 기준 URL. 로컬 기본값은 `http://localhost:3001` |
| `NEXTAUTH_URL` | NextAuth 호환 기준 URL. 로컬 기본값은 `http://localhost:3001` |
| `DATABASE_URL` | PostgreSQL 연결 문자열 |

Docker Compose의 로컬 데이터베이스 기본 연결 문자열은 다음과 같습니다.

```text
postgresql://wordrill:wordrill@localhost:5432/wordrill
```

데이터베이스 스크립트는 `.env.local`을 읽은 뒤 Prisma CLI를 실행합니다. 실제 `.env.local`은 저장소에 커밋하지 않습니다.

## Google 로그인 설정

Google Cloud Console에서 OAuth 2.0 웹 클라이언트를 만들고 다음 주소를 등록합니다.

- Authorized JavaScript origins: `http://localhost`, `http://localhost:3001`
- Authorized redirect URIs: `http://localhost:3001/api/auth/callback/google`

## 로컬 테스트 계정

`npm run db:seed`를 실행하면 다음 계정이 생성됩니다.

| 아이디 또는 이메일 | 비밀번호 |
| --- | --- |
| `tester1` 또는 `tester1@wordrill.local` | `wordrill1` |
| `tester2` 또는 `tester2@wordrill.local` | `wordrill2` |

비밀번호는 데이터베이스에 해시로 저장되며, production 환경에서는 테스트 계정 seed가 실행되지 않습니다.

## 주요 화면

| 경로 | 설명 |
| --- | --- |
| `/` | 게스트 체험 또는 로그인을 선택하는 시작 화면 |
| `/guest` | 임시 게스트 Auth ID와 공개 채팅방 목록 UI 프로토타입 |
| `/login` | Google OAuth 또는 로컬 테스트 계정 로그인 |
| `/rooms` | 가입한 채팅방 목록 및 채팅방 생성 |
| `/rooms/[roomId]` | `Room.id`로 식별하는 개별 실시간 채팅방 |
| `/users` | 현재 앱에 접속 중인 사용자 목록 |
| `/settings` | 로그인 사용자 설정 |

각 화면은 Next.js App Router 경로로 분리되어 URL 공유, 새로고침, 브라우저 앞뒤 이동을 지원합니다.

## npm 스크립트

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | 개발 모드의 Next.js 및 Socket.IO 커스텀 서버 시작 |
| `npm start` | Next.js 및 Socket.IO 커스텀 서버 시작 |
| `npm run build` | 배포용 Next.js 빌드 생성 |
| `npm run db:migrate` | Prisma 마이그레이션 적용 및 클라이언트 생성 |
| `npm run db:generate` | Prisma 클라이언트 생성 |
| `npm run db:seed` | 로컬 테스트 계정 생성 |
| `npm run db:prune-messages -- --days N` | 지정 기간보다 오래된 메시지 정리 대상 확인 |
| `npm run test:rooms-realtime` | 채팅방 목록 실시간 갱신 시나리오 검증 |

## 프로젝트 구조

```text
app/                    App Router 페이지, API, 채팅 UI, 전역 스타일
docs/product-plan.md    방 유형과 게스트 계정 등에 관한 제품 기획
lib/                    인증, DB, 방 목록 등 공용 서버·클라이언트 로직
prisma/                 Prisma 스키마와 마이그레이션
scripts/                DB 실행 보조, seed, 실시간 시나리오 검증 스크립트
types/                  프로젝트 타입 확장
auth.ts                 Auth.js Provider 설정
server.ts               Socket.IO를 포함한 커스텀 Next.js 서버
next.config.js          Next.js 설정
```

백업, 커넥션 풀, 메시지 보존 및 DB 성장 모니터링 절차는 [`docs/database-operations.md`](docs/database-operations.md)를 참고합니다.

## 현재 제한사항

- 게스트 공개방은 UI 프로토타입이며 실제 메시지 전송이 연결되어 있지 않습니다.
- 공개방, 회원방, 비밀방, 임시방을 구분하는 권한 모델이 완성되지 않았습니다.
- Socket.IO 회원 식별을 서버 검증 세션 또는 서명 토큰으로 강화해야 합니다.
- 게스트의 회원 전환과 장기 미사용 계정 정리 기능이 필요합니다.
- 모더레이션 및 신고 기능이 구현되어 있지 않습니다.
- 외부 서버 배포 설정이 준비되어 있지 않습니다.
