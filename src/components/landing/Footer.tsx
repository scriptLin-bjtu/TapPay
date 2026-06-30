export default function Footer() {
  return (
    <footer className="py-8 px-6 border-t border-[#2a2a36]">
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">
            <span className="text-[#28A0F0]">Tap</span>
            <span className="text-white">Pay</span>
          </span>
        </div>

        <div className="flex items-center gap-6 text-xs text-text-muted">
          <span>Arbitrum</span>
          <span>Particle UA</span>
          <span>Magic</span>
        </div>

        <p className="text-xs text-text-muted">
          &copy; 2026 TapPay
        </p>
      </div>
    </footer>
  );
}
