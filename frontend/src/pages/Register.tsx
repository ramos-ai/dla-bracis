import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { register, RegisterData } from "../services/AuthService";
import Button from "../components/Fields/Button";
import InputField from "../components/Fields/InputField";
import AuthParticles from "../components/AuthParticles/AuthParticles";

const Register: React.FC = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (password !== confirmPassword) {
      setError("As senhas não coincidem");
      return;
    }

    if (password.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres");
      return;
    }

    setIsLoading(true);

    try {
      const registerData: RegisterData = {
        name,
        email,
        password,
      };

      await register(registerData);
      setSuccess("Conta criada com sucesso! Redirecionando para o login...");
      setTimeout(() => {
        navigate("/login");
      }, 2000);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      setError(error.response?.data?.message || "Erro ao criar conta. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-x-hidden bg-background px-4 py-10 font-sans text-foreground">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--primary-soft)_0%,_transparent_50%)]"
        aria-hidden
      />
      <div className="auth-particles--muted pointer-events-none absolute inset-0 overflow-hidden opacity-30">
        <AuthParticles />
      </div>

      <div className="relative z-10 w-full max-w-md space-y-6">
        <div className="text-center">
          <Link to="/initial" className="font-display text-2xl font-semibold tracking-tight text-primary">
            DLA
          </Link>
          <p className="rule-label mt-3">Data Labelling App</p>
          <h1 className="mt-2 font-display text-xl font-semibold tracking-tight">Criar conta</h1>
          <p className="mt-1 text-sm text-muted-foreground">Registre-se para começar a rotular.</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-lg border border-border bg-surface p-6 shadow-sm sm:p-8"
        >
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-md border border-success/30 bg-success/5 px-3 py-2.5 text-sm text-success">
              {success}
            </div>
          )}

          <InputField
            label="Nome"
            name="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            disabled={isLoading}
            minLength={3}
          />

          <InputField
            label="Email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isLoading}
          />

          <InputField
            label="Senha"
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={isLoading}
            minLength={8}
          />

          <InputField
            label="Confirmar Senha"
            name="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            disabled={isLoading}
          />

          <Button type="submit" disabled={isLoading} className="w-full">
            {isLoading ? "Criando conta…" : "Criar Conta"}
          </Button>

          <p className="pt-1 text-center text-sm text-muted-foreground">
            Já tem uma conta?{" "}
            <Link to="/login" className="font-semibold text-secondary hover:text-primary hover:underline">
              Faça login
            </Link>
          </p>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          <Link to="/initial" className="hover:text-foreground hover:underline">
            ← Voltar à página inicial
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Register;
