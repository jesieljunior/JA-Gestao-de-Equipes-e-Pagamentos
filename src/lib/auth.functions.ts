import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const autoConfirmarEmail = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ email: z.string().email() }).parse(d))
  .handler(async ({ data }) => {
    try {
      const emailLimpo = data.email.trim().toLowerCase();
      const { data: usersData, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
      if (listErr || !usersData?.users) {
        return { confirmado: false, erro: listErr?.message || "Erro ao listar usuários" };
      }

      const targetUser = usersData.users.find((u) => u.email?.toLowerCase() === emailLimpo);

      if (!targetUser) {
        return { confirmado: false, erro: "Usuário não encontrado" };
      }

      const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(targetUser.id, {
        email_confirm: true,
      });

      if (updateErr) {
        return { confirmado: false, erro: updateErr.message };
      }

      return { confirmado: true };
    } catch (err) {
      return { confirmado: false, erro: err instanceof Error ? err.message : "Erro desconhecido" };
    }
  });

export const cadastrarOuRedefinirUsuario = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        email: z.string().email(),
        password: z.string().min(6),
        nome: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const emailLimpo = data.email.trim().toLowerCase();
      const { data: usersData, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
      if (listErr) {
        throw new Error(listErr.message);
      }

      const usuarioExistente = (usersData?.users ?? []).find(
        (u) => u.email?.toLowerCase() === emailLimpo,
      );

      if (usuarioExistente) {
        // Atualiza a senha com a que o usuário acabou de digitar e confirma o e-mail
        const nomeExistente = (
          usuarioExistente.user_metadata as Record<string, unknown> | undefined
        )?.["nome"];
        const nomeFinal = String(
          data.nome || nomeExistente || emailLimpo.split("@")[0] || "Usuário",
        );

        const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(
          usuarioExistente.id,
          {
            password: data.password,
            email_confirm: true,
            user_metadata: { nome: nomeFinal },
          },
        );
        if (updErr) throw updErr;

        // Garante que o registro em public.usuarios existe
        await supabaseAdmin.from("usuarios").upsert({
          id: usuarioExistente.id,
          email: emailLimpo,
          nome: nomeFinal,
          ativo: true,
        });

        return { sucesso: true, usuarioId: usuarioExistente.id };
      }

      const nomeCriar = String(data.nome || emailLimpo.split("@")[0] || "Usuário");

      // Cria o novo usuário com email confirmado diretamente
      const { data: novoUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: emailLimpo,
        password: data.password,
        email_confirm: true,
        user_metadata: { nome: nomeCriar },
      });

      if (createErr || !novoUser.user) {
        throw new Error(createErr?.message || "Não foi possível criar o usuário");
      }

      // Garante registro em public.usuarios
      await supabaseAdmin.from("usuarios").upsert({
        id: novoUser.user.id,
        email: emailLimpo,
        nome: nomeCriar,
        ativo: true,
      });

      return { sucesso: true, usuarioId: novoUser.user.id };
    } catch (err) {
      return {
        sucesso: false,
        erro: err instanceof Error ? err.message : "Erro ao processar cadastro",
      };
    }
  });
