import {
  UniversalAccount,
  UNIVERSAL_ACCOUNT_VERSION,
  type IAssetsResponse,
} from '@particle-network/universal-account-sdk';
import { BrowserProvider, getBytes, Signature } from 'ethers';
import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useMagic } from './MagicProvider';

const ARB_CHAIN_ID = 42161;

type AccountInfo = {
  ownerAddress: string;
  evmSmartAccount: string;
  solanaSmartAccount: string;
};

type UAContextType = {
  universalAccount: UniversalAccount | null;
  accountInfo: AccountInfo;
  primaryAssets: IAssetsResponse | null;
  isDelegated: boolean;
  refreshBalance: () => Promise<void>;
  ensureDelegated: () => Promise<void>;
  delegateChain: (chainId: number) => Promise<void>;
  signAndSend: (transaction: { rootHash: string } & Record<string, any>) => Promise<{ transactionId: string }>;
  loading: boolean;
};

const UAContext = createContext<UAContextType>({
  universalAccount: null,
  accountInfo: { ownerAddress: '', evmSmartAccount: '', solanaSmartAccount: '' },
  primaryAssets: null,
  isDelegated: false,
  refreshBalance: async () => {},
  ensureDelegated: async () => {},
  delegateChain: async () => {},
  signAndSend: async () => ({ transactionId: '' }),
  loading: false,
});

export const useUniversalAccount = () => useContext(UAContext);

export const UniversalAccountProvider = ({ children }: { children: ReactNode }) => {
  const { magic } = useMagic();
  const [universalAccount, setUniversalAccount] = useState<UniversalAccount | null>(null);
  const [accountInfo, setAccountInfo] = useState<AccountInfo>({
    ownerAddress: '',
    evmSmartAccount: '',
    solanaSmartAccount: '',
  });
  const [primaryAssets, setPrimaryAssets] = useState<IAssetsResponse | null>(null);
  const [isDelegated, setIsDelegated] = useState(false);
  const [loading, setLoading] = useState(false);

  const userAddress = typeof window !== 'undefined' ? localStorage.getItem('user') : null;

  useEffect(() => {
    if (!userAddress) {
      setUniversalAccount(null);
      return;
    }

    const ua = new UniversalAccount({
      projectId: process.env.NEXT_PUBLIC_PROJECT_ID!,
      projectClientKey: process.env.NEXT_PUBLIC_CLIENT_KEY!,
      projectAppUuid: process.env.NEXT_PUBLIC_APP_ID!,
      smartAccountOptions: {
        useEIP7702: true,
        name: 'UNIVERSAL',
        version: UNIVERSAL_ACCOUNT_VERSION,
        ownerAddress: userAddress,
      },
      tradeConfig: {
        slippageBps: 100, // 1% slippage tolerance
        // Pay gas with PARTI (universal gas) on every chain instead of each
        // chain's native token. Required when the UA holds no gas token on the
        // destination chain (e.g. withdrawing USDT to BSC with BNB balance = 0).
        // Without this, sendTransaction simulation fails with
        // "Transaction simulation failed" because the dest-chain UserOp can't
        // pay gas. Matches the official SDK examples.
        universalGas: true,
      },
    });

    setUniversalAccount(ua);
  }, [userAddress]);

  const refreshDelegationStatus = useCallback(async () => {
    if (!universalAccount) return;
    const deployments = await universalAccount.getEIP7702Deployments();
    const arb = deployments.find((d: any) => d.chainId === ARB_CHAIN_ID);
    setIsDelegated((arb as any)?.isDelegated ?? false);
  }, [universalAccount]);

  useEffect(() => {
    if (!universalAccount || !userAddress) return;

    const fetchAccountData = async () => {
      setLoading(true);
      try {
        const options = await universalAccount.getSmartAccountOptions();
        setAccountInfo({
          ownerAddress: userAddress,
          evmSmartAccount: options.smartAccountAddress || '',
          solanaSmartAccount: options.solanaSmartAccountAddress || '',
        });

        await refreshDelegationStatus();

        const assets = await universalAccount.getPrimaryAssets();
        setPrimaryAssets(assets);
      } catch (err) {
        console.error('Failed to fetch UA data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAccountData();
  }, [universalAccount, userAddress, refreshDelegationStatus]);

  const refreshBalance = useCallback(async () => {
    if (!universalAccount) return;
    try {
      const assets = await universalAccount.getPrimaryAssets();
      setPrimaryAssets(assets);
    } catch (err) {
      console.error('Failed to refresh balance:', err);
    }
  }, [universalAccount]);

  const signEip7702Auth = useCallback(
    async (contractAddress: string, chainId: number, nonce?: number) => {
      if (!magic) throw new Error('Magic not ready');
      return magic.wallet.sign7702Authorization({
        contractAddress,
        chainId,
        ...(nonce !== undefined && { nonce }),
      });
    },
    [magic],
  );

  // Pre-delegate the EOA on a specific chain via a Type-4 transaction.
  // Magic SDK cannot sign EIP-7702 authorizations with chainId 0 (chain-agnostic),
  // so for ANY chain the UA transacts on we must pre-delegate with a chain-specific
  // auth BEFORE sending the transaction. Otherwise sendTransaction fails with
  // AA24 (signature error) because the inline 7702 auth cannot be signed correctly.
  const delegateChain = useCallback(
    async (chainId: number) => {
      if (!universalAccount || !magic || !userAddress) {
        throw new Error('Universal Account or wallet not ready');
      }

      const deployments = await universalAccount.getEIP7702Deployments();
      const dep = deployments.find((d: any) => d.chainId === chainId);
      if (!dep || (dep as any).isDelegated) return;

      await magic.evm.switchChain(chainId);

      const [auth] = await universalAccount.getEIP7702Auth([chainId]);
      const authorization = await signEip7702Auth(auth.address, chainId, auth.nonce + 1);

      await magic.wallet.send7702Transaction({
        to: userAddress,
        data: '0x',
        authorizationList: [authorization],
      });
    },
    [universalAccount, magic, userAddress, signEip7702Auth],
  );

  // Ensure the EOA is delegated on Arbitrum (the default routing chain).
  const ensureDelegated = useCallback(async () => {
    await delegateChain(ARB_CHAIN_ID);
    await refreshDelegationStatus();
  }, [delegateChain, refreshDelegationStatus]);

  const signAndSend = useCallback(
    async (transaction: { rootHash: string; userOps?: any[] } & Record<string, any>) => {
      if (!universalAccount || !magic || !userAddress) {
        throw new Error('Universal Account or wallet not ready');
      }

      type EIP7702Authorization = { userOpHash: string; signature: string };
      const authorizations: EIP7702Authorization[] = [];
      const nonceMap = new Map<number, string>();

      if (transaction.userOps) {
        for (const userOp of transaction.userOps) {
          if (userOp.eip7702Auth && !userOp.eip7702Delegated) {
            let signatureSerialized = nonceMap.get(userOp.eip7702Auth.nonce);

            if (!signatureSerialized) {
              console.log('Signing inline EIP-7702 auth:', userOp.eip7702Auth);
              // Sign with the auth's ORIGINAL chainId. The SDK returns 0
              // (chain-agnostic); replacing it with the destination chainId
              // (as the demo did) mismatches the authorization hash and causes
              // AA24 (signature error). This is the gasless inline-delegation
              // path — the paymaster covers gas, no local balance needed.
              const authorization = await signEip7702Auth(
                userOp.eip7702Auth.address,
                userOp.eip7702Auth.chainId,
                userOp.eip7702Auth.nonce,
              );

              const sig = Signature.from({
                r: authorization.r,
                s: authorization.s,
                v: authorization.v,
              });
              signatureSerialized = sig.serialized;
              nonceMap.set(userOp.eip7702Auth.nonce, signatureSerialized);
            }

            if (signatureSerialized) {
              authorizations.push({
                userOpHash: userOp.userOpHash,
                signature: signatureSerialized,
              });
            }
          }
        }
      }

      const provider = new BrowserProvider((magic as any).rpcProvider);
      const signer = await provider.getSigner();
      const signature = await signer.signMessage(getBytes(transaction.rootHash));

      console.log('signAndSend:', {
        rootHash: transaction.rootHash,
        signature,
        authorizationsCount: authorizations.length,
        userOpsCount: transaction.userOps?.length,
      });

      const result = await universalAccount.sendTransaction(
        transaction as any,
        signature,
        authorizations.length > 0 ? authorizations : undefined,
      );
      return result;
    },
    [universalAccount, magic, userAddress, signEip7702Auth],
  );

  const value = useMemo(
    () => ({
      universalAccount,
      accountInfo,
      primaryAssets,
      isDelegated,
      refreshBalance,
      ensureDelegated,
      delegateChain,
      signAndSend,
      loading,
    }),
    [universalAccount, accountInfo, primaryAssets, isDelegated, refreshBalance, ensureDelegated, delegateChain, signAndSend, loading],
  );

  return <UAContext.Provider value={value}>{children}</UAContext.Provider>;
};
