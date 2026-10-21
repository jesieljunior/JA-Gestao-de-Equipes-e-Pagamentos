import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Clock, ShieldCheck, ArrowRight } from "lucide-react";

export function ShadcnShowcase() {
  return (
    <Card className="max-w-md shadow-md border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">
            shadcn/ui configurado
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400 px-2 py-0.5 rounded-full">
            <ShieldCheck className="size-3" /> Ativo
          </span>
        </div>
        <CardTitle className="text-lg font-bold text-foreground">
          Já — Gestão de Equipes e Pagamentos
        </CardTitle>
        <CardDescription>
          Plataforma para agências de eventos e empresas organizarem colaboradores, escalas, ponto e
          pagamentos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Users className="size-3.5 text-primary" />
          <span>Gestão integrada de freelancers e equipes CLT</span>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="size-3.5 text-primary" />
          <span>Controle de ponto eletrônico com selfie e geolocalização</span>
        </div>
      </CardContent>
      <CardFooter className="flex justify-between gap-2 border-t border-border/60 pt-4">
        <Button variant="outline" size="sm">
          Saiba mais
        </Button>
        <Button size="sm" className="gap-1.5">
          Acessar plataforma <ArrowRight className="size-3.5" />
        </Button>
      </CardFooter>
    </Card>
  );
}
