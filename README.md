# Wordrill

내부 테스트를 위한 Next.js 기반 실시간 채팅 서비스 프로토타입입니다.

## 로컬 실행

```bash
npm install
npm run dev
```

브라우저 창 두 개에서 `http://localhost:3001`을 열고 서로 다른 닉네임으로 입장하면 실시간 채팅을 테스트할 수 있습니다.

## 스크립트

- `npm run dev`: 로컬 Next.js 및 Socket.IO 서버를 시작합니다
- `npm run build`: 배포용 Next.js 빌드를 생성합니다
- `npm start`: 커스텀 서버를 시작합니다

## 현재 범위

- Next.js App Router 기반 화면
- Socket.IO를 사용한 실시간 메시지
- 닉네임 기반 채팅방 입장
- 온라인 사용자 목록
- 입장 및 퇴장 시스템 메시지
- 최근 메시지 50개를 메모리에 보관
- `/health` 상태 확인 엔드포인트

## 프로젝트 구조

- `app/`: 채팅 UI와 전역 스타일
- `server.js`: Socket.IO 이벤트를 포함한 커스텀 Next.js 서버
- `next.config.js`: Next.js 설정

## 외부 테스트 전 다음 작업

- 사용자와 메시지를 저장할 영구 저장소 추가
- 계정 및 세션 인증 추가
- 채팅방 또는 채널 기능 추가
- 기본적인 모더레이션 및 신고 기능 추가
- 임대 서버 배포 설정 추가
