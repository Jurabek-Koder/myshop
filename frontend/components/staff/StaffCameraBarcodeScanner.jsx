import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserCodeReader, BrowserMultiFormatReader } from '@zxing/browser';
import './StaffCameraBarcodeScanner.css';

function stopVideoElement(videoEl) {
  if (!videoEl) return;
  try {
    const stream = videoEl.srcObject;
    if (stream instanceof MediaStream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    BrowserCodeReader.cleanVideoSource(videoEl);
  } catch {
    videoEl.srcObject = null;
  }
}

/** Mobil kamera orqali chek shtrix-kodi / QR skanerlash */
export default function StaffCameraBarcodeScanner({
  open,
  onClose,
  onScan,
  title = 'Chekni skanerlang',
  hint = 'Sklat chekidagi shtrix-kodni ramka ichiga joylang',
}) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const readerRef = useRef(null);
  const scanLockRef = useRef(false);
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  const [error, setError] = useState('');
  const [scanMessage, setScanMessage] = useState('');
  const [ready, setReady] = useState(false);
  const [processing, setProcessing] = useState(false);

  onScanRef.current = onScan;
  onCloseRef.current = onClose;

  const stopScanner = useCallback(() => {
    try {
      controlsRef.current?.stop();
    } catch {
      /* ignore */
    }
    controlsRef.current = null;
    try {
      BrowserCodeReader.releaseAllStreams();
    } catch {
      /* ignore */
    }
    stopVideoElement(videoRef.current);
    readerRef.current = null;
    scanLockRef.current = false;
  }, []);

  const handleClose = useCallback(() => {
    stopScanner();
    setProcessing(false);
    setScanMessage('');
    onCloseRef.current?.();
  }, [stopScanner]);

  useEffect(() => {
    if (!open) {
      stopScanner();
      setError('');
      setScanMessage('');
      setReady(false);
      setProcessing(false);
      return undefined;
    }

    stopScanner();
    setError('');
    setScanMessage('');
    setReady(false);
    setProcessing(false);

    const reader = new BrowserMultiFormatReader(undefined, {
      delayBetweenScanAttempts: 120,
      delayBetweenScanSuccess: 900,
    });
    readerRef.current = reader;
    let cancelled = false;

    void (async () => {
      try {
        const controls = await reader.decodeFromConstraints(
          {
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          },
          videoRef.current,
          (result) => {
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
                  try {
                    controls.stop();
                  } catch {
                    /* ignore */
                  }
                  controlsRef.current = null;
                  scanLockRef.current = false;
                  setProcessing(false);
                  onCloseRef.current?.();
                  return;
                }

                setScanMessage(outcome?.message || 'Qayta skanerlang.');
                setProcessing(false);
                scanLockRef.current = false;
              } catch {
                if (cancelled) return;
                setScanMessage('Xatolik. Qayta skanerlang.');
                setProcessing(false);
                scanLockRef.current = false;
              }
            })();
          },
        );
        if (cancelled) {
          controls.stop();
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
    })();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [open, stopScanner]);

  if (!open) return null;

  return (
    <div
      className="staff-camera-scanner-overlay"
      role="presentation"
      onClick={handleClose}
    >
      <div
        className="staff-camera-scanner-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="staff-camera-scanner-title"
        onClick={(ev) => ev.stopPropagation()}
      >
        <header className="staff-camera-scanner-head">
          <h2 id="staff-camera-scanner-title">{title}</h2>
          <button
            type="button"
            className="staff-camera-scanner-close"
            onClick={handleClose}
            aria-label="Yopish"
            disabled={processing}
          >
            ×
          </button>
        </header>

        <div className="staff-camera-scanner-viewport">
          <video
            ref={videoRef}
            className="staff-camera-scanner-video"
            playsInline
            muted
            autoPlay
          />
          <div className="staff-camera-scanner-frame" aria-hidden />
          {processing ? (
            <div className="staff-camera-scanner-processing" aria-live="polite">
              {scanMessage || 'Biriktirilmoqda…'}
            </div>
          ) : null}
        </div>

        {error ? (
          <p className="staff-camera-scanner-error" role="alert">
            {error}
          </p>
        ) : scanMessage && !processing ? (
          <p className="staff-camera-scanner-warn" role="status">
            {scanMessage}
          </p>
        ) : (
          <p className="staff-camera-scanner-hint">
            {ready ? hint : 'Kamera ochilmoqda…'}
          </p>
        )}

        <button
          type="button"
          className="staff-camera-scanner-cancel"
          onClick={handleClose}
          disabled={processing}
        >
          Bekor qilish
        </button>
      </div>
    </div>
  );
}
