import Link from "next/link";

export const metadata = {
  title: "Download Allota Mobile App — Android & iOS",
  description: "Install Allota Mobile Desk on your Android phone or iPhone.",
};

export default function DownloadPage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 border border-[#E2E8F0] shadow-xl text-center space-y-6">
        {/* App Icon */}
        <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-[#0284C7] to-[#0369A1] flex items-center justify-center text-white font-black text-2xl shadow-lg shadow-[#0284C7]/30">
          A
        </div>

        <div>
          <span className="inline-block px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-[#E0F2FE] text-[#0369A1] border border-[#BAE6FD]">
            Mobile Companion Desk
          </span>
          <h1 className="text-2xl font-black text-[#0F172A] mt-2">Allota Mobile App</h1>
          <p className="text-xs text-[#64748B] mt-1 max-w-xs mx-auto leading-relaxed">
            Real-time Meta Ads lead alerts, 1-tap WhatsApp dispatch, and AI call briefings on your phone.
          </p>
        </div>

        {/* Action 1: Launch Web App */}
        <div className="space-y-3 pt-2">
          <Link
            href="/app"
            className="w-full flex items-center justify-center gap-2 bg-[#0284C7] hover:bg-[#0369A1] text-white py-3.5 px-4 rounded-2xl text-xs font-extrabold shadow-md shadow-[#0284C7]/20 transition active:scale-95 cursor-pointer"
          >
            <span>🚀</span>
            <span>Open Mobile App Now</span>
          </Link>

          {/* Action 2: Open Desktop Console */}
          <Link
            href="/admin"
            className="w-full flex items-center justify-center gap-2 bg-white hover:bg-[#F8FAFC] text-[#334155] border border-[#E2E8F0] py-3.5 px-4 rounded-2xl text-xs font-bold transition active:scale-95 cursor-pointer"
          >
            <span>🌐</span>
            <span>Open Full CRM in Chrome</span>
          </Link>
        </div>

        {/* 2-Step Install Guide */}
        <div className="rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] p-4 text-left space-y-2">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#0F172A]">
            📲 How to Add to Your Phone Home Screen:
          </p>
          <ol className="list-decimal list-inside text-xs text-[#334155] space-y-1.5 font-medium">
            <li>
              Tap <strong>"Open Mobile App Now"</strong> above.
            </li>
            <li>
              Tap your browser menu (<strong>3 dots</strong> in Chrome or <strong>Share icon</strong> in Safari).
            </li>
            <li>
              Select <strong>"Install app"</strong> or <strong>"Add to Home Screen"</strong>.
            </li>
          </ol>
          <p className="text-[10px] text-[#64748B] pt-1 border-t border-[#E2E8F0]">
            ✓ Once added, it opens as a standalone full-screen app with permanent login.
          </p>
        </div>

        <div className="text-[11px] text-[#64748B]">
          Official Mobile Companion for Kesrox &amp; Allota CRM
        </div>
      </div>
    </div>
  );
}
