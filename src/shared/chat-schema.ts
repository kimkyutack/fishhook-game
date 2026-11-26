import { z } from "zod";
export const ChatSchema = z
  .object({
    type: z.literal("chat"),
    text: z
      .string()
      .max(500)
      .transform((s) =>
        s
          .normalize("NFKC")
          .replace(
            /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,
            " ",
          )
          .replace(/\s+/gu, " ")
          .trim(),
      )
      .pipe(z.string().min(1).max(100)),
  })
  .strict();
