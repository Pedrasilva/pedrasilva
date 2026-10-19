export function isConfirmableIssuedPdf(row:{direction:string|null;intake_type:string|null;status:string}) {
  return row.direction==='issued' && ['fatura_emitida','nota_credito'].includes(row.intake_type??'') && row.status==='pending_review';
}