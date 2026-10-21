import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { autoConfirmarEmail, cadastrarOuRedefinirUsuario } from "@/lib/auth.functions";
import {
  carregarDadosAcesso,
  extrairTokenOuLink,
  resolverDestinoAcesso,
} from "@/lib/auth-navigation";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    try {
      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        const dados = await carregarDadosAcesso(supabase, data.user.id);
        const destino = resolverDestinoAcesso(dados);
        if (destino !== "/auth") {
          throw redirect({ to: destino });
        }
      }
    } catch (e) {
      if (e && typeof e === "object" && "to" in e) throw e;
    }
  },
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Entrar no Já — Gestão de Equipes e Pagamentos" },
      {
        name: "description",
        content:
          "Acesse o Já para gerenciar eventos, equipes, escalas, ponto em campo, fechamento de horas e pagamentos da sua agência.",
      },
      { property: "og:title", content: "Entrar no Já — Gestão de Equipes e Pagamentos" },
      {
        property: "og:description",
        content: "Acesso da agência ao painel de gestão de equipes e pagamento de colaboradores.",
      },
    ],
  }),
  component: Auth,
});

function Auth() {
  const navigate = useNavigate();
  const autoConfirmar = useServerFn(autoConfirmarEmail);
  const cadastrarOuRedefinir = useServerFn(cadastrarOuRedefinirUsuario);
  const [carregando, setCarregando] = useState(false);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [aguardandoConfirmacao, setAguardandoConfirmacao] = useState(false);

  const [codigoOtp, setCodigoOtp] = useState("");
  const [verificandoOtp, setVerificandoOtp] = useState(false);

  const redirecionarParaDestino = useCallback(
    async (user: { id: string }) => {
      try {
        const dados = await carregarDadosAcesso(supabase, user.id);
        if (!dados.ativo) {
          toast.error("Conta desativada ou indisponível.");
          await supabase.auth.signOut();
          return;
        }
        const destino = resolverDestinoAcesso(dados);
        if (window.location.hash || window.location.search) {
          window.history.replaceState(null, "", window.location.pathname);
        }
        try {
          await (navigate as unknown as (opts: { to: string; replace?: boolean }) => Promise<void>)(
            { to: destino, replace: true },
          );
        } catch {
          window.location.href = destino;
        }
      } catch (err) {
        console.error("Falha ao resolver destino de acesso:", err);
        window.location.href = "/painel";
      }
    },
    [navigate],
  );

  // Escuta confirmação da autenticação e trata links de confirmação com hash ou code
  useEffect(() => {
    // 1. Trata código PKCE na query string (?code=...)
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ data, error }) => {
        if (!error && data?.user) {
          toast.success("Autenticado com sucesso!");
          redirecionarParaDestino(data.user);
        }
      });
    }

    // 2. Trata hash com tokens (#access_token=...&refresh_token=...)
    if (window.location.hash.includes("access_token=")) {
      const hash = window.location.hash.replace(/^#/, "");
      const hashParams = new URLSearchParams(hash);
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      if (accessToken && refreshToken) {
        supabase.auth
          .setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
          .then(({ data, error }) => {
            if (!error && data?.user) {
              toast.success("Autenticado com sucesso!");
              redirecionarParaDestino(data.user);
            }
          });
      }
    }

    // 3. Listener de estado de autenticação Supabase
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user && (event === "SIGNED_IN" || event === "USER_UPDATED")) {
        toast.success("Autenticado com sucesso!");
        await redirecionarParaDestino(session.user);
      }
    });

    // 4. Verificação de sessão já ativa no carregamento
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
    if (error) {
      // Se acusar e-mail não confirmado, auto-confirma no backend e tenta o login direto
      if (error.message.toLowerCase().includes("email not confirmed")) {
        try {
          await autoConfirmar({ data: { email } });
          const { data: retryData, error: retryErr } = await supabase.auth.signInWithPassword({
            email,
            password: senha,
          });
          if (!retryErr && retryData?.user) {
            setCarregando(false);
            toast.success("Autenticado com sucesso!");
            await redirecionarParaDestino(retryData.user);
            return;
          }
        } catch (err) {
          console.warn("Auto-confirmação no login:", err);
        }
      }

      setCarregando(false);
      toast.error(
        error.message === "Invalid login credentials"
          ? "E-mail ou senha incorretos."
          : error.message,
      );
      return;
    }
    setCarregando(false);
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
    const extracao = extrairTokenOuLink(codigoOtp);

    // Caso o usuário cole link com tokens de hash
    if (extracao.tipo === "tokens_hash" && extracao.accessToken && extracao.refreshToken) {
      try {
        const { error: sessErr } = await supabase.auth.setSession({
          access_token: extracao.accessToken,
          refresh_token: extracao.refreshToken,
        });
        if (sessErr) throw sessErr;
        toast.success("Autenticado com sucesso!");
        const { data: userData } = await supabase.auth.getUser();
        if (userData.user) await redirecionarParaDestino(userData.user);
        return;
      } catch (err) {
        console.error("Falha ao aplicar tokens:", err);
      }
    }

    // Validação de token ou código OTP
    const { data: otpData, error } = await supabase.auth.verifyOtp({
      email,
      token: extracao.token || codigoOtp.trim(),
      type: extracao.tokenType || "email",
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
      if (userData.user) await redirecionarParaDestino(userData.user);
    }
  }

  async function cadastrar(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);

    try {
      const res = await cadastrarOuRedefinir({
        data: {
          email,
          password: senha,
          nome,
        },
      });

      if (!res.sucesso) {
        setCarregando(false);
        toast.error(res.erro || "Falha ao processar cadastro.");
        return;
      }

      // Login imediato com o e-mail e a senha cadastrados
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: senha,
      });

      setCarregando(false);
      if (error) {
        toast.error("Erro ao autenticar: " + error.message);
        return;
      }

      if (data.user) {
        toast.success("Conta criada e autenticada com sucesso!");
        await redirecionarParaDestino(data.user);
      }
    } catch (err) {
      setCarregando(false);
      toast.error(err instanceof Error ? err.message : "Erro inesperado ao cadastrar.");
    }
  }

  async function comGoogle() {
    setCarregando(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth`,
      },
    });
    if (error) {
      setCarregando(false);
      toast.error("Não foi possível entrar com o Google.");
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-between bg-muted/30 px-4 py-8">
      <div className="w-full max-w-sm my-auto">
        <div className="mb-6 text-center space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary mb-2">
            <span>SaaS por Swali</span>
          </div>
          <p className="text-3xl font-black tracking-tight text-foreground">Já</p>
          <p className="text-xs font-medium text-muted-foreground">
            Gestão de Equipes e Pagamentos
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
          Já é uma plataforma corporativa da{" "}
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
