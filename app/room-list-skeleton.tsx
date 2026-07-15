type RoomListSkeletonProps = {
  count?: number;
  label?: string;
};

export default function RoomListSkeleton({
  count = 4,
  label = "채팅방 목록을 불러오고 있습니다."
}: RoomListSkeletonProps) {
  const itemCount = Number.isFinite(count) ? Math.max(1, Math.floor(count)) : 4;

  return (
    <div className="roomListLoading" role="status">
      <span className="srOnly">{label}</span>
      <ul aria-hidden="true" className="roomList roomSkeletonList">
        {Array.from({ length: itemCount }, (_, index) => (
          <li className="roomListItem roomSkeletonItem" key={index}>
            <span className="roomSkeletonAvatar" />
            <span className="roomSkeletonSummary">
              <span className="roomSkeletonLine roomSkeletonTitle" />
              <span className="roomSkeletonLine roomSkeletonMessage" />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
