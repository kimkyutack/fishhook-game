import { BALANCE } from "../config/balance";
import { GameWorldDO } from "./world";
export { GameWorldDO };
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/") || url.pathname === "/ws") {
      if (request.method !== "GET" && request.method !== "POST")
        return Response.json(
          { error: "허용되지 않는 요청입니다." },
          { status: 405 },
        );
      const origin = request.headers.get("Origin");
      if (
        (origin && origin !== url.origin) ||
        ((request.method === "POST" || url.pathname === "/ws") && !origin)
      )
        return Response.json(
          { error: "같은 주소에서 접속해 주세요." },
          { status: 403 },
        );
      return env.GAME_WORLD.getByName(BALANCE.world).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
