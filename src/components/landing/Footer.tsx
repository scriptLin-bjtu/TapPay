export default function Footer() {
  const contractAddress = process.env.NEXT_PUBLIC_TAPAY_CONTRACT || '';

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
          <a
            href="https://developers.particle.network/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors"
          >
            Particle UA
          </a>
          <a
            href="https://eips.ethereum.org/EIPS/eip-7702"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors"
          >
            EIP-7702
          </a>
          <a
            href={`https://arbiscan.io/address/${contractAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors"
          >
            Arbitrum
          </a>
          <a
            href="https://magic.link/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors"
          >
            Magic
          </a>
        </div>

        <p className="text-xs text-text-muted">
          &copy; 2026 TapPay
        </p>
      </div>
    </footer>
  );
}
