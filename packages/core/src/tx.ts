/**
 * Deposit / withdraw planning for Morpho Vault V2 (HANDOFF §4.1–4.4).
 *
 * Pure functions only: they decide which transactions to send and encode them.
 * The app runs them through the user's wallet (simulate with `eth_call` first,
 * then `eth_sendTransaction`); nothing here signs or holds funds.
 *
 * Vault V2 signatures (morpho-org/vault-v2 src/VaultV2.sol):
 *   deposit(assets, onBehalf) · withdraw(assets, receiver, onBehalf) · redeem(shares, receiver, onBehalf)
 * Its maxDeposit / maxWithdraw / maxRedeem always return 0 ("gross
 * underestimation" because gates can revert), so limits come from simulating
 * the exact call rather than from the max* views.
 */
import { decodeErrorResult, encodeFunctionData, type Address, type Hex } from 'viem';
import { erc20Abi, vaultV2Abi } from './abis';

export interface TxRequest {
  to: Address;
  data: Hex;
}

export type DepositStep =
  | { kind: 'reset-approval'; tx: TxRequest }
  | { kind: 'approve'; tx: TxRequest }
  | { kind: 'deposit'; tx: TxRequest };

/**
 * Exact decimal string → token units. Returns null for anything that is not a
 * plain positive decimal, or that has more (non-zero) decimals than the token.
 */
export function parseAmount(input: string, decimals: number): bigint | null {
  const m = /^(\d*)(?:\.(\d*))?$/.exec(input.trim());
  if (!m || (!m[1] && !m[2]) || !Number.isInteger(decimals) || decimals < 0) return null;
  const frac = m[2] ?? '';
  if (frac.length > decimals && /[1-9]/.test(frac.slice(decimals))) return null;
  return BigInt(m[1] || '0') * 10n ** BigInt(decimals) + BigInt(frac.slice(0, decimals).padEnd(decimals, '0') || '0');
}

export interface DepositPlanInput {
  vault: Address;
  asset: Address;
  user: Address;
  amount: bigint;
  /** Current `asset.allowance(user, vault)`. */
  allowance: bigint;
  /**
   * True when simulating `approve(vault, amount)` reverted while an old
   * allowance is still set (USDT-style tokens refuse non-zero → non-zero).
   */
  approveNeedsReset?: boolean;
}

/** Approve exactly `amount` (never unlimited) when the allowance is short, then deposit. */
export function planDeposit(p: DepositPlanInput): DepositStep[] {
  if (p.amount <= 0n) throw new Error('Deposit amount must be positive');
  const steps: DepositStep[] = [];
  if (p.allowance < p.amount) {
    if (p.approveNeedsReset && p.allowance > 0n) steps.push({ kind: 'reset-approval', tx: approveTx(p.asset, p.vault, 0n) });
    steps.push({ kind: 'approve', tx: approveTx(p.asset, p.vault, p.amount) });
  }
  steps.push({
    kind: 'deposit',
    tx: { to: p.vault, data: encodeFunctionData({ abi: vaultV2Abi, functionName: 'deposit', args: [p.amount, p.user] }) },
  });
  return steps;
}

export function approveTx(asset: Address, spender: Address, amount: bigint): TxRequest {
  return { to: asset, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender, amount] }) };
}

export interface WithdrawPlanInput {
  vault: Address;
  user: Address;
  /** Requested amount in asset units (ignored when `max`). */
  amount: bigint;
  /** `vault.convertToAssets(vault.balanceOf(user))`. */
  positionAssets: bigint;
  /** `vault.balanceOf(user)`. */
  shares: bigint;
  /** The user pressed MAX. */
  max?: boolean;
}

/**
 * Partial exit → `withdraw(assets, user, user)`. Full exit (MAX, or an amount
 * at least the whole position) → `redeem(allShares, user, user)` so no dust is
 * left behind (HANDOFF §4.2).
 */
export function planWithdraw(p: WithdrawPlanInput): { kind: 'withdraw' | 'redeem'; assets: bigint; tx: TxRequest } {
  if (p.shares <= 0n) throw new Error('Nothing to withdraw');
  if (p.max || p.amount >= p.positionAssets) {
    return {
      kind: 'redeem',
      assets: p.positionAssets,
      tx: { to: p.vault, data: encodeFunctionData({ abi: vaultV2Abi, functionName: 'redeem', args: [p.shares, p.user, p.user] }) },
    };
  }
  if (p.amount <= 0n) throw new Error('Withdraw amount must be positive');
  return {
    kind: 'withdraw',
    assets: p.amount,
    tx: { to: p.vault, data: encodeFunctionData({ abi: vaultV2Abi, functionName: 'withdraw', args: [p.amount, p.user, p.user] }) },
  };
}

const VAULT_REASONS: Record<string, string> = {
  AbsoluteCapExceeded: "The vault is full: the curator's deposit cap is reached. Try a smaller amount or another vault.",
  RelativeCapExceeded: "The vault is full: the curator's deposit cap is reached. Try a smaller amount or another vault.",
  CannotReceiveShares: 'This vault only accepts deposits from approved addresses.',
  CannotSendAssets: 'This vault only accepts deposits from approved addresses.',
  CannotSendShares: "This vault's rules block withdrawals for this address right now.",
  CannotReceiveAssets: "This vault's rules block withdrawals for this address right now.",
  TransferFromReverted: 'The token transfer failed. Check your balance and approval, then try again.',
  TransferFromReturnedFalse: 'The token transfer failed. Check your balance and approval, then try again.',
  TransferReverted: 'The vault could not send the tokens. Try again later.',
  TransferReturnedFalse: 'The vault could not send the tokens. Try again later.',
};

function reasonText(reason: string): string {
  const s = reason.trim();
  if (/insufficient liquidity/i.test(s)) return "Not enough liquidity in the vault's markets right now. Try a smaller amount, or wait for borrowers to repay.";
  if (/insufficient (balance|allowance)|exceeds (balance|allowance)/i.test(s)) return 'Not enough balance or approval for this amount.';
  return s ? 'The contract refused: ' + s.slice(0, 160) : '';
}

// Vault V2 errors plus the two Solidity built-ins, so every name is typed.
const REVERT_ABI = [
  ...vaultV2Abi,
  { type: 'error', name: 'Error', inputs: [{ name: 'message', type: 'string' }] },
  { type: 'error', name: 'Panic', inputs: [{ name: 'code', type: 'uint256' }] },
] as const;

export const UNKNOWN_REVERT = 'The transaction would fail, and the contract gave no reason. Nothing was sent.';

/**
 * Revert data from a failed simulation → one plain-English sentence (HANDOFF
 * §11: "revert reasons shown in plain English"). Handles Vault V2 custom
 * errors, `Error(string)` (Morpho Blue uses strings such as "insufficient
 * liquidity") and `Panic(uint256)`.
 */
export function explainRevert(data: Hex | undefined | null): string {
  if (!data || data.length < 10) return UNKNOWN_REVERT;
  try {
    const d = decodeErrorResult({ abi: REVERT_ABI, data });
    if (d.errorName === 'Error') return reasonText(String(d.args[0])) || UNKNOWN_REVERT;
    if (d.errorName === 'Panic') return 'The amount is more than this wallet holds in the vault.';
    return VAULT_REASONS[d.errorName] ?? `The vault refused this transaction (${d.errorName}).`;
  } catch {
    return UNKNOWN_REVERT;
  }
}
