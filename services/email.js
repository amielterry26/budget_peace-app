// ============================================================
// Email Service — powered by Resend
// ============================================================
'use strict';

const { Resend } = require('resend');

let _resend = null;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

const FROM = process.env.EMAIL_FROM || 'Budget Peace <notifications@budgetpeace.app>';

// ---- Money formatter ----------------------------------------
function money(n) {
  return '$' + Number(n || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
}

// ---- Date helpers -------------------------------------------
function fmtDate(dateStr) {
  // "2026-04-20" → "April 20"
  const [y, m, d] = dateStr.split('-').map(Number);
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  return `${months[m - 1]} ${d}`;
}

function fmtRange(start, end) {
  return `${fmtDate(start)} – ${fmtDate(end)}`;
}

// ---- Base layout -------------------------------------------
function layout(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #F0F2F5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #1A202C; }
  .wrap { max-width: 560px; margin: 32px auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 16px rgba(0,0,0,0.08); }
  .header { background: #1A202C; padding: 28px 32px; }
  .header-logo { font-size: 18px; font-weight: 700; color: #fff; letter-spacing: -0.3px; }
  .header-logo span { color: #63E2A3; }
  .body { padding: 28px 32px; }
  .title { font-size: 22px; font-weight: 700; color: #1A202C; margin-bottom: 4px; }
  .subtitle { font-size: 14px; color: #6B7280; margin-bottom: 24px; }
  .section-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; color: #9CA3AF; margin-bottom: 8px; }
  .stat-row { display: flex; gap: 12px; margin-bottom: 20px; }
  .stat-box { flex: 1; background: #F8FAFC; border-radius: 10px; padding: 14px 16px; }
  .stat-box__label { font-size: 11px; color: #9CA3AF; font-weight: 500; margin-bottom: 2px; }
  .stat-box__value { font-size: 20px; font-weight: 700; color: #1A202C; }
  .stat-box__value--green { color: #059669; }
  .stat-box__value--red { color: #DC2626; }
  .bill-list { border: 1px solid #E5E7EB; border-radius: 10px; overflow: hidden; margin-bottom: 20px; }
  .bill-row { display: flex; align-items: center; justify-content: space-between; padding: 11px 16px; border-bottom: 1px solid #F3F4F6; }
  .bill-row:last-child { border-bottom: none; }
  .bill-row__name { font-size: 14px; font-weight: 500; color: #1A202C; }
  .bill-row__meta { font-size: 12px; color: #9CA3AF; margin-top: 1px; }
  .bill-row__amount { font-size: 14px; font-weight: 600; color: #1A202C; }
  .divider { border: none; border-top: 1px solid #F3F4F6; margin: 20px 0; }
  .btn { display: inline-block; background: #1A202C; color: #fff !important; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; margin-top: 4px; }
  .footer { padding: 20px 32px; text-align: center; border-top: 1px solid #F3F4F6; }
  .footer p { font-size: 12px; color: #9CA3AF; line-height: 1.6; }
  .footer a { color: #6B7280; text-decoration: underline; }
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <div class="header-logo">Budget<span>Peace</span></div>
  </div>
  <div class="body">${body}</div>
  <div class="footer">
    <p>You received this because you have Budget Peace email notifications on.<br/>
    <a href="https://budgetpeace.app">Manage notification preferences</a></p>
  </div>
</div>
</body>
</html>`;
}

// ============================================================
// Template: Payday Summary
// ============================================================
// data: { period, expenses, cards, banks, totalBills, remaining }
function paydaySummaryHtml(data) {
  const { period, expenses, cards, banks, totalBills, remaining } = data;

  const cardMap = Object.fromEntries((cards || []).map(c => [c.cardId, c]));
  const bankMap = Object.fromEntries((banks || []).map(b => [b.bankId, b]));

  const billRows = expenses.map(e => {
    const card = cardMap[e.cardId];
    const bank = card ? bankMap[card.bankId] : null;
    const meta = [card ? card.name : '', bank ? bank.name : ''].filter(Boolean).join(' · ');
    return `
    <div class="bill-row">
      <div>
        <div class="bill-row__name">${esc(e.name)}</div>
        ${meta ? `<div class="bill-row__meta">${esc(meta)}</div>` : ''}
      </div>
      <div class="bill-row__amount">${money(e.amount)}</div>
    </div>`;
  }).join('');

  const remainClass = remaining >= 0 ? 'stat-box__value--green' : 'stat-box__value--red';

  const body = `
    <div class="title">Payday is tomorrow!</div>
    <div class="subtitle">${fmtRange(period.startDate, period.endDate)}</div>

    <div class="stat-row">
      <div class="stat-box">
        <div class="stat-box__label">Take-home</div>
        <div class="stat-box__value">${money(period.income)}</div>
      </div>
      <div class="stat-box">
        <div class="stat-box__label">Bills due</div>
        <div class="stat-box__value">${money(totalBills)}</div>
      </div>
      <div class="stat-box">
        <div class="stat-box__label">Remaining</div>
        <div class="stat-box__value ${remainClass}">${money(remaining)}</div>
      </div>
    </div>

    ${expenses.length > 0 ? `
    <div class="section-label">Bills this period</div>
    <div class="bill-list">${billRows}</div>` : `
    <p style="font-size:14px;color:#6B7280;margin-bottom:20px;">No recurring bills assigned to this period.</p>`}

    <a class="btn" href="https://budgetpeace.app">Open Budget Peace</a>
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
    `Remaining: ${money(remaining)}`,
    '',
  ];
  if (expenses.length > 0) {
    lines.push('Bills this period:');
    for (const e of expenses) lines.push(`  • ${e.name}: ${money(e.amount)}`);
  }
  lines.push('', 'Open Budget Peace: https://budgetpeace.app');
  return lines.join('\n');
}

// ============================================================
// Template: Bill Due Reminder
// ============================================================
// data: { expenses (due in N days), period, daysAway }
function billDueHtml(data) {
  const { expenses, period, daysAway } = data;
  const dayLabel = daysAway === 1 ? 'tomorrow' : `in ${daysAway} days`;

  const billRows = expenses.map(e => `
    <div class="bill-row">
      <div class="bill-row__name">${esc(e.name)}</div>
      <div class="bill-row__amount">${money(e.amount)}</div>
    </div>`).join('');

  const body = `
    <div class="title">Bills due ${dayLabel}</div>
    <div class="subtitle">Period: ${fmtRange(period.startDate, period.endDate)}</div>

    <div class="section-label">${expenses.length} bill${expenses.length !== 1 ? 's' : ''} coming up</div>
    <div class="bill-list">${billRows}</div>

    <a class="btn" href="https://budgetpeace.app">Open Budget Peace</a>
  `;

  return layout(`Bills Due ${dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1)} — Budget Peace`, body);
}

function billDueText(data) {
  const { expenses, period, daysAway } = data;
  const dayLabel = daysAway === 1 ? 'tomorrow' : `in ${daysAway} days`;
  const lines = [
    `Bills due ${dayLabel} (${fmtRange(period.startDate, period.endDate)})`,
    '',
  ];
  for (const e of expenses) lines.push(`  • ${e.name}: ${money(e.amount)}`);
  lines.push('', 'Open Budget Peace: https://budgetpeace.app');
  return lines.join('\n');
}

// ============================================================
// Template: Goal Milestone
// ============================================================
// data: { goal, milestonePercent }
function goalMilestoneHtml(data) {
  const { goal, milestonePercent } = data;
  const pct = Math.round((goal.currentAmount / goal.targetAmount) * 100);

  const body = `
    <div class="title">Goal milestone reached!</div>
    <div class="subtitle">${esc(goal.name)}</div>

    <div class="stat-row">
      <div class="stat-box">
        <div class="stat-box__label">Progress</div>
        <div class="stat-box__value stat-box__value--green">${pct}%</div>
      </div>
      <div class="stat-box">
        <div class="stat-box__label">Saved</div>
        <div class="stat-box__value">${money(goal.currentAmount)}</div>
      </div>
      <div class="stat-box">
        <div class="stat-box__label">Target</div>
        <div class="stat-box__value">${money(goal.targetAmount)}</div>
      </div>
    </div>

    <p style="font-size:14px;color:#6B7280;margin-bottom:20px;">
      You've saved ${money(goal.currentAmount)} of your ${money(goal.targetAmount)} goal.
      ${goal.targetAmount - goal.currentAmount > 0 ? `Just ${money(goal.targetAmount - goal.currentAmount)} to go!` : 'Goal complete — amazing work!'}
    </p>

    <a class="btn" href="https://budgetpeace.app">Open Budget Peace</a>
  `;

  return layout('Goal Milestone — Budget Peace', body);
}

function goalMilestoneText(data) {
  const { goal } = data;
  const pct = Math.round((goal.currentAmount / goal.targetAmount) * 100);
  return [
    `Goal milestone: ${goal.name} is at ${pct}%!`,
    `Saved: ${money(goal.currentAmount)} of ${money(goal.targetAmount)}`,
    '',
    'Open Budget Peace: https://budgetpeace.app',
  ].join('\n');
}

// ============================================================
// Template: Over-Budget Alert
// ============================================================
// data: { period, totalBills, income, overage }
function overBudgetHtml(data) {
  const { period, totalBills, income, overage } = data;

  const body = `
    <div class="title">Heads up — you're over budget</div>
    <div class="subtitle">Period: ${fmtRange(period.startDate, period.endDate)}</div>

    <div class="stat-row">
      <div class="stat-box">
        <div class="stat-box__label">Take-home</div>
        <div class="stat-box__value">${money(income)}</div>
      </div>
      <div class="stat-box">
        <div class="stat-box__label">Bills total</div>
        <div class="stat-box__value">${money(totalBills)}</div>
      </div>
      <div class="stat-box">
        <div class="stat-box__label">Over by</div>
        <div class="stat-box__value stat-box__value--red">${money(overage)}</div>
      </div>
    </div>

    <p style="font-size:14px;color:#6B7280;margin-bottom:20px;">
      Your bills for this period exceed your take-home by ${money(overage)}.
      Review your expenses to bring things back on track.
    </p>

    <a class="btn" href="https://budgetpeace.app">Review Budget</a>
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

// ---- HTML escape -----------------------------------------------
function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============================================================
// Send helpers
// ============================================================

async function sendPaydaySummary(toEmail, data) {
  return getResend().emails.send({
    from:    FROM,
    to:      toEmail,
    subject: `Payday tomorrow — ${money(data.period.income)} incoming`,
    html:    paydaySummaryHtml(data),
    text:    paydaySummaryText(data),
  });
}

async function sendBillDueReminder(toEmail, data) {
  const dayLabel = data.daysAway === 1 ? 'tomorrow' : `in ${data.daysAway} days`;
  return getResend().emails.send({
    from:    FROM,
    to:      toEmail,
    subject: `${data.expenses.length} bill${data.expenses.length !== 1 ? 's' : ''} due ${dayLabel}`,
    html:    billDueHtml(data),
    text:    billDueText(data),
  });
}

async function sendGoalMilestone(toEmail, data) {
  const pct = Math.round((data.goal.currentAmount / data.goal.targetAmount) * 100);
  return getResend().emails.send({
    from:    FROM,
    to:      toEmail,
    subject: `${data.goal.name} is at ${pct}%! 🎯`,
    html:    goalMilestoneHtml(data),
    text:    goalMilestoneText(data),
  });
}

async function sendOverBudget(toEmail, data) {
  return getResend().emails.send({
    from:    FROM,
    to:      toEmail,
    subject: `You're over budget by ${money(data.overage)} this period`,
    html:    overBudgetHtml(data),
    text:    overBudgetText(data),
  });
}

module.exports = {
  sendPaydaySummary,
  sendBillDueReminder,
  sendGoalMilestone,
  sendOverBudget,
};
