import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { passwordIssues, isValidPassword } from "@/lib/auth-rules";
import { Loader2, KeyRound } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Definir nova senha — Lactalis" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const nav = useNavigate();
  const [ready, setReady] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Supabase entrega o token de recovery via hash do URL e cria a sessão automaticamente.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const issues = passwordIssues(pw);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidPassword(pw)) { toast.error("Senha não atende aos requisitos."); return; }
    if (pw !== pw2) { toast.error("As senhas não conferem."); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) { setLoading(false); toast.error(error.message); return; }
    // Reenvia confirmação informando alteração + força novo login
    const email = (await supabase.auth.getUser()).data.user?.email;
    await supabase.auth.signOut();
    setLoading(false);
    toast.success("Senha atualizada. Faça login novamente.");
    if (email) {
      // dispara também um e-mail de confirmação (link mágico) como segunda confirmação
      await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/` } });
    }
    nav({ to: "/login" });
  };

  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-br from-background to-muted px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto rounded-full bg-primary/10 p-3 w-fit">
            <KeyRound className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Definir nova senha</CardTitle>
          <CardDescription>
            {ready ? "Crie uma nova senha forte para continuar." : "Validando link de recuperação…"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pw">Nova senha</Label>
              <Input id="pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} required disabled={!ready} />
              {pw.length > 0 && issues.length > 0 && (
                <ul className="text-[11px] text-destructive space-y-0.5 mt-1">
                  {issues.map((i) => <li key={i}>• {i}</li>)}
                </ul>
              )}
              {pw.length > 0 && issues.length === 0 && (
                <p className="text-[11px] text-green-600">Senha forte ✓</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw2">Confirmar senha</Label>
              <Input id="pw2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} required disabled={!ready} />
            </div>
            <Button type="submit" className="w-full" disabled={loading || !ready}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Atualizar senha"}
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">
              Após atualizar, enviaremos um e-mail de confirmação e você precisará fazer login novamente.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}