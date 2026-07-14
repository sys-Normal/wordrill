# Project Working Rules

## Documentation boundaries

- Keep repository working rules and agent instructions in `AGENTS.md`.
- Keep the root `README.md` focused on the project itself: its purpose, features, setup, usage, architecture, and current limitations.
- Do not add agent behavior, verification procedures, or repository working conventions to `README.md`.

## Commit messages

- Follow the Conventional Commits-style format `<type>: <subject>`.
- Keep the type prefix in English and choose it based on the change, such as `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `style`, `perf`, `build`, or `ci`.
- Write the subject in Korean, keeping it concise and focused on the completed change.
- Examples: `feat: 채팅방 검색 기능 추가`, `docs: 로컬 실행 방법 정리`, `fix: 메시지 중복 전송 오류 수정`.

## Cross-session continuity

- Record ongoing work, planned work, important decisions, and unresolved blockers in project files so another session can continue without relying on conversation history.
- Use `docs/roadmap.md` as the source of truth for project phases, completion status, priorities, and the next recommended task.
- Update `docs/roadmap.md` whenever a planned item is added, completed, deferred, or materially changed.
- Keep implementation-specific plans and handoff notes under `docs/`; do not place session handoff or agent working notes in `README.md`.
- Before starting a new project phase, read `docs/roadmap.md` and relevant documents linked from it.

## Development server verification

- Determine how the development server runs from the repository configuration before inspecting open ports.
- Start with the root `package.json` and follow the `scripts.dev` command to its actual entry point.
- Inspect that entry point, relevant environment files, and documented defaults to determine the configured port.
- Use port/process inspection and HTTP requests only afterward, to verify that the configured server is running.
- Never identify an HTTP service as this project solely because it responds on a common port such as `3000`.
- If the configured port is already occupied, verify which process owns it and report that the attempted new server did not start.
