import { it, expect } from "vitest";
import { ChatSchema } from "../src/shared/chat-schema";
it("normalizes chat text and rejects empty, long and spoofed messages", () => {
  expect(
    ChatSchema.parse({ type: "chat", text: "  안녕\n  낚시\u202e친구  " }).text,
  ).toBe("안녕 낚시 친구");
  for (const text of ["", "   \n", "가".repeat(101)])
    expect(ChatSchema.safeParse({ type: "chat", text }).success).toBe(false);
  expect(
    ChatSchema.safeParse({ type: "chat", text: "안녕", name: "다른사람" })
      .success,
  ).toBe(false);
  expect(
    ChatSchema.parse({ type: "chat", text: "<script>hello</script>" }).text,
  ).toBe("<script>hello</script>");
});
