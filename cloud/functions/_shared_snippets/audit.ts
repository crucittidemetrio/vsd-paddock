async function logAudit(supabase: any, teamId: string, driverId: string, action: string, target: string, summary: string) {
  try {
    await supabase.from('audit_log').insert({ team_id: teamId, driver_id: driverId, action, target_id: target, details: summary });
  } catch (_e) { /* non-blocking */ }
}
