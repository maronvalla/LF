export default function ConfirmModal({ message, onCancel, onConfirm }) {
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
            No
          </button>
          <button
            className="bg-[#f07c0f] hover:bg-[#df6f08] text-white border border-[#d86b07] rounded px-5 py-1.5 text-sm font-bold"
            onClick={onConfirm}
            type="button"
          >
            Sí
          </button>
        </div>
      </div>
    </div>
  );
}
