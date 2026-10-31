import Link from "next/link";

interface PaginationBarProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  itemName?: string;
  buildHref: (page: number) => string;
}

export function PaginationBar({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  itemName = "leads",
  buildHref,
}: PaginationBarProps) {
  if (totalItems === 0) return null;

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  // Generate page numbers with ellipsis windowing
  const getPageNumbers = () => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: (number | "...")[] = [];
    pages.push(1);
    if (currentPage > 3) {
      pages.push("...");
    }
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    if (currentPage < totalPages - 2) {
      pages.push("...");
    }
    pages.push(totalPages);
    return pages;
  };

  const pageNumbers = getPageNumbers();

  return (
    <div className="flex flex-col gap-3 border-t border-line bg-slate-50/70 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs font-semibold text-ink-muted">
        Showing <span className="font-bold text-ink">{startItem}</span>–<span className="font-bold text-ink">{endItem}</span> of{" "}
        <span className="font-bold text-ink">{totalItems}</span> {itemName}
      </p>

      <div className="flex flex-wrap items-center gap-1.5">
        {/* Previous Button */}
        {currentPage > 1 ? (
          <Link
            href={buildHref(currentPage - 1)}
            className="inline-flex items-center gap-1 rounded-xl border border-line bg-white px-3 py-1.5 text-xs font-bold text-ink hover:border-primary/40 hover:text-primary hover:bg-slate-50 transition shadow-2xs"
          >
            ← Previous
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-xl border border-line-soft bg-slate-100/70 px-3 py-1.5 text-xs font-bold text-ink-faint cursor-not-allowed">
            ← Previous
          </span>
        )}

        {/* Page Number Buttons */}
        <div className="hidden sm:flex items-center gap-1">
          {pageNumbers.map((p, idx) => {
            if (p === "...") {
              return (
                <span key={`ellipsis-${idx}`} className="px-1.5 text-xs text-ink-muted font-bold select-none">
                  ...
                </span>
              );
            }
            const isActive = p === currentPage;
            return (
              <Link
                key={p}
                href={buildHref(p)}
                className={`min-w-8 h-8 flex items-center justify-center rounded-xl text-xs font-bold transition px-2 ${
                  isActive
                    ? "bg-primary text-white shadow-xs font-extrabold"
                    : "border border-line bg-white text-ink hover:border-primary/40 hover:text-primary hover:bg-slate-50"
                }`}
              >
                {p}
              </Link>
            );
          })}
        </div>

        {/* Mobile Page Indicator */}
        <span className="sm:hidden px-2 text-xs font-bold text-ink">
          Page {currentPage} of {totalPages}
        </span>

        {/* Next Button */}
        {currentPage < totalPages ? (
          <Link
            href={buildHref(currentPage + 1)}
            className="inline-flex items-center gap-1 rounded-xl border border-line bg-white px-3 py-1.5 text-xs font-bold text-ink hover:border-primary/40 hover:text-primary hover:bg-slate-50 transition shadow-2xs"
          >
            Next →
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-xl border border-line-soft bg-slate-100/70 px-3 py-1.5 text-xs font-bold text-ink-faint cursor-not-allowed">
            Next →
          </span>
        )}
      </div>
    </div>
  );
}
