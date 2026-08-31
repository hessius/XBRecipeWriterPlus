/** Temporary deploy probe: web-standard handler. Deleted once diagnosed. */
export default async function handler(request: Request): Promise<Response> {
    return new Response(JSON.stringify({shape: "web", method: request.method}), {
        status:  200,
        headers: {"content-type": "application/json"}
    });
}
