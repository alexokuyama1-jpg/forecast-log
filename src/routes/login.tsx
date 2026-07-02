import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { isValidLactalisEmail, passwordIssues, isValidPassword, LACTALIS_DOMAIN } from "@/lib/auth-rules";
import { setAdminSession } from "@/hooks/use-auth";
import { Loader2, ShieldCheck, Mail, KeyRound } from "lucide-react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const nav = useNavigate();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) nav({ to: "/" });
    });
  }, [nav]);

  const [tab, setTab] = useState<string>("signin");

  // ===== Sign in
  const [siEmail, setSiEmail] = useState("");
  const [siPw, setSiPw] = useState("");
  const [siLoading, setSiLoading] = useState(false);
  const onSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailRaw = siEmail.trim().toLowerCase();
    // Admin bypass
    if (emailRaw === "admin@admin" && siPw === "Lactalis@2026") {
      setAdminSession({ email: emailRaw, isAdmin: true });
      toast.success("Bem-vindo, administrador!");
      nav({ to: "/" });
      return;
    }
    if (!isValidLactalisEmail(siEmail)) {
      toast.error(`Use um e-mail ${LACTALIS_DOMAIN}`);
      return;
    }
    setSiLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: siEmail.trim().toLowerCase(), password: siPw });
    setSiLoading(false);
    if (error) {
      if (error.message.toLowerCase().includes("email not confirmed")) {
        toast.error("E-mail ainda não verificado. Confira sua caixa de entrada.");
        setVfEmail(siEmail);
        setTab("verify");
      } else {
        toast.error("E-mail ou senha inválidos.");
      }
      return;
    }
    toast.success("Bem-vindo!");
    nav({ to: "/" });
  };

  // ===== Sign up
  const [suEmail, setSuEmail] = useState("");
  const [suPw, setSuPw] = useState("");
  const [suPw2, setSuPw2] = useState("");
  const [suLoading, setSuLoading] = useState(false);
  const onSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidLactalisEmail(suEmail)) {
      toast.error(`Cadastro permitido somente para e-mails ${LACTALIS_DOMAIN}`);
      return;
    }
    if (!isValidPassword(suPw)) {
      toast.error("A senha não atende aos requisitos.");
      return;
    }
    if (suPw !== suPw2) {
      toast.error("As senhas não conferem.");
      return;
    }
    setSuLoading(true);
    const email = suEmail.trim().toLowerCase();
    const { data, error } = await supabase.auth.signUp({
      email,
      password: suPw,
      options: { emailRedirectTo: `${window.location.origin}/` },
    });
    setSuLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    // Supabase retorna identities=[] quando o email já existe
    const identities = data.user?.identities ?? [];
    if (data.user && identities.length === 0) {
      toast.error("Este e-mail já está cadastrado. Use a recuperação de senha.");
      setRecEmail(email);
      setTab("recover");
      return;
    }
    toast.success("Enviamos um código de 6 dígitos para o seu e-mail.");
    setVfEmail(email);
    setTab("verify");
  };

  // ===== Verify OTP (cadastro)
  const [vfEmail, setVfEmail] = useState("");
  const [vfCode, setVfCode] = useState("");
  const [vfLoading, setVfLoading] = useState(false);
  const onVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(vfCode)) {
      toast.error("Informe o código de 6 dígitos.");
      return;
    }
    setVfLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      email: vfEmail.trim().toLowerCase(),
      token: vfCode,
      type: "signup",
    });
    setVfLoading(false);
    if (error) {
      toast.error("Código inválido ou expirado.");
      return;
    }
    toast.success("E-mail verificado com sucesso!");
    nav({ to: "/" });
  };
  const onResend = async () => {
    if (!isValidLactalisEmail(vfEmail)) {
      toast.error("Informe um e-mail válido");
      return;
    }
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: vfEmail.trim().toLowerCase(),
      options: { emailRedirectTo: `${window.location.origin}/` },
    });
    if (error) toast.error(error.message);
    else toast.success("Novo código enviado.");
  };

  // ===== Recover password (envia email -> /reset-password)
  const [recEmail, setRecEmail] = useState("");
  const [recLoading, setRecLoading] = useState(false);
  const onRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidLactalisEmail(recEmail)) {
      toast.error(`Use um e-mail ${LACTALIS_DOMAIN}`);
      return;
    }
    setRecLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(recEmail.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setRecLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Enviamos um e-mail com o link para definir uma nova senha.");
  };

  const pwIssues = passwordIssues(suPw);

  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-br from-background to-muted px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto rounded-full bg-primary/10 p-3 w-fit">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Painel Lactalis</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={setTab} className="space-y-4">
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="signin">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Cadastrar</TabsTrigger>
              <TabsTrigger value="verify">Verificar</TabsTrigger>
              <TabsTrigger value="recover">Recuperar</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={onSignIn} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="si-email">E-mail corporativo</Label>
                  <Input id="si-email" type="email" placeholder={`nome${LACTALIS_DOMAIN}`}
                    value={siEmail} onChange={(e) => setSiEmail(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="si-pw">Senha</Label>
                  <Input id="si-pw" type="password" value={siPw} onChange={(e) => setSiPw(e.target.value)} required />
                </div>
                <Button type="submit" className="w-full" disabled={siLoading}>
                  {siLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
                </Button>
                <button type="button" className="text-xs text-muted-foreground hover:text-primary block mx-auto"
                  onClick={() => { setRecEmail(siEmail); setTab("recover"); }}>
                  Esqueci minha senha
                </button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={onSignUp} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="su-email">E-mail corporativo</Label>
                  <Input id="su-email" type="email" placeholder={`nome${LACTALIS_DOMAIN}`}
                    value={suEmail} onChange={(e) => setSuEmail(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="su-pw">Senha</Label>
                  <Input id="su-pw" type="password" value={suPw} onChange={(e) => setSuPw(e.target.value)} required />
                  {suPw.length > 0 && pwIssues.length > 0 && (
                    <ul className="text-[11px] text-destructive space-y-0.5 mt-1">
                      {pwIssues.map((i) => <li key={i}>• {i}</li>)}
                    </ul>
                  )}
                  {suPw.length > 0 && pwIssues.length === 0 && (
                    <p className="text-[11px] text-green-600">Senha forte ✓</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="su-pw2">Confirmar senha</Label>
                  <Input id="su-pw2" type="password" value={suPw2} onChange={(e) => setSuPw2(e.target.value)} required />
                </div>
                <Button type="submit" className="w-full" disabled={suLoading}>
                  {suLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar conta"}
                </Button>
                <p className="text-[11px] text-muted-foreground text-center">
                  Após o cadastro, enviaremos um código de 6 dígitos para validar seu e-mail.
                </p>
              </form>
            </TabsContent>

            <TabsContent value="verify">
              <div className="space-y-4 text-center py-2">
                <div className="mx-auto rounded-full bg-primary/10 p-3 w-fit">
                  <Mail className="h-6 w-6 text-primary" />
                </div>
                <div className="space-y-1">
                  <p className="font-semibold text-sm">Verifique seu e-mail</p>
                  <p className="text-sm text-muted-foreground">
                    Enviamos um link de confirmação para <span className="font-medium text-foreground">{vfEmail}</span>.
                    Abra o e-mail e clique em <strong>"Confirm email address"</strong> para ativar sua conta.
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">Não recebeu? Verifique sua caixa de spam.</p>
                <button type="button" onClick={onResend}
                  className="text-xs text-muted-foreground hover:text-primary block mx-auto underline">
                  Reenviar e-mail de confirmação
                </button>
                <Button variant="outline" className="w-full" onClick={() => setTab("signin")}>
                  Voltar para o login
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="recover">
              <form onSubmit={onRecover} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="rec-email">E-mail cadastrado</Label>
                  <Input id="rec-email" type="email" placeholder={`nome${LACTALIS_DOMAIN}`}
                    value={recEmail} onChange={(e) => setRecEmail(e.target.value)} required />
                </div>
                <Button type="submit" className="w-full" disabled={recLoading}>
                  {recLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar link de redefinição"}
                </Button>
                <p className="text-[11px] text-muted-foreground text-center">
                  Você receberá um e-mail com link para abrir a tela de nova senha.
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground mt-4">
        <Link to="/" className="hover:text-primary">← Voltar</Link>
      </p>
    </div>
  );
}