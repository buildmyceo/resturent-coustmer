'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Camera, RefreshCw, CheckCircle2, AlertCircle, FlipHorizontal } from 'lucide-react';
import { playTap } from '@/lib/audio';
import jsQR from 'jsqr';

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  restaurantSlug?: string;
}

export function QRScannerModal({ isOpen, onClose, restaurantSlug = 'barista-pum1' }: QRScannerModalProps) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [scannedResult, setScannedResult] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Stop camera stream safely
  const stopCamera = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsScanning(false);
  };

  // Start camera stream
  const startCamera = async (mode: 'environment' | 'user') => {
    stopCamera();
    setCameraError(null);
    setScannedResult(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('Camera access is not supported by your browser. Please allow camera permissions.');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play().catch(() => {});
        setIsScanning(true);
        requestAnimationFrame(scanVideoFrame);
      }
    } catch (err: any) {
      console.warn('Camera start error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('Camera permission was denied. Please allow camera access in your browser settings to scan the QR code.');
      } else {
        setCameraError('Unable to open camera. Please ensure another app is not using it.');
      }
    }
  };

  // Continuous frame scanner via requestAnimationFrame
  const scanVideoFrame = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
      });

      if (code && code.data) {
        handleQRDetected(code.data);
        return; // stop scanning after detect
      }
    }

    animFrameRef.current = requestAnimationFrame(scanVideoFrame);
  };

  // Parse detected QR data and navigate
  const handleQRDetected = (rawText: string) => {
    stopCamera();
    playTap();

    let cleanToken = rawText.trim();

    // If it's a full URL e.g. https://domain.com/barista-pum1/T-01/zv_barista-pum1_tt01_1693d7f6
    try {
      if (cleanToken.startsWith('http://') || cleanToken.startsWith('https://')) {
        const parsed = new URL(cleanToken);
        // Direct relative redirect if on same domain or path
        onClose();
        router.push(parsed.pathname);
        return;
      }
    } catch {
      // Non-blocking
    }

    setScannedResult(cleanToken);

    setTimeout(() => {
      onClose();
      router.push(`/qr/${cleanToken}`);
    }, 400);
  };

  useEffect(() => {
    if (isOpen) {
      startCamera(facingMode);
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen, facingMode]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl border border-slate-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Scan Table QR</h3>
              <p className="text-[11px] text-slate-400">Point your camera at the table QR code</p>
            </div>
          </div>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Camera Viewfinder Body */}
        <div className="p-5 space-y-3">
          <div className="relative aspect-square w-full rounded-2xl overflow-hidden bg-slate-900 flex items-center justify-center shadow-inner">
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              playsInline
              muted
            />
            <canvas ref={canvasRef} className="hidden" />

            {/* Viewfinder Overlay */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-48 h-48 border-2 border-blue-400/80 rounded-2xl relative shadow-2xl">
                {/* Viewfinder Corners */}
                <div className="absolute top-0 left-0 w-5 h-5 border-t-4 border-l-4 border-blue-500 rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-5 h-5 border-t-4 border-r-4 border-blue-500 rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-5 h-5 border-b-4 border-l-4 border-blue-500 rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-5 h-5 border-b-4 border-r-4 border-blue-500 rounded-br-lg" />

                {/* Animated Scanning Beam */}
                {isScanning && (
                  <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-blue-400 to-transparent shadow-lg shadow-blue-400 animate-pulse" />
                )}
              </div>
            </div>

            {/* Camera Flip Button */}
            <button
              type="button"
              onClick={() => {
                const nextMode = facingMode === 'environment' ? 'user' : 'environment';
                setFacingMode(nextMode);
                startCamera(nextMode);
              }}
              className="absolute bottom-3 right-3 p-2 rounded-xl bg-black/60 text-white hover:bg-black/80 backdrop-blur-xs transition-colors"
              title="Flip camera"
            >
              <FlipHorizontal className="w-4 h-4" />
            </button>

            {/* Scanned Badge */}
            {scannedResult && (
              <div className="absolute inset-0 bg-emerald-600/90 backdrop-blur-xs flex flex-col items-center justify-center text-white p-4 text-center">
                <CheckCircle2 className="w-10 h-10 mb-2 animate-bounce" />
                <span className="font-bold text-sm">Table Code Detected!</span>
                <span className="text-xs opacity-90 font-mono mt-1 truncate max-w-[200px]">
                  {scannedResult}
                </span>
              </div>
            )}

            {/* Camera Error */}
            {cameraError && (
              <div className="absolute inset-0 bg-slate-900/95 flex flex-col items-center justify-center p-6 text-center text-white space-y-2">
                <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
                <p className="text-xs text-slate-300 leading-relaxed max-w-[240px]">{cameraError}</p>
                <button
                  onClick={() => startCamera(facingMode)}
                  className="mt-2 text-xs font-bold bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-xl flex items-center gap-1.5 mx-auto"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Try Again</span>
                </button>
              </div>
            )}
          </div>

          <p className="text-[11px] text-center text-slate-500">
            Hold your smartphone camera steady over the QR code on your dining table.
          </p>
        </div>
      </div>
    </div>
  );
}
