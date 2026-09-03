import { Router } from "express";
import { Pool } from "pg";
import multer from "multer";

const upload = multer({
  storage: multer.memoryStorage(),
  // A contract is a document, not a video. 15MB is generous and stops a
  // mis-drop filling the bucket.
  limits: { fileSize: 15 * 1024 * 1024 },
});

/**
 * Staff and stakeholders: one list of people.
 *
 * CONTRACTS ARE PRIVATE. They state somebody's salary, so they live in a
 * non-public bucket and are only ever handed out as a signed URL that
 * expires. A person can fetch their own; the founder can fetch anyone's.
 * Nobody else can fetch any.
 */
export function createPeopleRouter(pool: Pool) {
  const router = Router();

  const handle = (fn: any) => async (req: any, res: any) => {
    try { await fn(req, res); }
    catch (e: any) {
      console.error("[people]", e);
      res.status(400).json({ error: e.message });
    }
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

  const roleOf = async (email: string): Promise<string> => {
    const r = await pool.query(
      `SELECT role FROM finance_users WHERE lower(email) = lower($1) AND active`,
      [email || '']);
    return r.rows[0]?.role || 'none';
  };

  const founderOnly = (fn: any) => handle(async (req: any, res: any) => {
    if (await roleOf(req.adminEmail) !== 'founder') {
      return res.status(403).json({
        error: 'Only the founder can change people, pay or contracts.' });
    }
    await fn(req, res);
  });

  /**
   * Supabase admin client.
   *
   * Credentials from the environment. The service-role key is a master key --
   * it bypasses every row-level policy in the database -- so it does not
   * belong in source that gets committed. SUPABASE_URL and
   * SUPABASE_SERVICE_ROLE_KEY are read from Vercel's environment variables.
   */
  const storage = async () => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        'Contract storage is not configured. Set SUPABASE_URL and '
        + 'SUPABASE_SERVICE_ROLE_KEY in your Vercel environment variables.');
    }
    const { createClient } = await import('@supabase/supabase-js');
    return createClient(url, key).storage.from('staff-contracts');
  };

  // ---- The list ---------------------------------------------------------

  router.get('/', handle(async (req: any, res: any) => {
    const role = await roleOf(req.adminEmail);
    const r = await pool.query('SELECT * FROM people');

    const rows = r.rows.map((p) => ({
      ...p,
      shares: Number(p.shares || 0),
      full_salary: p.full_salary === null ? null : Number(p.full_salary),
      deferred_balance: Number(p.deferred_balance || 0),
      rewards_total: Number(p.rewards_total || 0),
      contract_count: Number(p.contract_count || 0),
    }));

    // A stakeholder may see the roster, but not what anyone else earns.
    // Section 9: enforce it here, not by hiding a column in the UI.
    if (role !== 'founder') {
      const me = rows.find(
        (p) => (p.login_email || '').toLowerCase() === (req.adminEmail || '').toLowerCase());
      return res.json(rows.map((p) => p.id === me?.id ? p : {
        id: p.id, full_name: p.full_name, role_title: p.role_title,
        is_founder: p.is_founder, is_staff: p.is_staff,
        employment_status: p.employment_status, shares: p.shares,
        access_role: p.access_role,
        full_salary: null, deferred_balance: null, rewards_total: null,
        contract_count: 0, restricted: true,
      }));
    }
    res.json(rows);
  }));

  router.post('/', founderOnly(async (req: any, res: any) => {
    const { full_name, email, role_title, phone, is_staff, is_founding_team,
            is_cofounder, is_director, staff_role, is_investor, is_external,
            notes } = req.body;
    if (!full_name?.trim()) throw new Error('A full name is required.');

    const r = await pool.query(
      `INSERT INTO shareholders
         (full_name, email, role_title, phone, is_staff, is_founding_team,
          is_cofounder, is_director, staff_role, is_investor, is_external, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [full_name.trim(), email || null, role_title || null, phone || null,
       is_staff !== false, !!is_founding_team, !!is_cofounder, !!is_director,
       staff_role || role_title || null, !!is_investor, !!is_external,
       notes || null]);

    await audit(req, 'person.add', 'shareholders', r.rows[0].id, null, r.rows[0]);
    res.status(201).json(r.rows[0]);
  }));

  router.put('/:id', founderOnly(async (req: any, res: any) => {
    const { full_name, email, role_title, phone, employment_status, is_staff,
            is_founding_team, is_cofounder, is_director, staff_role,
            is_investor, is_external, notes } = req.body;
    const before = await pool.query('SELECT * FROM shareholders WHERE id = $1',
                                    [req.params.id]);
    const r = await pool.query(
      `UPDATE shareholders SET
         full_name = COALESCE($1, full_name),
         email = COALESCE($2, email),
         role_title = COALESCE($3, role_title),
         phone = COALESCE($4, phone),
         employment_status = COALESCE($5, employment_status),
         is_staff = COALESCE($6, is_staff),
         is_founding_team = COALESCE($7, is_founding_team),
         is_cofounder = COALESCE($8, is_cofounder),
         is_director = COALESCE($9, is_director),
         staff_role = COALESCE($10, staff_role),
         is_investor = COALESCE($11, is_investor),
         is_external = COALESCE($12, is_external),
         notes = COALESCE($13, notes)
       WHERE id = $14 RETURNING *`,
      [full_name ?? null, email ?? null, role_title ?? null, phone ?? null,
       employment_status ?? null, is_staff ?? null, is_founding_team ?? null,
       is_cofounder ?? null, is_director ?? null, staff_role ?? null,
       is_investor ?? null, is_external ?? null, notes ?? null,
       req.params.id]);
    if (!r.rows[0]) throw new Error('No such person.');
    await audit(req, 'person.update', 'shareholders', req.params.id,
                before.rows[0], r.rows[0]);
    res.json(r.rows[0]);
  }));

  // ---- Access -----------------------------------------------------------

  /**
   * Approve an email so somebody can sign in, and say what they may see.
   *
   * TWO SEPARATE SYSTEMS, and this only touches one of them. finance_users
   * controls the FINANCE module. admin_users controls the rest of the admin
   * app. Granting finance access does not let somebody into Gists or Users,
   * and it deliberately does not: a shareholder who should see their own
   * stake has no business moderating content.
   */
  router.post('/:id/access', founderOnly(async (req: any, res: any) => {
    const { email, role, is_director, active } = req.body;
    if (!email?.trim()) throw new Error('An email is required to give access.');

    const valid = ['founder', 'director', 'stakeholder'];
    if (role && !valid.includes(role)) {
      throw new Error(`Role must be one of: ${valid.join(', ')}.`);
    }

    const before = await pool.query(
      'SELECT * FROM finance_users WHERE shareholder_id = $1', [req.params.id]);

    const r = await pool.query(
      `INSERT INTO finance_users (email, shareholder_id, role, is_director, active)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (email) DO UPDATE SET
         shareholder_id = EXCLUDED.shareholder_id,
         role = EXCLUDED.role,
         is_director = EXCLUDED.is_director,
         active = EXCLUDED.active
       RETURNING *`,
      [email.trim().toLowerCase(), req.params.id, role || 'stakeholder',
       !!is_director, active !== false]);

    await audit(req, 'access.grant', 'finance_users', r.rows[0].id,
                before.rows[0] || null, r.rows[0]);
    res.status(201).json(r.rows[0]);
  }));

  router.delete('/:id/access', founderOnly(async (req: any, res: any) => {
    const before = await pool.query(
      'SELECT * FROM finance_users WHERE shareholder_id = $1', [req.params.id]);
    // Deactivated, not deleted. The audit log references these rows, and a
    // revoked login is a thing you want a record of.
    await pool.query(
      'UPDATE finance_users SET active = false WHERE shareholder_id = $1',
      [req.params.id]);
    await audit(req, 'access.revoke', 'finance_users',
                before.rows[0]?.id || null, before.rows[0] || null, null);
    res.json({ ok: true });
  }));

  // ---- Pay --------------------------------------------------------------

  router.put('/:id/salary', founderOnly(async (req: any, res: any) => {
    const { scale, monthly_salary, resolution_ref } = req.body;
    const kobo = Math.round(Number(monthly_salary || 0) * 100);
    if (kobo < 0) throw new Error('A salary cannot be negative.');

    const before = await pool.query(
      'SELECT * FROM pay_scales WHERE shareholder_id = $1', [req.params.id]);

    // The banded scales are contractual. Changing one needs the shareholder
    // resolution that authorised it -- a confirm dialog can be clicked
    // through, a required field cannot.
    const banded = ['officer', 'founder'];
    const wasBanded = banded.includes(before.rows[0]?.scale);
    const willBeBanded = banded.includes(scale);
    if ((wasBanded || willBeBanded) && !String(resolution_ref || '').trim()) {
      throw new Error(
        'Officer and founder salaries are set by contract. Record the '
        + 'shareholder resolution reference that authorises this change.');
    }

    // A flat salary is paid in full every month: no bands, no deferral.
    const cap = scale === 'flat' ? 0
      : scale === 'founder' ? 150_000_00 : 100_000_00;
    const inst = scale === 'flat' ? 0
      : scale === 'founder' ? 15_000_00 : 10_000_00;

    const r = await pool.query(
      `INSERT INTO pay_scales
         (shareholder_id, scale, full_salary, deferred_cap, min_instalment,
          resolution_ref, active)
       VALUES ($1,$2,$3,$4,$5,$6,true)
       ON CONFLICT (shareholder_id) DO UPDATE SET
         scale = EXCLUDED.scale,
         full_salary = EXCLUDED.full_salary,
         deferred_cap = EXCLUDED.deferred_cap,
         min_instalment = EXCLUDED.min_instalment,
         resolution_ref = EXCLUDED.resolution_ref,
         updated_at = now()
       RETURNING *`,
      [req.params.id, scale || 'flat', kobo, cap, inst,
       resolution_ref || null]);

    await audit(req, 'salary.set', 'pay_scales', req.params.id,
                before.rows[0] || null, r.rows[0]);
    res.json(r.rows[0]);
  }));

  // ---- Rewards ----------------------------------------------------------

  router.get('/:id/rewards', handle(async (req: any, res: any) => {
    const role = await roleOf(req.adminEmail);
    const owner = await pool.query(
      `SELECT 1 FROM finance_users WHERE shareholder_id = $1
         AND lower(email) = lower($2) AND active`,
      [req.params.id, req.adminEmail || '']);
    if (role !== 'founder' && owner.rows.length === 0) {
      return res.status(403).json({ error: 'You can only see your own rewards.' });
    }
    const r = await pool.query(
      `SELECT r.*, sc.name AS class_name FROM staff_rewards r
       LEFT JOIN share_classes sc ON sc.id = r.share_class_id
       WHERE r.person_id = $1 ORDER BY r.awarded_on DESC`, [req.params.id]);
    res.json(r.rows.map((x) => ({
      ...x,
      amount: x.amount === null ? null : Number(x.amount),
      shares: x.shares === null ? null : Number(x.shares),
    })));
  }));

  /**
   * A bonus, or shares.
   *
   * A SHARE AWARD ALSO MOVES THE CAP TABLE. Recording the decision without
   * the movement would leave the register saying one thing and the reward
   * ledger another, so both happen in one transaction or neither does.
   */
  router.post('/:id/rewards', founderOnly(async (req: any, res: any) => {
    const { kind, amount, shares, share_class_id, reason, awarded_on } = req.body;
    if (!reason?.trim()) throw new Error('Say what the reward is for.');

    const kobo = amount ? Math.round(Number(amount) * 100) : null;
    const shareCount = shares ? Math.floor(Number(shares)) : null;
    if (!kobo && !shareCount) throw new Error('Enter an amount or a number of shares.');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const r = await client.query(
        `INSERT INTO staff_rewards
           (person_id, kind, amount, shares, share_class_id, reason,
            awarded_on, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [req.params.id, kind || 'bonus', kobo, shareCount,
         share_class_id || null, reason.trim(),
         awarded_on || new Date(), req.adminEmail]);

      if (shareCount) {
        if (!share_class_id) throw new Error('Choose a share class for a share award.');

        // Article 3(a): Class A may only be ISSUED to the Founder. It reaches
        // a Founding Team Member by transfer instead, which is a different
        // movement with a different effect on the total.
        const cls = await client.query(
          'SELECT founder_only, name FROM share_classes WHERE id = $1',
          [share_class_id]);
        const person = await client.query(
          'SELECT is_founder, full_name FROM shareholders WHERE id = $1',
          [req.params.id]);

        if (cls.rows[0]?.founder_only && !person.rows[0]?.is_founder) {
          throw new Error(
            `${cls.rows[0].name} cannot be issued to ${person.rows[0]?.full_name}. `
            + `Under Article 3 it only reaches a Founding Team Member by `
            + `transfer from the founder — record it on the Ownership tab.`);
        }

        await client.query(
          `INSERT INTO share_transactions
             (shareholder_id, class_id, shares, kind, price_per_share,
              txn_date, note, created_by)
           VALUES ($1,$2,$3,'issue',0,$4,$5,$6)`,
          [req.params.id, share_class_id, shareCount,
           awarded_on || new Date(), `Reward: ${reason.trim()}`, req.adminEmail]);
      }

      await client.query('COMMIT');
      await audit(req, 'reward.add', 'staff_rewards', r.rows[0].id, null, r.rows[0]);
      res.status(201).json(r.rows[0]);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }));

  router.post('/rewards/:rewardId/paid', founderOnly(async (req: any, res: any) => {
    const r = await pool.query(
      `UPDATE staff_rewards SET paid_on = COALESCE($1, current_date)
       WHERE id = $2 RETURNING *`,
      [req.body.paid_on || null, req.params.rewardId]);
    if (!r.rows[0]) throw new Error('No such reward.');
    await audit(req, 'reward.paid', 'staff_rewards', req.params.rewardId,
                null, r.rows[0]);
    res.json(r.rows[0]);
  }));

  // ---- Contracts --------------------------------------------------------

  /** Whether the caller may see this person's documents. */
  const canSeeContracts = async (req: any, personId: string) => {
    if (await roleOf(req.adminEmail) === 'founder') return true;
    const own = await pool.query(
      `SELECT 1 FROM finance_users WHERE shareholder_id = $1
         AND lower(email) = lower($2) AND active`,
      [personId, req.adminEmail || '']);
    return own.rows.length > 0;
  };

  // ---- The person's own record -------------------------------------------

  /**
   * Everything about one person except their pay.
   *
   * TWO SENSITIVITIES, TWO RULES, ONE RESPONSE. The profile is HR detail and
   * goes to anyone holding the People screen. The bank details are a salary
   * destination and go to the founder or the person themselves; everybody
   * else gets the last four digits, which is enough to recognise an account
   * and not enough to pay into one.
   *
   * Doing this in one endpoint rather than two keeps the masking decision in
   * a single place. Two endpoints is how one of them ends up forgetting.
   */
  router.get('/:id/profile', handle(async (req: any, res: any) => {
    const privileged = await canSeeContracts(req, req.params.id);

    const [person, profile, bank] = await Promise.all([
      pool.query(
        `SELECT id, full_name, email, phone, role_title, staff_role,
                employment_status, joined_on, exited_on, notes
           FROM shareholders WHERE id = $1`, [req.params.id]),
      pool.query('SELECT * FROM staff_profiles WHERE person_id = $1',
                 [req.params.id]),
      privileged
        ? pool.query('SELECT * FROM staff_bank_details WHERE person_id = $1',
                     [req.params.id])
        : pool.query('SELECT * FROM staff_bank_masked WHERE person_id = $1',
                     [req.params.id]),
    ]);

    if (!person.rows[0]) throw new Error('No such person.');

    // Reading somebody's full account number is worth a line in the audit
    // trail. Reading your own is not -- that is just looking at your own
    // payslip details, and logging it would bury the reads that matter.
    if (privileged && bank.rows[0]?.account_number
        && await roleOf(req.adminEmail) === 'founder') {
      const self = await pool.query(
        `SELECT 1 FROM finance_users WHERE shareholder_id = $1
           AND lower(email) = lower($2)`, [req.params.id, req.adminEmail || '']);
      if (self.rows.length === 0) {
        await audit(req, 'bank.details.view', 'staff_bank_details',
                    req.params.id, null, null);
      }
    }

    res.json({
      person: person.rows[0],
      profile: profile.rows[0] || null,
      bank: bank.rows[0] || null,
      // The client renders differently rather than guessing from whether a
      // field happens to be present.
      bank_visible: privileged,
    });
  }));

  /** Set or change the profile. Founder only. */
  router.put('/:id/profile', founderOnly(async (req: any, res: any) => {
    // A whitelist, not Object.keys(req.body). Building an UPDATE from
    // whatever the caller sent is how a request quietly writes a column it
    // was never meant to reach.
    const FIELDS = [
      'address_line1', 'address_line2', 'city', 'state', 'country',
      'date_of_birth', 'gender', 'personal_email', 'alternate_phone',
      'emergency_name', 'emergency_relationship', 'emergency_phone',
      'next_of_kin_name', 'next_of_kin_relationship', 'next_of_kin_phone',
      'employment_type', 'work_location', 'reports_to', 'probation_ends',
      'notes',
    ];

    const given = FIELDS.filter((f) => f in req.body);
    if (given.length === 0) {
      return res.status(400).json({ error: 'Nothing to change.' });
    }

    // Empty strings become NULL. A date column will not take '' and an empty
    // box means "not recorded", not "recorded as blank".
    const clean = (f: string) => {
      const v = req.body[f];
      return v === '' || v === undefined ? null : v;
    };

    const before = await pool.query(
      'SELECT * FROM staff_profiles WHERE person_id = $1', [req.params.id]);

    const cols = ['person_id', ...given, 'updated_by'];
    const values = [req.params.id, ...given.map(clean), req.adminEmail];
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
    const updates = [...given, 'updated_by']
      .map((f) => `${f} = EXCLUDED.${f}`).join(', ');

    const r = await pool.query(
      `INSERT INTO staff_profiles (${cols.join(', ')})
       VALUES (${placeholders})
       ON CONFLICT (person_id) DO UPDATE SET ${updates}
       RETURNING *`, values);

    await audit(req, 'profile.update', 'staff_profiles', req.params.id,
                before.rows[0] || null, r.rows[0]);
    res.json(r.rows[0]);
  }));

  /**
   * Set or change where somebody's salary is paid.
   *
   * FOUNDER ONLY, INCLUDING FOR THEIR OWN. An account number plus a name is
   * enough to redirect a payment, and salary destinations are a standard
   * fraud target: take over an account, change the details, wait for payday.
   * If the person could edit their own, one compromised login would be
   * enough. They can read theirs to check it; changing it is a conversation.
   *
   * The audit entry is written by a trigger on the table rather than here, so
   * a change made by any route at all is still recorded.
   */
  router.put('/:id/bank', founderOnly(async (req: any, res: any) => {
    const { bank_name, account_number, account_name, bank_code,
            verified } = req.body;

    // Digits only. Nigerian NUBAN accounts are ten; other formats exist, so
    // this refuses obvious nonsense rather than enforcing a single country's
    // rule and locking out a legitimate account.
    const digits = String(account_number || '').replace(/\s/g, '');
    if (digits && !/^\d{6,20}$/.test(digits)) {
      return res.status(400).json({
        error: 'An account number should be between 6 and 20 digits, and '
             + 'digits only.',
      });
    }

    const r = await pool.query(
      `INSERT INTO staff_bank_details
         (person_id, bank_name, account_number, account_name, bank_code,
          verified_at, verified_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (person_id) DO UPDATE SET
         bank_name = EXCLUDED.bank_name,
         account_number = EXCLUDED.account_number,
         account_name = EXCLUDED.account_name,
         bank_code = EXCLUDED.bank_code,
         verified_at = EXCLUDED.verified_at,
         verified_by = EXCLUDED.verified_by,
         updated_by = EXCLUDED.updated_by
       RETURNING *`,
      [req.params.id, bank_name || null, digits || null,
       account_name || null, bank_code || null,
       verified ? new Date() : null,
       verified ? req.adminEmail : null,
       req.adminEmail]);

    res.json(r.rows[0]);
  }));

  router.get('/:id/contracts', handle(async (req: any, res: any) => {
    if (!await canSeeContracts(req, req.params.id)) {
      return res.status(403).json({ error: 'You can only see your own contract.' });
    }
    const r = await pool.query(
      `SELECT id, title, kind, file_name, mime_type, size_bytes, signed_on,
              uploaded_by, uploaded_at, superseded_by
       FROM staff_contracts WHERE person_id = $1
       ORDER BY uploaded_at DESC`, [req.params.id]);
    res.json(r.rows.map((c) => ({ ...c, size_bytes: Number(c.size_bytes || 0) })));
  }));

  router.post('/:id/contracts',
    (req: any, res: any, next: any) => {
      upload.single('file')(req, res, (err: any) => {
        if (err) return res.status(400).json({ error: 'Upload failed: ' + err.message });
        next();
      });
    },
    handle(async (req: any, res: any) => {
      if (await roleOf(req.adminEmail) !== 'founder') {
        return res.status(403).json({ error: 'Only the founder can upload contracts.' });
      }
      if (!req.file) throw new Error('No file was attached.');

      const bucket = await storage();
      // Namespaced by person, so a listing of the bucket cannot be walked to
      // read somebody else's contract by guessing a timestamp.
      const safe = req.file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const path = `${req.params.id}/${Date.now()}_${safe}`;

      const { error } = await bucket.upload(path, req.file.buffer, {
        contentType: req.file.mimetype, upsert: false });
      if (error) throw new Error('Could not store the file: ' + error.message);

      const r = await pool.query(
        `INSERT INTO staff_contracts
           (person_id, title, storage_path, file_name, mime_type, size_bytes,
            kind, signed_on, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, title, kind,
                  file_name, uploaded_at`,
        [req.params.id, req.body.title || req.file.originalname, path,
         req.file.originalname, req.file.mimetype, req.file.size,
         req.body.kind || 'employment', req.body.signed_on || null,
         req.adminEmail]);

      await audit(req, 'contract.upload', 'staff_contracts', r.rows[0].id,
                  null, { person: req.params.id, file: req.file.originalname });
      res.status(201).json(r.rows[0]);
    }));

  /**
   * A short-lived link to one contract.
   *
   * Minted per request and expires in five minutes. The bucket is private, so
   * there is no permanent URL to leak, and a link copied out of the page stops
   * working almost immediately.
   */
  router.get('/:id/contracts/:contractId/link', handle(async (req: any, res: any) => {
    if (!await canSeeContracts(req, req.params.id)) {
      return res.status(403).json({ error: 'You can only open your own contract.' });
    }
    const c = await pool.query(
      'SELECT storage_path, file_name FROM staff_contracts WHERE id = $1 AND person_id = $2',
      [req.params.contractId, req.params.id]);
    if (!c.rows[0]) throw new Error('No such contract.');

    const bucket = await storage();
    const { data, error } = await bucket.createSignedUrl(c.rows[0].storage_path, 300);
    if (error) throw new Error('Could not create a link: ' + error.message);

    await audit(req, 'contract.view', 'staff_contracts', req.params.contractId,
                null, { person: req.params.id });
    res.json({ url: data.signedUrl, file_name: c.rows[0].file_name, expires_in: 300 });
  }));

  /** My own record, for someone who is not the founder. */
  router.get('/me/summary', handle(async (req: any, res: any) => {
    const r = await pool.query(
      `SELECT * FROM people WHERE lower(login_email) = lower($1)`,
      [req.adminEmail || '']);
    if (!r.rows[0]) return res.json({ linked: false });
    const p = r.rows[0];
    res.json({
      linked: true,
      ...p,
      shares: Number(p.shares || 0),
      full_salary: p.full_salary === null ? null : Number(p.full_salary),
      deferred_balance: Number(p.deferred_balance || 0),
      rewards_total: Number(p.rewards_total || 0),
    });
  }));

  return router;
}
