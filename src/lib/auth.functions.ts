import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const autoConfirmarEmail = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ email: z.string().email() }).parse(d))
  .handler(async ({ data }) => {
    try {
      const { data: usersData, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
      if (listErr || !usersData?.users) {
        return { confirmado: false, erro: listErr?.message || "Erro ao listar usuários" };
      }

      const targetUser = usersData.users.find(
        (u) => u.email?.toLowerCase() === data.email.toLowerCase(),
      );

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
