import { useCallback, useMemo, useState } from 'react';
import { isAddress, parseUnits, Interface, toBeHex } from 'ethers';
import {
  CHAIN_ID,
  SUPPORTED_TOKEN_TYPE,
  SUPPORTED_TARGET_TOKENS_V2,
  serializeInstruction,
  type IAsset,
} from '@particle-network/universal-account-sdk';
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { useUniversalAccount } from '@/hooks/UniversalAccountProvider';
import showToast from '@/utils/showToast';
import Spinner from '@/components/ui/Spinner';

interface WithdrawModalProps {
  open: boolean;
  onClose: () => void;
  assets: IAsset[];
}

// Chain display config
const CHAIN_CONFIG: Record<number, { name: string; color: string }> = {
  [CHAIN_ID.ETHEREUM_MAINNET]: { name: 'Ethereum', color: '#627EEA' },
  [CHAIN_ID.ARBITRUM_MAINNET_ONE]: { name: 'Arbitrum', color: '#28A0F0' },
  [CHAIN_ID.BASE_MAINNET]: { name: 'Base', color: '#0052FF' },
  [CHAIN_ID.BSC_MAINNET]: { name: 'BSC', color: '#F3BA2F' },
  [CHAIN_ID.SOLANA_MAINNET]: { name: 'Solana', color: '#9945FF' },
  [CHAIN_ID.XLAYER_MAINNET]: { name: 'XLayer', color: '#000000' },
};

const TOKEN_LABELS: Record<string, string> = {
  [SUPPORTED_TOKEN_TYPE.ETH]: 'ETH',
  [SUPPORTED_TOKEN_TYPE.USDC]: 'USDC',
  [SUPPORTED_TOKEN_TYPE.USDT]: 'USDT',
  [SUPPORTED_TOKEN_TYPE.BNB]: 'BNB',
  [SUPPORTED_TOKEN_TYPE.SOL]: 'SOL',
  [SUPPORTED_TOKEN_TYPE.BTC]: 'BTC',
};

// Well-known Solana mainnet SPL token mint addresses.
const SOLANA_MINTS: Record<string, string> = {
  [SUPPORTED_TOKEN_TYPE.USDC]: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  [SUPPORTED_TOKEN_TYPE.USDT]: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
};

type Step = 'chain' | 'token' | 'amount' | 'address' | 'confirm';

export default function WithdrawModal({ open, onClose, assets }: WithdrawModalProps) {
  const { universalAccount, accountInfo, ensureDelegated, signAndSend, primaryAssets, refreshBalance } = useUniversalAccount();

  // Form state
  const [targetChain, setTargetChain] = useState<number | null>(null);
  const [targetTokenType, setTargetTokenType] = useState<SUPPORTED_TOKEN_TYPE | null>(null);
  const [amount, setAmount] = useState('');
  const [amountError, setAmountError] = useState('');
  const [targetAddress, setTargetAddress] = useState('');
  const [addressError, setAddressError] = useState('');

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [txId, setTxId] = useState('');
  const [step, setStep] = useState<Step>('chain');

  // Total available balance in USD (for reference)
  const totalBalanceUSD = primaryAssets?.totalAmountInUSD || 0;

  // Available target tokens for selected chain
  const availableTokens = useMemo(() => {
    if (!targetChain) return [];
    const tokens = SUPPORTED_TARGET_TOKENS_V2.filter((t) => t.chainId === targetChain);
    // Deduplicate by type
    const seen = new Set<string>();
    return tokens.filter((t) => {
      if (seen.has(t.type)) return false;
      seen.add(t.type);
      return true;
    });
  }, [targetChain]);

  // Supported chain IDs (only show chains that have target tokens)
  const supportedChains = useMemo(() => {
    const chainIds = new Set(SUPPORTED_TARGET_TOKENS_V2.map((t) => t.chainId));
    return Array.from(chainIds).filter((id) => CHAIN_CONFIG[id]);
  }, []);

  const reset = useCallback(() => {
    setTargetChain(null);
    setTargetTokenType(null);
    setAmount('');
    setAmountError('');
    setTargetAddress('');
    setAddressError('');
    setSubmitting(false);
    setTxId('');
    setStep('chain');
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const handleSelectChain = useCallback((chainId: number) => {
    setTargetChain(chainId);
    setTargetTokenType(null);
    setStep('token');
  }, []);

  const handleSelectToken = useCallback((tokenType: SUPPORTED_TOKEN_TYPE) => {
    setTargetTokenType(tokenType);
    setStep('amount');
  }, []);

  const handleAmountNext = useCallback(() => {
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) {
      setAmountError('Enter a valid amount');
      return;
    }
    setAmountError('');
    setStep('address');
  }, [amount]);

  const handleAddressNext = useCallback(() => {
    if (!targetAddress) {
      setAddressError('Enter a target address');
      return;
    }
    // For Solana, skip isAddress check (it's base58)
    if (targetChain !== CHAIN_ID.SOLANA_MAINNET && !isAddress(targetAddress)) {
      setAddressError('Invalid EVM address');
      return;
    }
    setAddressError('');
    setStep('confirm');
  }, [targetAddress, targetChain]);

  const handleSubmit = useCallback(async () => {
    if (!universalAccount || !targetChain || !targetTokenType) return;

    // Balance the UA holds of the *target* token (0 means a swap+bridge is needed).
    const targetAssetAmount =
      primaryAssets?.assets.find((a: any) => a.tokenType === targetTokenType)?.amount || 0;

    setSubmitting(true);
    try {
      console.log('Withdrawing:', {
        targetChain,
        targetTokenType,
        amount,
        targetAddress,
        targetAssetAmount,
      });

      // Full token info on the target chain (needs address + decimals).
      const targetToken = SUPPORTED_TARGET_TOKENS_V2.find(
        (t) => t.chainId === targetChain && t.type === targetTokenType,
      );
      if (!targetToken) {
        throw new Error('Target token is not supported on the selected chain');
      }
      const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
      const isNative = targetToken.address === ZERO_ADDRESS;
      const requestedAmount = parseFloat(amount);
      const hasEnough = !isNaN(requestedAmount) && targetAssetAmount >= requestedAmount;

      // Build the UA transaction. createTransferTransaction only moves a token
      // the UA ALREADY holds (same token, cross-chain) — it does NOT swap token
      // types. When the UA lacks the target token, createUniversalTransaction's
      // `expectTokens` swaps+bridges from other Primary Assets and `transactions`
      // sends the result to the receiver, in one tx.
      const buildTx = async () => {
        if (hasEnough) {
          return universalAccount.createTransferTransaction({
            token: { chainId: targetChain, address: targetToken.address },
            amount,
            receiver: targetAddress,
          });
        }
        // Use realDecimals (the token's on-chain precision, e.g. 6 for USDC),
        // NOT `decimals` (which is the UA's internal uniform 18-decimals field).
        // Using `decimals` makes parseUnits produce a value 1e12x too large for
        // 6-decimal tokens, so the transfer reverts on-chain.

        // --- Solana destination: build Solana instructions ---
        if (targetChain === CHAIN_ID.SOLANA_MAINNET) {
          const uaSolanaAddress = accountInfo.solanaSmartAccount;
          if (!uaSolanaAddress) throw new Error('Solana smart account not available');

          const uaSolanaPk = new PublicKey(uaSolanaAddress);
          const receiverPk = new PublicKey(targetAddress);

          if (targetTokenType === SUPPORTED_TOKEN_TYPE.SOL) {
            // Native SOL: SystemProgram.transfer
            const lamports = Math.round(parseFloat(amount) * LAMPORTS_PER_SOL);
            const solIx = serializeInstruction(
              SystemProgram.transfer({
                fromPubkey: uaSolanaPk,
                toPubkey: receiverPk,
                lamports,
              }),
            );
            return universalAccount.createUniversalTransaction({
              chainId: CHAIN_ID.SOLANA_MAINNET,
              expectTokens: [{ type: SUPPORTED_TOKEN_TYPE.SOL, amount }],
              transactions: [solIx],
            });
          }

          // SPL token (USDC / USDT): create ATA idempotent + transfer
          const mintAddress = SOLANA_MINTS[targetTokenType];
          if (!mintAddress) {
            throw new Error(`Unsupported SPL token type: ${targetTokenType}`);
          }
          const mint = new PublicKey(mintAddress);
          const sourceAta = getAssociatedTokenAddressSync(mint, uaSolanaPk, true);
          const targetAta = getAssociatedTokenAddressSync(mint, receiverPk, true);
          // SPL token amount in smallest unit (e.g. 6 decimals for USDC/USDT)
          const rawAmount = Math.round(parseFloat(amount) * 10 ** targetToken.realDecimals);

          const ataIx = serializeInstruction(
            createAssociatedTokenAccountIdempotentInstruction(uaSolanaPk, targetAta, receiverPk, mint),
          );
          const transferIx = serializeInstruction(
            createTransferInstruction(sourceAta, targetAta, uaSolanaPk, rawAmount),
          );
          return universalAccount.createUniversalTransaction({
            chainId: CHAIN_ID.SOLANA_MAINNET,
            expectTokens: [{ type: targetTokenType, amount }],
            transactions: [ataIx, transferIx],
          });
        }

        // --- EVM destination ---
        const amountWei = parseUnits(amount, targetToken.realDecimals);
        const evmTx = isNative
          ? { to: targetAddress, data: '0x', value: toBeHex(amountWei) }
          : {
              to: targetToken.address,
              data: new Interface([
                'function transfer(address to, uint256 amount)',
              ]).encodeFunctionData('transfer', [targetAddress, amountWei]),
              value: '0x0',
            };
        return universalAccount.createUniversalTransaction({
          chainId: targetChain,
          expectTokens: [{ type: targetTokenType, amount }],
          transactions: [evmTx],
        });
      };

      await ensureDelegated();
      const tx = await buildTx();
      console.log('Route:', hasEnough ? 'direct transfer' : 'universal (swap + transfer)');

      console.log('Transaction created:', {
        type: tx.type,
        mode: tx.mode,
        sender: tx.sender,
        receiver: tx.receiver,
        userOpsCount: tx.userOps?.length,
        rootHash: tx.rootHash,
      });
      console.log('Transaction routing detail:', {
        totalDepositTokenAmountInUSD: tx.totalDepositTokenAmountInUSD,
        depositTokens: tx.depositTokens,
        transactionFees: tx.transactionFees,
        fallback: tx.fallback,
        userOps: tx.userOps?.map((op: any) => ({
          chainId: op.chainId,
          gasFeeInUSD: op.gasFeeInUSD,
          eip7702Delegated: op.eip7702Delegated,
          eip7702Auth: op.eip7702Auth,
        })),
      });

      const result = await signAndSend(tx);
      setTxId(result.transactionId);
      showToast({ message: 'Withdrawal submitted!', type: 'success' });
    } catch (e: any) {
      console.error('withdraw failed', e);
      // Particle's UniversalError carries the real server reason in .code / .data.
      // The default Error print only shows .message, so log these explicitly.
      console.error('withdraw failed (detail):', {
        name: e?.name,
        code: e?.code,
        message: e?.message,
        data: e?.data,
        responseData: e?.response?.data,
        stack: e?.stack,
      });
      const message: string = e?.message || String(e);
      let hint = message;
      if (/simulation/i.test(message)) {
        hint =
          'Transaction simulation failed. The cross-chain swap/bridge/gas fees may exceed ' +
          'the amount, or no viable route exists. Try a larger amount, or withdraw a token ' +
          'you already hold.';
      }
      showToast({ message: 'Withdrawal failed: ' + hint, type: 'error' });
    } finally {
      setSubmitting(false);
    }
  }, [
    universalAccount,
    accountInfo,
    targetChain,
    targetTokenType,
    targetAddress,
    amount,
    ensureDelegated,
    signAndSend,
    primaryAssets,
  ]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      onClick={handleClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full max-w-sm rounded-2xl p-6 max-h-[85vh] overflow-y-auto"
        style={{ background: '#141419', border: '1px solid #2a2a36' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-text-muted hover:text-text-primary transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>

        <h3 className="text-lg font-semibold text-text-primary mb-1">Withdraw</h3>
        <p className="text-text-muted text-xs mb-2">
          Send assets to any wallet. UA automatically routes from all your chains.
        </p>

        {/* Balance hint */}
        {primaryAssets && (
          <p className="text-xs mb-4" style={{ color: '#28A0F0' }}>
            Available: ${totalBalanceUSD.toFixed(2)} across all chains
          </p>
        )}

        {/* Success state */}
        {txId ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-2xl text-white"
              style={{ background: '#22c55e' }}
            >
              ✓
            </div>
            <p className="text-lg font-semibold" style={{ color: '#22c55e' }}>
              Withdrawal Submitted
            </p>
            <a
              href={`https://universalx.app/activity/details?id=${txId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-mono break-all"
              style={{ color: '#28A0F0' }}
            >
              View transaction
            </a>
            <button
              onClick={handleClose}
              className="w-full py-3 rounded-xl font-semibold text-sm text-white mt-2"
              style={{ background: '#28A0F0' }}
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {/* Step indicator */}
            <div className="flex gap-1 mb-5">
              {(['chain', 'token', 'amount', 'address', 'confirm'] as Step[]).map(
                (s, i) => {
                  const steps: Step[] = ['chain', 'token', 'amount', 'address', 'confirm'];
                  const currentIdx = steps.indexOf(step);
                  const isDone = i < currentIdx;
                  const isActive = i === currentIdx;
                  return (
                    <div
                      key={s}
                      className="flex-1 h-1 rounded-full transition-colors"
                      style={{
                        background: isDone
                          ? '#22c55e'
                          : isActive
                            ? '#28A0F0'
                            : 'rgba(255,255,255,0.06)',
                      }}
                    />
                  );
                },
              )}
            </div>

            {/* Step 1: Select Target Chain */}
            {step === 'chain' && (
              <div className="flex flex-col gap-2">
                <p className="text-text-secondary text-xs font-medium mb-2">
                  1. Select target chain
                </p>
                {supportedChains.map((chainId) => {
                  const config = CHAIN_CONFIG[chainId];
                  return (
                    <button
                      key={chainId}
                      onClick={() => handleSelectChain(chainId)}
                      className="flex items-center gap-3 p-3 rounded-xl transition-all hover:opacity-80"
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid #2a2a36',
                      }}
                    >
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                        style={{ background: config.color }}
                      >
                        {config.name[0]}
                      </div>
                      <span className="text-text-primary text-sm font-medium">
                        {config.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Step 2: Select Target Token */}
            {step === 'token' && targetChain && (
              <div className="flex flex-col gap-2">
                <p className="text-text-secondary text-xs font-medium mb-2">
                  2. Select token on {CHAIN_CONFIG[targetChain]?.name}
                </p>
                <p className="text-text-muted text-xs mb-2">
                  UA will automatically convert from your available assets if needed.
                </p>
                {availableTokens.map((token) => {
                  // Find balance for this token type
                  const tokenAsset = primaryAssets?.assets.find(
                    (a: any) => a.tokenType === token.type,
                  );
                  const tokenBalance = tokenAsset?.amount || 0;

                  return (
                    <button
                      key={token.type}
                      onClick={() => handleSelectToken(token.type)}
                      className="flex items-center gap-3 p-3 rounded-xl transition-all hover:opacity-80"
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid #2a2a36',
                      }}
                    >
                      <div className="flex flex-col items-start">
                        <span className="text-text-primary text-sm font-medium">
                          {TOKEN_LABELS[token.type] || token.type}
                        </span>
                        <span className="text-text-muted text-xs">
                          Balance: {tokenBalance.toFixed(4)}
                        </span>
                      </div>
                      <span className="text-text-muted text-xs ml-auto font-mono">
                        {token.address.slice(0, 6)}...{token.address.slice(-4)}
                      </span>
                    </button>
                  );
                })}
                <button
                  onClick={() => setStep('chain')}
                  className="py-2.5 rounded-xl text-sm font-medium text-text-secondary mt-2"
                  style={{ background: 'rgba(255,255,255,0.06)' }}
                >
                  Back
                </button>
              </div>
            )}

            {/* Step 3: Enter Amount */}
            {step === 'amount' && targetTokenType && (
              <div className="flex flex-col gap-4">
                <p className="text-text-secondary text-xs font-medium">
                  3. Enter amount of {TOKEN_LABELS[targetTokenType]}
                </p>
                <p className="text-text-muted text-xs">
                  UA will convert from your available assets if you don&apos;t have enough {TOKEN_LABELS[targetTokenType]}.
                </p>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-text-muted text-xs">Amount</label>
                    <span className="text-text-muted text-xs">
                      Total available: ${totalBalanceUSD.toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="number"
                    placeholder="0.00"
                    step="any"
                    min="0"
                    value={amount}
                    onChange={(e) => {
                      if (amountError) setAmountError('');
                      setAmount(e.target.value);
                    }}
                    className="w-full px-3 py-2.5 rounded-lg text-text-primary text-sm outline-none"
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: `1px solid ${amountError ? '#ef4444' : '#2a2a36'}`,
                    }}
                  />
                  {amountError && (
                    <span className="text-xs mt-1 block" style={{ color: '#ef4444' }}>
                      {amountError}
                    </span>
                  )}
                  <p className="text-text-muted text-xs mt-2">
                    UA will automatically source from your available balances across all chains.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setStep('token')}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium text-text-secondary"
                    style={{ background: 'rgba(255,255,255,0.06)' }}
                  >
                    Back
                  </button>
                  <button
                    onClick={handleAmountNext}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white"
                    style={{ background: '#28A0F0' }}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {/* Step 4: Enter Target Address */}
            {step === 'address' && (
              <div className="flex flex-col gap-4">
                <p className="text-text-secondary text-xs font-medium">
                  4. Enter recipient address
                </p>
                <div>
                  <label className="text-text-muted text-xs mb-1.5 block">
                    {targetChain === CHAIN_ID.SOLANA_MAINNET ? 'Solana Address' : 'EVM Address'}
                  </label>
                  <input
                    type="text"
                    placeholder={
                      targetChain === CHAIN_ID.SOLANA_MAINNET
                        ? 'Solana wallet address'
                        : '0x...'
                    }
                    value={targetAddress}
                    onChange={(e) => {
                      if (addressError) setAddressError('');
                      setTargetAddress(e.target.value.trim());
                    }}
                    className="w-full px-3 py-2.5 rounded-lg text-text-primary text-sm font-mono outline-none"
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: `1px solid ${addressError ? '#ef4444' : '#2a2a36'}`,
                    }}
                  />
                  {addressError && (
                    <span className="text-xs mt-1 block" style={{ color: '#ef4444' }}>
                      {addressError}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setStep('amount')}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium text-text-secondary"
                    style={{ background: 'rgba(255,255,255,0.06)' }}
                  >
                    Back
                  </button>
                  <button
                    onClick={handleAddressNext}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white"
                    style={{ background: '#28A0F0' }}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {/* Step 5: Confirm */}
            {step === 'confirm' && targetChain && targetTokenType && (
              <div className="flex flex-col gap-4">
                <p className="text-text-secondary text-xs font-medium">5. Confirm withdrawal</p>

                <div
                  className="rounded-xl p-4 flex flex-col gap-3"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid #2a2a36',
                  }}
                >
                  <div className="flex justify-between">
                    <span className="text-text-muted text-xs">Target Chain</span>
                    <span className="text-text-primary text-sm font-medium">
                      {CHAIN_CONFIG[targetChain]?.name}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted text-xs">Token</span>
                    <span className="text-text-primary text-sm font-medium">
                      {TOKEN_LABELS[targetTokenType]}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted text-xs">Amount</span>
                    <span className="text-text-primary text-sm font-medium">{amount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted text-xs">Recipient</span>
                    <span className="text-text-primary text-xs font-mono">
                      {targetAddress.slice(0, 8)}...{targetAddress.slice(-6)}
                    </span>
                  </div>
                </div>

                <p className="text-text-muted text-xs">
                  UA will automatically route funds from your available balances across all chains. No gas token needed.
                </p>

                <div className="flex gap-2">
                  <button
                    onClick={() => setStep('address')}
                    disabled={submitting}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium text-text-secondary disabled:opacity-40"
                    style={{ background: 'rgba(255,255,255,0.06)' }}
                  >
                    Back
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={submitting || !universalAccount}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 flex items-center justify-center gap-2"
                    style={{ background: '#6851ff' }}
                  >
                    {submitting ? (
                      <>
                        <Spinner /> Sending...
                      </>
                    ) : (
                      'Confirm Withdraw'
                    )}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
