import { createClient } from "@solana/kit";
import { solanaDevnetRpc } from "@solana/kit-plugin-rpc";
import { walletSigner } from "@solana/kit-plugin-wallet";

/** Deliberately fixed to devnet. No private key or mainnet configuration. */
export const solanaClient = createClient()
  .use(walletSigner({ chain: "solana:devnet", storage: null }))
  .use(solanaDevnetRpc());
