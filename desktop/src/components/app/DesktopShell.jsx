import { Suspense } from "react";
import HomeNavigation from "../HomeNavigation";
import NotificationBell from "../NotificationBell";
import AppSectionLoader from "./AppSectionLoader";

export default function DesktopShell({
  isDark,
  activeTab,
  allowedTabs,
  user,
  isMobileMenuOpen,
  onSetMobileMenuOpen,
  onSelectTab,
  onLogout,
  pendingCashOrders,
  onOpenPendingOrder,
  onCancelPendingOrder,
  notifications,
  onDismissAlert,
  onDismissAllAlerts,
  renderActiveTab,
}) {
  const handleTabSelect = (tab) => {
    onSetMobileMenuOpen(false);
    onSelectTab(tab);
  };

  return (
    <div className={`h-screen flex font-sans overflow-hidden ${isDark ? "bg-zinc-950 text-white" : "bg-zinc-50 text-zinc-900"}`}>
      {activeTab === "Dashboard" ? (
        <HomeNavigation
          user={user}
          allowedTabs={allowedTabs}
          onSelectTab={handleTabSelect}
          onLogout={onLogout}
          pendingCashOrders={pendingCashOrders}
          onOpenPendingOrder={onOpenPendingOrder}
          onCancelPendingOrder={onCancelPendingOrder}
        />
      ) : (
        <main className="flex-1 h-screen flex flex-col relative animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="absolute top-4 left-4 z-50 flex gap-2">
            <button
              onClick={() => handleTabSelect("Dashboard")}
              className={`hidden md:flex px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all shadow-xl items-center gap-2 ${isDark ? "bg-[#121212] border border-zinc-800 hover:border-zinc-600 text-zinc-400 hover:text-white" : "bg-white border border-zinc-200 hover:border-[#e85d04] text-zinc-600 hover:text-[#e85d04]"}`}
            >
              <span>VOLVER AL INICIO</span>
              <kbd className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-normal ${isDark ? "bg-zinc-800" : "bg-zinc-100"}`}>ESC</kbd>
            </button>
            <button
              onClick={() => onSetMobileMenuOpen(!isMobileMenuOpen)}
              className={`md:hidden p-2 rounded-lg transition-all shadow-md ${isDark ? "bg-[#121212] border border-zinc-800 text-zinc-400" : "bg-white border border-zinc-200 text-zinc-600"} ${isMobileMenuOpen ? (isDark ? "bg-zinc-800 text-white" : "bg-zinc-100 text-[#e85d04]") : ""}`}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {isMobileMenuOpen ? (
                  <>
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </>
                ) : (
                  <>
                    <line x1="3" y1="12" x2="21" y2="12"></line>
                    <line x1="3" y1="6" x2="21" y2="6"></line>
                    <line x1="3" y1="18" x2="21" y2="18"></line>
                  </>
                )}
              </svg>
            </button>
          </div>

          {isMobileMenuOpen ? (
            <div className="md:hidden absolute inset-0 z-40 flex flex-col pt-16 animate-in slide-in-from-left duration-300">
              <div className="flex-1 overflow-y-auto w-full p-4 shadow-2xl backdrop-blur-3xl bg-white/90 dark:bg-black/90 pb-24">
                <div className="grid grid-cols-1 gap-3">
                  <button
                    onClick={() => handleTabSelect("Dashboard")}
                    className="p-4 rounded-xl border-2 border-[#e85d04] bg-[#e85d04]/10 text-[#e85d04] font-black text-left w-full shadow-sm flex items-center justify-between"
                  >
                    <span>VOLVER AL INICIO</span>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path>
                    </svg>
                  </button>
                  {allowedTabs.map((tab) => (
                    <button
                      key={tab}
                      onClick={() => handleTabSelect(tab)}
                      className={`p-4 rounded-xl border text-left font-bold shadow-sm transition-colors ${activeTab === tab
                        ? (isDark ? "bg-zinc-800 border-zinc-700 text-white" : "bg-zinc-100 border-[#e85d04] text-[#e85d04]")
                        : (isDark ? "bg-[#121212] border-zinc-800 text-zinc-400" : "bg-white border-zinc-200 text-zinc-700")
                        }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <div className="flex-1 overflow-auto p-4 md:p-6 pb-6 pt-20">
            <Suspense fallback={<AppSectionLoader isDark={isDark} />}>
              {renderActiveTab()}
            </Suspense>
          </div>
        </main>
      )}

      <div className="absolute top-4 right-4 z-50">
        <NotificationBell
          alerts={notifications}
          onDismiss={onDismissAlert}
          onDismissAll={onDismissAllAlerts}
          isDark={isDark}
        />
      </div>
    </div>
  );
}
