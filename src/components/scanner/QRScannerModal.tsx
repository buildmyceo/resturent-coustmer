'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Camera, RefreshCw, Sparkles, ArrowRight, CheckCircle2, AlertCircle, FlipHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { playTap } from '@/lib/audio';
import jsQR from 'jsqr';

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  restaurantSlug?: string;
}

export function QRScannerModal({ isOpen, onClose, restaurantSlug = 'bikaner-w7bt' }: QRScannerModalProps) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [activeTab, setActiveTab] = useState<'camera' | 'manual'>('camera');
  const [manualToken, setManualToken] = useState('');
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
        setCameraError('Camera access is not supported by your browser. Please enter the table code manually.');
        setActiveTab('manual');
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
        await videoRef.current.play();
        setIsScanning(true);
        requestAnimationFrame(scanVideoFrame);
      }
    } catch (err: any) {
      console.warn('Camera stream error:', err);
      setCameraError(
        err?.name === 'NotAllowedError'
          ? 'Camera permission was denied. Please allow camera access or type the table code below.'
          : 'Unable to start camera. Please enter table code manually.'
      );
      setActiveTab('manual');
    }
  };

  // Frame processing loop using jsQR
  const scanVideoFrame = () => {
    if (!videoRef.current || !canvasRef.current || !streamRef.current) return;

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
        handleCodeDetected(code.data);
        return; // Stop scanning loop on detection
      }
    }

    animFrameRef.current = requestAnimationFrame(scanVideoFrame);
  };

  // Parse and navigate upon detecting a QR code
  const handleCodeDetected = (rawCode: string) => {
    stopCamera();
    playTap();
    setScannedResult(rawCode);

    let cleanToken = rawCode.trim();

    // If it's a full URL, extract the token or path
    try {
      if (cleanToken.startsWith('http://') || cleanToken.startsWith('https://')) {
        const url = new URL(cleanToken);
        const pathSegments = url.pathname.split('/').filter(Boolean);
        // e.g. /qr/TOKEN -> TOKEN
        // e.g. /bikaner-w7bt/T-01/TOKEN -> redirect to full path
        if (pathSegments.includes('qr') && pathSegments.length >= 2) {
          cleanToken = pathSegments[pathSegments.indexOf('qr') + 1];
        } else if (pathSegments.length >= 3) {
          // Direct table route /slug/table/token
          setTimeout(() => {
            onClose();
            router.push(url.pathname);
          }, 400);
          return;
        }
      }
    } catch {
      // Non-blocking
    }

    setTimeout(() => {
      onClose();
      // Navigate to table resolver
      if (cleanToken.startsWith('zv_') && cleanToken.includes('_t')) {
        // e.g. zv_bikanerw7bt_tT01
        router.push(`/qr/${cleanToken}`);
      } else {
        router.push(`/qr/${cleanToken}`);
      }
    }, 400);
  };

  // Handle manual token submit
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualToken.trim()) return;
    playTap();
    onClose();
    router.push(`/qr/${manualToken.trim()}`);
  };

  useEffect(() => {
    if (isOpen) {
      if (activeTab === 'camera') {
        startCamera(facingMode);
      }
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen, activeTab, facingMode]);

  if (!isOpen) return null;

  const quickTables = [
    { label: 'Table T-01 (Main Dining)', token: 'zv_bikanerw7bt_tT01' },
    { label: 'Table T-02 (Booth 2)', token: 'zv_bikanerw7bt_tT02' },
    { label: 'Table T-03 (Patio Table)', token: 'zv_bikanerw7bt_tT03' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl border border-slate-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Scan Table QR</h3>
              <p className="text-[11px] text-slate-400">Point at table code or enter token</p>
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

        {/* Tab Switcher */}
        <div className="grid grid-cols-2 gap-1 p-2 bg-slate-100/70 border-b border-slate-100">
          <button
            onClick={() => {
              setActiveTab('camera');
              startCamera(facingMode);
            }}
            className={`py-2 text-xs font-bold rounded-xl transition-all ${
              activeTab === 'camera'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Camera Scanner
          </button>
          <button
            onClick={() => {
              stopCamera();
              setActiveTab('manual');
            }}
            className={`py-2 text-xs font-bold rounded-xl transition-all ${
              activeTab === 'manual'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Enter Code
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {activeTab === 'camera' ? (
            <div className="space-y-3">
              {/* Camera Viewfinder */}
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

                {/* Camera Error / Fallback */}
                {cameraError && (
                  <div className="absolute inset-0 bg-slate-900/95 flex flex-col items-center justify-center p-6 text-center text-white">
                    <AlertCircle className="w-8 h-8 text-amber-400 mb-2" />
                    <p className="text-xs text-slate-300 mb-3">{cameraError}</p>
                    <button
                      onClick={() => setActiveTab('manual')}
                      className="text-xs font-bold bg-blue-600 px-4 py-2 rounded-xl"
                    >
                      Type Table Code Instead
                    </button>
                  </div>
                )}
              </div>

              <p className="text-[11px] text-center text-slate-500">
                Hold your camera steady over the QR code on your dining table.
              </p>
            </div>
          ) : (
            <form onSubmit={handleManualSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Table Code or Token
                </label>
                <input
                  type="text"
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  placeholder="e.g. zv_bikanerw7bt_tT01 or T-01"
                  autoFocus
                  className="w-full text-xs font-mono p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50 focus:bg-white transition-all text-slate-900"
                />
              </div>

              <Button type="submit" size="lg" className="w-full gap-2">
                <span>Open Restaurant Menu</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </form>
          )}

          {/* Quick Demo Table Links */}
          <div className="pt-3 border-t border-slate-100">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-blue-500" />
              <span>Sample Dining Tables</span>
            </div>
            <div className="space-y-1.5">
              {quickTables.map((t) => (
                <button
                  key={t.token}
                  onClick={() => {
                    stopCamera();
                    playTap();
                    onClose();
                    router.push(`/qr/${t.token}`);
                  }}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-blue-50/60 border border-slate-100 text-left text-xs transition-colors group"
                >
                  <span className="font-medium text-slate-700 group-hover:text-blue-600">
                    {t.label}
                  </span>
                  <span className="text-[10px] font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                    Open Table
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
