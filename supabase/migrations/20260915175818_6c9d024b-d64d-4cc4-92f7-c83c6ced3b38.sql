create policy "documentos_fiscais_storage_leitura"
on storage.objects for select to authenticated
using (
  bucket_id = 'documentos-fiscais'
  and (
    (storage.foldername(name))[1] = public.empresa_atual()::text
    or public.eh_equipe_plataforma()
  )
);

create policy "documentos_fiscais_storage_insercao"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'documentos-fiscais'
  and (storage.foldername(name))[1] = public.empresa_atual()::text
  and (
    public.tem_capacidade(auth.uid(),'financeiro.gerenciar')
    or public.tem_capacidade(auth.uid(),'cadastros.gerenciar')
  )
);

create policy "documentos_fiscais_storage_atualizacao"
on storage.objects for update to authenticated
using (
  bucket_id = 'documentos-fiscais'
  and (storage.foldername(name))[1] = public.empresa_atual()::text
  and (
    public.tem_capacidade(auth.uid(),'financeiro.gerenciar')
    or public.tem_capacidade(auth.uid(),'cadastros.gerenciar')
  )
)
with check (
  bucket_id = 'documentos-fiscais'
  and (storage.foldername(name))[1] = public.empresa_atual()::text
  and (
    public.tem_capacidade(auth.uid(),'financeiro.gerenciar')
    or public.tem_capacidade(auth.uid(),'cadastros.gerenciar')
  )
);

create policy "documentos_fiscais_storage_exclusao"
on storage.objects for delete to authenticated
using (
  bucket_id = 'documentos-fiscais'
  and (storage.foldername(name))[1] = public.empresa_atual()::text
  and public.has_role(auth.uid(),'admin')
);