import type { ReactNode } from "react";

type LayoutProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

export function Layout({ title, subtitle, children }: LayoutProps) {
  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Bonus Loyalty</p>
          <h1>{title}</h1>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </header>
      {children}
    </main>
  );
}

export function Card({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "dark" }) {
  return <section className={`card ${tone === "dark" ? "card-dark" : ""}`}>{children}</section>;
}

export function Field({
  label,
  children
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function ErrorMessage({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }
  return <p className="error">{message}</p>;
}

export function StaffNav() {
  const path = window.location.pathname;
  return (
    <nav className="bottom-nav">
      <a href="/seller" className={path.startsWith("/seller") ? "active" : undefined}>
        Продавец
      </a>
      <a href="/admin" className={path.startsWith("/admin") ? "active" : undefined}>
        Админ
      </a>
    </nav>
  );
}
