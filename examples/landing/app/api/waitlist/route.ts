/**
 * Demo action endpoint — the target of the `join_waitlist` action declared
 * in the home snapshot. Lives at /api/waitlist so the MCP manifest can point
 * agents at a real execute_url.
 */

export async function POST(req: Request): Promise<Response> {
  let email: unknown = null;
  try {
    const body = await req.json();
    email = (body as { email?: unknown }).email;
  } catch {
    /* no-op */
  }
  if (typeof email !== 'string' || !email.includes('@')) {
    return Response.json({ error: 'invalid_email' }, { status: 400 });
  }
  // Demo: just log. A real impl would write to a DB / send an email.
  console.log('[waitlist] +', email);
  return Response.json({ status: 'subscribed', email, when: new Date().toISOString() });
}
