/**
 * Temporary investigation tool — reconcile app P&L (results.json) vs dashboard
 * export (xlsx) for one week. Usage:
 *   node reconcile-pnl.cjs <app-results.json> <dashboard.xlsx> [label]
 * Safe to delete after the gross-discrepancy investigation.
 */
const XLSX = require('xlsx');
const fs = require('fs');

const [appPath, xlsxPath, label = ''] = process.argv.slice(2);
if (!appPath || !xlsxPath) {
    console.error('usage: node reconcile-pnl.cjs <app.json> <dash.xlsx> [label]');
    process.exit(1);
}

const norm = (s) => String(s ?? '').trim().toUpperCase().replace(/\s+/g, ' ');

// ---- App side (results.json: items[].drivers[].{driver.full_name,total_revenue}) ----
const app = {};
let appTotal = 0;
const appJson = JSON.parse(fs.readFileSync(appPath, 'utf8'));
const items = appJson.items ?? appJson;
for (const it of items) {
    for (const dr of it.drivers ?? []) {
        const n = norm(dr.driver?.full_name);
        const v = dr.total_revenue || 0;
        app[n] = (app[n] || 0) + v;
        appTotal += v;
    }
}

// ---- Dashboard side (xlsx P&L Report: Driver + Gross columns, TOTAL row) ----
const wb = XLSX.readFile(xlsxPath);
const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
const header = aoa[0].map((h) => String(h).trim().toLowerCase());
const cDriver = header.indexOf('driver');
const cGross = header.indexOf('gross');
const dash = {};
let dashTotal = 0;
let dashTotalRow = null;
for (let i = 1; i < aoa.length; i++) {
    const r = aoa[i];
    if (!r || !r[cDriver]) continue;
    if (String(r[cDriver]).trim().toUpperCase() === 'TOTAL') {
        dashTotalRow = Number(r[cGross]) || 0;
        continue;
    }
    const n = norm(r[cDriver]);
    const g = Number(r[cGross]) || 0;
    dash[n] = (dash[n] || 0) + g;
    dashTotal += g;
}

// ---- Reconcile ----
const keys = new Set([...Object.keys(app), ...Object.keys(dash)]);
const b = {
    zeroed: [0, 0],
    under: [0, 0],
    over: [0, 0],
    onlyApp: [0, 0],
    onlyDash: [0, 0],
    same: [0, 0],
};
const diffs = [];
for (const k of keys) {
    const a = app[k] || 0;
    const d = dash[k] || 0;
    if (!(k in dash)) {
        b.onlyApp[0] += a;
        b.onlyApp[1]++;
    } else if (!(k in app)) {
        b.onlyDash[0] += d;
        b.onlyDash[1]++;
    } else if (Math.abs(a - d) <= 0.5) {
        b.same[1]++;
    } else if (d === 0) {
        b.zeroed[0] += a;
        b.zeroed[1]++;
        diffs.push([k, a, d]);
    } else if (d < a) {
        b.under[0] += a - d;
        b.under[1]++;
        diffs.push([k, a, d]);
    } else {
        b.over[0] += d - a;
        b.over[1]++;
        diffs.push([k, a, d]);
    }
}

const money = (n) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });
console.log(`\n===== ${label || `${appPath} vs ${xlsxPath}`} =====`);
console.log(`app total:       $${money(appTotal)}  (${Object.keys(app).length} drivers)`);
console.log(`dashboard total: $${money(dashTotal)}  (${Object.keys(dash).length} drivers)  [TOTAL row: $${money(dashTotalRow ?? 0)}]`);
console.log(`GAP (app - dash): $${money(appTotal - dashTotal)}  (${(((appTotal - dashTotal) / (appTotal || 1)) * 100).toFixed(1)}%)`);
console.log('\ncomposition:');
console.log(`  same gross:                 ${b.same[1]} drivers`);
console.log(`  dash ZEROED (real→$0):     +$${money(b.zeroed[0])}  (${b.zeroed[1]})`);
console.log(`  dash UNDER (0<dash<app):   +$${money(b.under[0])}  (${b.under[1]})`);
console.log(`  only in APP:               +$${money(b.onlyApp[0])}  (${b.onlyApp[1]})`);
console.log(`  dash OVER (dash>app):      -$${money(b.over[0])}  (${b.over[1]})`);
console.log(`  only in DASH:              -$${money(b.onlyDash[0])}  (${b.onlyDash[1]})`);
console.log('\ntop 12 per-driver diffs (driver, app, dash):');
diffs.sort((x, y) => Math.abs(y[1] - y[2]) - Math.abs(x[1] - x[2]));
for (const [n, a, d] of diffs.slice(0, 12)) {
    console.log(`  ${n.padEnd(28)} ${String(a).padStart(8)} ${String(d).padStart(8)}`);
}
