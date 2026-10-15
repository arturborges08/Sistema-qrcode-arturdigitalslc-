import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, CameraOff, ScanLine } from "lucide-react";
import { api } from "../lib/api";
import { Button, Card, CardHeader, Field, Input, PageHeader } from "../components/ui";

/** Extrai o código de uma leitura: aceita a URL completa (…/r/CODIGO) ou só o código. */
export function extractCode(text: string): string | null {
  const t = text.trim();
  if (/^[A-Za-z0-9]{4,32}$/.test(t)) return t;
  try {
    const m = /^\/r\/([A-Za-z0-9]{4,32})\/?$/.exec(new URL(t).pathname);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

interface ScanTarget {
  id: string;
  configured: boolean;
}

const ownerLookup = (code: string) => api<ScanTarget>(`/plates/by-code/${encodeURIComponent(code)}`);
const ownerPath = (p: ScanTarget) => `/plaquinhas/${p.id}${p.configured ? "" : "?configurar=1"}`;

export function ScanPage({
  lookup = ownerLookup,
  pathFor = ownerPath,
  description = "Aponte a câmera para o QR Code para abrir a plaquinha e definir ou trocar o link.",
}: {
  lookup?: (code: string) => Promise<ScanTarget>;
  pathFor?: (p: ScanTarget) => string;
  description?: string;
}) {
  const nav = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"idle" | "starting" | "scanning" | "denied" | "unsupported">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const busy = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);

  function stop() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }
  useEffect(() => stop, []);

  async function open(code: string) {
    if (busy.current) return;
    busy.current = true;
    setMessage("Procurando plaquinha…");
    try {
      const plate = await lookup(code);
      stop();
      nav(pathFor(plate));
    } catch (e) {
      setMessage((e as Error).message);
      setTimeout(() => (busy.current = false), 1500);
    }
  }

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) return setState("unsupported");
    setState("starting");
    setMessage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      setState("scanning");
      const { default: jsQR } = await import("jsqr");
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      const tick = () => {
        if (!streamRef.current) return;
        if (video.readyState >= 2 && video.videoWidth > 0) {
          const scale = Math.min(1, 640 / video.videoWidth);
          canvas.width = Math.round(video.videoWidth * scale);
          canvas.height = Math.round(video.videoHeight * scale);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const result = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
          if (result?.data && !busy.current) {
            const code = extractCode(result.data);
            if (code) void open(code);
            else setMessage("Este QR Code não é de uma plaquinha do sistema.");
          }
        }
        setTimeout(() => requestAnimationFrame(tick), 120);
      };
      tick();
    } catch (e) {
      const name = (e as DOMException).name;
      setState(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unsupported");
    }
  }

  function onManual(e: FormEvent) {
    e.preventDefault();
    const code = extractCode(manual);
    if (!code) return setMessage("Digite o código impresso abaixo do QR ou cole o endereço completo.");
    void open(code);
  }

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Escanear plaquinha" description={description} />
      <Card>
        <div className="relative aspect-square overflow-hidden rounded-t-xl bg-zinc-900">
          <video ref={videoRef} playsInline muted className={state === "scanning" ? "size-full object-cover" : "hidden"} />
          <canvas ref={canvasRef} className="hidden" />
          {state === "scanning" ? (
            <div className="pointer-events-none absolute inset-[18%] rounded-2xl border-2 border-white/80" aria-hidden />
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-4 p-6 text-center text-zinc-300">
              {state === "denied" ? <CameraOff className="size-8" aria-hidden /> : <ScanLine className="size-8" aria-hidden />}
              <p className="max-w-xs text-sm">
                {state === "denied"
                  ? "O acesso à câmera foi negado. Libere a câmera para este site nas configurações do navegador ou digite o código abaixo."
                  : state === "unsupported"
                    ? "Não foi possível usar a câmera neste navegador. Digite o código abaixo."
                    : "A câmera só é usada enquanto esta tela estiver aberta."}
              </p>
              {(state === "idle" || state === "denied") && (
                <Button variant="primary" onClick={start} icon={<Camera className="size-4" />}>
                  Abrir câmera
                </Button>
              )}
              {state === "starting" && <p className="text-sm">Abrindo câmera…</p>}
            </div>
          )}
        </div>
        {message && (
          <p className="border-t border-zinc-100 px-5 py-3 text-sm text-zinc-700" role="status">
            {message}
          </p>
        )}
      </Card>
      <Card className="mt-6">
        <CardHeader title="Ou digite o código" description="É o código de 8 caracteres impresso abaixo do QR Code." />
        <form onSubmit={onManual} className="flex flex-col gap-2 p-5 sm:flex-row sm:items-end" noValidate>
          <div className="flex-1">
            <Field label="Código" htmlFor="code">
              <Input id="code" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Ex.: a8K3mPzQ" />
            </Field>
          </div>
          <Button type="submit">Abrir</Button>
        </form>
      </Card>
    </div>
  );
}
