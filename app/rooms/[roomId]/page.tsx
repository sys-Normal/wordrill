import { notFound, redirect } from "next/navigation";
import { prisma } from "../../../lib/prisma";
import RoomChat from "./room-chat";

type RoomPageProps = {
  params: Promise<{ roomId: string }>;
};

export default async function RoomPage({ params }: RoomPageProps) {
  const { roomId } = await params;
  const room = await prisma.room.findFirst({
    where: {
      OR: [
        { id: roomId },
        { slug: roomId }
      ]
    },
    select: {
      id: true,
      name: true,
      slug: true
    }
  });

  if (!room) {
    notFound();
  }

  if (room.id !== roomId) {
    redirect(`/rooms/${room.id}`);
  }

  return <RoomChat key={room.id} initialRoom={{ id: room.id, name: room.name }} />;
}
