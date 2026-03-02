import { useEffect } from "react";

export default function AppToast({ message, type, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      className={`fixed bottom-4 right-4 px-4 py-2 rounded-lg shadow-lg z-[1000] transition-all ${
        type === "error" ? "bg-rose-600 text-white" : "bg-burnt-500 text-white"
      }`}
    >
      {message}
    </div>
  );
}
