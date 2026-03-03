import { useEffect } from "react";

export default function ConfirmModal({ message, onCancel, onConfirm }) {
  useEffect(() => {
    const onKey = (event) => {
      const key = String(event.key || "").toLowerCase();
      if (key === "y" || event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        onConfirm();
      } else if (key === "n" || event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel, onConfirm]);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl border border-zinc-200 p-5 w-[320px] flex flex-col gap-4">
        <p className="text-sm font-semibold text-zinc-800 text-center whitespace-pre-wrap">{message}</p>
        <div className="flex gap-2 justify-center">
          <button
            className="bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-300 rounded px-5 py-1.5 text-sm font-bold"
            onClick={onCancel}
            type="button"
          >
            No <kbd className="ml-1 text-[10px] font-mono font-normal bg-zinc-200 px-1 rounded">N</kbd>
          </button>
          <button
            className="bg-[#f07c0f] hover:bg-[#df6f08] text-white border border-[#d86b07] rounded px-5 py-1.5 text-sm font-bold"
            onClick={onConfirm}
            type="button"
          >
            Sí <kbd className="ml-1 text-[10px] font-mono font-normal bg-[#d86b07] px-1 rounded">Y</kbd> <kbd className="text-[10px] font-mono font-normal bg-[#d86b07] px-1 rounded">↵</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}
