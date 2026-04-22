  // Payday summary
  authFetch('/api/admin/test-email', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({type:'paydaySummary'}) }).then(r=>r.json()).then(console.log)
  // Bill due reminder
  authFetch('/api/admin/test-email', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({type:'billDue'}) }).then(r=>r.json()).then(console.log)
  // Over-budget alert
  authFetch('/api/admin/test-email', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({type:'overBudget'}) }).then(r=>r.json()).then(console.log)
  // Goal milestone
  authFetch('/api/admin/test-email', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({type:'goalMilestone'}) }).then(r=>r.json()).then(console.log)
