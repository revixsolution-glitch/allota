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

  function handleFileSelect(selectedFile: File | null) {
    if (!selectedFile) return;
    setFile(selectedFile);
    setResult(null);

    // Auto-fill batch name if empty
    if (!batchTag) {
      const cleanName = selectedFile.name.replace(/\.[^/.]+$/, "");
      setBatchTag(`${cleanName}`);
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
