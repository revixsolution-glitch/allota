"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";

interface EmployeeOption {
  id: string;
  name: string;
  leadCount: number;
}

export function ExcelUploader({ employees }: { employees: EmployeeOption[] }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [batchTag, setBatchTag] = useState("");
  const [division, setDivision] = useState("PCD_FRANCHISE");
  const [employeeId, setEmployeeId] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    allDuplicates?: boolean;
    message?: string;
    batchTag?: string;
    insertedCount?: number;
    duplicateCount?: number;
    invalidCount?: number;
    totalRowsProcessed?: number;
    assignedTo?: string;
    error?: string;
  } | null>(null);

  const [detectedColumns, setDetectedColumns] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<any[][]>([]);
  const [columnMapping, setColumnMapping] = useState<{
    nameCol: string;
    phoneCol: string;
    divisionCol: string;
    cityCol: string;
    stateCol: string;
    inquiryCol: string;
  }>({
    nameCol: "",
    phoneCol: "",
    divisionCol: "",
    cityCol: "",
    stateCol: "",
    inquiryCol: "",
  });

  async function handleFileSelect(selectedFile: File | null) {
    if (!selectedFile) return;
    setFile(selectedFile);
    setResult(null);

    // Auto-fill batch name if empty
    if (!batchTag) {
      const cleanName = selectedFile.name.replace(/\.[^/.]+$/, "");
      setBatchTag(`${cleanName}`);
    }

    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      const wb = XLSX.read(arrayBuffer, { type: "array" });
      const firstSheetName = wb.SheetNames[0];
      if (!firstSheetName) return;

      const sheet = wb.Sheets[firstSheetName];
      const aoa: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      const nonEmpty = aoa.filter((row) => Array.isArray(row) && row.some((c) => String(c).trim() !== ""));
      if (nonEmpty.length === 0) return;

      // Detect header row index
      let headerIdx = 0;
      for (let r = 0; r < Math.min(nonEmpty.length, 10); r++) {
        const row = nonEmpty[r];
        const matches = row.filter((cell) => {
          const s = String(cell).toLowerCase().replace(/[^a-z0-9]/g, "");
          return [
            "name", "party", "chemist", "doctor", "phone", "mobile", "contact",
            "city", "state", "type", "category", "division", "inquiry", "remark"
          ].some((kw) => s.includes(kw));
        }).length;
        if (matches >= 2) {
          headerIdx = r;
          break;
        }
      }

      const headers = (nonEmpty[headerIdx] || []).map((c, i) => {
        const s = String(c).trim();
        return s || `Column ${i + 1}`;
      });

      const dataSlice = nonEmpty.slice(headerIdx + 1, headerIdx + 4);

      setDetectedColumns(headers);
      setPreviewRows(dataSlice);

      // Auto-detect matching column for each field
      let autoName = "";
      let autoPhone = "";
      let autoDivision = "";
      let autoCity = "";
      let autoState = "";
      let autoInquiry = "";

      headers.forEach((h) => {
        const k = h.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (!k) return;

        // Division / Lead Type check: MUST take priority over generic name matches
        if (
          !autoDivision &&
          (k.includes("type") ||
           k.includes("division") ||
           k.includes("category") ||
           k.includes("segment") ||
           k.includes("franchise") ||
           k.includes("mfg") ||
           k.includes("nature") ||
           k === "pcd")
        ) {
          autoDivision = h;
        } else if (
          !autoPhone &&
          (k.includes("phone") ||
           k.includes("mobile") ||
           k.includes("mob") ||
           k.includes("whatsapp") ||
           k.includes("cell") ||
           k.includes("tel") ||
           k.includes("calling") ||
           k.includes("contactno") ||
           k === "contact")
        ) {
          autoPhone = h;
        } else if (
          !autoName &&
          (k.includes("name") ||
           k.includes("party") ||
           k.includes("chemist") ||
           k.includes("doctor") ||
           k.includes("dr") ||
           k.includes("customer") ||
           k.includes("client") ||
           k.includes("firm") ||
           k.includes("agency") ||
           k.includes("person") ||
           k.includes("prospect") ||
           k.includes("shop") ||
           k.includes("dealer")) &&
          !k.includes("type") &&
          !k.includes("division") &&
          !k.includes("category")
        ) {
          autoName = h;
        } else if (
          !autoCity &&
          (k.includes("city") ||
           k.includes("district") ||
           k.includes("dist") ||
           k.includes("town") ||
           k.includes("hq") ||
           k.includes("location") ||
           k.includes("place") ||
           k.includes("territory") ||
           k.includes("area") ||
           k.includes("address"))
        ) {
          autoCity = h;
        } else if (
          !autoState &&
          (k.includes("state") ||
           k.includes("province") ||
           k.includes("region") ||
           k.includes("zone"))
        ) {
          autoState = h;
        } else if (
          !autoInquiry &&
          (k.includes("inquiry") ||
           k.includes("enquiry") ||
           k.includes("remark") ||
           k.includes("note") ||
           k.includes("requirement") ||
           k.includes("product") ||
           k.includes("detail") ||
           k.includes("message"))
        ) {
          autoInquiry = h;
        }
      });

      // If autoName is still empty, look for any header that is not phone/city/state/division
      if (!autoName) {
        const remaining = headers.find(
          (h) => h !== autoPhone && h !== autoDivision && h !== autoCity && h !== autoState && h !== autoInquiry
        );
        if (remaining) autoName = remaining;
      }

      setColumnMapping({
        nameCol: autoName || "",
        phoneCol: autoPhone || "",
        divisionCol: autoDivision || "",
        cityCol: autoCity || "",
        stateCol: autoState || "",
        inquiryCol: autoInquiry || "",
      });
    } catch (e) {
      console.warn("Could not preview spreadsheet client-side:", e);
    }
  }

  function downloadSampleCsv() {
    const sampleData = [
      {
        "Full Name": "Dr. Rajesh Sharma",
        "Mobile Number": "9812345670",
        "City": "Ambala",
        "State": "Haryana",
        "Category": "PCD Pharma Franchise",
        "Inquiry Details": "Interested in cardiac & diabetic PCD monopoly rights for Ambala Cantt",
      },
      {
        "Full Name": "Gupta Medicos",
        "Mobile Number": "9898765432",
        "City": "Varanasi",
        "State": "Uttar Pradesh",
        "Category": "PCD Pharma Franchise",
        "Inquiry Details": "Requires pediatric range PCD price list and visual aid",
      },
      {
        "Full Name": "Zenith Bioscience Pvt Ltd",
        "Mobile Number": "9876543210",
        "City": "Baddi",
        "State": "Himachal Pradesh",
        "Category": "Third-Party Manufacturing",
        "Inquiry Details": "Quotations needed for 50,000 Softgel capsules batch (Calcium + Calcitriol)",
      },
      {
        "Full Name": "Apex Pharma Formulation",
        "Mobile Number": "9712345678",
        "City": "Ahmedabad",
        "State": "Gujarat",
        "Category": "Third-Party Manufacturing",
        "Inquiry Details": "Contract manufacturing for dry syrups and antibiotic tablets",
      },
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sample Leads");
    XLSX.writeFile(wb, "Allota_AI_Bulk_Leads_Template.xlsx");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setIsUploading(true);
    setResult(null);

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("batchTag", batchTag.trim());
      fd.append("division", division);
      if (employeeId) {
        fd.append("employeeId", employeeId);
      }
      if (columnMapping.nameCol || columnMapping.phoneCol || columnMapping.divisionCol) {
        fd.append("columnMapping", JSON.stringify(columnMapping));
      }

      const res = await fetch("/api/admin/leads/upload", {
        method: "POST",
        body: fd,
      });

      const data = await res.json();
      if (!res.ok) {
        setResult({
          success: false,
          error: data.error || "Failed to upload file",
        });
      } else {
        setResult(data);
        setFile(null);
        setBatchTag("");
        setDetectedColumns([]);
        setPreviewRows([]);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        router.refresh();
      }
    } catch (err: any) {
      setResult({
        success: false,
        error: err?.message || "Network error while uploading",
      });
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="rounded-3xl p-6 neo-panel bg-white border border-line shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="text-base font-extrabold text-ink">
              ⚡ High-Speed Bulk Excel / CSV Ingestor
            </h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 border border-emerald-200 px-2 py-0.5 text-[10px] font-extrabold text-emerald-800">
              🛡️ Zero-Duplicate Guarantee
            </span>
          </div>
          <p className="text-xs text-ink-faint mt-0.5">
            Ingest commercial leads at zero Marg API cost. Strictly filters existing CRM numbers & duplicate rows so employees never share duplicate data.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href="/api/admin/leads/export"
            download
            className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-bold text-blue-800 hover:bg-blue-100 transition shadow-2xs shrink-0 cursor-pointer"
          >
            <svg className="h-4 w-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export All Leads (.xlsx)
          </a>

          <button
            type="button"
            onClick={downloadSampleCsv}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition shadow-2xs shrink-0 cursor-pointer"
          >
            <svg className="h-4 w-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download Excel Template (.xlsx)
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        {/* Drag and Drop Zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
              handleFileSelect(e.dataTransfer.files[0]);
            }
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-7 text-center transition cursor-pointer ${
            isDragging
              ? "border-emerald-500 bg-emerald-50/50"
              : file
              ? "border-emerald-400 bg-emerald-50/20"
              : "border-line hover:border-emerald-400 hover:bg-slate-50/70"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx, .xls, .csv"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileSelect(e.target.files[0]);
              }
            }}
          />

          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 shadow-xs mb-3">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>

          {file ? (
            <div>
              <p className="text-sm font-bold text-emerald-800">{file.name}</p>
              <p className="text-xs text-ink-muted mt-0.5">
                {(file.size / 1024).toFixed(1)} KB • Ready for ingest • Click to choose another file
              </p>
            </div>
          ) : (
            <div>
              <p className="text-sm font-bold text-ink">
                Drag & drop your Excel or CSV file here, or <span className="text-emerald-600 underline">browse files</span>
              </p>
              <p className="text-xs text-ink-faint mt-1">
                Supports .xlsx, .xls, and .csv files (Handles 5,000+ records with auto phone deduplication)
              </p>
            </div>
          )}
        </div>

        {/* Smart Column Mapping & Live Preview Section */}
        {file && detectedColumns.length > 0 && (
          <div className="rounded-2xl border border-emerald-200/80 bg-gradient-to-b from-emerald-50/40 to-slate-50/50 p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white text-[10px] font-bold">
                    ✓
                  </span>
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-ink">
                    Smart Column Mapping & Live Ingestion Preview
                  </h3>
                </div>
                <p className="text-[11px] text-ink-muted mt-0.5">
                  Confirm or adjust how spreadsheet columns map to CRM fields so lead names, types & phones are processed with 100% precision.
                </p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-emerald-800 border border-emerald-200 shrink-0">
                {detectedColumns.length} Columns Detected
              </span>
            </div>

            {/* Column Mapping Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-wider text-ink-muted mb-1">
                  👤 Lead / Party Name *
                </label>
                <select
                  value={columnMapping.nameCol}
                  onChange={(e) => setColumnMapping({ ...columnMapping, nameCol: e.target.value })}
                  className="w-full h-9 rounded-xl border border-line bg-white px-2.5 text-xs font-semibold text-ink neo-pressed focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                >
                  <option value="">⚡ Auto-Detect Name</option>
                  {detectedColumns.map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-wider text-ink-muted mb-1">
                  📞 Mobile Number *
                </label>
                <select
                  value={columnMapping.phoneCol}
                  onChange={(e) => setColumnMapping({ ...columnMapping, phoneCol: e.target.value })}
                  className="w-full h-9 rounded-xl border border-line bg-white px-2.5 text-xs font-semibold text-ink neo-pressed focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                >
                  <option value="">⚡ Auto-Detect Phone</option>
                  {detectedColumns.map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-wider text-ink-muted mb-1">
                  🏢 Lead Type / Division
                </label>
                <select
                  value={columnMapping.divisionCol}
                  onChange={(e) => setColumnMapping({ ...columnMapping, divisionCol: e.target.value })}
                  className="w-full h-9 rounded-xl border border-line bg-white px-2.5 text-xs font-semibold text-ink neo-pressed focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                >
                  <option value="">⚡ Use Selected Division ({division === "PCD_FRANCHISE" ? "PCD" : "Third Party"})</option>
                  {detectedColumns.map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-wider text-ink-muted mb-1">
                  📍 City / District
                </label>
                <select
                  value={columnMapping.cityCol}
                  onChange={(e) => setColumnMapping({ ...columnMapping, cityCol: e.target.value })}
                  className="w-full h-9 rounded-xl border border-line bg-white px-2.5 text-xs font-semibold text-ink neo-pressed focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                >
                  <option value="">⚡ Auto-Detect City</option>
                  {detectedColumns.map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-wider text-ink-muted mb-1">
                  🗺️ State
                </label>
                <select
                  value={columnMapping.stateCol}
                  onChange={(e) => setColumnMapping({ ...columnMapping, stateCol: e.target.value })}
                  className="w-full h-9 rounded-xl border border-line bg-white px-2.5 text-xs font-semibold text-ink neo-pressed focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                >
                  <option value="">⚡ Auto-Detect State</option>
                  {detectedColumns.map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-wider text-ink-muted mb-1">
                  📝 Inquiry / Notes
                </label>
                <select
                  value={columnMapping.inquiryCol}
                  onChange={(e) => setColumnMapping({ ...columnMapping, inquiryCol: e.target.value })}
                  className="w-full h-9 rounded-xl border border-line bg-white px-2.5 text-xs font-semibold text-ink neo-pressed focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                >
                  <option value="">⚡ Auto-Detect Inquiry</option>
                  {detectedColumns.map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Live 3-Row Preview Table */}
            {previewRows.length > 0 && (
              <div className="rounded-xl border border-line bg-white overflow-hidden shadow-2xs mt-3">
                <div className="bg-slate-50/80 px-3.5 py-2 border-b border-line flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-ink-muted">
                    Live Sample Preview (First {previewRows.length} Rows)
                  </span>
                  <span className="text-[10px] text-emerald-700 font-bold">
                    ✓ Live mapping preview verified
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-line bg-slate-50/40 text-[10px] uppercase font-bold text-ink-muted">
                        <th className="py-2 px-3">#</th>
                        <th className="py-2 px-3">Lead / Party Name</th>
                        <th className="py-2 px-3">Phone</th>
                        <th className="py-2 px-3">Lead Type / Division</th>
                        <th className="py-2 px-3">Location</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {previewRows.map((row, idx) => {
                        const nameIdx = detectedColumns.indexOf(columnMapping.nameCol);
                        const phoneIdx = detectedColumns.indexOf(columnMapping.phoneCol);
                        const divIdx = detectedColumns.indexOf(columnMapping.divisionCol);
                        const cityIdx = detectedColumns.indexOf(columnMapping.cityCol);
                        const stateIdx = detectedColumns.indexOf(columnMapping.stateCol);

                        let previewName = nameIdx !== -1 && row[nameIdx] ? String(row[nameIdx]).trim() : "";
                        // If selected name column is a division keyword, show recovery
                        const isDivTerm = /pcd|franchise|third|mfg|contract/i.test(previewName);
                        if (!previewName || isDivTerm) {
                          // Look for alternate cell
                          const alternate = row.find(
                            (c: any, i: number) =>
                              i !== phoneIdx &&
                              i !== divIdx &&
                              c &&
                              String(c).trim().length >= 2 &&
                              !/pcd|franchise|third|mfg|contract/i.test(String(c)) &&
                              !/^\d+$/.test(String(c))
                          );
                          if (alternate) {
                            previewName = String(alternate).trim();
                          }
                        }

                        const previewPhone = phoneIdx !== -1 && row[phoneIdx] ? String(row[phoneIdx]).trim() : row.find((c: any) => /^[6-9]\d{9}$/.test(String(c).replace(/\D/g, "").slice(-10))) || "Auto-detecting";
                        const rawDiv = divIdx !== -1 && row[divIdx] ? String(row[divIdx]).trim() : (division === "PCD_FRANCHISE" ? "PCD Pharma Franchise" : "Third-Party Manufacturing");
                        const previewCity = cityIdx !== -1 && row[cityIdx] ? String(row[cityIdx]).trim() : "";
                        const previewState = stateIdx !== -1 && row[stateIdx] ? String(row[stateIdx]).trim() : "";
                        const loc = [previewCity, previewState].filter(Boolean).join(", ") || "—";

                        return (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="py-2 px-3 text-ink-faint text-[10px] font-mono">{idx + 1}</td>
                            <td className="py-2 px-3 font-bold text-ink">
                              {previewName || <span className="text-amber-600 italic">Prospect (Auto-Named)</span>}
                            </td>
                            <td className="py-2 px-3 font-mono text-ink-muted">
                              {previewPhone}
                            </td>
                            <td className="py-2 px-3">
                              <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-200">
                                {rawDiv.toLowerCase().includes("third") || rawDiv.toLowerCase().includes("mfg") ? "🏭 Third-Party" : "🏢 PCD Franchise"}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-ink-muted truncate max-w-[120px]">
                              {loc}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Form Controls Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1.5">
              Batch Tag / Campaign Name *
            </label>
            <input
              type="text"
              value={batchTag}
              onChange={(e) => setBatchTag(e.target.value)}
              required
              placeholder="e.g. CPHI Expo Delhi 2025"
              className="w-full h-11 rounded-2xl border border-line bg-white px-3.5 text-xs font-semibold text-ink neo-pressed focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1.5">
              Pharma Division *
            </label>
            <select
              value={division}
              onChange={(e) => setDivision(e.target.value)}
              className="w-full h-11 rounded-2xl border border-line bg-white px-3.5 text-xs font-semibold text-ink neo-pressed focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            >
              <option value="PCD_FRANCHISE">🏢 PCD Pharma Franchise</option>
              <option value="THIRD_PARTY">🏭 Third-Party Manufacturing</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1.5">
              Initial Assignment
            </label>
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="w-full h-11 rounded-2xl border border-line bg-white px-3.5 text-xs font-semibold text-ink neo-pressed focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            >
              <option value="">⚡ Keep in Unassigned Pool (Allot later)</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  Directly Assign to: {emp.name} ({emp.leadCount} leads)
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-ink-faint">
            Every lead is stored with original payload & timestamp. ₹0 Marg API overhead.
          </p>

          <button
            type="submit"
            disabled={!file || isUploading}
            className={`flex items-center gap-2 rounded-2xl px-6 py-3 text-xs font-bold text-white shadow-md transition cursor-pointer ${
              !file || isUploading
                ? "bg-slate-300 cursor-not-allowed shadow-none"
                : "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-emerald-500/25"
            }`}
          >
            {isUploading ? (
              <>
                <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Processing & Deduplicating...</span>
              </>
            ) : (
              <>
                <span>🚀</span>
                <span>Ingest & Process Batch</span>
              </>
            )}
          </button>
        </div>

        {/* Feedback / Result Banner */}
        {result && (
          <div
            className={`rounded-2xl p-4 border transition-all ${
              result.success
                ? result.allDuplicates
                  ? "bg-blue-50 border-blue-200 text-blue-900"
                  : "bg-emerald-50 border-emerald-200 text-emerald-900"
                : "bg-rose-50 border-rose-200 text-rose-900"
            }`}
          >
            {result.success ? (
              result.allDuplicates ? (
                <div>
                  <div className="flex items-center gap-2 font-bold text-sm text-blue-900">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-700 text-xs">
                      🛡️
                    </span>
                    <span>Zero-Duplicate Protection Active: All Contacts Already in CRM</span>
                  </div>
                  <p className="mt-1 text-xs text-blue-800 leading-relaxed font-medium">
                    {result.message || `All ${result.duplicateCount} contacts in this spreadsheet already exist in your CRM database and were safely skipped. Zero duplicate leads were created, ensuring no duplicate data is shared with employees.`}
                  </p>
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="rounded-xl bg-white/90 p-2.5 border border-blue-200 shadow-2xs">
                      <p className="text-ink-faint text-[10px] font-bold uppercase">New Leads Created</p>
                      <p className="text-base font-extrabold text-blue-700">0</p>
                    </div>
                    <div className="rounded-xl bg-white/90 p-2.5 border border-blue-200 shadow-2xs">
                      <p className="text-ink-faint text-[10px] font-bold uppercase">Duplicates Filtered</p>
                      <p className="text-base font-extrabold text-amber-600">{result.duplicateCount} (Skipped)</p>
                    </div>
                    <div className="rounded-xl bg-white/90 p-2.5 border border-blue-200 shadow-2xs">
                      <p className="text-ink-faint text-[10px] font-bold uppercase">Invalid Rows</p>
                      <p className="text-base font-extrabold text-slate-500">{result.invalidCount || 0}</p>
                    </div>
                    <div className="rounded-xl bg-white/90 p-2.5 border border-blue-200 shadow-2xs">
                      <p className="text-ink-faint text-[10px] font-bold uppercase">Isolation Guarantee</p>
                      <p className="text-xs font-bold text-emerald-700 truncate mt-1">✓ 100% Rep Protected</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2 font-bold text-sm text-emerald-800">
                    <svg className="h-5 w-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Batch Ingested Successfully: {result.batchTag}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="rounded-xl bg-white/80 p-2.5 border border-emerald-100">
                      <p className="text-ink-faint text-[10px] font-bold uppercase">New Leads Ingested</p>
                      <p className="text-base font-extrabold text-emerald-700">{result.insertedCount}</p>
                    </div>
                    <div className="rounded-xl bg-white/80 p-2.5 border border-emerald-100">
                      <p className="text-ink-faint text-[10px] font-bold uppercase">Duplicate Phones Skipped</p>
                      <p className="text-base font-extrabold text-amber-600">{result.duplicateCount}</p>
                    </div>
                    <div className="rounded-xl bg-white/80 p-2.5 border border-emerald-100">
                      <p className="text-ink-faint text-[10px] font-bold uppercase">Invalid Rows Skipped</p>
                      <p className="text-base font-extrabold text-rose-600">{result.invalidCount}</p>
                    </div>
                    <div className="rounded-xl bg-white/80 p-2.5 border border-emerald-100">
                      <p className="text-ink-faint text-[10px] font-bold uppercase">Assignment Status</p>
                      <p className="text-xs font-bold text-ink truncate mt-1">{result.assignedTo}</p>
                    </div>
                  </div>
                </div>
              )
            ) : (
              <div className="flex items-start gap-2.5 text-xs">
                <svg className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="font-bold text-rose-800">Upload Failed</p>
                  <p className="mt-0.5 text-rose-700 leading-relaxed">{result.error}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
