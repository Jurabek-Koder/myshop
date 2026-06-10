import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import './ExpeditorMobileScanSession.css';

function stopMediaStream(stream) {
  if (!stream) return;
  try {
    stream.getTracks().forEach((track) => track.stop());
  } catch {
    /* ignore */
  }
}

function detachVideoElement(videoEl) {
  if (!videoEl) return;
  stopMediaStream(videoEl.srcObject);
  videoEl.srcObject = null;
}

async function attachVideoStream(videoEl, stream) {
  videoEl.srcObject = stream;
  videoEl.setAttribute('playsinline', 'true');
  videoEl.setAttribute('webkit-playsinline', 'true');
  videoEl.muted = true;
  try {
    await videoEl.play();
  } catch {
    /* ba’zi brauzerlarda play() keyin ishlaydi */
  }
}

/** Ekspeditor mobil: yarim panel — kamera + skanerlangan zakazlar navbati */
export default function ExpeditorMobileScanSession({
  open,
  onClose,
  onScan,
  scanQueue = [],
  title = 'Chek skanerlash',
}) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const streamRef = useRef(null);
  const readerRef = useRef(null);
  const scanLockRef = useRef(false);
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  const queueEndRef = useRef(null);
  const [error, setError] = useState('');
  const [scanMessage, setScanMessage] = useState('');
  const [ready, setReady] = useState(false);
  const [processing, setProcessing] = useState(false);

  onScanRef.current = onScan;
  onCloseRef.current = onClose;

  const teardownCamera = useCallback(() => {
    try {
      controlsRef.current?.stop();
    } catch {
      /* ignore */
    }
    controlsRef.current = null;
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    detachVideoElement(videoRef.current);
    readerRef.current = null;
    scanLockRef.current = false;
  }, []);

  const handleClose = useCallback(() => {
    teardownCamera();
    setProcessing(false);
    setScanMessage('');
    setReady(false);
    onCloseRef.current?.();
  }, [teardownCamera]);

  useEffect(() => {
    if (!open) {
      teardownCamera();
      setError('');
      setScanMessage('');
      setReady(false);
      setProcessing(false);
      return undefined;
    }

    let cancelled = false;
    setError('');
    setScanMessage('');
    setReady(false);
    setProcessing(false);
    scanLockRef.current = false;

    const reader = new BrowserMultiFormatReader(undefined, {
      delayBetweenScanAttempts: 150,
      delayBetweenScanSuccess: 900,
    });
    readerRef.current = reader;

    const startCamera = async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (cancelled) return;

      const video = videoRef.current;
      if (!video) {
        setError('Kamera maydoni tayyor emas. Qayta urinib ko‘ring.');
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Brauzer kamerani qo‘llab-quvvatlamaydi.');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        if (cancelled) {
          stopMediaStream(stream);
          return;
        }

        streamRef.current = stream;
        await attachVideoStream(video, stream);
        if (cancelled) return;

        const controls = await reader.decodeFromStream(stream, video, (result) => {
          if (!result || scanLockRef.current || cancelled) return;

          scanLockRef.current = true;
          setProcessing(true);
          setScanMessage('Biriktirilmoqda…');
          setError('');

          void (async () => {
            try {
              const outcome = await onScanRef.current(result.getText());
              if (cancelled) return;

              if (outcome?.action === 'close') {
                scanLockRef.current = false;
                setProcessing(false);
                onCloseRef.current?.();
                return;
              }

              setScanMessage(outcome?.message || '');
              setProcessing(false);
              scanLockRef.current = false;
            } catch {
              if (cancelled) return;
              setScanMessage('Xatolik. Qayta skanerlang.');
              setProcessing(false);
              scanLockRef.current = false;
            }
          })();
        });

        if (cancelled) {
          try {
            controls.stop();
          } catch {
            /* ignore */
          }
          return;
        }

        controlsRef.current = controls;
        setReady(true);
      } catch (e) {
        if (cancelled) return;
        const msg =
          e?.name === 'NotAllowedError'
            ? 'Kamera ruxsati berilmadi. Brauzer sozlamalaridan ruxsat bering.'
            : e?.name === 'NotFoundError'
              ? 'Qurilmada kamera topilmadi.'
              : e?.message || 'Kamera ochilmadi';
        setError(msg);
      }
    };

    void startCamera();

    return () => {
      cancelled = true;
      try {
        controlsRef.current?.stop();
      } catch {
        /* ignore */
      }
      controlsRef.current = null;
      stopMediaStream(streamRef.current);
      streamRef.current = null;
      detachVideoElement(videoRef.current);
      readerRef.current = null;
      scanLockRef.current = false;
    };
  }, [open, teardownCamera]);

  useEffect(() => {
    if (!open || scanQueue.length === 0) return;
    queueEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [open, scanQueue.length]);

  if (!open) return null;

  return (
    <section className="expeditor-mobile-scan-session" aria-label="Mobil skaner sessiyasi">
      <div className="expeditor-mobile-scan-session__camera">
        <header className="expeditor-mobile-scan-session__head">
          <h2 className="expeditor-mobile-scan-session__title">{title}</h2>
          <button
            type="button"
            className="expeditor-mobile-scan-session__close"
            onClick={handleClose}
            aria-label="Skanerni yopish"
            disabled={processing}
          >
            ×
          </button>
        </header>

        <div className="expeditor-mobile-scan-session__viewport">
          <video
            ref={videoRef}
            className="expeditor-mobile-scan-session__video"
            playsInline
            muted
            autoPlay
          />
          <div className="expeditor-mobile-scan-session__frame" aria-hidden />
          {processing ? (
            <div className="expeditor-mobile-scan-session__processing" aria-live="polite">
              {scanMessage || 'Biriktirilmoqda…'}
            </div>
          ) : null}
        </div>

        {error ? (
          <p className="expeditor-mobile-scan-session__msg expeditor-mobile-scan-session__msg--err" role="alert">
            {error}
          </p>
        ) : scanMessage && !processing ? (
          <p className="expeditor-mobile-scan-session__msg expeditor-mobile-scan-session__msg--warn" role="status">
            {scanMessage}
          </p>
        ) : (
          <p className="expeditor-mobile-scan-session__msg">
            {ready ? 'Chek shtrix-kodini ramka ichiga tuting' : 'Kamera ochilmoqda…'}
          </p>
        )}
      </div>

      <div className="expeditor-mobile-scan-session__queue">
        <header className="expeditor-mobile-scan-session__queue-head">
          <span className="expeditor-mobile-scan-session__queue-title">Skanerlangan zakazlar</span>
          <span className="expeditor-mobile-scan-session__queue-count">{scanQueue.length}</span>
        </header>
        <ol className="expeditor-mobile-scan-session__queue-list" aria-live="polite">
          {scanQueue.length === 0 ? (
            <li className="expeditor-mobile-scan-session__queue-empty">
              Skaner qiling — zakazlar shu yerda navbat bilan chiqadi
            </li>
          ) : (
            scanQueue.map((item, index) => (
              <li key={`${item.id}-${item.at}`} className="expeditor-mobile-scan-session__queue-item">
                <span className="expeditor-mobile-scan-session__queue-n">{index + 1}</span>
                <span className="expeditor-mobile-scan-session__queue-id">o-{item.id}</span>
                <span className="expeditor-mobile-scan-session__queue-badge">Kuryerga berildi</span>
              </li>
            ))
          )}
          <li ref={queueEndRef} className="expeditor-mobile-scan-session__queue-anchor" aria-hidden />
        </ol>
      </div>
    </section>
  );
}
