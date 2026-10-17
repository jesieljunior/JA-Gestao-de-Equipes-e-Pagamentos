import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    try {
      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        const { data: usuario } = await supabase
          .from("usuarios")
          .select("empresa_id, ativo")
          .eq("id", data.user.id)
          .maybeSingle();

        if (usuario && usuario.ativo === false) return;

        const { data: plataforma } = await supabase
          .from("plataforma_usuarios")
          .select("papel")
          .eq("user_id", data.user.id);

        const papeis = (plataforma ?? []).map((p) => p.papel as string);
        if (papeis.includes("admin_master")) throw redirect({ to: "/admin" });
        if (papeis.includes("suporte")) throw redirect({ to: "/suporte" });

        if (!usuario?.empresa_id) throw redirect({ to: "/onboarding" });
        throw redirect({ to: "/painel" });
      }
    } catch (e) {
      if (e && typeof e === "object" && "to" in e) throw e;
    }
  },
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Entrar no PayCrew" },
      {
        name: "description",
        content:
          "Acesse o PayCrew para gerenciar eventos, escalas, ponto em campo, fechamento de horas e pagamentos da sua agência.",
      },
      { property: "og:title", content: "Entrar no PayCrew" },
      {
        property: "og:description",
        content: "Acesso da agência ao painel de operação e pagamento de equipes.",
      },
    ],
  }),
  component: Auth,
});

function Auth() {
  const navigate = useNavigate();
  const [carregando, setCarregando] = useState(false);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [aguardandoConfirmacao, setAguardandoConfirmacao] = useState(false);

  const [codigoOtp, setCodigoOtp] = useState("");
  const [verificandoOtp, setVerificandoOtp] = useState(false);

  const redirecionarParaDestino = useCallback(
    async (user: { id: string }) => {
      const { data: usuario } = await supabase
        .from("usuarios")
        .select("empresa_id, ativo")
        .eq("id", user.id)
        .maybeSingle();

      if (usuario && usuario.ativo === false) {
        toast.error("Conta desativada ou indisponível.");
        await supabase.auth.signOut();
        return;
      }

      const { data: plataforma } = await supabase
        .from("plataforma_usuarios")
        .select("papel")
        .eq("user_id", user.id);

      const papeis = (plataforma ?? []).map((p) => p.papel as string);
      if (papeis.includes("admin_master")) {
        navigate({ to: "/admin", replace: true });
        return;
      }
      if (papeis.includes("suporte")) {
        navigate({ to: "/suporte", replace: true });
        return;
      }

      if (!usuario?.empresa_id) {
        navigate({ to: "/onboarding", replace: true });
        return;
      }

      navigate({ to: "/painel", replace: true });
    },
    [navigate],
  );

  // Escuta confirmação da autenticação
  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user && event === "SIGNED_IN") {
        toast.success("Autenticado com sucesso!");
        await redirecionarParaDestino(session.user);
      }
    });

    supabase.auth.getSession().then(async ({ data: sess }) => {
      if (sess.session?.user) {
        await redirecionarParaDestino(sess.session.user);
      }
    });

    return () => authListener.subscription.unsubscribe();
  }, [redirecionarParaDestino]);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setCarregando(false);
    if (error) {
      toast.error(
        error.message === "Invalid login credentials"
          ? "E-mail ou senha incorretos."
          : error.message,
      );
      return;
    }
    if (data.user) {
      toast.success("Autenticado com sucesso!");
      await redirecionarParaDestino(data.user);
    }
  }

  async function enviarLinkMagico(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth` },
    });
    setCarregando(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("E-mail de acesso enviado! Verifique sua caixa de entrada.");
    setAguardandoConfirmacao(true);
  }

  async function validarCodigoOtp(e: React.FormEvent) {
    e.preventDefault();
    setVerificandoOtp(true);
    const inputLimpo = codigoOtp.trim();

    // Caso o usuário cole o link completo do botão do e-mail
    if (inputLimpo.includes("token=") || inputLimpo.includes("#access_token=")) {
      try {
        if (inputLimpo.includes("#access_token=")) {
          const hash = inputLimpo.split("#")[1];
          const params = new URLSearchParams(hash);
          const accessToken = params.get("access_token");
          const refreshToken = params.get("refresh_token");
          if (accessToken && refreshToken) {
            const { error: sessErr } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (sessErr) throw sessErr;
            toast.success("Autenticado com sucesso!");
            const { data: userData } = await supabase.auth.getUser();
            if (userData.user) {
              await redirecionarParaDestino(userData.user);
            }
            return;
          }
        } else if (inputLimpo.includes("token=")) {
          const urlObj = new URL(inputLimpo);
          const tokenParam = urlObj.searchParams.get("token");
          const typeParam = (urlObj.searchParams.get("type") as "email" | "magiclink") ?? "email";
          if (tokenParam) {
            const { error: otpErr } = await supabase.auth.verifyOtp({
              email,
              token: tokenParam,
              type: typeParam === "magiclink" ? "magiclink" : "email",
            });
            if (otpErr) throw otpErr;
            toast.success("Autenticado com sucesso!");
            const { data: userData } = await supabase.auth.getUser();
            if (userData.user) {
              await redirecionarParaDestino(userData.user);
            }
            return;
          }
        }
      } catch (err) {
        console.error("Falha ao analisar link colado:", err);
      }
    }

    // Verificação normal de código numérico de 6 dígitos
    const { data: otpData, error } = await supabase.auth.verifyOtp({
      email,
      token: inputLimpo,
      type: "email",
    });
    setVerificandoOtp(false);
    if (error) {
      toast.error(
        error.message.includes("Token has expired") || error.message.includes("invalid")
          ? "Código inválido ou expirado. Você também pode clicar diretamente no botão 'Log In' do e-mail."
          : error.message,
      );
      return;
    }
    toast.success("Autenticado com sucesso!");
    if (otpData.user) {
      await redirecionarParaDestino(otpData.user);
    } else {
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        await redirecionarParaDestino(userData.user);
      }
    }
  }

  async function cadastrar(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: {
        emailRedirectTo: `${window.location.origin}/auth`,
        data: { nome },
      },
    });
    setCarregando(false);
    if (error) {
      toast.error(
        error.message.includes("already registered")
          ? "Este e-mail já tem conta. Use a aba Senha ou Código."
          : error.message,
      );
      return;
    }
    if (data.session) {
      toast.success("Autenticado com sucesso!");
      await redirecionarParaDestino(data.session.user);
      return;
    }
    setAguardandoConfirmacao(true);
  }

  async function comGoogle() {
    setCarregando(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setCarregando(false);
      toast.error("Não foi possível entrar com o Google.");
      return;
    }
    if (result.redirected) return;
    const { data: userData } = await supabase.auth.getUser();
    if (userData.user) {
      toast.success("Autenticado com sucesso!");
      await redirecionarParaDestino(userData.user);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-between bg-muted/30 px-4 py-8">
      <div className="w-full max-w-sm my-auto">
        <div className="mb-6 text-center space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary mb-2">
            <span>SaaS por Swali</span>
          </div>
          <p className="text-2xl font-bold tracking-tight text-foreground">PayCrew</p>
          <p className="text-xs text-muted-foreground">
            Operação e pagamento de equipes de eventos
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
          {aguardandoConfirmacao ? (
            <div className="space-y-4 text-center">
              <div>
                <p className="text-base font-semibold">E-mail de Acesso Enviado</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Enviamos o acesso para <strong className="text-foreground">{email}</strong>.
                </p>
              </div>

              <div className="rounded-lg bg-primary/10 border border-primary/20 p-3 text-left space-y-2">
                <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse" />
                  Como acessar agora:
                </p>
                <ol className="text-[11px] text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>
                    <strong>Opção 1 (Recomendada):</strong> Abra o e-mail e clique no botão{" "}
                    <strong>&quot;Log In&quot;</strong>. Esta tela detectará na hora e abrirá o
                    painel.
                  </li>
                  <li>
                    <strong>Opção 2:</strong> Se o e-mail contiver um código numérico de 6 dígitos
                    ou se preferir copiar o endereço do link do botão, insira abaixo:
                  </li>
                </ol>
              </div>

              <form onSubmit={validarCodigoOtp} className="space-y-3 text-left">
                <div className="space-y-1.5">
                  <Label htmlFor="codigo-otp">Código de 6 dígitos ou link do botão</Label>
                  <Input
                    id="codigo-otp"
                    type="text"
                    placeholder="Ex: 123456 ou cole o link do e-mail"
                    required
                    value={codigoOtp}
                    onChange={(e) => setCodigoOtp(e.target.value)}
                    className="text-sm font-mono"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={verificandoOtp}>
                  {verificandoOtp ? "Verificando..." : "Confirmar e Entrar"}
                </Button>
              </form>

              <div className="pt-2 border-t border-border flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={enviarLinkMagico}
                  disabled={carregando}
                  className="text-primary hover:underline"
                >
                  Reenviar e-mail
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAguardandoConfirmacao(false);
                    setCodigoOtp("");
                  }}
                  className="text-muted-foreground hover:underline"
                >
                  Trocar e-mail / Voltar
                </button>
              </div>
            </div>
          ) : (
            <Tabs defaultValue="entrar">
              <TabsList className="grid w-full grid-cols-3 text-xs">
                <TabsTrigger value="entrar">Senha</TabsTrigger>
                <TabsTrigger value="codigo">Código</TabsTrigger>
                <TabsTrigger value="criar">Criar</TabsTrigger>
              </TabsList>

              <TabsContent value="entrar" className="mt-4">
                <form onSubmit={entrar} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="email">E-mail</Label>
                    <Input
                      id="email"
                      type="email"
                      required
                      autoComplete="email"
                      placeholder="seu.email@exemplo.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="senha">Senha</Label>
                    <Input
                      id="senha"
                      type="password"
                      required
                      autoComplete="current-password"
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={carregando}>
                    {carregando ? "Entrando..." : "Entrar"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="codigo" className="mt-4">
                <form onSubmit={enviarLinkMagico} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="email-otp">E-mail para receber código</Label>
                    <Input
                      id="email-otp"
                      type="email"
                      required
                      autoComplete="email"
                      placeholder="seu.email@exemplo.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Sem necessidade de senha. Enviamos um código ou link de 1 clique direto para
                      sua caixa de entrada.
                    </p>
                  </div>
                  <Button type="submit" className="w-full" disabled={carregando}>
                    {carregando ? "Enviando..." : "Enviar código de acesso"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="criar" className="mt-4">
                <form onSubmit={cadastrar} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="nome">Seu nome</Label>
                    <Input
                      id="nome"
                      required
                      placeholder="Ex: João da Silva"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email-novo">E-mail</Label>
                    <Input
                      id="email-novo"
                      type="email"
                      required
                      autoComplete="email"
                      placeholder="seu.email@exemplo.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="senha-nova">Senha (mín. 6 caracteres)</Label>
                    <Input
                      id="senha-nova"
                      type="password"
                      required
                      minLength={6}
                      autoComplete="new-password"
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={carregando}>
                    {carregando ? "Cadastrando..." : "Criar conta de agência"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          )}

          {!aguardandoConfirmacao ? (
            <>
              <div className="my-3 flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-[11px] text-muted-foreground">ou acesso rápido</span>
                <span className="h-px flex-1 bg-border" />
              </div>
              <Button
                variant="outline"
                className="w-full font-medium"
                onClick={comGoogle}
                disabled={carregando}
              >
                Entrar com Google
              </Button>

              <div className="rounded-lg bg-muted/60 p-3 text-[11px] text-muted-foreground space-y-1 border border-border/60">
                <p className="font-semibold text-foreground flex items-center gap-1.5">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Ambiente de Teste & Validação
                </p>
                <p>
                  Para testar agora mesmo, clique em <strong>Entrar com Google</strong> com sua
                  conta autorizada ou utilize a aba <strong>Código</strong> para receber acesso
                  imediato sem senha.
                </p>
              </div>
            </>
          ) : null}
        </div>
      </div>

      <footer className="mt-8 text-center text-xs text-muted-foreground">
        <p>
          PayCrew é um software como serviço da{" "}
          <a
            href="https://www.swali.com.br/"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-foreground underline decoration-primary/50 hover:text-primary transition-colors"
          >
            Swali (swali.com.br)
          </a>
        </p>
      </footer>
    </div>
  );
}
