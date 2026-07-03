import { EVMExtension } from '@magic-ext/evm';
import { OAuthExtension } from '@magic-ext/oauth2';
import { Magic as MagicBase } from 'magic-sdk';
import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react';

export type Magic = MagicBase<[EVMExtension, OAuthExtension]>;

type MagicContextType = {
  magic: Magic | null;
};

const MagicContext = createContext<MagicContextType>({
  magic: null,
});

export const useMagic = () => useContext(MagicContext);

const MagicProvider = ({ children }: { children: ReactNode }) => {
  const [magic, setMagic] = useState<Magic | null>(null);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_MAGIC_API_KEY) {
      const arbRpcUrl = process.env.NEXT_PUBLIC_ARB_RPC_URL || 'https://arb1.arbitrum.io/rpc';
      // Magic's EVM extension must know about every chain the UA may transact on,
      // otherwise magic.evm.switchChain(chainId) throws
      // "No matching network configured in EVM Extension for chainId". Register the
      // EVM chains UA V2 routes through, so pre-delegation works on any of them.
      const networks = [
        { chainId: 1, rpcUrl: 'https://eth.llamarpc.com' },
        { chainId: 42161, rpcUrl: arbRpcUrl, default: true },
        { chainId: 8453, rpcUrl: 'https://mainnet.base.org' },
        { chainId: 56, rpcUrl: 'https://bsc-dataseed.binance.org' },
        { chainId: 196, rpcUrl: 'https://rpc.xlayer.tech' },
        { chainId: 10, rpcUrl: 'https://mainnet.optimism.io' },
        { chainId: 137, rpcUrl: 'https://polygon-rpc.com' },
        { chainId: 43114, rpcUrl: 'https://api.avax.network/ext/bc/C/rpc' },
        { chainId: 5000, rpcUrl: 'https://rpc.mantle.xyz' },
        { chainId: 59144, rpcUrl: 'https://rpc.linea.build' },
        { chainId: 146, rpcUrl: 'https://rpc.soniclabs.com' },
        { chainId: 80094, rpcUrl: 'https://rpc.berachain.com' },
      ];
      const magic = new MagicBase(process.env.NEXT_PUBLIC_MAGIC_API_KEY as string, {
        network: { rpcUrl: arbRpcUrl, chainId: 42161 },
        extensions: [new EVMExtension(networks), new OAuthExtension()],
      });

      setMagic(magic);
    }
  }, []);

  const value = useMemo(() => {
    return {
      magic,
    };
  }, [magic]);

  return <MagicContext.Provider value={value}>{children}</MagicContext.Provider>;
};

export default MagicProvider;