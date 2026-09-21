-- Monitoreo CBC IESTP v2.0 - complemento para evidencia digital y precisión GPS
-- Ejecutar después de ACTUALIZACION_MULTIUSUARIO.sql y ACTUALIZACION_V16_SEGUIMIENTO.sql.
alter table public.visitas add column if not exists gps_precision_m numeric;
alter table public.visitas add column if not exists firma_nombre text;
alter table public.visitas add column if not exists firma_path text;
alter table public.evaluaciones add column if not exists evidencia_path text;
insert into storage.buckets (id,name,public) values ('evidencias-cbc','evidencias-cbc',false) on conflict (id) do nothing;
drop policy if exists evidencia_cbc_insert on storage.objects;
create policy evidencia_cbc_insert on storage.objects for insert to authenticated with check (bucket_id='evidencias-cbc' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists evidencia_cbc_read on storage.objects;
create policy evidencia_cbc_read on storage.objects for select to authenticated using (bucket_id='evidencias-cbc');
