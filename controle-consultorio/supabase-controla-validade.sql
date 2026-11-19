-- =====================================================================
-- Controle do Consultório — permite marcar quais itens têm validade
-- controlada (lote/vencimento) e quais não (ex.: gaze, esparadrapo).
--
-- Rode uma vez no SQL Editor do Supabase, depois do supabase.sql.
-- =====================================================================

alter table public.cc_itens
  add column if not exists controla_validade boolean not null default true;
