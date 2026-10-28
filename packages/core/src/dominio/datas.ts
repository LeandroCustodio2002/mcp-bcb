import { ErroDeEntrada } from "./tipos.js";

const ISO_DIA = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_MES = /^(\d{4})-(\d{2})$/;

/** "dd/mm/aaaa" (formato do SGS) → "aaaa-mm-dd". */
export function brParaIso(data: string): string {
  const [dia, mes, ano] = data.split("/");
  return `${ano}-${mes}-${dia}`;
}

/** "aaaa-mm-dd" → "dd/mm/aaaa". */
export function isoParaBr(data: string): string {
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

/** Data de hoje no fuso de Brasília, em ISO. */
export function hojeEmBrasilia(agora: Date): string {
  // en-CA formata como aaaa-mm-dd.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}

export function validarDia(data: string, campo: string): string {
  const m = ISO_DIA.exec(data);
  if (!m) throw new ErroDeEntrada(`${campo} deve estar no formato aaaa-mm-dd (recebido: "${data}").`);
  const d = new Date(`${data}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== data) {
    throw new ErroDeEntrada(`${campo} não é uma data válida: "${data}".`);
  }
  return data;
}

/** Aceita "aaaa-mm" ou "aaaa-mm-dd" e devolve o primeiro dia do mês. */
export function primeiroDiaDoMes(data: string, campo: string): string {
  const m = ISO_MES.exec(data) ?? ISO_DIA.exec(data);
  if (!m) throw new ErroDeEntrada(`${campo} deve estar no formato aaaa-mm (recebido: "${data}").`);
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) throw new ErroDeEntrada(`${campo} tem um mês inválido: "${data}".`);
  return `${m[1]}-${m[2]}-01`;
}

/** Diferença em anos entre duas datas ISO (aproximada, para checar limites). */
export function anosEntre(inicio: string, fim: string): number {
  const ms = new Date(`${fim}T00:00:00Z`).getTime() - new Date(`${inicio}T00:00:00Z`).getTime();
  return ms / (365.25 * 24 * 60 * 60 * 1000);
}
