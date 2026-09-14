import { Pool } from "pg";

/**
 * Run a query with the signed-in admin's identity visible to Postgres.
 *
 * WHY THIS EXISTS. docs/PAYMENTS.md §5 lists the RPCs the dashboard must use,
 * and every admin one gates on is_app_admin(), which resolves the caller
 * from auth.uid() and auth.jwt()->>'email' -- a Supabase auth context. This
 * dashboard signs in with Firebase and holds no Supabase session, so over a
 * plain pg connection both are NULL and every RPC refuses.
 *
 * The request arrives here carrying a Firebase token requireAdmin has already
 * verified. This hands the database the email it proved. is_app_admin() still
 * decides, on the server, against admin_users -- §11.9 is kept exactly:
 * "Admin actions go through is_app_admin() RPCs, never through direct
 * writes." What changes is only that the RPC can read who is asking.
 *
 * SET LOCAL is transaction-scoped, which is the property that matters: the
 * claims cannot outlive this call and leak onto the next request that gets
 * the same pooled connection. That is why it takes a dedicated client and a
 * BEGIN rather than pool.query.
 */
export async function asAdmin<T>(
  pool: Pool,
  email: string,
  fn: (client: any) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // is_app_admin() returns false the moment auth.uid() is NULL, so `sub`
    // has to be present. The admin's real profile id is used where one
    // exists; otherwise any non-null uuid, because the email claim takes
    // precedence over the profile lookup inside the function and the EMAIL
    // is what is checked against admin_users.
    const prof = await client.query(
      'SELECT id FROM profiles WHERE lower(email) = lower($1) LIMIT 1',
      [email]);
    const sub = prof.rows[0]?.id || '00000000-0000-0000-0000-000000000000';

    await client.query(
      `SELECT set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub, email, role: 'authenticated' })]);

    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
