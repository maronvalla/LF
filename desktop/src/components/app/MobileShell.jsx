import { Suspense, useMemo, useRef, useState } from "react";
import NotificationBell from "../NotificationBell";
import AppSectionLoader from "./AppSectionLoader";
import {
  buildMobilePrimaryTabs,
  buildMobileSectionOrder,
  getMobileTabMeta,
  isInteractiveSwipeTarget,
  MobileTabIcon,
  normalizeTabToken,
} from "./mobileNavigation";

const getPendingOrderActionLabel = (order) =>
  String(order?.pending_action || "").toUpperCase() === "CONFIGURAR_PAGO_PARCIAL"
    ? "Definir pago parcial"
    : "Cobrar orden";

export default function MobileShell({
  isDark,
  user,
  role,
  activeTab,
  allowedTabs,
  notifications,
  onDismissAlert,
  onDismissAllAlerts,
  pendingCashOrders,
  onOpenPendingOrder,
  onCancelPendingOrder,
  onSelectTab,
  onRequestLogout,
  renderActiveTab,
}) {
  const [isSectionsOpen, setIsSectionsOpen] = useState(false);
  const gestureRef = useRef(null);

  const mobileSectionOrder = useMemo(() => buildMobileSectionOrder(allowedTabs), [allowedTabs]);
  const mobilePrimaryTabs = useMemo(() => buildMobilePrimaryTabs(allowedTabs), [allowedTabs]);
  const quickAccessTabs = useMemo(
    () => mobileSectionOrder.filter((tab) => normalizeTabToken(tab) !== "DASHBOARD").slice(0, 6),
    [mobileSectionOrder]
  );
  const activeMobileMeta = useMemo(() => getMobileTabMeta(activeTab), [activeTab]);
  const activeMobileIndex = Math.max(0, mobileSectionOrder.indexOf(activeTab));
  const previousMobileTab = activeMobileIndex > 0 ? mobileSectionOrder[activeMobileIndex - 1] : null;
  const nextMobileTab =
    activeMobileIndex < mobileSectionOrder.length - 1 ? mobileSectionOrder[activeMobileIndex + 1] : null;

  const handleTabSelect = (tab) => {
    setIsSectionsOpen(false);
    onSelectTab(tab);
  };

  const handleTouchStart = (event) => {
    if (event.touches.length !== 1) return;
    const hasOpenModal = Boolean(document.querySelector(".fixed.inset-0"));
    if (hasOpenModal) return;
    const touch = event.touches[0];
    gestureRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      interactive: isInteractiveSwipeTarget(event.target),
    };
  };

  const handleTouchEnd = (event) => {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    if (!gesture || gesture.interactive || event.changedTouches.length !== 1) return;
    const hasOpenModal = Boolean(document.querySelector(".fixed.inset-0"));
    if (hasOpenModal) return;
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - gesture.startX;
    const deltaY = touch.clientY - gesture.startY;
    if (Math.abs(deltaX) < 72 || Math.abs(deltaX) < Math.abs(deltaY) * 1.35) return;

    const currentIndex = mobileSectionOrder.indexOf(activeTab);
    if (currentIndex === -1) return;

    if (deltaX < 0 && currentIndex < mobileSectionOrder.length - 1) {
      onSelectTab(mobileSectionOrder[currentIndex + 1]);
      return;
    }

    if (deltaX > 0 && currentIndex > 0) {
      onSelectTab(mobileSectionOrder[currentIndex - 1]);
    }
  };

  const moreButtonActive =
    activeTab !== "Dashboard" &&
    !mobilePrimaryTabs.some((tab) => normalizeTabToken(tab) === normalizeTabToken(activeTab));

  return (
    <div className={`h-screen flex flex-col overflow-hidden font-sans ${isDark ? "bg-zinc-950 text-white" : "bg-[#f3f4f6] text-zinc-900"}`}>
      <header
        className={`shrink-0 px-3 pt-safe-top pb-3 border-b backdrop-blur-xl ${
          isDark
            ? "border-zinc-800 bg-[linear-gradient(180deg,rgba(9,11,17,0.96),rgba(9,11,17,0.78))]"
            : "border-zinc-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,255,255,0.88))]"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className={`text-[10px] font-black uppercase tracking-[0.24em] ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
              {user.fullName || user.username} / {role}
            </div>
            <div className={`mt-1 text-[1.65rem] leading-none font-black tracking-tight ${isDark ? "text-white" : "text-zinc-900"}`}>
              {activeMobileMeta.label}
            </div>
            <div className={`mt-1 text-xs ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
              {activeMobileMeta.description}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <NotificationBell
              alerts={notifications}
              onDismiss={onDismissAlert}
              onDismissAll={onDismissAllAlerts}
              isDark={isDark}
            />
            <button
              type="button"
              onClick={() => setIsSectionsOpen(true)}
              className={`p-2.5 rounded-2xl border shadow-sm transition-colors ${
                isDark
                  ? "bg-[#121212] border-zinc-800 text-zinc-300 hover:text-white hover:border-zinc-600"
                  : "bg-white border-zinc-200 text-zinc-700 hover:text-[#e85d04] hover:border-[#e85d04]/40"
              }`}
              title="Ver secciones"
            >
              <MobileTabIcon icon="grid" className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 overflow-x-auto scrollbar-hide" data-disable-swipe-nav="true">
          <button
            type="button"
            onClick={() => handleTabSelect("Dashboard")}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] whitespace-nowrap ${
              activeTab === "Dashboard"
                ? "bg-[#e85d04] text-white border-[#e85d04]"
                : isDark
                  ? "bg-transparent text-zinc-400 border-zinc-800"
                  : "bg-white text-zinc-600 border-zinc-200"
            }`}
          >
            <MobileTabIcon icon="home" className="w-4 h-4" />
            Inicio
          </button>

          {previousMobileTab ? (
            <button
              type="button"
              onClick={() => handleTabSelect(previousMobileTab)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold whitespace-nowrap ${
                isDark ? "border-zinc-800 text-zinc-400" : "border-zinc-200 text-zinc-600 bg-white"
              }`}
            >
              <span>{"<-"}</span>
              {getMobileTabMeta(previousMobileTab).shortLabel}
            </button>
          ) : null}

          {nextMobileTab ? (
            <button
              type="button"
              onClick={() => handleTabSelect(nextMobileTab)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold whitespace-nowrap ${
                isDark ? "border-zinc-800 text-zinc-400" : "border-zinc-200 text-zinc-600 bg-white"
              }`}
            >
              {getMobileTabMeta(nextMobileTab).shortLabel}
              <span>{"->"}</span>
            </button>
          ) : null}

          <div
            className={`ml-auto inline-flex items-center rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] whitespace-nowrap ${
              isDark ? "bg-zinc-900 text-zinc-500" : "bg-zinc-200/70 text-zinc-500"
            }`}
          >
            {activeMobileIndex + 1}/{mobileSectionOrder.length}
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 relative">
        <div className="absolute inset-0 px-2 pt-2 pb-safe-nav">
          <div
            className={`h-full rounded-[28px] border shadow-[0_20px_60px_rgba(0,0,0,0.12)] overflow-hidden ${
              isDark
                ? "bg-[linear-gradient(180deg,rgba(18,18,18,0.96),rgba(10,10,12,0.98))] border-zinc-800"
                : "bg-white border-zinc-200"
            }`}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div className="h-full overflow-auto p-2 sm:p-3">
              {activeTab === "Dashboard" ? (
                <>
                  {pendingCashOrders.length ? (
                    <div className="mb-3 grid gap-2">
                      {pendingCashOrders.slice(0, 3).map((order) => (
                        <div
                          key={order.id}
                          className={`rounded-2xl border p-3 ${
                            isDark ? "border-amber-500/20 bg-amber-500/10" : "border-amber-200 bg-amber-50"
                          }`}
                          data-disable-swipe-nav="true"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className={`text-[10px] font-black uppercase tracking-[0.18em] ${isDark ? "text-amber-300" : "text-amber-700"}`}>
                                Orden pendiente
                              </div>
                              <div className={`mt-1 text-sm font-black truncate ${isDark ? "text-white" : "text-zinc-900"}`}>
                                {order.customer_name || "CONSUMIDOR FINAL"}
                              </div>
                              <div className={`text-xs ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                                {order.sale_number || order.id} / ${Number(order.total_amount || 0).toFixed(2)}
                              </div>
                              <div className={`mt-1 text-[10px] font-black uppercase tracking-[0.16em] ${isDark ? "text-amber-300" : "text-amber-700"}`}>
                                {getPendingOrderActionLabel(order)}
                              </div>
                            </div>
                            <div className="flex gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => onOpenPendingOrder(order.id)}
                                className="rounded-xl bg-[#e85d04] text-white px-3 py-2 text-[11px] font-black uppercase"
                              >
                                {String(order?.pending_action || "").toUpperCase() === "CONFIGURAR_PAGO_PARCIAL"
                                  ? "Definir"
                                  : "Abrir"}
                              </button>
                              <button
                                type="button"
                                onClick={() => onCancelPendingOrder(order.id)}
                                className={`rounded-xl px-3 py-2 text-[11px] font-black uppercase ${
                                  isDark ? "bg-zinc-900 text-zinc-300 border border-zinc-700" : "bg-white text-zinc-700 border border-zinc-200"
                                }`}
                              >
                                Anular
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {quickAccessTabs.length ? (
                    <div className="mb-3 grid grid-cols-2 gap-2" data-disable-swipe-nav="true">
                      {quickAccessTabs.map((tab) => {
                        const meta = getMobileTabMeta(tab);
                        return (
                          <button
                            key={`quick-${tab}`}
                            type="button"
                            onClick={() => handleTabSelect(tab)}
                            className={`rounded-2xl border p-3 text-left transition-colors ${
                              isDark
                                ? "border-zinc-800 bg-zinc-900/70 text-white hover:border-zinc-700"
                                : "border-zinc-200 bg-zinc-50 text-zinc-900 hover:border-[#e85d04]/40"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <MobileTabIcon icon={meta.icon} className="w-4 h-4" />
                              <span className="text-xs font-black uppercase tracking-[0.16em]">{meta.shortLabel}</span>
                            </div>
                            <div className={`mt-2 text-[11px] leading-snug ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                              {meta.description}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </>
              ) : null}

              <Suspense fallback={<AppSectionLoader isDark={isDark} />}>{renderActiveTab()}</Suspense>
            </div>
          </div>
        </div>
      </main>

      <nav
        className={`fixed inset-x-0 bottom-0 z-40 border-t px-2 pt-2 pb-safe-bottom backdrop-blur-2xl ${
          isDark ? "border-zinc-800 bg-zinc-950/92" : "border-zinc-200 bg-white/95"
        }`}
      >
        <div className="grid grid-cols-5 gap-2">
          {["Dashboard", ...mobilePrimaryTabs].map((tab) => {
            const meta = getMobileTabMeta(tab);
            const isActive = normalizeTabToken(activeTab) === normalizeTabToken(tab);
            return (
              <button
                key={`mobile-nav-${tab}`}
                type="button"
                onClick={() => handleTabSelect(tab)}
                className={`flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2.5 text-center transition-all ${
                  isActive
                    ? "bg-[#e85d04] text-white shadow-lg"
                    : isDark
                      ? "bg-zinc-900 text-zinc-400"
                      : "bg-zinc-100 text-zinc-600"
                }`}
              >
                <MobileTabIcon icon={meta.icon} className="w-5 h-5" />
                <span className="text-[10px] font-black uppercase tracking-[0.14em]">{meta.shortLabel}</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setIsSectionsOpen(true)}
            className={`flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2.5 text-center transition-all ${
              moreButtonActive
                ? isDark
                  ? "bg-zinc-800 text-white"
                  : "bg-zinc-900 text-white"
                : isDark
                  ? "bg-zinc-900 text-zinc-400"
                  : "bg-zinc-100 text-zinc-600"
            }`}
          >
            <MobileTabIcon icon="grid" className="w-5 h-5" />
            <span className="text-[10px] font-black uppercase tracking-[0.14em]">Mas</span>
          </button>
        </div>
      </nav>

      {isSectionsOpen ? (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/55 backdrop-blur-sm">
          <button type="button" className="flex-1 cursor-default" onClick={() => setIsSectionsOpen(false)} />
          <div
            className={`rounded-t-[32px] border-t px-4 pt-4 pb-safe-bottom max-h-[82vh] overflow-hidden ${
              isDark ? "border-zinc-800 bg-[#101113]" : "border-zinc-200 bg-white"
            }`}
          >
            <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-zinc-400/40" />
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <div className={`text-[11px] font-black uppercase tracking-[0.22em] ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
                  Navegacion movil
                </div>
                <div className={`text-2xl font-black ${isDark ? "text-white" : "text-zinc-900"}`}>Secciones</div>
                <div className={`text-xs mt-1 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                  Desliza izquierda o derecha sobre el contenido para pasar entre pantallas.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSectionsOpen(false)}
                className={`p-2 rounded-2xl border ${isDark ? "border-zinc-800 text-zinc-300" : "border-zinc-200 text-zinc-700"}`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="overflow-y-auto max-h-[calc(82vh-120px)] pr-1">
              <div className="grid grid-cols-1 gap-2">
                {mobileSectionOrder.map((tab) => {
                  const meta = getMobileTabMeta(tab);
                  const isActive = normalizeTabToken(activeTab) === normalizeTabToken(tab);
                  return (
                    <button
                      key={`sheet-${tab}`}
                      type="button"
                      onClick={() => handleTabSelect(tab)}
                      className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
                        isActive
                          ? isDark
                            ? "border-[#e85d04] bg-[#e85d04]/12 text-white"
                            : "border-[#e85d04] bg-[#fff4eb] text-zinc-900"
                          : isDark
                            ? "border-zinc-800 bg-zinc-900 text-zinc-300"
                            : "border-zinc-200 bg-zinc-50 text-zinc-700"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`rounded-2xl p-2 ${isActive ? "bg-[#e85d04] text-white" : isDark ? "bg-zinc-950 text-zinc-400" : "bg-white text-zinc-600"}`}>
                          <MobileTabIcon icon={meta.icon} className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-black uppercase tracking-[0.14em]">{meta.label}</div>
                          <div className={`text-xs mt-1 ${isActive ? (isDark ? "text-zinc-200" : "text-zinc-600") : isDark ? "text-zinc-500" : "text-zinc-500"}`}>
                            {meta.description}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={onRequestLogout}
                className={`mt-4 w-full rounded-2xl px-4 py-3 text-sm font-black uppercase tracking-[0.18em] ${
                  isDark ? "bg-rose-950/60 text-rose-200 border border-rose-900/70" : "bg-rose-50 text-rose-700 border border-rose-200"
                }`}
              >
                Cerrar sesion
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
