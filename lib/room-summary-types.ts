export type RoomSummary = {
  id: string;
  lastMessage: {
    createdAt: string;
    nickname: string;
    text: string;
  } | null;
  messageCount: number;
  name: string;
  slug: string;
  unreadCount: number;
  updatedAt: string;
};

export function sortRoomSummaries(rooms: RoomSummary[]) {
  return [...rooms].sort((left, right) => {
    const timeDifference = getRoomActivityTime(right) - getRoomActivityTime(left);

    if (timeDifference !== 0) {
      return timeDifference;
    }

    return left.name.localeCompare(right.name);
  });
}

function getRoomActivityTime(room: RoomSummary) {
  return new Date(room.lastMessage?.createdAt || room.updatedAt).getTime();
}
