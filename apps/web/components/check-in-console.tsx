'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { ApiError, api, getToken } from '../lib/api';
import styles from './check-in-console.module.css';

type Result = { protocol: string; checkedInAt: string; alreadyCheckedIn: boolean };
type Detector = { detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>> };
type DetectorConstructor = new (options: { formats: string[] }) => Detector;

export default function CheckInConsole({ eventId }: { eventId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const scanningRef = useRef(false);
  const startingCameraRef = useRef(false);
  const mountedRef = useRef(true);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    mountedRef.current = true;
    inputRef.current?.focus();
    return () => {
      mountedRef.current = false;
      scanningRef.current = false;
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  function stopCamera() {
    scanningRef.current = false;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  }

  async function register(value: string) {
    const normalized = value.trim();
    if (!normalized || busyRef.current) return;
    if (!getToken()) { window.location.assign('/login'); return; }
    busyRef.current = true;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const response = await api<Result>(`/events/${encodeURIComponent(eventId)}/check-in`, {
        method: 'POST',
        body: JSON.stringify({ code: normalized }),
      });
      setResult(response);
      setCode('');
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        window.location.assign('/login');
        return;
      }
      setError(caught instanceof Error ? caught.message : 'Não foi possível registrar a entrada.');
    } finally {
      busyRef.current = false;
      setBusy(false);
      if (!scanningRef.current) inputRef.current?.focus();
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void register(code);
  }

  async function startCamera() {
    if (startingCameraRef.current || streamRef.current) return;
    startingCameraRef.current = true;
    setCameraError('');
    const CameraDetector = (window as Window & { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
    if (!CameraDetector || !navigator.mediaDevices?.getUserMedia) {
      setCameraError('Leitura pela câmera indisponível neste navegador. Use o leitor óptico ou digite o código.');
      startingCameraRef.current = false;
      return;
    }
    try {
      const detector = new CameraDetector({ formats: ['qr_code'] });
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false, video: { facingMode: { ideal: 'environment' } },
      });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      setCameraOn(true);
      // The video element mounts after the state update; defer attaching the stream until then.
      requestAnimationFrame(() => {
        const video = videoRef.current;
        if (!video || streamRef.current !== stream) {
          stream.getTracks().forEach((track) => track.stop());
          if (streamRef.current === stream) stopCamera();
          return;
        }
        const activeVideo: HTMLVideoElement = video;
        activeVideo.srcObject = stream;
        void activeVideo.play().then(() => {
          if (streamRef.current !== stream) return;
          scanningRef.current = true;
          async function scan() {
            if (!scanningRef.current) return;
            try {
              const matches = await detector.detect(activeVideo);
              if (!scanningRef.current) return;
              const scanned = matches.find((match) => match.rawValue.trim())?.rawValue;
              if (scanned) {
                stopCamera();
                void register(scanned);
                return;
              }
            } catch {
              if (!scanningRef.current) return;
              stopCamera();
              setCameraError('A leitura da câmera foi interrompida. Use o código manual ou tente novamente.');
              return;
            }
            if (scanningRef.current) frameRef.current = requestAnimationFrame(() => { void scan(); });
          }
          void scan();
        }).catch(() => {
          if (streamRef.current !== stream) return;
          stopCamera();
          setCameraError('Não foi possível iniciar a câmera. Use o código manual.');
        });
      });
    } catch {
      if (!mountedRef.current) return;
      stopCamera();
      setCameraError('Câmera indisponível ou permissão negada. Use o leitor óptico ou digite o código.');
    } finally {
      startingCameraRef.current = false;
    }
  }

  return <main className={styles.page}>
    <Link className={styles.back} href={`/eventos/${encodeURIComponent(eventId)}/painel`}>← Voltar ao painel do evento</Link>
    <header className={styles.header}>
      <p className="eyebrow">Operação do evento</p>
      <h1>Check-in de participantes</h1>
      <p>Leia o QR da credencial ou informe o código. A entrada só é registrada para inscrições confirmadas deste evento.</p>
    </header>
    <div className={styles.layout}>
      <section className={styles.panel} aria-labelledby="reading-title">
        <h2 id="reading-title">Ler credencial</h2>
        <p className={styles.hint}>Leitores ópticos que digitam o código funcionam no campo abaixo. Pressione Enter para registrar.</p>
        <form onSubmit={submit} className={styles.form}>
          <label htmlFor="credential-code">Código da credencial</label>
          <input id="credential-code" className="input input-large" ref={inputRef}
            autoComplete="off" autoCapitalize="off" spellCheck={false} required
            value={code} onChange={(event) => setCode(event.target.value)} />
          <button className="btn btn-primary" type="submit" disabled={busy || !code.trim()}>
            {busy ? 'Validando entrada…' : 'Registrar entrada'}
          </button>
        </form>
        <div className={styles.camera}>
          <h3>Câmera do dispositivo</h3>
          <p className={styles.hint}>Aponte para o QR. A câmera é ligada apenas quando você solicitar e para após a leitura.</p>
          {cameraOn && <video ref={videoRef} className={styles.video} muted playsInline aria-label="Imagem ao vivo da câmera para leitura do QR" />}
          <button className="btn btn-secondary" type="button" disabled={busy} onClick={cameraOn ? stopCamera : () => { void startCamera(); }}>
            {cameraOn ? 'Desligar câmera' : 'Ler QR pela câmera'}
          </button>
          {cameraError && <p className={styles.notice} role="alert">{cameraError}</p>}
        </div>
      </section>
      <section className={styles.panel} aria-labelledby="outcome-title">
        <h2 id="outcome-title">Resultado da leitura</h2>
        {error && <div role="alert" className={styles.denied}>
          <strong>Entrada não registrada</strong>
          <p>{error}</p>
        </div>}
        {result && <div role="status" aria-live="polite" className={result.alreadyCheckedIn ? styles.repeat : styles.accepted}>
          <strong>{result.alreadyCheckedIn ? 'Entrada já registrada' : 'Entrada autorizada'}</strong>
          <p>Protocolo: {result.protocol}</p>
          <p>Registro: {new Date(result.checkedInAt).toLocaleString('pt-BR')}</p>
        </div>}
        {!error && !result && <p className={styles.empty} role="status">Aguardando uma credencial. O resultado aparece aqui após a validação.</p>}
        <p className={styles.privacy}>A decisão é validada no servidor e registrada para auditoria. Não fotografe nem salve documentos pessoais neste dispositivo.</p>
      </section>
    </div>
  </main>;
}
