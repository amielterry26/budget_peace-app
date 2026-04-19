// ============================================================
// Email Service — powered by Resend
// All layouts use table-based HTML for Gmail compatibility
// ============================================================
'use strict';

const { Resend } = require('resend');

let _resend = null;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

const FROM = process.env.EMAIL_FROM || 'Budget Peace <notifications@budgetpeace.app>';

// ---- Helpers ------------------------------------------------

function money(n) {
  return '$' + Number(n || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

function fmtDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  return `${months[m - 1]} ${d}`;
}

function fmtRange(start, end) {
  return `${fmtDate(start)} – ${fmtDate(end)}`;
}

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---- Base layout -------------------------------------------

function layout(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#F0FDF4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F0FDF4;padding:32px 16px;">
  <tr>
    <td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background-color:#0F172A;padding:24px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <span style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">Budget<span style="color:#63E2A3;">Peace</span></span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:28px 32px 8px;">
            ${body}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px 28px;border-top:1px solid #F1F5F9;">
            <p style="margin:0;font-size:12px;color:#94A3B8;text-align:center;line-height:1.6;">
              You received this because you have Budget Peace email notifications on.<br/>
              <a href="https://budgetpeace.app/#settings" style="color:#16A34A;text-decoration:underline;">Manage notification preferences</a>
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

// ---- Stat box row (3 columns) --------------------------------

function statBoxRow(boxes) {
  // boxes: [{label, value, valueColor}]
  const cols = boxes.map((b, i) => `
    <td width="${Math.floor(100 / boxes.length)}%" style="background:#F0FDF4;border-radius:10px;padding:14px 16px;${i < boxes.length - 1 ? 'border-right:6px solid transparent;' : ''}">
      <div style="font-size:11px;font-weight:600;color:#16A34A;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:4px;">${b.label}</div>
      <div style="font-size:20px;font-weight:700;color:${b.valueColor || '#0F172A'};">${b.value}</div>
    </td>`).join('');
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:8px 0;margin-bottom:24px;">
      <tr>${cols}</tr>
    </table>`;
}

// ---- Bill list table ----------------------------------------

function billListTable(rows) {
  if (!rows.length) return `<p style="font-size:14px;color:#64748B;margin:0 0 24px;">No bills assigned to this period.</p>`;
  const rowsHtml = rows.map((r, i) => `
    <tr>
      <td style="padding:12px 16px;${i < rows.length - 1 ? 'border-bottom:1px solid #F1F5F9;' : ''}">
        <div style="font-size:14px;font-weight:500;color:#0F172A;">${esc(r.name)}</div>
        ${r.meta ? `<div style="font-size:12px;color:#94A3B8;margin-top:2px;">${esc(r.meta)}</div>` : ''}
      </td>
      <td align="right" style="padding:12px 16px;white-space:nowrap;font-size:14px;font-weight:600;color:#0F172A;${i < rows.length - 1 ? 'border-bottom:1px solid #F1F5F9;' : ''}">
        ${money(r.amount)}
      </td>
    </tr>`).join('');
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #BBF7D0;border-left:3px solid #22C55E;border-radius:10px;border-collapse:collapse;margin-bottom:24px;overflow:hidden;">
      ${rowsHtml}
    </table>`;
}

// ---- CTA button ---------------------------------------------

function ctaBtn(label, href) {
  return `
    <table cellpadding="0" cellspacing="0" style="margin-bottom:4px;">
      <tr>
        <td style="background-color:#166534;border-radius:8px;padding:12px 24px;">
          <a href="${href}" style="font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">${label}</a>
        </td>
      </tr>
    </table>`;
}

// ============================================================
// Template: Payday Summary
// ============================================================

function paydaySummaryHtml(data) {
  const { period, expenses, cards, banks, totalBills, remaining } = data;

  const cardMap = Object.fromEntries((cards || []).map(c => [c.cardId, c]));
  const bankMap = Object.fromEntries((banks || []).map(b => [b.bankId, b]));

  const rows = expenses.map(e => {
    const card = cardMap[e.cardId];
    const bank = card ? bankMap[card.bankId] : null;
    const due  = e.dueDate ? `Due ${Number(String(e.dueDate).split('-')[2])}` : null;
    const meta = [due, bank ? bank.name : '', card ? `${card.name} ···· ${card.lastFour || ''}` : ''].filter(Boolean).join(' · ');
    return { name: e.name, amount: e.amount, meta };
  });

  const remColor = remaining >= 0 ? '#059669' : '#DC2626';

  const body = `
    <h2 style="margin:0 0 4px;font-size:24px;font-weight:700;color:#0F172A;letter-spacing:-0.3px;">Payday is tomorrow!</h2>
    <p style="margin:0 0 24px;font-size:14px;color:#64748B;">${fmtRange(period.startDate, period.endDate)}</p>

    ${statBoxRow([
      { label: 'Take-home',  value: money(period.income)  },
      { label: 'Bills due',  value: money(totalBills)     },
      { label: 'Remaining',  value: money(remaining), valueColor: remColor },
    ])}

    <div style="font-size:11px;font-weight:600;color:#16A34A;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:8px;">Bills this period</div>
    ${billListTable(rows)}

    ${ctaBtn('Open Budget Peace', 'https://budgetpeace.app')}
  `;

  return layout('Payday Tomorrow — Budget Peace', body);
}

function paydaySummaryText(data) {
  const { period, expenses, totalBills, remaining } = data;
  const lines = [
    `Payday is tomorrow! (${fmtRange(period.startDate, period.endDate)})`,
    '',
    `Take-home: ${money(period.income)}`,
    `Bills due:  ${money(totalBills)}`,
    `Remaining:  ${money(remaining)}`,
    '',
  ];
  if (expenses.length) {
    lines.push('Bills this period:');
    for (const e of expenses) lines.push(`  • ${e.name}: ${money(e.amount)}`);
  }
  lines.push('', 'Open Budget Peace: https://budgetpeace.app');
  return lines.join('\n');
}

// ============================================================
// Template: Bill Due Reminder
// ============================================================

function billDueHtml(data) {
  const { expenses, period, daysAway } = data;
  const dayLabel = daysAway === 1 ? 'tomorrow' : `in ${daysAway} days`;
  const titleLabel = daysAway === 1 ? 'tomorrow' : `in ${daysAway} days`;
  const rows = expenses.map(e => ({
    name: e.name,
    amount: e.amount,
    meta: e.dueDate ? `Due ${Number(String(e.dueDate).split('-')[2])}` : null,
  }));

  const body = `
    <h2 style="margin:0 0 4px;font-size:24px;font-weight:700;color:#0F172A;letter-spacing:-0.3px;">
      ${expenses.length} bill${expenses.length !== 1 ? 's' : ''} due ${titleLabel}
    </h2>
    <p style="margin:0 0 24px;font-size:14px;color:#64748B;">Period: ${fmtRange(period.startDate, period.endDate)}</p>

    <div style="font-size:11px;font-weight:600;color:#16A34A;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:8px;">Coming up</div>
    ${billListTable(rows)}

    ${ctaBtn('Open Budget Peace', 'https://budgetpeace.app')}
  `;

  return layout(`Bills Due ${dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1)} — Budget Peace`, body);
}

function billDueText(data) {
  const { expenses, period, daysAway } = data;
  const dayLabel = daysAway === 1 ? 'tomorrow' : `in ${daysAway} days`;
  const lines = [`Bills due ${dayLabel} (${fmtRange(period.startDate, period.endDate)})`, ''];
  for (const e of expenses) lines.push(`  • ${e.name}: ${money(e.amount)}`);
  lines.push('', 'Open Budget Peace: https://budgetpeace.app');
  return lines.join('\n');
}

// ============================================================
// Template: Goal Milestone
// ============================================================

function goalMilestoneHtml(data) {
  const { goal } = data;
  const saved  = Number(goal.currentSaved) || 0;
  const target = Number(goal.targetAmount)  || 0;
  const pct    = target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 100;
  const left   = Math.max(0, target - saved);

  const body = `
    <h2 style="margin:0 0 4px;font-size:24px;font-weight:700;color:#0F172A;letter-spacing:-0.3px;">Goal milestone reached!</h2>
    <p style="margin:0 0 24px;font-size:14px;color:#64748B;">${esc(goal.name)}</p>

    ${statBoxRow([
      { label: 'Progress', value: `${pct}%`,   valueColor: '#059669' },
      { label: 'Saved',    value: money(saved)  },
      { label: 'Target',   value: money(target) },
    ])}

    <p style="margin:0 0 24px;font-size:14px;color:#64748B;">
      ${left > 0
        ? `Just ${money(left)} to go — you're almost there!`
        : `You've hit your goal of ${money(target)}. Incredible work!`}
    </p>

    ${ctaBtn('Open Budget Peace', 'https://budgetpeace.app')}
  `;

  return layout('Goal Milestone — Budget Peace', body);
}

function goalMilestoneText(data) {
  const { goal } = data;
  const pct = Math.min(100, Math.round((goal.currentSaved / goal.targetAmount) * 100));
  return [
    `${goal.name} is at ${pct}%!`,
    `Saved: ${money(goal.currentSaved)} of ${money(goal.targetAmount)}`,
    '',
    'Open Budget Peace: https://budgetpeace.app',
  ].join('\n');
}

// ============================================================
// Template: Over-Budget Alert
// ============================================================

function overBudgetHtml(data) {
  const { period, totalBills, income, overage } = data;

  const body = `
    <h2 style="margin:0 0 4px;font-size:24px;font-weight:700;color:#0F172A;letter-spacing:-0.3px;">Heads up — you're over budget</h2>
    <p style="margin:0 0 24px;font-size:14px;color:#64748B;">Period: ${fmtRange(period.startDate, period.endDate)}</p>

    ${statBoxRow([
      { label: 'Take-home', value: money(income)     },
      { label: 'Bills',     value: money(totalBills) },
      { label: 'Over by',   value: money(overage), valueColor: '#DC2626' },
    ])}

    <p style="margin:0 0 24px;font-size:14px;color:#64748B;">
      Your bills for this period exceed your take-home by ${money(overage)}. Review your expenses to bring things back on track.
    </p>

    ${ctaBtn('Review Budget', 'https://budgetpeace.app')}
  `;

  return layout('Over Budget Alert — Budget Peace', body);
}

function overBudgetText(data) {
  const { period, totalBills, income, overage } = data;
  return [
    `Over-budget alert for ${fmtRange(period.startDate, period.endDate)}`,
    `Take-home: ${money(income)} | Bills: ${money(totalBills)} | Over by: ${money(overage)}`,
    '',
    'Open Budget Peace: https://budgetpeace.app',
  ].join('\n');
}

// ============================================================
// Send helpers
// ============================================================

async function sendPaydaySummary(toEmail, data) {
  return getResend().emails.send({
    from: FROM, to: toEmail,
    subject: `Payday tomorrow — ${money(data.period.income)} incoming`,
    html: paydaySummaryHtml(data), text: paydaySummaryText(data),
  });
}

async function sendBillDueReminder(toEmail, data) {
  const dayLabel = data.daysAway === 1 ? 'tomorrow' : `in ${data.daysAway} days`;
  return getResend().emails.send({
    from: FROM, to: toEmail,
    subject: `${data.expenses.length} bill${data.expenses.length !== 1 ? 's' : ''} due ${dayLabel}`,
    html: billDueHtml(data), text: billDueText(data),
  });
}

async function sendGoalMilestone(toEmail, data) {
  const saved  = Number(data.goal.currentSaved) || 0;
  const target = Number(data.goal.targetAmount)  || 1;
  const pct    = Math.min(100, Math.round((saved / target) * 100));
  return getResend().emails.send({
    from: FROM, to: toEmail,
    subject: `${data.goal.name} is at ${pct}%`,
    html: goalMilestoneHtml(data), text: goalMilestoneText(data),
  });
}

async function sendOverBudget(toEmail, data) {
  return getResend().emails.send({
    from: FROM, to: toEmail,
    subject: `You're over budget by ${money(data.overage)} this period`,
    html: overBudgetHtml(data), text: overBudgetText(data),
  });
}

module.exports = {
  sendPaydaySummary,
  sendBillDueReminder,
  sendGoalMilestone,
  sendOverBudget,
};
