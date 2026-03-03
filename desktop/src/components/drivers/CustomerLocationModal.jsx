import { useState } from 'react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';
import api from '../../api';

/**
 * Shown when a delivery is being confirmed for a customer with no registered coordinates.
 * Guides the driver through: (1) save current GPS as customer location, (2) capture facade photo.
 * Calls onDone() when the flow is complete (regardless of what the driver chose).
 */
export default function CustomerLocationModal({ customerId, onDone }) {
  const [step, setStep] = useState('CONFIRM_LOCATION');
  // steps: CONFIRM_LOCATION | SAVING_LOCATION | CONFIRM_PHOTO | SAVING_PHOTO
  const [error, setError] = useState('');

  const handleSaveLocation = async () => {
    setStep('SAVING_LOCATION');
    setError('');
    try {
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
      await api.patch(`/customers/${customerId}/location`, {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
    } catch (err) {
      setError(String(err?.message || 'No se pudo guardar la ubicacion.'));
    }
    setStep('CONFIRM_PHOTO');
  };

  const handleCapturePhoto = async () => {
    setStep('SAVING_PHOTO');
    setError('');
    try {
      const photo = await Camera.getPhoto({
        quality: 60,
        width: 1280,
        height: 1280,
        resultType: CameraResultType.Base64,
        source: CameraSource.Prompt,
      });
      if (photo?.base64String) {
        const format = photo.format || 'jpeg';
        await api.post(`/customers/${customerId}/facade-photo`, {
          base64: photo.base64String,
          mimeType: `image/${format}`,
        });
      }
    } catch {
      // User cancelled or plugin not available — just proceed
    }
    onDone();
  };

  const overlay = (children) => (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-5">
        {children}
      </div>
    </div>
  );

  if (step === 'CONFIRM_LOCATION') {
    return overlay(
      <>
        <div className="text-xs font-black text-amber-300 uppercase tracking-widest">
          Sin ubicación exacta
        </div>
        <p className="text-sm text-zinc-200 leading-relaxed">
          Este cliente no tiene ubicación exacta cargada. ¿Desea guardar la ubicación actual como dirección del cliente?
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => setStep('CONFIRM_PHOTO')}
            className="flex-1 h-12 bg-zinc-800 hover:bg-zinc-700 active:scale-[0.98] text-zinc-300 rounded-xl font-bold uppercase text-xs tracking-wide transition-all"
          >
            No, continuar
          </button>
          <button
            onClick={handleSaveLocation}
            className="flex-1 h-12 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white rounded-xl font-bold uppercase text-xs tracking-wide transition-all"
          >
            Sí, guardar
          </button>
        </div>
      </>
    );
  }

  if (step === 'SAVING_LOCATION') {
    return overlay(
      <p className="text-sm text-zinc-300 text-center">Obteniendo ubicación GPS...</p>
    );
  }

  if (step === 'CONFIRM_PHOTO') {
    return overlay(
      <>
        {error ? (
          <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg p-3">
            {error}
          </div>
        ) : null}
        <div className="text-xs font-black text-amber-300 uppercase tracking-widest">
          Foto de fachada
        </div>
        <p className="text-sm text-zinc-200 leading-relaxed">
          ¿Desea fotografiar la fachada del negocio? La foto quedará visible para el administrador y cajero.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onDone}
            className="flex-1 h-12 bg-zinc-800 hover:bg-zinc-700 active:scale-[0.98] text-zinc-300 rounded-xl font-bold uppercase text-xs tracking-wide transition-all"
          >
            Omitir
          </button>
          <button
            onClick={handleCapturePhoto}
            className="flex-1 h-12 bg-cyan-700 hover:bg-cyan-600 active:scale-[0.98] text-white rounded-xl font-bold uppercase text-xs tracking-wide transition-all"
          >
            Fotografiar
          </button>
        </div>
      </>
    );
  }

  if (step === 'SAVING_PHOTO') {
    return overlay(
      <p className="text-sm text-zinc-300 text-center">Guardando foto...</p>
    );
  }

  return null;
}
