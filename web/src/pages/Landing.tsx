import { Link } from "react-router-dom";
import { ArrowRight, Check, Download, Link2, MessageCircle, Nfc, QrCode, RefreshCw, ScanLine, Star, Store, UtensilsCrossed } from "lucide-react";
import { api } from "../lib/api";
import { formatMoney } from "../lib/format";
import type { PlanInfo } from "../lib/types";
import { useAsync } from "../lib/useAsync";
import { Logo } from "../components/Logo";
import { ThemeToggle } from "../components/ThemeToggle";
import { buttonClass, cx } from "../components/ui";

const STEPS = [
  { icon: QrCode, title: "Crie o seu QR Code", text: "Dê um nome e cole o link: avaliação do Google, WhatsApp, Instagram ou cardápio." },
  { icon: Download, title: "Baixe e imprima", text: "Arquivo em alta resolução (PNG ou SVG) pronto para a gráfica, adesivo ou plaquinha." },
  { icon: RefreshCw, title: "Troque o link quando quiser", text: "Mudou a promoção? Troque o destino no painel. O QR Code impresso continua o mesmo." },
];

const USES = [
  { icon: Star, title: "Avaliações no Google", text: "O cliente aponta a câmera e cai direto na tela de avaliar." },
  { icon: MessageCircle, title: "WhatsApp", text: "Abre a conversa com o seu número, sem digitar nada." },
  { icon: UtensilsCrossed, title: "Cardápio e promoções", text: "Atualize o cardápio sem trocar a plaquinha da mesa." },
  { icon: Store, title: "Instagram e site", text: "Leve quem está na loja para as suas redes." },
];

function PhoneMock() {
  return (
    <div className="relative mx-auto w-full max-w-sm" aria-hidden>
      <div className="absolute -inset-6 rounded-[2.5rem] bg-gradient-to-br from-brand-400/30 via-brand-200/20 to-transparent blur-2xl" />
      <div className="relative grid grid-cols-[1fr_auto] items-center gap-4">
        {/* Plaquinha */}
        <div className="rotate-[-4deg] rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl">
          <p className="text-center text-xs font-semibold uppercase tracking-wider text-brand-600">Avalie a gente</p>
          <div className="qr-surface mx-auto mt-3 grid size-32 grid-cols-7 gap-0.5 rounded-lg bg-white p-2">
            {QR_PATTERN.map((on, i) => (
              <span key={i} className={cx("rounded-[2px]", on ? "bg-[#111]" : "bg-transparent")} />
            ))}
          </div>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-zinc-500">
            <Nfc className="size-3.5" /> Aproxime ou escaneie
          </p>
        </div>
        {/* Celular */}
        <div className="w-36 rotate-[5deg] rounded-[1.6rem] border-4 border-zinc-800 bg-zinc-800 shadow-2xl sm:w-40">
          <div className="overflow-hidden rounded-[1.2rem] bg-white">
            <div className="flex items-center gap-1.5 border-b border-zinc-100 px-3 py-2">
              <Link2 className="size-3 text-zinc-400" />
              <span className="truncate text-[10px] text-zinc-500">g.page/r/sua-loja/review</span>
            </div>
            <div className="space-y-2 p-3">
              <div className="flex gap-0.5 text-amber-500">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Star key={i} className="size-4 fill-current" />
                ))}
              </div>
              <div className="h-2 w-4/5 rounded bg-zinc-200" />
              <div className="h-2 w-3/5 rounded bg-zinc-200" />
              <div className="h-12 rounded-md border border-zinc-200" />
              <div className="h-6 rounded-md bg-brand-600" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Desenho ilustrativo (7x7). Não é um QR Code de verdade.
const QR_PATTERN = [
  1, 1, 1, 0, 1, 1, 1,
  1, 0, 1, 0, 1, 0, 1,
  1, 1, 1, 1, 1, 1, 1,
  0, 1, 0, 1, 0, 0, 1,
  1, 1, 1, 0, 1, 1, 0,
  1, 0, 1, 1, 0, 1, 1,
  1, 1, 1, 0, 1, 0, 1,
].map(Boolean);

export function LandingPage() {
  const { data: plan } = useAsync(() => api<PlanInfo>("/billing/plan"), []);
  const price = plan ? formatMoney(plan.priceCents) : "R$ 9,90";
  const signupOpen = plan?.signupEnabled ?? true;

  const Cta = ({ className }: { className?: string }) =>
    signupOpen ? (
      <Link to="/cadastro" className={cx(buttonClass("primary"), "h-12 px-6 text-base", className)}>
        Começar por {price}/mês <ArrowRight className="size-4" aria-hidden />
      </Link>
    ) : (
      <span className={cx(buttonClass("secondary"), "h-12 cursor-default px-6 text-base", className)}>Cadastros abrem em breve</span>
    );

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-zinc-200/70 bg-stone-100/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:px-6">
          <Link to="/inicio" aria-label="Plaquinhas, página inicial">
            <Logo />
          </Link>
          <nav className="ml-auto flex items-center gap-1 sm:gap-2" aria-label="Principal">
            <a href="#como-funciona" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 md:inline">
              Como funciona
            </a>
            <a href="#plano" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 md:inline">
              Preço
            </a>
            <ThemeToggle />
            <Link to="/login" className={buttonClass("ghost", "sm")}>
              Entrar
            </Link>
            {signupOpen && (
              <Link to="/cadastro" className={cx(buttonClass("primary", "sm"), "hidden sm:inline-flex")}>
                Criar conta
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main>
        {/* Destaque */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-12 sm:px-6 md:grid-cols-2 md:pt-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-600/15">
              <ScanLine className="size-3.5" aria-hidden /> QR Code e NFC para o seu negócio
            </p>
            <h1 className="mt-5 text-4xl font-bold leading-[1.1] tracking-tight text-zinc-900 sm:text-5xl">
              Imprima uma vez. <span className="text-brand-600">Troque o link</span> quando quiser.
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-zinc-600">
              Crie QR Codes para avaliações no Google, WhatsApp, cardápio ou Instagram. Se o link mudar, você atualiza no
              painel e a plaquinha impressa continua funcionando.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Cta />
              <a href="#como-funciona" className={cx(buttonClass("secondary"), "h-12 px-6 text-base")}>
                Ver como funciona
              </a>
            </div>
            <p className="mt-4 text-sm text-zinc-500">Pague por Pix ou cartão. Sem fidelidade: renove só se quiser.</p>
          </div>
          <PhoneMock />
        </section>

        {/* Como funciona */}
        <section id="como-funciona" className="scroll-mt-20 border-y border-zinc-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-center text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">Como funciona</h2>
            <p className="mx-auto mt-2 max-w-xl text-center text-zinc-600">Três passos, sem instalar nada.</p>
            <ol className="mt-10 grid gap-6 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="relative rounded-2xl border border-zinc-200 bg-stone-50 p-6">
                  <span className="absolute right-5 top-5 text-sm font-bold text-zinc-300">{i + 1}</span>
                  <span className="flex size-11 items-center justify-center rounded-xl bg-brand-600 text-white">
                    <s.icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 font-semibold text-zinc-900">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Usos */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-center text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">Para que você pode usar</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {USES.map((u) => (
              <div key={u.title} className="rounded-2xl border border-zinc-200 bg-white p-5">
                <u.icon className="size-6 text-brand-600" aria-hidden />
                <h3 className="mt-3 font-semibold text-zinc-900">{u.title}</h3>
                <p className="mt-1 text-sm text-zinc-600">{u.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Plano */}
        <section id="plano" className="scroll-mt-20 border-t border-zinc-200 bg-white">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 md:grid-cols-2">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">Um plano simples</h2>
              <p className="mt-3 max-w-md text-zinc-600">
                Um valor por mês, com tudo incluído. O pagamento é feito pela InfinitePay (Pix ou cartão) e o acesso é liberado
                assim que o pagamento é confirmado.
              </p>
              <dl className="mt-8 space-y-5 text-sm">
                <div>
                  <dt className="font-semibold text-zinc-900">Como renovo?</dt>
                  <dd className="mt-1 text-zinc-600">
                    A cobrança não é automática. Perto do vencimento o painel avisa e você paga o próximo mês com um toque.
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-zinc-900">E se eu esquecer de pagar?</dt>
                  <dd className="mt-1 text-zinc-600">
                    Seus QR Codes continuam funcionando por mais {plan?.graceDays ?? 3} dias. Depois disso mostram um aviso até você renovar, e voltam
                    a funcionar na hora, sem reimprimir.
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-zinc-900">Funciona com NFC?</dt>
                  <dd className="mt-1 text-zinc-600">Sim. Grave o endereço do seu QR Code na etiqueta NFC e ela segue o mesmo link.</dd>
                </div>
              </dl>
            </div>
            <div className="rounded-3xl border-2 border-brand-600 bg-white p-8 shadow-xl shadow-brand-600/10">
              <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">Plano mensal</p>
              <p className="mt-3 flex items-baseline gap-1">
                <span className="text-5xl font-bold tracking-tight text-zinc-900">{price}</span>
                <span className="text-zinc-500">/mês</span>
              </p>
              <ul className="mt-6 space-y-3 text-sm text-zinc-700">
                {[
                  `Até ${plan?.maxPlates ?? 20} QR Codes`,
                  "Troque o link quantas vezes quiser",
                  "Arquivos para impressão em alta resolução",
                  "Histórico de cada troca de link",
                  "Funciona no celular, com modo claro e escuro",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden /> {f}
                  </li>
                ))}
              </ul>
              <Cta className="mt-8 w-full" />
              <p className="mt-3 text-center text-xs text-zinc-500">Já tem conta? <Link to="/login" className="font-medium text-brand-600 hover:underline">Entrar</Link></p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-200">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-zinc-500 sm:flex-row sm:px-6">
          <Logo className="opacity-80" />
          <p>Pagamentos processados pela InfinitePay.</p>
        </div>
      </footer>
    </div>
  );
}
