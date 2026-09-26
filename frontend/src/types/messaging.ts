export interface OfficerMessage {
  id: string;
  fromUserId: string;
  toUserId: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export interface ThreadSummary {
  officer: { userId: string; displayName: string };
  lastMessage: OfficerMessage | null;
  unreadCount: number;
}
