import legacy from "#performance-desk-archive";
import { starterRequest } from "./hosted.mjs";

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname !== "/api/starter") return legacy.fetch(request, env);
    const authorization = request.headers.get("Authorization");
    const publisher = request.method === "PUT" && authorization !== null
      && await legacy.publisherAllowed(authorization, env);
    return starterRequest(request, env, { publisher });
  },
};
