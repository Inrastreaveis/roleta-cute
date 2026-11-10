/* Configuração pública do Supabase para a Roleta Cute.
   A publishable key foi feita para uso no navegador. A segurança real é aplicada pelo RLS do banco. */
window.ROLETACUTE_SUPABASE_URL = 'https://jddbzhijnijfnkdeikgb.supabase.co';
window.ROLETACUTE_SUPABASE_KEY = 'sb_publishable_aoshM9dgUalxXpsWJA4I2A_qFEP_pjZ';
window.roletaSupabase = window.supabase.createClient(
  window.ROLETACUTE_SUPABASE_URL,
  window.ROLETACUTE_SUPABASE_KEY,
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
);
