import { Router } from "express";
import { Pool } from "pg";

/**
 * Deleting a record, and putting it back.
 *
 * TWO LOCKS, BOTH SERVER-SIDE.
 *
 *   1. SUPER ADMIN ONLY. Not the finance founder role, not a director --
 *      the account named below and nobody else. Anybody can enter a figure;
 *      only one person can make one disappear.
 *
 *   2. A FRESH SIGN-IN. Firebase silently refreshes an ID token every hour,
 *      so a valid token proves the session is alive and nothing more. The
 *      `auth_time` claim only moves when a human actually signs in or
 *      re-authenticates, so requiring it to be recent is a check the SERVER
 *      can make. A "confirm it's you" prompt that only sets a flag in the
 *      browser proves nothing to anyone; this proves it to the database.
 *
 * NOTHING IS TRULY DESTROYED. The whole row is copied into deleted_records
 * first, so a restore is an INSERT of exactly what was there -- same id, same
 * values. A delete that could not be reversed would be a second mistake
 * waiting to happen, not a correction.
 */
export function createUndoRouter(pool: Pool) {
  const router = Router();

  const SUPER_ADMINS = [
    'allowancemobileapp@gmail.com',
    'allowancemobielapp@gmail.com',
  ];

  // Long enough to find the row and think about it; short enough that an
  // unattended laptop is not a licence to erase the books.
  const REAUTH_WINDOW_SECONDS = 5 * 60;

  const handle = (fn: any) => async (req: any, res: any) => {
    try { await fn(req, res); }
    catch (e: any) {
      console.error('[undo]', e);
      res.status(400).json({ error: e.message });
    }
  };

  /**
   * What can be deleted, and how to describe it afterwards.
   *
   * A whitelist, not a table name from the URL. Letting the caller name the
   * table would be a delete-anything endpoint wearing a permission check --
   * `id` is parameterised, but the table name cannot be, so it must never
   * come from a request.
   */
  // idType matters only for rejecting obvious nonsense early; the id is a
  // bound parameter either way, so it is never SQL. company_expenses is the
  // one SERIAL table -- it is created by server.ts at boot and predates the
  // 0080 family, where everything is a uuid.
  const ENTITIES: Record<string, {
    table: string;
    label: string;
    idType: 'int' | 'uuid';
    describe: (r: any) => string;
  }> = {
    expense: {
      table: 'company_expenses', label: 'Expense', idType: 'int',
      describe: (r) => `${r.title} — N${Number(r.amount).toLocaleString('en-NG')}`,
    },
    revenue: {
      table: 'revenue_entries', label: 'Revenue', idType: 'uuid',
      describe: (r) => `${r.stream} — N${(Number(r.gross_collected) / 100).toLocaleString('en-NG')}`,
    },
    capital: {
      table: 'capital_events', label: 'Capital in', idType: 'uuid',
      describe: (r) => `${r.kind} from ${r.counterparty || 'unnamed'} — N${(Number(r.amount) / 100).toLocaleString('en-NG')}`,
    },
    investment: {
      table: 'company_investments', label: 'Investment', idType: 'uuid',
      describe: (r) => `${r.title} — N${Number(r.amount).toLocaleString('en-NG')}`,
    },
    liability: {
      table: 'company_liabilities', label: 'Money owed', idType: 'uuid',
      describe: (r) => `${r.title} — N${Number(r.amount).toLocaleString('en-NG')}`,
    },
    valuation: {
      table: 'company_valuations', label: 'Valuation', idType: 'uuid',
      describe: (r) => `N${Number(r.amount).toLocaleString('en-NG')} on ${r.valued_on}`,
    },
  };

  const audit = async (req: any, action: string, entity: string,
                       id: string | null, before: any, after: any) => {
    try {
      await pool.query(
        `INSERT INTO finance_audit (actor, action, entity, entity_id, before, after)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [req.adminEmail || 'unknown', action, entity, id,
         before ? JSON.stringify(before) : null,
         after ? JSON.stringify(after) : null]);
    } catch (e) { console.error('audit write failed', e); }
  };

  /** Both locks, in one place so neither can be forgotten at a call site. */
  const superAdminReauthed = (fn: any) => handle(async (req: any, res: any) => {
    const email = String(req.adminEmail || '').toLowerCase();

    if (!SUPER_ADMINS.includes(email)) {
      return res.status(403).json({
        error: 'Only the super admin can delete or restore a record. Everyone '
             + 'else can add one and ask for it to be reversed.',
        code: 'NOT_SUPER_ADMIN',
      });
    }

    const authTime = Number(req.authTime || 0);
    const age = Math.floor(Date.now() / 1000) - authTime;

    if (!authTime || age > REAUTH_WINDOW_SECONDS) {
      return res.status(401).json({
        error: 'Confirm it is you before deleting anything. This needs a '
             + 'sign-in from the last five minutes.',
        code: 'REAUTH_REQUIRED',
        // The client uses this to say how stale the session is rather than
        // just asserting that it is.
        signed_in_seconds_ago: authTime ? age : null,
      });
    }

    await fn(req, res);
  });

  /** What is deletable, so the UI does not have to hardcode the list. */
  router.get('/entities', handle(async (_req: any, res: any) => {
    res.json(Object.entries(ENTITIES).map(([id, e]) => ({
      id, label: e.label,
    })));
  }));

  /**
   * Delete one record.
   *
   * The row is read, copied, then removed, in that order and in one
   * transaction. Deleting first and copying after would lose the row on any
   * failure in between, which is exactly the case this exists to prevent.
   */
  router.delete('/:entity/:id', superAdminReauthed(async (req: any, res: any) => {
    const meta = ENTITIES[req.params.entity];
    if (!meta) {
      return res.status(400).json({ error: 'That kind of record cannot be deleted here.' });
    }

    const id = req.params.id;
    if (meta.idType === 'int' && !/^\d+$/.test(id)) {
      return res.status(400).json({ error: 'Not a valid record id.' });
    }
    if (meta.idType === 'uuid'
        && !/^[0-9a-f-]{36}$/i.test(id)) {
      return res.status(400).json({ error: 'Not a valid record id.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const found = await client.query(
        `SELECT * FROM public.${meta.table} WHERE id = $1 FOR UPDATE`, [id]);

      if (found.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'That record no longer exists.' });
      }

      const row = found.rows[0];

      // An expense written BY a payroll payment is not free-standing: pulling
      // it out on its own would leave the payroll line saying it was paid
      // while the money reappears in the bank balance. That correction has
      // its own path, which puts both sides back.
      if (meta.table === 'company_expenses') {
        const linked = await client.query(
          'SELECT id FROM payroll_payments WHERE expense_id = $1 AND voided_at IS NULL',
          [id]);
        if (linked.rows.length > 0) {
          await client.query('ROLLBACK');
          return res.status(409).json({
            error: 'That expense was created by a payroll payment. Reverse the '
                 + 'payment on the Payroll screen instead — that puts back '
                 + 'what the person is owed as well as the money.',
            code: 'LINKED_TO_PAYROLL',
          });
        }
      }

      const kept = await client.query(
        `INSERT INTO deleted_records
           (entity, entity_id, payload, description, deleted_by, reason)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [req.params.entity, String(id), JSON.stringify(row),
         meta.describe(row), req.adminEmail, req.body?.reason || null]);

      await client.query(`DELETE FROM public.${meta.table} WHERE id = $1`, [id]);
      await client.query('COMMIT');

      await audit(req, 'record.delete', meta.table, String(id), row, null);

      res.json({
        deleted: true,
        entity: req.params.entity,
        description: meta.describe(row),
        undo_id: kept.rows[0].id,
      });
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }));

  /** Everything deleted, newest first, with what it was. */
  router.get('/deleted', handle(async (req: any, res: any) => {
    const email = String(req.adminEmail || '').toLowerCase();
    if (!SUPER_ADMINS.includes(email)) {
      return res.status(403).json({
        error: 'Only the super admin can see deleted records.' });
    }

    const r = await pool.query(`
      SELECT id, entity, entity_id, description, deleted_by, deleted_at,
             reason, restored_by, restored_at
      FROM deleted_records
      ORDER BY deleted_at DESC LIMIT 100`);

    res.json(r.rows.map((d: any) => ({
      ...d,
      label: ENTITIES[d.entity]?.label || d.entity,
    })));
  }));

  /**
   * Put one back.
   *
   * The same id it had, so anything that referenced it still does. That is
   * the whole reason the payload is stored rather than the figures being
   * retyped: a restore has to be the original row, not one that looks like it.
   */
  router.post('/deleted/:id/restore',
    superAdminReauthed(async (req: any, res: any) => {
      const found = await pool.query(
        'SELECT * FROM deleted_records WHERE id = $1', [req.params.id]);
      if (!found.rows[0]) throw new Error('No such deleted record.');

      const rec = found.rows[0];
      if (rec.restored_at) {
        return res.status(409).json({
          error: `That was already restored on ${
            new Date(rec.restored_at).toLocaleDateString('en-NG')}.` });
      }

      const meta = ENTITIES[rec.entity];
      if (!meta) throw new Error('That kind of record can no longer be restored.');

      const payload = rec.payload || {};
      const cols = Object.keys(payload);
      if (cols.length === 0) throw new Error('Nothing was stored to restore.');

      // Columns come from the payload WE wrote from that table's own row, not
      // from anything a caller sent. Quoted anyway, so a column name that
      // needs it does not break the statement.
      const columnList = cols.map((c) => `"${c.replace(/"/g, '""')}"`).join(', ');
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
      const values = cols.map((c) => payload[c]);

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const back = await client.query(
          `INSERT INTO public.${meta.table} (${columnList})
           VALUES (${placeholders}) RETURNING *`, values);

        await client.query(
          `UPDATE deleted_records SET restored_by = $1, restored_at = now()
           WHERE id = $2`, [req.adminEmail, req.params.id]);

        await client.query('COMMIT');

        await audit(req, 'record.restore', meta.table, String(rec.entity_id),
                    null, back.rows[0]);

        res.json({ restored: true, description: rec.description });
      } catch (e: any) {
        await client.query('ROLLBACK').catch(() => {});
        if (e.code === '23505') {
          throw new Error(
            'A record with that id already exists — it looks like this was '
            + 'already put back another way.');
        }
        throw e;
      } finally {
        client.release();
      }
    }));

  return router;
}
