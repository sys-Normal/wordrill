# Wordrill

Next.js-based realtime chat service prototype for internal testing.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3001` in two browser windows and join with different nicknames.

## Scripts

- `npm run dev`: start the local Next.js and Socket.IO server
- `npm run build`: create a production Next.js build
- `npm start`: start the custom server

## Current scope

- Next.js App Router frontend
- Realtime messages with Socket.IO
- Nickname-based room entry
- Online user list
- Join/leave system messages
- In-memory message history for the latest 50 messages
- Health endpoint at `/health`

## Project structure

- `app/`: chat UI and global styles
- `server.js`: custom Next.js server with Socket.IO events
- `next.config.js`: Next.js configuration

## Next steps before external testing

- Add persistent storage for users and messages
- Add account/session authentication
- Add rooms or channels
- Add moderation/reporting basics
- Add deployment config for a rented server
