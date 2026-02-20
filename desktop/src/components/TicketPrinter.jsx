import React from 'react';

export default function TicketPrinter({ ticket }) {
    if (!ticket || !Array.isArray(ticket.lines) || ticket.lines.length === 0) return null;

    return (
        <div className="ticket-print hidden print:block print:w-[58mm] print:font-mono print:text-[12px] print:leading-tight">
            {ticket.lines.map((line, i) => (
                <div key={i} className="whitespace-pre-wrap">
                    {line}
                </div>
            ))}
            <div className="pt-4 text-center text-[10px]">
                *** FIN COMPROBANTE ***
            </div>
        </div>
    );
}
