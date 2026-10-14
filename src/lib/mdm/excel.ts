import * as XLSX from "xlsx";
import { META_COLS, TABLES, type AuditEntry, type MasterRow, type TableKey } from "./schema";

const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");

function rowsToSheet(table: TableKey, rows: MasterRow[]) {
  const cols = [...TABLES[table].columns.map((c) => c.key), ...META_COLS];
  return XLSX.utils.json_to_sheet(rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c] ?? ""]))), { header: cols });
}

export function exportTable(table: TableKey, rows: MasterRow[]) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, rowsToSheet(table, rows), table);
  XLSX.writeFile(wb, `${table}_${stamp()}.xlsx`);
}

export function exportBackup(data: { table: TableKey; rows: MasterRow[] }[], audit?: AuditEntry[]) {
  const wb = XLSX.utils.book_new();
  for (const d of data) XLSX.utils.book_append_sheet(wb, rowsToSheet(d.table, d.rows), d.table);
  if (audit) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(audit.map((a) => ({
      DateTime: a.at, User: a.user, Action: a.action, Table: a.table ?? "", Record: a.recordCode ?? "",
      Changes: (a.changes ?? []).map((c) => `${c.field}: ${c.old ?? "∅"} → ${c.new ?? "∅"}`).join("; "), Note: a.note ?? "",
    }))), "AUDIT_LOG");
  }
  XLSX.writeFile(wb, `MDM_BACKUP_${stamp()}.xlsx`);
}

export function downloadTemplate(table: TableKey) {
  const cols = [...TABLES[table].columns.map((c) => c.key), "status"];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([cols]), table);
  XLSX.writeFile(wb, `${table}_TEMPLATE.xlsx`);
}

export async function readImport(file: File) {
  const wb = XLSX.read(await file.arrayBuffer());
  const ws = wb.Sheets[wb.SheetNames[0]!]!;
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
}
