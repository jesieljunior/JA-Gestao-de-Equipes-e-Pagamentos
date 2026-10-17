import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
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
      if (data?.user) throw redirect({ to: "/painel" });
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

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setCarregando(false);
    if (error) {
      toast.error(
        error.message === "Invalid login credentials"
          ? "E-mail ou senha incorretos."
          : error.message,
      );
      return;
    }
    navigate({ to: "/painel", replace: true });
  }

  async function enviarLinkMagico(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setCarregando(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Código de 6 dígitos enviado para seu e-mail!");
    setAguardandoConfirmacao(true);
  }

  async function validarCodigoOtp(e: React.FormEvent) {
    e.preventDefault();
    setVerificandoOtp(true);
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: codigoOtp.trim(),
      type: "email",
    });
    setVerificandoOtp(false);
    if (error) {
      toast.error(
        error.message.includes("Token has expired") || error.message.includes("invalid")
          ? "Código de verificação inválido ou expirado."
          : error.message,
      );
      return;
    }
    toast.success("Autenticado com sucesso!");
    navigate({ to: "/painel", replace: true });
  }

  async function cadastrar(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: {
        emailRedirectTo: window.location.origin,
        data: { nome },
      },
    });
    setCarregando(false);
    if (error) {
      toast.error(
        error.message.includes("already registered")
          ? "Este e-mail já tem conta. Use a aba Entrar."
          : error.message,
      );
      return;
    }
    if (data.session) {
      navigate({ to: "/painel", replace: true });
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
    navigate({ to: "/painel", replace: true });
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
                <p className="text-base font-semibold">Código de Confirmação</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Enviamos um link e um código de 6 dígitos para{" "}
                  <strong className="text-foreground">{email}</strong>.
                </p>
              </div>

              <form onSubmit={validarCodigoOtp} className="space-y-3 text-left">
                <div className="space-y-1.5">
                  <Label htmlFor="codigo-otp">Digite o código de 6 dígitos</Label>
                  <Input
                    id="codigo-otp"
                    type="text"
                    inputMode="numeric"
                    placeholder="123456"
                    required
                    maxLength={10}
                    value={codigoOtp}
                    onChange={(e) => setCodigoOtp(e.target.value)}
                    className="text-center text-lg tracking-widest font-mono"
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
                  Reenviar código
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
