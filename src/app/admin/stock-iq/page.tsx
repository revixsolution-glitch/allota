import Link from "next/link";
import {
  adjustProductStock,
  createProductStock,
  triggerErpSync,
} from "@/lib/admin-actions";
import { prisma } from "@/lib/prisma";
import { getSession, getActiveCompanyId } from "@/lib/auth";
import { ErpModuleGate } from "@/components/ErpModuleGate";

export default async function AdminStockIqPage(props: {
  searchParams: Promise<{
    search?: string;
    filter?: string;
    category?: string;
    dosageForm?: string;
  }>;
}) {
  const session = await getSession();
  const activeCompanyId = getActiveCompanyId(session);
  const companyScope = activeCompanyId ? { companyId: activeCompanyId } : {};

  const settings = activeCompanyId
    ? await prisma.companySettings.findFirst({
        where: { companyId: activeCompanyId },
      })
    : await prisma.companySettings.findFirst({
        where: { id: "default" },
      });

  const isSuperAdmin = session?.role === "SUPER_ADMIN";
  const company = activeCompanyId
    ? await prisma.company.findUnique({ where: { id: activeCompanyId } })
    : null;
  const isDemoAdmin =
    isSuperAdmin ||
    !company?.slug ||
    company.slug === "pharma-life" ||
    company.slug === "pharma-life-sciences";

  const hasBillingApi = Boolean(settings?.billingSoftwareApiKey && settings?.enableBillingErp);
  const canAccessErp = hasBillingApi || (isDemoAdmin && Boolean(settings?.enableBillingErp));

  if (!canAccessErp || !settings?.enableStockIq) {
    return (
      <ErpModuleGate
        moduleName="Stock IQ & Batch Inventory"
        description="Tracks formulation inventory, available box stock, net billing rates, and expiry risk buckets."
        erpDependency="Marg ERP 9+ or Billing API"
        icon="📦"
      />
    );
  }

  const searchParams = await props.searchParams;
  const search = (searchParams.search || "").trim().toLowerCase();
  const filter = searchParams.filter || "all";
  const category = searchParams.category || "all";
  const dosageForm = searchParams.dosageForm || "all";

  const allProducts = await prisma.product.findMany({
    where: companyScope,
    orderBy: [{ stockQty: "asc" }, { name: "asc" }],
  });

  const now = new Date();

  // Aggregate metrics
  const totalSkus = allProducts.length;
  const totalBoxes = allProducts.reduce((sum, p) => sum + p.stockQty, 0);

  const nearExpiryProducts = allProducts.filter((p) => {
    if (!p.expiryDate) return false;
    const diffDays = Math.ceil(
      (p.expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    return diffDays > 0 && diffDays <= 90;
  });

  const criticalExpiryProducts = allProducts.filter((p) => {
    if (!p.expiryDate) return false;
    const diffDays = Math.ceil(
      (p.expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    return diffDays > 0 && diffDays <= 30;
  });

  const lowStockProducts = allProducts.filter(
    (p) => p.stockQty <= p.reorderThreshold
  );

  const totalNearExpiryBoxes = nearExpiryProducts.reduce(
    (sum, p) => sum + p.stockQty,
    0
  );

  // Expiry buckets for visual overview
  const expiryBuckets = [
    {
      label: "Critical (< 30 Days)",
      days: 30,
      count: criticalExpiryProducts.length,
      boxes: criticalExpiryProducts.reduce((s, p) => s + p.stockQty, 0),
      tone: "rose",
      desc: "Immediate distributor clearance discount needed",
    },
    {
      label: "Near Expiry (31–60 Days)",
      days: 60,
      count: allProducts.filter((p) => {
        if (!p.expiryDate) return false;
        const d = Math.ceil((p.expiryDate.getTime() - now.getTime()) / 86400000);
        return d > 30 && d <= 60;
      }).length,
      boxes: allProducts
        .filter((p) => {
          if (!p.expiryDate) return false;
          const d = Math.ceil((p.expiryDate.getTime() - now.getTime()) / 86400000);
          return d > 30 && d <= 60;
        })
        .reduce((s, p) => s + p.stockQty, 0),
      tone: "amber",
      desc: "Prioritize in upcoming franchise dispatches",
    },
    {
      label: "Approaching (61–90 Days)",
      days: 90,
      count: allProducts.filter((p) => {
        if (!p.expiryDate) return false;
        const d = Math.ceil((p.expiryDate.getTime() - now.getTime()) / 86400000);
        return d > 60 && d <= 90;
      }).length,
      boxes: allProducts
        .filter((p) => {
          if (!p.expiryDate) return false;
          const d = Math.ceil((p.expiryDate.getTime() - now.getTime()) / 86400000);
          return d > 60 && d <= 90;
        })
        .reduce((s, p) => s + p.stockQty, 0),
      tone: "blue",
      desc: "Monitor reorder frequency and buffer",
    },
    {
      label: "Healthy Shelf Life (> 90 Days)",
      days: 91,
      count: allProducts.filter((p) => {
        if (!p.expiryDate) return true;
        const d = Math.ceil((p.expiryDate.getTime() - now.getTime()) / 86400000);
        return d > 90;
      }).length,
      boxes: allProducts
        .filter((p) => {
          if (!p.expiryDate) return true;
          const d = Math.ceil((p.expiryDate.getTime() - now.getTime()) / 86400000);
          return d > 90;
        })
        .reduce((s, p) => s + p.stockQty, 0),
      tone: "emerald",
      desc: "Standard commercial circulation",
    },
  ];

  // 1. Dynamic Formulation Categories (Dosage forms & product ranges directly from live ERP data)
  const distinctDosageForms = Array.from(
    new Set(allProducts.map((p) => (p.dosageForm || "Tablets").trim()))
  ).filter(Boolean);

  const preferredOrder = [
    "Tablets",
    "Softgel Capsules",
    "Injections",
    "Capsules",
    "Syrups & Suspensions",
    "Ointments & Gels",
    "Drops & Pediatrics",
  ];

  const sortedCategories = distinctDosageForms.sort((a, b) => {
    const idxA = preferredOrder.indexOf(a);
    const idxB = preferredOrder.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b);
  });

  const categoryStats = sortedCategories.map((catName) => {
    const matching = allProducts.filter(
      (p) => (p.dosageForm || "Tablets").toLowerCase() === catName.toLowerCase()
    );
    const meta = getCategoryMeta(catName);
    return {
      name: catName,
      count: matching.length,
      boxes: matching.reduce((sum, p) => sum + p.stockQty, 0),
      ...meta,
    };
  });

  // 2. Dynamic Therapeutic Divisions (Cardio & Diab, Antibiotics, Gastroenterology, Gynecology, etc.)
  const distinctDivisions = Array.from(
    new Set(allProducts.map((p) => (p.category || "General").trim()))
  ).filter(Boolean).sort();

  // URL Helper preserving filter parameters
  const buildFilterUrl = (overrides: {
    filter?: string;
    category?: string;
    dosageForm?: string;
    search?: string;
  }) => {
    const f = overrides.filter !== undefined ? overrides.filter : filter;
    const c = overrides.category !== undefined ? overrides.category : category;
    const d = overrides.dosageForm !== undefined ? overrides.dosageForm : dosageForm;
    const s = overrides.search !== undefined ? overrides.search : (searchParams.search || "");

    const params = new URLSearchParams();
    if (f && f !== "all") params.set("filter", f);
    if (c && c !== "all") params.set("category", c);
    if (d && d !== "all") params.set("dosageForm", d);
    if (s && s.trim()) params.set("search", s.trim());

    const qs = params.toString();
    return qs ? `/admin/stock-iq?${qs}` : "/admin/stock-iq";
  };

  // Filtered list - Pure Logic based on live database values
  const filteredProducts = allProducts.filter((p) => {
    // Search matching across name, sku, composition, batch, dosageForm, and category
    if (search) {
      const matchName = p.name.toLowerCase().includes(search);
      const matchSku = p.sku.toLowerCase().includes(search);
      const matchComp = (p.composition || "").toLowerCase().includes(search);
      const matchBatch = (p.batchNumber || "").toLowerCase().includes(search);
      const matchDosage = (p.dosageForm || "").toLowerCase().includes(search);
      const matchCat = (p.category || "").toLowerCase().includes(search);
      if (!matchName && !matchSku && !matchComp && !matchBatch && !matchDosage && !matchCat) return false;
    }

    // Formulation Category Filter (Tablets, Softgel Capsules, Injections, etc.)
    if (dosageForm !== "all") {
      if ((p.dosageForm || "Tablets").toLowerCase() !== dosageForm.toLowerCase()) {
        return false;
      }
    }

    // Therapeutic Division filter
    if (category !== "all") {
      if ((p.category || "General").toLowerCase() !== category.toLowerCase()) {
        return false;
      }
    }

    // Status filter
    if (filter === "near-expiry") {
      if (!p.expiryDate) return false;
      const d = Math.ceil((p.expiryDate.getTime() - now.getTime()) / 86400000);
      return d <= 90;
    }
    if (filter === "low-stock") {
      return p.stockQty <= p.reorderThreshold;
    }
    if (filter === "healthy") {
      const isNearExpiry = p.expiryDate
        ? Math.ceil((p.expiryDate.getTime() - now.getTime()) / 86400000) <= 90
        : false;
      return p.stockQty > p.reorderThreshold && !isNearExpiry;
    }

    return true;
  });

  const lastSyncedProduct = allProducts.find((p) => p.lastSyncedAt);
  const lastSyncTime = lastSyncedProduct?.lastSyncedAt
    ? lastSyncedProduct.lastSyncedAt.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Recently synced";

  return (
    <div className="space-y-8">
      {/* Top Banner with ERP Sync Integration */}
      <section className="relative overflow-hidden rounded-3xl p-7 neo-panel border-t-2 border-t-teal-500">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 h-60 w-60 rounded-full bg-gradient-to-br from-teal-400/15 via-emerald-500/10 to-indigo-500/10 blur-3xl pointer-events-none" />

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between relative z-10">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-800 border border-teal-200">
                <span className="h-2 w-2 rounded-full bg-teal-500 animate-pulse" />
                Live ERP Integration
              </span>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
                Marg ERP 9+ & Busy Accounting API
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-ink-muted">
                Last API Sync: {lastSyncTime}
              </span>
            </div>

            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-ink">
              Stock IQ & ERP Inventory Intelligence
            </h1>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            <form action={triggerErpSync}>
              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-md shadow-teal-500/20 hover:shadow-lg hover:from-teal-700 hover:to-emerald-700 transition cursor-pointer"
              >
                <svg className="h-4 w-4 animate-spin-slow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Sync with Marg / Busy API
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* 4 Financial & Inventory KPI Cards */}
      <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StockKpiCard
          title="Total Available Stock"
          value={`${totalBoxes.toLocaleString("en-IN")} Boxes`}
          detail={`${totalSkus} Active Pharmaceutical SKUs`}
          topBar="from-teal-400 via-emerald-500 to-teal-600"
          icon={
            <svg className="h-5 w-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          }
          iconBg="bg-teal-50 border-teal-200"
          tag="Warehoused"
          tagClass="bg-teal-50 text-teal-700 border-teal-200"
        />

        <StockKpiCard
          title="Near-Expiry Risk (< 90d)"
          value={`${nearExpiryProducts.length} SKUs`}
          detail={`${totalNearExpiryBoxes.toLocaleString("en-IN")} boxes requiring fast clearance`}
          topBar="from-amber-400 via-orange-500 to-amber-600"
          icon={
            <svg className="h-5 w-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          iconBg="bg-amber-50 border-amber-200"
          tag="Expiry Watch"
          tagClass="bg-amber-50 text-amber-700 border-amber-200"
        />

        <StockKpiCard
          title="Critical Expiry (< 30d)"
          value={`${criticalExpiryProducts.length} SKUs`}
          detail="Urgent recall or emergency distributor incentive"
          topBar="from-rose-400 via-red-500 to-rose-600"
          icon={
            <svg className="h-5 w-5 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          }
          iconBg="bg-rose-50 border-rose-200"
          tag="Urgent Action"
          tagClass="bg-rose-50 text-rose-700 border-rose-200"
        />

        <StockKpiCard
          title="Low Stock / Reorder Needed"
          value={`${lowStockProducts.length} SKUs`}
          detail="Below safety reorder threshold in Marg ERP"
          topBar="from-indigo-400 via-blue-500 to-indigo-600"
          icon={
            <svg className="h-5 w-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          }
          iconBg="bg-indigo-50 border-indigo-200"
          tag="PO Alert"
          tagClass="bg-indigo-50 text-indigo-700 border-indigo-200"
        />
      </section>

      {/* Near Expiry & Shelf-Life Breakdown Panel */}
      <section className="rounded-3xl p-6 neo-panel">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-b border-line pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              <h2 className="font-bold text-ink text-base">
                Batch Expiry Intelligence & Shelf-Life Segmentation
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-ink-faint">
              Categorized timeline of medicine batches to prevent expired stock returns and protect dealer relationships.
            </p>
          </div>
          <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
            Marg ERP Rule: Auto-discount at 60 Days to Expiry
          </span>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {expiryBuckets.map((bucket) => (
            <div
              key={bucket.label}
              className="rounded-2xl p-4 neo-pressed border border-line flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                  {bucket.label}
                </span>
                <span className="rounded-md bg-white px-2 py-0.5 text-[11px] font-bold text-ink shadow-xs border border-line">
                  {bucket.count} SKUs
                </span>
              </div>

              <div className="my-3">
                <p className="text-2xl font-black text-ink">
                  {bucket.boxes.toLocaleString("en-IN")} <span className="text-sm font-semibold text-ink-muted">Boxes</span>
                </p>
                <p className="text-[11px] text-ink-faint mt-1 leading-relaxed">
                  {bucket.desc}
                </p>
              </div>

              <div className="pt-2 border-t border-line/60 flex items-center justify-between text-[10px] text-ink-faint">
                <span>Buffer Status:</span>
                <span className={`font-bold ${
                  bucket.tone === "rose"
                    ? "text-rose-600"
                    : bucket.tone === "amber"
                    ? "text-amber-600"
                    : bucket.tone === "blue"
                    ? "text-blue-600"
                    : "text-emerald-600"
                }`}>
                  {bucket.count > 0 ? `${bucket.count} Batches Flagged` : "Zero Risk"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Add New SKU / Product Form */}
      <section className="rounded-3xl p-6 neo-panel">
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div>
            <h2 className="font-bold text-ink text-base">
              Add New Medicine SKU to Inventory
            </h2>
          </div>
          <span className="rounded-full bg-teal-50 text-teal-800 border border-teal-200 px-3 py-1 text-xs font-bold">
            Live ERP Mapping
          </span>
        </div>

        <form action={createProductStock} className="mt-5 grid gap-4 md:grid-cols-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Brand / Product Name *
            </label>
            <input
              name="name"
              required
              placeholder="e.g. Cefixime 200mg DT"
              className={formInputClass}
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              SKU Code *
            </label>
            <input
              name="sku"
              required
              placeholder="e.g. CEF-200-DT"
              className={formInputClass}
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Active Composition / Salts
            </label>
            <input
              name="composition"
              placeholder="e.g. Cefixime 200mg + LB"
              className={formInputClass}
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Product Category / Formulation *
            </label>
            <select name="dosageForm" className={formInputClass} defaultValue="Tablets" required>
              <option value="Tablets">⚪ Tablets</option>
              <option value="Softgel Capsules">🟢 Softgel Capsules</option>
              <option value="Injections">💉 Injections</option>
              <option value="Capsules">💊 Capsules</option>
              <option value="Syrups & Suspensions">🧪 Syrups & Suspensions</option>
              <option value="Ointments & Gels">🧴 Ointments & Gels</option>
              <option value="Drops & Pediatrics">💧 Drops & Pediatrics</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Therapeutic Division / Segment
            </label>
            <select name="category" className={formInputClass} defaultValue="Antibiotics">
              <option value="Antibiotics">Antibiotics</option>
              <option value="Cardiac & Diab">Cardiac & Diab</option>
              <option value="Gastroenterology">Gastroenterology</option>
              <option value="Gynecology">Gynecology</option>
              <option value="Nutraceuticals">Nutraceuticals</option>
              <option value="Pain & Analgesic">Pain & Analgesic</option>
              <option value="Respiratory">Respiratory</option>
              <option value="Derma & Skin">Derma & Skin</option>
              <option value="Pediatrics">Pediatrics</option>
              <option value="General">General</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Batch Number *
            </label>
            <input
              name="batchNumber"
              required
              placeholder="e.g. BAT-2026-X81"
              className={formInputClass}
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Packaging Specification
            </label>
            <input
              name="packaging"
              placeholder="e.g. Boxes (10x10 Alu-Alu)"
              defaultValue="Boxes (10x10 Alu-Alu)"
              className={formInputClass}
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Available Boxes in Stock *
            </label>
            <input
              name="stockQty"
              type="number"
              min="0"
              required
              placeholder="e.g. 500"
              className={formInputClass}
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Reorder Alert Threshold (Boxes)
            </label>
            <input
              name="reorderThreshold"
              type="number"
              min="1"
              defaultValue="200"
              className={formInputClass}
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              MRP per Box (₹)
            </label>
            <input
              name="mrp"
              type="number"
              step="0.1"
              placeholder="e.g. 145"
              className={formInputClass}
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Billing Rate per Box (₹)
            </label>
            <input
              name="rate"
              type="number"
              step="0.1"
              placeholder="e.g. 42"
              className={formInputClass}
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Shelf Life (Months)
            </label>
            <select name="expiryMonths" className={formInputClass} defaultValue="18">
              <option value="1">1 Month (Immediate Clearance)</option>
              <option value="2">2 Months (Near Expiry)</option>
              <option value="6">6 Months</option>
              <option value="12">12 Months (1 Year)</option>
              <option value="18">18 Months (1.5 Years)</option>
              <option value="24">24 Months (2 Years)</option>
              <option value="36">36 Months (3 Years)</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Connected ERP Source
            </label>
            <select name="erpSource" className={formInputClass} defaultValue="Marg ERP 9+">
              <option value="Marg ERP 9+">Marg ERP 9+ API</option>
              <option value="Busy Accounting">Busy Accounting 21 API</option>
              <option value="Direct Warehouse">Direct Warehouse Entry</option>
            </select>
          </div>

          <div className="md:col-span-4 pt-2">
            <button
              type="submit"
              className="rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-md shadow-teal-500/20 hover:shadow-lg transition cursor-pointer"
            >
              + Register Medicine SKU & Sync Inventory
            </button>
          </div>
        </form>
      </section>

      {/* Product Inventory Table with Interactive Filter Controls */}
      <section className="overflow-hidden rounded-3xl neo-panel">
        <div className="border-b border-line px-6 py-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-slate-50/40">
          <div>
            <h2 className="font-bold text-ink text-base">
              Available Product Catalog & Box Quantities
            </h2>
          </div>

          {/* Filter Pills & Search */}
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/stock-iq"
              className={`rounded-xl px-3 py-1.5 text-xs font-bold border transition ${
                filter === "all"
                  ? "bg-primary text-white border-primary shadow-xs"
                  : "bg-white text-ink-muted border-line hover:text-ink neo-button"
              }`}
            >
              All ({allProducts.length})
            </Link>
            <Link
              href="/admin/stock-iq?filter=near-expiry"
              className={`rounded-xl px-3 py-1.5 text-xs font-bold border transition ${
                filter === "near-expiry"
                  ? "bg-amber-600 text-white border-amber-600 shadow-xs"
                  : "bg-white text-amber-700 border-amber-200 hover:bg-amber-50"
              }`}
            >
              Near Expiry ({nearExpiryProducts.length})
            </Link>
            <Link
              href="/admin/stock-iq?filter=low-stock"
              className={`rounded-xl px-3 py-1.5 text-xs font-bold border transition ${
                filter === "low-stock"
                  ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                  : "bg-white text-rose-700 border-rose-200 hover:bg-rose-50"
              }`}
            >
              Low Stock ({lowStockProducts.length})
            </Link>
            <Link
              href="/admin/stock-iq?filter=healthy"
              className={`rounded-xl px-3 py-1.5 text-xs font-bold border transition ${
                filter === "healthy"
                  ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                  : "bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50"
              }`}
            >
              Healthy
            </Link>
          </div>
        </div>

        {/* Category Buttons Bar (Softgel, Tablets, Injections, etc.) */}
        <div className="border-b border-line px-6 py-4 bg-white/95">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-teal-500 animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-wider text-ink">
                Select Product Category:
              </span>
              <span className="text-xs text-ink-muted">
                (Company formulation catalog sourced dynamically from Marg ERP / Billing Software)
              </span>
            </div>
            {dosageForm !== "all" && (
              <Link
                href={buildFilterUrl({ dosageForm: "all" })}
                className="text-xs font-bold text-teal-700 hover:text-teal-900 hover:underline inline-flex items-center gap-1"
              >
                <span>Reset to All Categories</span>
                <span>✕</span>
              </Link>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* All Range Button */}
            <Link
              href={buildFilterUrl({ dosageForm: "all" })}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold border transition ${
                dosageForm === "all"
                  ? "bg-slate-900 text-white border-slate-900 shadow-sm ring-2 ring-slate-900/20"
                  : "bg-white text-ink-muted border-line hover:text-ink hover:bg-slate-50"
              }`}
            >
              <span>📦</span>
              <span>All Categories</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                  dosageForm === "all"
                    ? "bg-white/20 text-white"
                    : "bg-slate-100 text-ink-muted"
                }`}
              >
                {allProducts.length}
              </span>
            </Link>

            {/* Dynamic Category Buttons (Softgels, Tablets, Injections, Capsules, etc.) */}
            {categoryStats.map((cat) => {
              const isSelected =
                dosageForm.toLowerCase() === cat.name.toLowerCase();
              return (
                <Link
                  key={cat.name}
                  href={buildFilterUrl({
                    dosageForm: isSelected ? "all" : cat.name,
                  })}
                  className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold border transition ${
                    isSelected
                      ? "bg-teal-700 text-white border-teal-700 shadow-sm ring-2 ring-teal-500/30"
                      : "bg-white text-ink-muted border-line hover:text-teal-900 hover:border-teal-300 hover:bg-teal-50/50"
                  }`}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.name}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                      isSelected
                        ? "bg-white/25 text-white"
                        : "bg-slate-100 text-ink-muted"
                    }`}
                  >
                    {cat.count}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Search Bar + Secondary Division Filter */}
        <div className="border-b border-line px-6 py-3 bg-slate-50/60 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <form method="GET" action="/admin/stock-iq" className="flex items-center gap-2 flex-1 max-w-md">
            <input type="hidden" name="filter" value={filter} />
            <input type="hidden" name="dosageForm" value={dosageForm} />
            <input type="hidden" name="category" value={category} />
            <div className="relative w-full">
              <input
                type="text"
                name="search"
                defaultValue={search}
                placeholder="Search by brand, active salts, SKU, or batch..."
                className="w-full rounded-xl border border-line bg-white px-3.5 py-1.5 text-xs text-ink neo-pressed focus:outline-none focus:ring-2 focus:ring-teal-500/40"
              />
            </div>
            <button
              type="submit"
              className="rounded-xl px-3.5 py-1.5 text-xs font-bold text-ink neo-button hover:text-primary transition"
            >
              Search
            </button>
            {search && (
              <Link
                href={buildFilterUrl({ search: "" })}
                className="text-xs text-rose-600 hover:underline shrink-0 font-medium"
              >
                Clear
              </Link>
            )}
          </form>

          {/* Division Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-1 max-w-full">
            <span className="text-xs font-semibold text-ink-faint shrink-0 mr-1">Division:</span>
            <Link
              href={buildFilterUrl({ category: "all" })}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold border transition shrink-0 ${
                category === "all"
                  ? "bg-slate-800 text-white border-slate-800"
                  : "bg-white text-ink-muted border-line hover:text-ink"
              }`}
            >
              All Divisions
            </Link>
            {distinctDivisions.map((divName) => (
              <Link
                key={divName}
                href={buildFilterUrl({ category: category === divName ? "all" : divName })}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-bold border transition shrink-0 ${
                  category === divName
                    ? "bg-teal-700 text-white border-teal-700 shadow-xs"
                    : "bg-white text-ink-muted border-line hover:text-ink"
                }`}
              >
                {divName}
              </Link>
            ))}
          </div>
        </div>

        {/* Master Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-slate-50/60 text-[11px] font-bold uppercase tracking-wider text-ink-faint">
              <tr>
                <th className="px-6 py-3.5">Product & Composition</th>
                <th className="px-6 py-3.5">SKU & Batch Details</th>
                <th className="px-6 py-3.5">Packaging</th>
                <th className="px-6 py-3.5">Available Boxes</th>
                <th className="px-6 py-3.5">Batch Expiry</th>
                <th className="px-6 py-3.5">Pricing (₹)</th>
                <th className="px-6 py-3.5">Update Stock</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {filteredProducts.map((product) => {
                const meta = getCategoryMeta(product.dosageForm);
                const diffDays = product.expiryDate
                  ? Math.ceil(
                      (product.expiryDate.getTime() - now.getTime()) /
                        (1000 * 60 * 60 * 24)
                    )
                  : 999;

                const isCriticalExpiry = diffDays <= 30;
                const isNearExpiry = diffDays > 30 && diffDays <= 90;
                const isLowStock = product.stockQty <= product.reorderThreshold;

                return (
                  <tr key={product.id} className="hover:bg-slate-50/60 transition">
                    {/* Product & Composition + Prominent Category Badge */}
                    <td className="px-6 py-4">
                      <p className="font-bold text-ink text-sm">{product.name}</p>
                      <p className="text-xs text-ink-faint mt-0.5">
                        {product.composition || "Standard pharma molecule"}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        {/* Formulation Category Badge */}
                        <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold border ${meta.badgeColor}`}>
                          <span>{meta.icon}</span>
                          <span>{product.dosageForm || "Tablets"}</span>
                        </span>

                        {/* Division Badge */}
                        {product.category && product.category !== "General" && (
                          <span className="inline-flex items-center rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                            {product.category}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* SKU & Batch Details */}
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <span className="font-mono text-xs font-bold text-ink bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          {product.sku}
                        </span>
                        <p className="text-xs font-mono text-ink-muted">
                          Batch: <span className="font-bold text-ink">{product.batchNumber || "UNASSIGNED"}</span>
                        </p>
                        <span className="inline-block rounded bg-teal-50 text-teal-700 border border-teal-200 px-1.5 py-0.2 text-[10px] font-medium">
                          {product.erpSource || "Marg ERP 9+"}
                        </span>
                      </div>
                    </td>

                    {/* Packaging */}
                    <td className="px-6 py-4 text-xs font-semibold text-ink-muted">
                      {product.packaging || "Standard Packaging"}
                    </td>

                    {/* Available Boxes & Threshold */}
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="text-lg font-black text-ink">
                            {product.stockQty.toLocaleString("en-IN")}{" "}
                            <span className="text-xs font-bold text-ink-muted">Boxes</span>
                          </p>
                          {isLowStock && (
                            <span className="rounded-md bg-rose-100 text-rose-800 border border-rose-200 px-1.5 py-0.2 text-[10px] font-bold animate-pulse">
                              Low Stock
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-ink-faint">
                          Reorder Alert: {product.reorderThreshold} Boxes
                        </p>
                      </div>
                    </td>

                    {/* Batch Expiry */}
                    <td className="px-6 py-4">
                      {product.expiryDate ? (
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-ink">
                            {product.expiryDate.toLocaleDateString("en-IN", {
                              month: "short",
                              year: "numeric",
                            })}
                          </p>
                          {isCriticalExpiry ? (
                            <span className="inline-block rounded-md bg-rose-100 text-rose-800 border border-rose-300 px-2 py-0.5 text-[10px] font-bold">
                              Critical: {diffDays}d left!
                            </span>
                          ) : isNearExpiry ? (
                            <span className="inline-block rounded-md bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 text-[10px] font-bold">
                              Near Expiry: {diffDays}d left
                            </span>
                          ) : (
                            <span className="inline-block rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[10px] font-medium">
                              Healthy ({Math.round(diffDays / 30)} mos)
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-ink-faint">Not recorded</span>
                      )}
                    </td>

                    {/* Pricing */}
                    <td className="px-6 py-4">
                      <p className="text-xs font-bold text-ink">
                        MRP: ₹{Number(product.mrp ?? 0).toFixed(1)}
                      </p>
                      <p className="text-[11px] text-emerald-700 font-semibold mt-0.5">
                        Rate: ₹{Number(product.rate ?? 0).toFixed(1)} / box
                      </p>
                    </td>

                    {/* Quick Adjust Box Quantity */}
                    <td className="px-6 py-4">
                      <form action={adjustProductStock} className="flex items-center gap-1.5">
                        <input type="hidden" name="productId" value={product.id} />
                        <input
                          name="stockQty"
                          type="number"
                          min="0"
                          defaultValue={product.stockQty}
                          className="w-20 rounded-lg border border-line bg-white px-2 py-1 text-xs font-bold text-ink shadow-xs"
                        />
                        <button
                          type="submit"
                          className="rounded-lg bg-teal-600 px-2.5 py-1 text-xs font-bold text-white shadow-xs hover:bg-teal-700 transition cursor-pointer"
                        >
                          Save
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}

              {!filteredProducts.length && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-sm text-ink-faint">
                    No products matched your filter criteria. Try clearing the search or changing the filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StockKpiCard({
  title,
  value,
  detail,
  topBar,
  icon,
  iconBg,
  tag,
  tagClass,
}: {
  title: string;
  value: string;
  detail: string;
  topBar: string;
  icon: React.ReactNode;
  iconBg: string;
  tag: string;
  tagClass: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl neo-panel-soft transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
      <div className={`h-1.5 w-full bg-gradient-to-r ${topBar}`} />
      <div className="p-6">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-faint">
            {title}
          </p>
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${iconBg} shadow-xs`}>
            {icon}
          </div>
        </div>

        <p className="mt-4 text-3xl font-extrabold tracking-tight text-ink">
          {value}
        </p>

        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs font-medium text-ink-muted">
            {detail}
          </span>
          <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold border ${tagClass}`}>
            {tag}
          </span>
        </div>
      </div>
    </div>
  );
}

const formInputClass =
  "mt-1 w-full rounded-2xl border border-line bg-canvas px-3.5 py-2 text-sm text-ink neo-pressed focus:outline-none focus:ring-2 focus:ring-teal-500/40 transition";

function getCategoryMeta(dosageFormRaw?: string | null) {
  const df = (dosageFormRaw || "Tablets").trim();
  const lower = df.toLowerCase();
  if (lower.includes("softgel")) {
    return {
      label: df,
      icon: "🟢",
      badgeColor: "bg-emerald-50 text-emerald-800 border-emerald-300",
    };
  }
  if (lower.includes("tablet")) {
    return {
      label: df,
      icon: "⚪",
      badgeColor: "bg-indigo-50 text-indigo-800 border-indigo-200",
    };
  }
  if (lower.includes("injection") || lower.includes("injectable")) {
    return {
      label: df,
      icon: "💉",
      badgeColor: "bg-rose-50 text-rose-800 border-rose-200",
    };
  }
  if (lower.includes("capsule")) {
    return {
      label: df,
      icon: "💊",
      badgeColor: "bg-amber-50 text-amber-800 border-amber-200",
    };
  }
  if (lower.includes("syrup") || lower.includes("suspension") || lower.includes("liquid")) {
    return {
      label: df,
      icon: "🧪",
      badgeColor: "bg-purple-50 text-purple-800 border-purple-200",
    };
  }
  if (lower.includes("ointment") || lower.includes("gel") || lower.includes("cream")) {
    return {
      label: df,
      icon: "🧴",
      badgeColor: "bg-cyan-50 text-cyan-800 border-cyan-200",
    };
  }
  if (lower.includes("drop") || lower.includes("pediatric")) {
    return {
      label: df,
      icon: "💧",
      badgeColor: "bg-teal-50 text-teal-800 border-teal-200",
    };
  }
  return {
    label: df,
    icon: "🏷️",
    badgeColor: "bg-slate-100 text-slate-800 border-slate-200",
  };
}
