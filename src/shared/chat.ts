export const CHAT_LIFETIME = 6000;
export interface ChatMessage {
  type: "chat";
  id: string;
  playerId: string;
  name: string;
  text: string;
  at: number;
}
