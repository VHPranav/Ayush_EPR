// Hold JSON responses until the database commit succeeds. A failed audit insert
// must roll back the clinical change and return an error, never a success response.
export const transactional = (pool, handler) => async (req, res, next) => {
  let client;
  try { client = await pool.connect(); }
  catch (error) {
    if (req.file?.path) await (await import('node:fs/promises')).unlink(req.file.path).catch(() => {});
    return next(error);
  }
  const json = res.json;
  let body, hasResponse = false;
  res.json = value => { body = value; hasResponse = true; return res; };
  req.db = client;
  try {
    await client.query('BEGIN');
    await handler(req, res, client);
    if (!hasResponse) throw new Error('Transactional route did not produce a response');
    const rollback = res.statusCode >= 400 && !req.commitOnError;
    await client.query(rollback ? 'ROLLBACK' : 'COMMIT');
    if (rollback) await req.onRollback?.();
    res.json = json;
    return res.json(body);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    await req.onRollback?.();
    res.json = json;
    next(error);
  } finally {
    delete req.db;
    res.json = json;
    client.release();
  }
};
