import React from 'react';

export default function TicketPrinter({ ticket }) {
    if (!ticket || !Array.isArray(ticket.lines) || ticket.lines.length === 0) return null;

    return (
        <div className="ticket-print hidden print:block print:w-[58mm] print:pl-[4mm] print:pr-[2mm] print:font-sans print:font-semibold print:text-[13px] print:leading-snug">
            {ticket.lines.map((line, i) => {
                const text = line.trim();
                const isTitle = text === "DISTRIBUIDORA LA FAMILIA" || text === "BOLETA DE CONSOLIDADO";
                return (
                    <div key={i} className={`whitespace-pre-wrap ${isTitle ? "font-black text-[1.15em] text-center mb-1" : ""}`}>
                        {line}
                    </div>
                );
            })}
            <div className="pt-4 text-center text-[10px] font-normal">
                *** FIN COMPROBANTE ***
            </div>
        </div>
    );
}
