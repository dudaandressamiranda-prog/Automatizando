-- ---------------------------------------------------------------------------
-- Marca de "já usei este registro para atualizar o outro sistema"
--
-- A retirada é usada para dar baixa manual num outro app (o do fornecedor).
-- Sem um jeito de marcar "já resolvi este", é fácil relançar o mesmo item
-- duas vezes ou esquecer um. O checkbox na tela grava aqui — é conferência
-- de trabalho, não um segundo apagar: o registro continua existindo e
-- aparecendo no histórico, só marcado como tratado.
--
-- Rodar no SQL Editor do projeto Supabase.
-- ---------------------------------------------------------------------------

alter table public.retiradas
  add column if not exists resolved boolean not null default false,
  add column if not exists resolved_by text,
  add column if not exists resolved_at timestamptz;
