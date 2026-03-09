import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { io } from 'socket.io-client';
import CustomerLocationModal from './drivers/CustomerLocationModal';
import TrackingPlugin from '../plugins/TrackingPlugin';

import api, { socketOrigin, apiOrigin } from '../api';

const DEFAULT_FINAL_PAYMENT = {
  method: 'EFECTIVO',
  cashAmount: '',
  transferAmount: '',
  proofImageBase64: '',
  proofImageMimeType: '',
  proofImageName: '',
};

const requiresProof = (method) => method === 'TRANSFERENCIA' || method === 'MIXTO';
const isPrepaidDeliveryPayment = (deliveryPayment) => {
  const normalized = String(deliveryPayment || '').toUpperCase();
  return normalized === 'PAGADO_LOCAL' || normalized === 'TRANSFER_PREVIA';
};

const getPaymentMethodLabel = (method) => {
  const normalized = String(method || '').toUpperCase();
  if (normalized === 'TRANSFERENCIA') return 'Transferencia';
  if (normalized === 'MIXTO') return 'Mixto';
  return 'Efectivo';
};

const toPositiveNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const TUCUMAN_BOUNDS = {
  south: -28.25,
  west: -66.25,
  north: -25.9,
  east: -64.75,
};

const isValidDeliveryCoordinate = (lat, lng) =>
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  lat >= TUCUMAN_BOUNDS.south &&
  lat <= TUCUMAN_BOUNDS.north &&
  lng >= TUCUMAN_BOUNDS.west &&
  lng <= TUCUMAN_BOUNDS.east;

const OFFLINE_QUEUE_KEY = 'lf_driver_offline_queue_v1';

const readOfflineQueue = () => {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeOfflineQueue = (items) => {
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(Array.isArray(items) ? items : []));
  } catch {
    // Ignore local storage errors.
  }
};

const isOfflineError = (err) => {
  if (!err) return !navigator.onLine;
  if (!navigator.onLine) return true;
  if (!err.response) return true;
  const msg = String(err.message || '').toLowerCase();
  return msg.includes('network') || msg.includes('timeout');
};

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const parts = dataUrl.split(',');
      resolve(parts[1] || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

export default function DriverApp({ onLogout, user }) {
  const [deliveries, setDeliveries] = useState([]);
  const [activeShift, setActiveShift] = useState('11');
  const [routeDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [trackingState, setTrackingState] = useState('INICIANDO');
  const [trackingError, setTrackingError] = useState('');
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState('');
  const [financialSummary, setFinancialSummary] = useState({
    deliveredCount: 0,
    pendingCount: 0,
    rejectedCount: 0,
    totalRoute: 0,
    cashToRender: 0,
    transferRegistered: 0,
    returnablesToRender: 0,
    rejectedMerchandiseQty: 0,
  });
  const [rejectedReturnsByProduct, setRejectedReturnsByProduct] = useState([]);
  const [finalPaymentByDelivery, setFinalPaymentByDelivery] = useState({});
  const [proofPreviewByDelivery, setProofPreviewByDelivery] = useState({});
  const [submitStateByDelivery, setSubmitStateByDelivery] = useState({});
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [logoutPinModalOpen, setLogoutPinModalOpen] = useState(false);
  const [logoutPinValue, setLogoutPinValue] = useState('');
  const [logoutPinRequestedAt, setLogoutPinRequestedAt] = useState('');
  const [logoutPinExpiresAt, setLogoutPinExpiresAt] = useState('');
  const [logoutPinLoading, setLogoutPinLoading] = useState(false);
  const [logoutPinError, setLogoutPinError] = useState('');

  const [locationPrompt, setLocationPrompt] = useState(null);
  // locationPrompt: null | { deliveryId: string, customerId: string }

  const fileInputRef = useRef(null);
  const pendingProofDeliveryIdRef = useRef(null);
  const socketRef = useRef(null);
  const watchIdRef = useRef(null);
  const syncingQueueRef = useRef(false);

  const activeShiftLabel = activeShift === '19' ? 'SALIDA 19:00' : 'SALIDA 11:00';

  const requestDriverLogoutPin = async () => {
    setLogoutPinLoading(true);
    setLogoutPinError('');
    try {
      const { data } = await api.post('/auth/driver-logout/request-pin');
      setLogoutPinRequestedAt(new Date().toISOString());
      setLogoutPinExpiresAt(String(data?.expiresAt || ''));
      setLogoutPinModalOpen(true);
    } catch (err) {
      setLogoutPinError(err.response?.data?.message || 'No se pudo solicitar el PIN.');
      setLogoutPinModalOpen(true);
    } finally {
      setLogoutPinLoading(false);
    }
  };

  const confirmDriverLogout = async () => {
    if (!/^\d{6}$/.test(String(logoutPinValue || '').trim())) {
      setLogoutPinError('Ingresa un PIN valido de 6 digitos.');
      return;
    }
    setLogoutPinLoading(true);
    setLogoutPinError('');
    try {
      await api.post('/auth/driver-logout/confirm', { pin: String(logoutPinValue || '').trim() });
      onLogout?.();
    } catch (err) {
      setLogoutPinError(err.response?.data?.message || 'No se pudo cerrar la sesion.');
    } finally {
      setLogoutPinLoading(false);
    }
  };

  useEffect(() => {
    setTrackingState('INICIANDO');
    console.log('[DriverApp] Connecting socket to:', socketOrigin);
    const socket = io(socketOrigin, {
      transports: ['websocket', 'polling'], // Start with websocket directly if possible, fallback to polling
      tryAllTransports: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
      timeout: 12000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[DriverApp] Socket connected');
      setTrackingError('');
      setTrackingState((prev) => (prev === 'GPS_DENEGADO' || prev === 'SIN_GEOLOCATION' ? prev : 'CONECTADO'));
      socket.emit('driver_register', {
        userId: user?.id || null,
        userName: user?.fullName || user?.username || 'Repartidor',
        role: 'REPARTIDOR',
      });
    });

    socket.on('disconnect', () => {
      console.log('[DriverApp] Socket disconnected');
      setTrackingState((prev) => (prev === 'GPS_DENEGADO' || prev === 'SIN_GEOLOCATION' ? prev : 'DESCONECTADO'));
    });

    socket.on('connect_error', (err) => {
      console.log('[DriverApp] Socket connect_error:', err?.message || err);
      setTrackingError(String(err?.message || 'Error de conexion Socket.IO'));
      setTrackingState((prev) => (prev === 'GPS_DENEGADO' || prev === 'SIN_GEOLOCATION' ? prev : 'API_DESCONECTADA'));
    });

    socket.on('pedidos_cargados', (data) => {
      const notifId = Math.floor(Math.random() * 100000) + 2000;
      const title = 'Pedidos listos para cargar';
      const body = data?.message || `Turno ${data?.slot === '19' ? '19:00' : '11:00'} — pedidos cargados`;
      if (Capacitor.isNativePlatform()) {
        LocalNotifications.schedule({
          notifications: [{ id: notifId, title, body, schedule: { at: new Date(Date.now() + 300) } }],
        }).catch(() => {});
      } else {
        // Web fallback — browser Notification API
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification(title, { body });
        }
      }
    });

    const emitCoords = (lat, lng) => {
      socket.emit('camion_ubicacion', {
        lat: Number(lat),
        lng: Number(lng),
        user_id: user?.id || null,
        ts: new Date().toISOString(),
      });
    };

    let cancelled = false;
    let listenerHandle = null;

    const startTracking = async () => {
      if (Capacitor.isNativePlatform()) {
        // Request notification permission (Android 13+)
        try {
          await LocalNotifications.requestPermissions();
        } catch {
          // Non-fatal
        }

        // Android: use foreground service so GPS keeps running when screen locks
        try {
          const perm = await Geolocation.requestPermissions({ permissions: ['location'] });
          if (perm?.location === 'denied') {
            if (!cancelled) setTrackingState('GPS_DENEGADO');
            return;
          }
        } catch {
          // Permission API unavailable — proceed anyway; service will handle the error
        }

        try {
          listenerHandle = await TrackingPlugin.addListener('location', (data) => {
            if (!cancelled) emitCoords(data.lat, data.lng);
          });
          const authToken = localStorage.getItem('lf_token') || '';
          await TrackingPlugin.startTracking({ serverUrl: apiOrigin, authToken });
        } catch (err) {
          if (!cancelled) {
            setTrackingState('GPS_ERROR');
            setTrackingError(String(err?.message || 'Error al iniciar servicio GPS'));
          }
        }
      } else {
        // Web/desktop: browser geolocation fallback
        if (!navigator.geolocation) {
          setTrackingState('SIN_GEOLOCATION');
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (position) => {
            if (cancelled) return;
            emitCoords(position.coords.latitude, position.coords.longitude);
            watchIdRef.current = navigator.geolocation.watchPosition(
              (pos) => { if (!cancelled) emitCoords(pos.coords.latitude, pos.coords.longitude); },
              () => { if (!cancelled) setTrackingState('GPS_ERROR'); },
              { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
            );
          },
          () => { if (!cancelled) setTrackingState('GPS_ERROR'); },
          { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
        );
      }
    };

    startTracking();

    return () => {
      cancelled = true;
      if (Capacitor.isNativePlatform()) {
        listenerHandle?.remove();
        TrackingPlugin.stopTracking().catch(() => {});
      } else if (watchIdRef.current != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      socket.disconnect();
    };
  }, []);

  const normalizeDelivery = (row) => {
    const lat = Number(row.customer_latitude);
    const lng = Number(row.customer_longitude);
    const hasValidCoords = isValidDeliveryCoordinate(lat, lng);
    return {
      id: row.id,
      customerId: row.customer_id || null,
      name: row.customer_name || 'SIN CLIENTE',
      address: row.delivery_address || 'SIN DIRECCION',
      lat: hasValidCoords ? lat : null,
      lng: hasValidCoords ? lng : null,
      status: row.delivery_status || 'PENDIENTE',
      phone: row.customer_phone || '',
      saleTotal: Number(row.sale_total || 0),
      deliveryPayment: row.delivery_payment || null,
      deliveryPaymentMethod: row.delivery_payment_method || null,
      expectedCashAmount: Number(row.delivery_expected_cash_amount || 0),
      expectedTransferAmount: Number(row.delivery_expected_transfer_amount || 0),
      deliveryPaymentConfiguredAt: row.delivery_payment_configured_at || null,
      finalMethod: row.delivery_final_payment_method || null,
      finalCashAmount: Number(row.delivery_final_cash_amount || 0),
      finalTransferAmount: Number(row.delivery_final_transfer_amount || 0),
      items: Array.isArray(row.items) ? row.items : [],
    };
  };

  const getDeliveryReturnables = (delivery) => {
    const items = Array.isArray(delivery?.items) ? delivery.items : [];
    return items.reduce((acc, item) => {
      const qty = Number(item.qty || 0);
      const perItem = Number(item.returnableUnitsPerItem || 0);
      const hasReturnable = Boolean(item.hasReturnable) || perItem > 0;
      if (!hasReturnable || qty <= 0 || perItem <= 0) return acc;
      return acc + qty * perItem;
    }, 0);
  };

  const loadDriverBoard = useCallback(async () => {
    setRouteLoading(true);
    setRouteError('');
    try {
      const { data } = await api.get('/deliveries/driver-board', {
        params: { date: routeDate, slot: activeShift },
      });
      const incoming = Array.isArray(data?.orders) ? data.orders.map(normalizeDelivery) : [];
      setDeliveries(incoming);
      setFinalPaymentByDelivery((prev) => {
        const next = { ...prev };
        for (const row of incoming) {
          const inferredMethod =
            row.finalMethod ||
            row.deliveryPaymentMethod ||
            ((row.expectedCashAmount > 0 || row.expectedTransferAmount > 0) ? 'MIXTO' : null) ||
            (['PAGO_LOCAL_TRANSFERENCIA', 'PAGO_ENTREGA_TRANSFERENCIA'].includes(
              String(row.deliveryPayment || '').toUpperCase()
            )
              ? 'TRANSFERENCIA'
              : 'EFECTIVO');
          if (!next[row.id]) {
            next[row.id] = {
              ...DEFAULT_FINAL_PAYMENT,
              method: inferredMethod,
              cashAmount:
                row.finalCashAmount > 0
                  ? String(row.finalCashAmount)
                  : row.expectedCashAmount > 0
                    ? String(row.expectedCashAmount)
                    : '',
              transferAmount:
                row.finalTransferAmount > 0
                  ? String(row.finalTransferAmount)
                  : row.expectedTransferAmount > 0
                    ? String(row.expectedTransferAmount)
                    : '',
            };
          }
        }
        return next;
      });
      setFinancialSummary({
        deliveredCount: Number(data?.summary?.deliveredCount || 0),
        pendingCount: Number(data?.summary?.pendingCount || 0),
        rejectedCount: Number(data?.summary?.rejectedCount || 0),
        totalRoute: Number(data?.summary?.totalRoute || 0),
        cashToRender: Number(data?.summary?.cashToRender || 0),
        transferRegistered: Number(data?.summary?.transferRegistered || 0),
        returnablesToRender: Number(data?.summary?.returnablesToRender || 0),
        rejectedMerchandiseQty: Number(data?.summary?.rejectedMerchandiseQty || 0),
      });
      setRejectedReturnsByProduct(Array.isArray(data?.summary?.rejectedReturnsByProduct) ? data.summary.rejectedReturnsByProduct : []);
    } catch (err) {
      setRouteError(
        isOfflineError(err)
          ? 'Sin internet: mostrando datos locales hasta reconectar.'
          : err.response?.data?.message || 'No se pudo cargar el recorrido.'
      );
    } finally {
      setRouteLoading(false);
    }
  }, [activeShift, routeDate]);

  useEffect(() => {
    loadDriverBoard();
  }, [loadDriverBoard]);

  const getFinalPayment = (deliveryId) => {
    return finalPaymentByDelivery[deliveryId] || DEFAULT_FINAL_PAYMENT;
  };

  const setFinalPayment = (deliveryId, updater) => {
    setFinalPaymentByDelivery((prev) => {
      const current = prev[deliveryId] || DEFAULT_FINAL_PAYMENT;
      const next = typeof updater === 'function' ? updater(current) : updater;
      return { ...prev, [deliveryId]: next };
    });
  };

  const setDeliverySubmitState = (deliveryId, patch) => {
    setSubmitStateByDelivery((prev) => ({
      ...prev,
      [deliveryId]: {
        loading: false,
        error: '',
        ...(prev[deliveryId] || {}),
        ...patch,
      },
    }));
  };

  const handleStatusChange = (id, newStatus) => {
    setDeliveries((prev) => prev.map((d) => (d.id === id ? { ...d, status: newStatus } : d)));
  };

  const enqueueOfflineAction = (action) => {
    const queue = readOfflineQueue();
    queue.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      ...action,
    });
    writeOfflineQueue(queue);
    setPendingSyncCount(queue.length);
  };

  const syncOfflineQueue = useCallback(async () => {
    if (syncingQueueRef.current) return;
    if (!navigator.onLine) return;
    const queue = readOfflineQueue();
    if (queue.length === 0) {
      setPendingSyncCount(0);
      return;
    }

    syncingQueueRef.current = true;
    const remaining = [];
    let syncedAny = false;

    try {
      for (const item of queue) {
        try {
          await api.post(item.endpoint, item.payload || {});
          syncedAny = true;
        } catch (err) {
          if (isOfflineError(err)) {
            remaining.push(item);
            continue;
          }
          // Skip non-retriable failures to avoid blocking the queue.
        }
      }
    } finally {
      writeOfflineQueue(remaining);
      setPendingSyncCount(remaining.length);
      syncingQueueRef.current = false;
    }

    if (syncedAny) {
      await loadDriverBoard();
    }
  }, [loadDriverBoard]);

  const getCurrentCoords = async () => {
    try {
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
      return { lat: Number(pos.coords.latitude), lng: Number(pos.coords.longitude) };
    } catch {
      // Fallback to browser API (desktop/web)
      if (!navigator.geolocation) return { lat: null, lng: null };
      return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (position) => resolve({ lat: Number(position.coords.latitude), lng: Number(position.coords.longitude) }),
          () => resolve({ lat: null, lng: null }),
          { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 }
        );
      });
    }
  };

  useEffect(() => {
    setPendingSyncCount(readOfflineQueue().length);
    syncOfflineQueue();

    const onOnline = () => {
      syncOfflineQueue();
    };
    window.addEventListener('online', onOnline);
    const intervalId = window.setInterval(() => {
      syncOfflineQueue();
    }, 15000);

    return () => {
      window.removeEventListener('online', onOnline);
      window.clearInterval(intervalId);
    };
  }, [syncOfflineQueue]);

  const handlePaymentMethodChange = (deliveryId, method) => {
    setFinalPayment(deliveryId, (current) => {
      const next = {
        ...current,
        method,
      };
      if (!requiresProof(method)) {
        next.proofImageBase64 = '';
        next.proofImageMimeType = '';
        next.proofImageName = '';
        setProofPreviewByDelivery((prev) => {
          const copy = { ...prev };
          delete copy[deliveryId];
          return copy;
        });
      }
      return next;
    });
  };

  const handleMixedAmountChange = (deliveryId, field, value) => {
    setFinalPayment(deliveryId, (current) => ({
      ...current,
      [field]: value,
    }));
  };

  const saveProofImage = (deliveryId, { base64, mimeType, fileName, preview }) => {
    setFinalPayment(deliveryId, (current) => ({
      ...current,
      proofImageBase64: base64,
      proofImageMimeType: mimeType || 'image/jpeg',
      proofImageName: fileName || `comprobante-${deliveryId}.jpg`,
    }));

    setProofPreviewByDelivery((prev) => ({
      ...prev,
      [deliveryId]: preview,
    }));

    setDeliverySubmitState(deliveryId, { error: '' });
  };

  const handleProofFileInput = async (event) => {
    const file = event.target.files?.[0];
    const deliveryId = pendingProofDeliveryIdRef.current;
    event.target.value = '';

    if (!file || !deliveryId) return;

    try {
      const [preview, base64] = await Promise.all([fileToDataUrl(file), fileToBase64(file)]);
      saveProofImage(deliveryId, {
        base64,
        preview,
        mimeType: file.type || 'image/jpeg',
        fileName: file.name || `comprobante-${deliveryId}.jpg`,
      });
    } catch {
      setDeliverySubmitState(deliveryId, {
        error: 'No se pudo cargar la imagen del comprobante.',
      });
    } finally {
      pendingProofDeliveryIdRef.current = null;
    }
  };

  const openFilePickerFallback = (deliveryId) => {
    pendingProofDeliveryIdRef.current = deliveryId;
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleCaptureProof = async (deliveryId) => {
    setDeliverySubmitState(deliveryId, { error: '' });
    try {
      const photo = await Camera.getPhoto({
        quality: 60,
        width: 1280,
        height: 1280,
        resultType: CameraResultType.Base64,
        source: CameraSource.Prompt,
      });

      if (!photo.base64String) {
        setDeliverySubmitState(deliveryId, {
          error: 'No se obtuvo una imagen valida del comprobante.',
        });
        return;
      }

      const format = photo.format || 'jpeg';
      const mimeType = `image/${format}`;
      const preview = `data:${mimeType};base64,${photo.base64String}`;
      saveProofImage(deliveryId, {
        base64: photo.base64String,
        preview,
        mimeType,
        fileName: `comprobante-${deliveryId}.${format}`,
      });
    } catch {
      // Browser fallback
      openFilePickerFallback(deliveryId);
    }
  };

  const buildFinalPaymentPayload = (deliveryId) => {
    const finalPayment = getFinalPayment(deliveryId);
    const method = finalPayment.method || 'EFECTIVO';
    const delivery = deliveries.find((d) => d.id === deliveryId);
    const saleTotal = Number(delivery?.saleTotal || 0);

    const payload = {
      method,
      cashAmount: 0,
      transferAmount: 0,
      proofImageBase64: finalPayment.proofImageBase64 || '',
      proofImageMimeType: finalPayment.proofImageMimeType || '',
      proofImageName: finalPayment.proofImageName || '',
    };

    if (method === 'MIXTO') {
      payload.cashAmount = toPositiveNumber(finalPayment.cashAmount);
      payload.transferAmount = toPositiveNumber(finalPayment.transferAmount);
    } else if (method === 'EFECTIVO') {
      payload.cashAmount = saleTotal;
    } else if (method === 'TRANSFERENCIA') {
      payload.transferAmount = saleTotal;
    }

    return payload;
  };

  const validateBeforeDeliver = (deliveryId) => {
    const finalPayment = getFinalPayment(deliveryId);
    const method = finalPayment.method || 'EFECTIVO';
    const delivery = deliveries.find((d) => d.id === deliveryId);
    if (delivery && isPrepaidDeliveryPayment(delivery.deliveryPayment)) {
      return '';
    }
    const saleTotal = Number(delivery?.saleTotal || 0);

    if (method === 'MIXTO') {
      const cashAmount = toPositiveNumber(finalPayment.cashAmount);
      const transferAmount = toPositiveNumber(finalPayment.transferAmount);
      if (cashAmount <= 0 || transferAmount <= 0) {
        return 'Para pago mixto debes informar monto de efectivo y monto de transferencia.';
      }
      const sum = cashAmount + transferAmount;
      if (Math.abs(sum - saleTotal) > 0.01) {
        return `En pago mixto la suma debe ser igual al total del pedido ($${saleTotal.toFixed(2)}).`;
      }
    }

    if (requiresProof(method) && !finalPayment.proofImageBase64) {
      return 'Debes fotografiar el comprobante para continuar.';
    }

    return '';
  };

  const canMarkAsDelivered = (deliveryId) => {
    const finalPayment = getFinalPayment(deliveryId);
    const submitState = submitStateByDelivery[deliveryId] || {};
    const delivery = deliveries.find((d) => d.id === deliveryId);
    if (delivery && isPrepaidDeliveryPayment(delivery.deliveryPayment)) {
      return !submitState.loading;
    }
    const saleTotal = Number(delivery?.saleTotal || 0);
    if (submitState.loading) return false;

    if (finalPayment.method === 'MIXTO') {
      const cashAmount = toPositiveNumber(finalPayment.cashAmount);
      const transferAmount = toPositiveNumber(finalPayment.transferAmount);
      if (cashAmount <= 0 || transferAmount <= 0) return false;
      if (Math.abs(cashAmount + transferAmount - saleTotal) > 0.01) return false;
    }

    if (requiresProof(finalPayment.method) && !finalPayment.proofImageBase64) {
      return false;
    }

    return true;
  };

  // Intercept "Marcar como Entregado": if customer has no coordinates, prompt to save location/photo first
  const handleDeliverButtonClick = (deliveryId) => {
    const delivery = deliveries.find((d) => d.id === deliveryId);
    const hasCoords =
      delivery &&
      isValidDeliveryCoordinate(Number(delivery.lat), Number(delivery.lng));
    if (!hasCoords && delivery?.customerId) {
      setLocationPrompt({ deliveryId, customerId: delivery.customerId });
      return;
    }
    handleConfirmDelivered(deliveryId);
  };

  const handleConfirmDelivered = async (deliveryId) => {
    const validationError = validateBeforeDeliver(deliveryId);
    if (validationError) {
      setDeliverySubmitState(deliveryId, { error: validationError });
      return;
    }

    setDeliverySubmitState(deliveryId, { loading: true, error: '' });

    const endpoint = `/deliveries/${deliveryId}/mark-delivered`;
    const payload = { finalPayment: buildFinalPaymentPayload(deliveryId) };

    if (!navigator.onLine) {
      enqueueOfflineAction({ endpoint, payload });
      handleStatusChange(deliveryId, 'ENTREGADO');
      setDeliverySubmitState(deliveryId, {
        loading: false,
        error: 'Sin internet: accion guardada, se sincroniza al reconectar.',
      });
      return;
    }

    try {
      await api.post(endpoint, payload);
      handleStatusChange(deliveryId, 'ENTREGADO');
      await loadDriverBoard();
    } catch (err) {
      if (isOfflineError(err)) {
        enqueueOfflineAction({ endpoint, payload });
        handleStatusChange(deliveryId, 'ENTREGADO');
        setDeliverySubmitState(deliveryId, {
          error: 'Sin internet: accion guardada, se sincroniza al reconectar.',
        });
      } else {
        setDeliverySubmitState(deliveryId, {
          error: err.response?.data?.message || 'No se pudo marcar como entregado.',
        });
      }
    } finally {
      setDeliverySubmitState(deliveryId, { loading: false });
    }
  };

  const handleMarkRejected = async (deliveryId, status = 'RECHAZADO') => {
    setDeliverySubmitState(deliveryId, { loading: true, error: '' });
    try {
      const coords = await getCurrentCoords();
      const endpoint = `/deliveries/${deliveryId}/mark-status`;
      const payload = {
        status,
        lat: coords.lat,
        lng: coords.lng,
      };

      if (!navigator.onLine) {
        enqueueOfflineAction({ endpoint, payload });
        handleStatusChange(deliveryId, status);
        setDeliverySubmitState(deliveryId, {
          error: 'Sin internet: accion guardada, se sincroniza al reconectar.',
        });
        return;
      }

      await api.post(endpoint, payload);
      handleStatusChange(deliveryId, status);
      await loadDriverBoard();
    } catch (err) {
      if (isOfflineError(err)) {
        const coords = await getCurrentCoords();
        enqueueOfflineAction({
          endpoint: `/deliveries/${deliveryId}/mark-status`,
          payload: { status, lat: coords.lat, lng: coords.lng },
        });
        handleStatusChange(deliveryId, status);
        setDeliverySubmitState(deliveryId, {
          error: 'Sin internet: accion guardada, se sincroniza al reconectar.',
        });
      } else {
        setDeliverySubmitState(deliveryId, {
          error: err.response?.data?.message || 'No se pudo marcar como rechazado.',
        });
      }
    } finally {
      setDeliverySubmitState(deliveryId, { loading: false });
    }
  };

  const handleRevertToLoaded = async (deliveryId) => {
    setDeliverySubmitState(deliveryId, { loading: true, error: '' });
    try {
      const coords = await getCurrentCoords();
      const endpoint = `/deliveries/${deliveryId}/mark-status`;
      const payload = {
        status: 'CARGADO',
        lat: coords.lat,
        lng: coords.lng,
      };

      if (!navigator.onLine) {
        enqueueOfflineAction({ endpoint, payload });
        handleStatusChange(deliveryId, 'CARGADO');
        setDeliverySubmitState(deliveryId, {
          error: 'Sin internet: accion guardada, se sincroniza al reconectar.',
        });
        return;
      }

      await api.post(endpoint, payload);
      handleStatusChange(deliveryId, 'CARGADO');
      await loadDriverBoard();
    } catch (err) {
      if (isOfflineError(err)) {
        const coords = await getCurrentCoords();
        enqueueOfflineAction({
          endpoint: `/deliveries/${deliveryId}/mark-status`,
          payload: { status: 'CARGADO', lat: coords.lat, lng: coords.lng },
        });
        handleStatusChange(deliveryId, 'CARGADO');
        setDeliverySubmitState(deliveryId, {
          error: 'Sin internet: accion guardada, se sincroniza al reconectar.',
        });
      } else {
        setDeliverySubmitState(deliveryId, {
          error: err.response?.data?.message || 'No se pudo volver a cargado.',
        });
      }
    } finally {
      setDeliverySubmitState(deliveryId, { loading: false });
    }
  };

  const openGPS = (lat, lng) => {
    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng)) || (!Number(lat) && !Number(lng))) {
      return;
    }
    // Try to open native maps
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    window.open(url, '_blank');
  };

  return (
    <div className="min-h-screen bg-black text-white pb-20 font-sans select-none">
      {locationPrompt ? (
        <CustomerLocationModal
          customerId={locationPrompt.customerId}
          onDone={() => {
            const { deliveryId } = locationPrompt;
            setLocationPrompt(null);
            handleConfirmDelivered(deliveryId);
          }}
        />
      ) : null}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleProofFileInput}
      />

      {/* Header */}
      <div className="bg-zinc-900 border-b border-zinc-800 p-4 sticky top-0 z-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-lg">
        <div>
          <div className="text-[10px] text-zinc-500 uppercase font-black tracking-widest">Turno Activo</div>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <h1 className="text-xl sm:text-2xl font-black text-burnt-500 uppercase tracking-tighter">{activeShiftLabel}</h1>
            <select
              value={activeShift}
              onChange={(e) => setActiveShift(e.target.value)}
              className="h-8 px-2 rounded bg-zinc-800 border border-zinc-700 text-xs font-bold"
            >
              <option value="11">11:00</option>
              <option value="19">19:00</option>
            </select>
          </div>
          <div className="text-[10px] text-zinc-500 uppercase font-black tracking-widest mt-1">
            Radar: {trackingState}
          </div>
          {trackingError ? (
            <div className="text-[10px] text-rose-400 font-bold mt-1 max-w-[220px] break-words">
              {trackingError}
            </div>
          ) : null}
          <div className="text-[10px] text-zinc-500 uppercase font-black tracking-widest mt-1">
            Fecha: {routeDate}
          </div>
          {pendingSyncCount > 0 ? (
            <div className="text-[10px] text-amber-400 uppercase font-black tracking-widest mt-1">
              Pendiente de sincronizar: {pendingSyncCount}
            </div>
          ) : null}
        </div>
        <div className="w-full sm:w-auto sm:text-right space-y-1">
          <div className="text-[10px] text-zinc-500 uppercase font-black">Saldo a rendir</div>
          <div className="text-xl sm:text-2xl font-black text-emerald-400">${Number(financialSummary.cashToRender || 0).toFixed(2)}</div>
          <div className="text-[10px] text-zinc-500 uppercase font-black">
            Envases a rendir: {Number(financialSummary.returnablesToRender || 0)}
          </div>
          <div className="text-[10px] text-zinc-500 uppercase font-black">
            Mercaderia a devolver: {Number(financialSummary.rejectedMerchandiseQty || 0)}
          </div>
          <div className="text-[10px] text-zinc-500 uppercase font-black flex sm:justify-end gap-2">
            <span>Entregados: {financialSummary.deliveredCount}</span>
            <span className="text-zinc-700">|</span>
            <span>Pendientes: {financialSummary.pendingCount}</span>
          </div>
          <button className="bg-zinc-800 p-2 rounded-lg w-full mt-2" onClick={requestDriverLogoutPin} type="button">
            <span className="text-xs font-bold uppercase text-zinc-400">Salir</span>
          </button>
        </div>
      </div>

      {logoutPinModalOpen ? (
        <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-[#0c0d11] shadow-2xl p-5">
            <div className="text-lg font-black uppercase tracking-tight text-burnt-500">Cerrar sesion del chofer</div>
            <p className="mt-2 text-sm text-zinc-300">
              Se envio una notificacion al administrador con el PIN de autorizacion.
            </p>
            {logoutPinExpiresAt ? (
              <p className="mt-1 text-[11px] uppercase font-bold tracking-widest text-zinc-500">
                Vence: {new Date(logoutPinExpiresAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
              </p>
            ) : null}
            <label className="block mt-4 text-[11px] font-black uppercase tracking-widest text-zinc-500">
              PIN de administrador
            </label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={logoutPinValue}
              onChange={(e) => setLogoutPinValue(String(e.target.value || '').replace(/\D+/g, '').slice(0, 6))}
              className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white text-lg font-black tracking-[0.35em] text-center outline-none focus:border-burnt-500"
              placeholder="000000"
            />
            {logoutPinError ? (
              <div className="mt-3 text-sm text-rose-400 font-bold">{logoutPinError}</div>
            ) : null}
            <div className="mt-5 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setLogoutPinModalOpen(false);
                  setLogoutPinError('');
                  setLogoutPinValue('');
                }}
                className="col-span-1 rounded-xl bg-zinc-800 px-3 py-3 text-xs font-black uppercase tracking-widest text-zinc-300"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={requestDriverLogoutPin}
                disabled={logoutPinLoading}
                className="col-span-1 rounded-xl bg-zinc-700 px-3 py-3 text-xs font-black uppercase tracking-widest text-white disabled:opacity-60"
              >
                Reenviar
              </button>
              <button
                type="button"
                onClick={confirmDriverLogout}
                disabled={logoutPinLoading}
                className="col-span-1 rounded-xl bg-burnt-500 px-3 py-3 text-xs font-black uppercase tracking-widest text-white disabled:opacity-60"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* List */}
      <div className="p-4 space-y-6">
        {routeLoading ? (
          <div className="text-center text-zinc-400 text-sm uppercase font-bold tracking-widest">
            Cargando recorrido...
          </div>
        ) : null}

        {routeError ? (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300">
            {routeError}
          </div>
        ) : null}

        {deliveries.map((delivery, index) => {
          const finalPayment = getFinalPayment(delivery.id);
          const proofPreview = proofPreviewByDelivery[delivery.id];
          const submitState = submitStateByDelivery[delivery.id] || { loading: false, error: '' };
          const returnablesForOrder = getDeliveryReturnables(delivery);
          const prepaid = isPrepaidDeliveryPayment(delivery.deliveryPayment);
          const hasExpectedPartialPlan =
            String(delivery.deliveryPayment || '').toUpperCase() === 'PAGO_PARCIAL' &&
            (delivery.expectedCashAmount > 0 || delivery.expectedTransferAmount > 0);
          const prepaidMethodLabel = getPaymentMethodLabel(
            delivery.deliveryPaymentMethod || finalPayment.method
          );

          return (
            <div
              key={delivery.id}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl animate-in fade-in slide-in-from-bottom-4 duration-500"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              {/* Card Header */}
              <div className="p-5 border-b border-zinc-800 flex justify-between items-start bg-zinc-800/30">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <div className="bg-white text-black font-black w-8 h-8 rounded-full flex items-center justify-center text-lg">
                      {index + 1}
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${delivery.status === 'PENDIENTE'
                        ? 'bg-yellow-500/20 text-yellow-500'
                        : delivery.status === 'ENTREGADO'
                          ? 'bg-emerald-500/20 text-emerald-500'
                          : 'bg-rose-500/20 text-rose-500'
                        }`}
                    >
                      {delivery.status}
                    </span>
                  </div>
                  <h2 className="text-xl font-black uppercase text-white leading-none mb-1">{delivery.name}</h2>
                  <p className="text-zinc-400 text-sm font-medium">{delivery.address}</p>
                  <p className="text-zinc-500 text-xs font-bold mt-1">
                    Total pedido: ${Number(delivery.saleTotal || 0).toFixed(2)}
                  </p>
                  <p className="text-zinc-500 text-xs font-bold mt-1">
                    Envases retornables del pedido: {returnablesForOrder}
                  </p>
                </div>
              </div>

              {/* Actions Body */}
              <div className="p-4 space-y-4">
                {/* Navigation Button */}
                <button
                  onClick={() => openGPS(delivery.lat, delivery.lng)}
                  disabled={!isValidDeliveryCoordinate(Number(delivery.lat), Number(delivery.lng))}
                  className="w-full h-16 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed active:scale-[0.98] transition-all rounded-2xl flex items-center justify-center gap-3 shadow-lg shadow-blue-900/20"
                >
                  <span className="text-lg font-black uppercase tracking-wide">Navegar GPS</span>
                </button>

                {/* Status Actions */}
                {delivery.status === 'ENTREGADO' || delivery.status === 'RECHAZADO' || delivery.status === 'NO_ESTABA' ? (
                  <button
                    onClick={() => handleRevertToLoaded(delivery.id)}
                    className="w-full h-12 bg-zinc-950 text-zinc-500 rounded-xl text-xs font-bold uppercase tracking-widest hover:text-white transition-colors"
                  >
                    Deshacer / Volver a Cargado
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-zinc-700 bg-zinc-950 p-3 space-y-3">
                      {prepaid ? (
                        <div className="space-y-2">
                          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-3">
                            <p className="text-[11px] uppercase tracking-wider font-bold text-emerald-300">
                              Ya esta pagado
                            </p>
                            <p className="mt-1 text-sm font-semibold text-white">
                              Metodo registrado: {prepaidMethodLabel}
                            </p>
                            <p className="mt-1 text-xs text-zinc-400">
                              El chofer solo debe confirmar la entrega.
                            </p>
                          </div>
                        </div>
                      ) : (
                        <>
                          {hasExpectedPartialPlan ? (
                            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-3">
                              <p className="text-[11px] uppercase tracking-wider font-bold text-amber-300">
                                Configurado por caja
                              </p>
                              <p className="mt-1 text-sm font-semibold text-white">
                                Efectivo ${delivery.expectedCashAmount.toFixed(2)} / Transferencia ${delivery.expectedTransferAmount.toFixed(2)}
                              </p>
                              <p className="mt-1 text-xs text-zinc-400">
                                Puedes ajustarlo si el cobro real cambia al entregar.
                              </p>
                            </div>
                          ) : null}

                          <label className="text-[11px] uppercase tracking-wider font-bold text-zinc-400 block">
                            Metodo de pago final
                          </label>
                          <select
                            value={finalPayment.method}
                            onChange={(e) => handlePaymentMethodChange(delivery.id, e.target.value)}
                            className="w-full h-11 rounded-xl bg-zinc-900 border border-zinc-700 px-3 text-sm font-semibold"
                          >
                            <option value="EFECTIVO">Efectivo</option>
                            <option value="TRANSFERENCIA">Transferencia</option>
                            <option value="MIXTO">Mixto</option>
                          </select>

                          {finalPayment.method === 'MIXTO' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <input
                                type="number"
                                inputMode="decimal"
                                min="0"
                                step="0.01"
                                value={finalPayment.cashAmount}
                                onChange={(e) => handleMixedAmountChange(delivery.id, 'cashAmount', e.target.value)}
                                placeholder="Monto efectivo"
                                className="h-11 rounded-xl bg-zinc-900 border border-zinc-700 px-3 text-sm"
                              />
                              <input
                                type="number"
                                inputMode="decimal"
                                min="0"
                                step="0.01"
                                value={finalPayment.transferAmount}
                                onChange={(e) => handleMixedAmountChange(delivery.id, 'transferAmount', e.target.value)}
                                placeholder="Monto transferencia"
                                className="h-11 rounded-xl bg-zinc-900 border border-zinc-700 px-3 text-sm"
                              />
                            </div>
                          )}

                          {requiresProof(finalPayment.method) && (
                            <div className="space-y-2">
                              <button
                                onClick={() => handleCaptureProof(delivery.id)}
                                type="button"
                                className="w-full h-11 bg-cyan-700 hover:bg-cyan-600 active:scale-[0.98] rounded-xl font-black uppercase text-xs tracking-wide transition-all"
                              >
                                Fotografiar Comprobante
                              </button>
                              {proofPreview ? (
                                <img
                                  src={proofPreview}
                                  alt="Comprobante"
                                  className="w-full h-32 object-cover rounded-xl border border-zinc-700"
                                />
                              ) : (
                                <p className="text-xs text-zinc-500">Aun no hay comprobante capturado.</p>
                              )}
                            </div>
                          )}
                        </>
                      )}

                      {submitState.error ? <p className="text-xs text-rose-400">{submitState.error}</p> : null}
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => handleMarkRejected(delivery.id, 'RECHAZADO')}
                        className="flex-1 h-16 bg-zinc-800 hover:bg-zinc-700 active:scale-[0.98] border border-zinc-700 text-rose-500 rounded-2xl font-black uppercase text-sm flex flex-col items-center justify-center gap-1 transition-all"
                      >
                        Rechazado
                      </button>
                      <button
                        onClick={() => handleDeliverButtonClick(delivery.id)}
                        disabled={!canMarkAsDelivered(delivery.id)}
                        className="flex-[2] h-16 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-900/40 disabled:text-zinc-400 disabled:cursor-not-allowed active:scale-[0.98] text-white rounded-2xl font-black uppercase text-lg flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20 transition-all"
                      >
                        {submitState.loading ? 'Guardando...' : 'Marcar como Entregado'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {deliveries.length > 0 && deliveries.every((d) => d.status === 'ENTREGADO') && (
          <div className="p-6 text-center animate-bounce">
            <h3 className="text-2xl font-black text-emerald-500 uppercase">Ruta Completada</h3>
            <p className="text-zinc-500">Buen trabajo, a volver al galpon.</p>
          </div>
        )}

        {rejectedReturnsByProduct.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <div className="text-xs uppercase font-black tracking-widest text-yellow-400 mb-2">
              Mercaderia a devolver por rechazados
            </div>
            <div className="space-y-1">
              {rejectedReturnsByProduct.map((row) => (
                <div key={row.productId || row.sku || row.productName} className="flex justify-between text-sm">
                  <span className="text-zinc-300">
                    {row.productName} {row.sku ? `(${row.sku})` : ""}
                  </span>
                  <span className="font-black text-yellow-300">
                    {Number(row.qty || 0)} {row.unidad || "unidad"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
