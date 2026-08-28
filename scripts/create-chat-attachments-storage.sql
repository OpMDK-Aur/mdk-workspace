-- Bucket de Storage para los archivos que se adjuntan en el chat del Multiagente
-- (planillas de ventas, reportes, capturas, etc.). Público para poder generar
-- URLs directas que el modelo pueda leer como parte multimodal del mensaje.
insert into storage.buckets (id, name, public)
values ('chat-adjuntos', 'chat-adjuntos', true)
on conflict (id) do nothing;

-- Cualquier usuario autenticado puede subir archivos a este bucket.
drop policy if exists "chat_adjuntos_insert_authenticated" on storage.objects;
create policy "chat_adjuntos_insert_authenticated"
on storage.objects for insert
to authenticated
with check (bucket_id = 'chat-adjuntos');

-- Lectura pública (necesaria para que la URL del archivo sea consumible
-- directamente por el modelo de IA sin autenticación adicional).
drop policy if exists "chat_adjuntos_select_public" on storage.objects;
create policy "chat_adjuntos_select_public"
on storage.objects for select
to public
using (bucket_id = 'chat-adjuntos');

-- Cada usuario sólo puede borrar los archivos que subió.
drop policy if exists "chat_adjuntos_delete_own" on storage.objects;
create policy "chat_adjuntos_delete_own"
on storage.objects for delete
to authenticated
using (bucket_id = 'chat-adjuntos' and owner = auth.uid());
