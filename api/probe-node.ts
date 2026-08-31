/** Temporary deploy probe: legacy Node handler. Deleted once diagnosed. */
import type {IncomingMessage, ServerResponse} from "node:http";

export default function handler(req: IncomingMessage, res: ServerResponse): void {
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({shape: "node", method: req.method}));
}
