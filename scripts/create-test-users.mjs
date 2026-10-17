import { createClient } from "@supabase/supabase-js";

const DEFAULT_PASSWORD = "Teste!2026Acesso";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Env vars ausentes: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY antes de executar.",
  );
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

function slug(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

async function ensureEmpresa(empresaNome, cnpj) {
  const { data: existente, error: selectError } = await supabaseAdmin
    .from("empresas")
    .select("id")
    .eq("cnpj", cnpj)
    .maybeSingle();

  if (selectError) {
    throw selectError;
  }

  if (existente?.id) {
    return existente.id;
  }

  const { data, error } = await supabaseAdmin
    .from("empresas")
    .insert({ nome: empresaNome, cnpj })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  const { error: configError } = await supabaseAdmin
    .from("configuracoes")
    .insert({ empresa_id: data.id });

  if (configError) {
    throw configError;
  }

  return data.id;
}

async function createUser({ email, nome, password, empresaId, papelUsuario, papelPlataforma }) {
  const { data: createdUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nome },
  });

  if (createError) {
    throw createError;
  }

  const userId = createdUser.user.id;
  const empresaEfetiva = papelPlataforma ? null : empresaId;

  const { error: profileError } = await supabaseAdmin.from("usuarios").upsert({
    id: userId,
    nome,
    email,
    empresa_id: empresaEfetiva,
    ativo: true,
  });

  if (profileError) {
    throw profileError;
  }

  if (papelUsuario) {
    // Remove qualquer privilégio da plataforma para não gerar acesso duplo
    await supabaseAdmin.from("plataforma_usuarios").delete().eq("user_id", userId);
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: userId, role: papelUsuario });

    if (roleError) {
      throw roleError;
    }
  }

  if (papelPlataforma) {
    // Remove qualquer papel de agência e vínculo empresarial
    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    const { error: platformError } = await supabaseAdmin
      .from("plataforma_usuarios")
      .upsert({ user_id: userId, papel: papelPlataforma });

    if (platformError) {
      throw platformError;
    }
  }

  return { email, password, nome, empresaId: empresaEfetiva, papelUsuario, papelPlataforma };
}

async function main() {
  const timestamp = Date.now();
  const empresaNome = "Empresa Teste Local";
  const empresaCnpj = `00${String(Date.now()).slice(-12)}`;

  const empresaId = await ensureEmpresa(empresaNome, empresaCnpj);

  const users = [
    {
      nome: "Teste Admin Empresa",
      papelUsuario: "admin",
      papelPlataforma: null,
      email: `empresa-admin-${timestamp}@example.test`,
    },
    {
      nome: "Teste Coordenador",
      papelUsuario: "coordenador",
      papelPlataforma: null,
      email: `empresa-coordenador-${timestamp}@example.test`,
    },
    {
      nome: "Teste Financeiro",
      papelUsuario: "financeiro",
      papelPlataforma: null,
      email: `empresa-financeiro-${timestamp}@example.test`,
    },
    {
      nome: "Teste Supervisor",
      papelUsuario: "supervisor",
      papelPlataforma: null,
      email: `empresa-supervisor-${timestamp}@example.test`,
    },
    {
      nome: "Teste Suporte",
      papelUsuario: null,
      papelPlataforma: "suporte",
      email: `suporte-${timestamp}@example.test`,
    },
    {
      nome: "Teste Admin Master",
      papelUsuario: null,
      papelPlataforma: "admin_master",
      email: `admin-master-${timestamp}@example.test`,
    },
  ];

  const created = [];

  for (const user of users) {
    const account = await createUser({
      email: user.email,
      nome: user.nome,
      password: DEFAULT_PASSWORD,
      empresaId: user.papelUsuario ? empresaId : null,
      papelUsuario: user.papelUsuario,
      papelPlataforma: user.papelPlataforma,
    });

    created.push(account);
  }

  console.log("\nUsuários de teste criados com sucesso.");
  console.log("Senha padrão para todos:", DEFAULT_PASSWORD);
  console.log("Empresa:", empresaNome);
  console.log("CNPJ da empresa teste:", empresaCnpj);
  console.log("");

  for (const item of created) {
    const perfil = item.papelUsuario ?? item.papelPlataforma;
    console.log(`${item.nome} | ${item.email} | ${perfil}`);
  }
}

main().catch((error) => {
  console.error("Falha ao criar usuários de teste:", error);
  process.exit(1);
});
