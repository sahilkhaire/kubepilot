import { BrandMark } from '@/components/brand-mark'
import { ThemeToggle } from '@/components/theme-toggle'

/** Full-screen backdrop shared by the sign-in and password screens. */
export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <main className="relative isolate flex min-h-svh items-center justify-center overflow-hidden bg-sidebar p-4 sm:p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 [background:radial-gradient(60rem_40rem_at_50%_-10%,var(--glow),transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-50 [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_50%_30%,black_20%,transparent_70%)]"
      />
      <div className="absolute top-3 right-3">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-[22rem]">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <BrandMark className="size-11 rounded-xl shadow-[0_0_0_1px_oklch(1_0_0/0.12),0_8px_30px_-6px_var(--glow)]" />
          <div>
            <h1 className="text-gradient text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <div className="rounded-xl border bg-card/80 p-5 shadow-2xl shadow-black/10 backdrop-blur-xl">{children}</div>
      </div>
    </main>
  )
}
