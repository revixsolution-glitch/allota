/** Brand heading accent: sky → purple → orange, same as the allota.in logo/headline. */
export function GradientText({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-[linear-gradient(135deg,#38bdf8,#a855f7_52%,#fb923c)] bg-clip-text text-transparent">
      {children}
    </span>
  );
}
