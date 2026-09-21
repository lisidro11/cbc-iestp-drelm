-- Monitoreo CBC IESTP v1.6 - soporte de seguimiento y medidas correctivas
-- Ejecutar UNA VEZ en Supabase > SQL Editor > Run.

alter table public.visitas add column if not exists visita_origen_id uuid references public.visitas(id) on delete set null;
alter table public.visitas add column if not exists numero_visita integer;

create table if not exists public.medidas_correctivas (
  id uuid primary key default gen_random_uuid(),
  visita_id uuid not null references public.visitas(id) on delete cascade,
  variable text not null,
  cbc text,
  codigo_indicador text,
  codigo_medida text not null,
  medida text not null,
  responsable text,
  plazo_dias integer,
  fecha_vencimiento date,
  estado text not null default 'Pendiente' check (estado in ('Pendiente','En proceso','Subsanada')),
  seguimiento text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(visita_id,variable,codigo_medida)
);

alter table public.medidas_correctivas enable row level security;
grant select,insert,update,delete on public.medidas_correctivas to authenticated;

drop policy if exists medidas_read on public.medidas_correctivas;
create policy medidas_read on public.medidas_correctivas for select to authenticated using (exists(select 1 from public.visitas v where v.id=visita_id));
drop policy if exists medidas_insert on public.medidas_correctivas;
create policy medidas_insert on public.medidas_correctivas for insert to authenticated with check (exists(select 1 from public.visitas v where v.id=visita_id and v.user_id=(select auth.uid())));
drop policy if exists medidas_update on public.medidas_correctivas;
create policy medidas_update on public.medidas_correctivas for update to authenticated using (exists(select 1 from public.visitas v where v.id=visita_id and (v.user_id=(select auth.uid()) or public.is_admin()))) with check (exists(select 1 from public.visitas v where v.id=visita_id and (v.user_id=(select auth.uid()) or public.is_admin())));
drop policy if exists medidas_delete on public.medidas_correctivas;
create policy medidas_delete on public.medidas_correctivas for delete to authenticated using (exists(select 1 from public.visitas v where v.id=visita_id and (v.user_id=(select auth.uid()) or public.is_admin())));

-- Lectura institucional acumulada para todos los usuarios autenticados.
drop policy if exists visitas_read on public.visitas;
create policy visitas_read on public.visitas for select to authenticated using (true);
drop policy if exists evaluaciones_read on public.evaluaciones;
create policy evaluaciones_read on public.evaluaciones for select to authenticated using (exists(select 1 from public.visitas v where v.id=visita_id));
