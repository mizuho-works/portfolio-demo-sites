// Apps Script（sheet-sync.gs v3）の代わり。Playwright の route で script.google.com への通信を受ける。
const KEYS = ["month", "name", "dt", "at", "dims", "orient", "model", "ss", "bytes", "pc"];
module.exports = (opts = {}) => {
  const st = { rows: [], months: null, history: [], version: opts.version || 3, emptyReads: 0, giga: opts.giga || [] };
  st.handle = async (route, req) => {
    let body;
    const url = new URL(req.url());
    if (req.method() === "POST") {
      const d = JSON.parse(req.postData());
      st.rows = (d.items || []).map((it) => Object.fromEntries(KEYS.map((k) => [k, it[k] == null ? "" : String(it[k])])));
      if (d.months && d.months.length) st.months = d.months;
      if (st.version >= 3) st.history.push(...(d.events || []));
      body = { ok: true, version: st.version, count: st.rows.length };
    } else if (url.searchParams.get("gigafile")) {
      body = st.version >= 3 ? { ok: true, files: st.giga } : { ok: true, version: st.version, items: st.rows };
    } else {
      let items = st.rows.map((r) => ({ ...r, dt: r.dt || null }));
      if (st.emptyReads > 0) { st.emptyReads--; items = []; } // 書き込み途中を読んだときの再現
      body = { ok: true, version: st.version, items };
    }
    await route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
  };
  return st;
};
