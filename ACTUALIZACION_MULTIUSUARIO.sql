-- ACTUALIZACION MULTIUSUARIO CBC IESTP
-- Ejecutar UNA VEZ en Supabase > SQL Editor.
-- Permite que todos los usuarios autenticados vean el acumulado institucional,
-- manteniendo la edición de visitas restringida a su creador o al administrador.

drop policy if exists visitas_read on public.visitas;
create policy visitas_read on public.visitas
for select to authenticated
using (true);

drop policy if exists evaluaciones_read on public.evaluaciones;
create policy evaluaciones_read on public.evaluaciones
for select to authenticated
using (exists (select 1 from public.visitas v where v.id = visita_id));

-- Las políticas INSERT/UPDATE/DELETE existentes se mantienen:
-- especialista: sus propios registros; administrador: todos.
