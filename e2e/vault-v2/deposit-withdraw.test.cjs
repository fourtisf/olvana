// End-to-end deposit / withdraw test: the real site HTML in Chromium, a wallet that forwards to a local chain (id 4663)
// running Morpho's real VaultV2 + VaultV2Factory (compiled from morpho-org/vault-v2) at the mainnet factory address.
// Run through ./run.sh (needs Node 22, python3 and playwright-core; set CHROMIUM to a Chromium binary if not /opt/pw-browsers/chromium).
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');

// Earn / calculator vault picker (replaced the row of vault buttons): open it, click the vault row
const pickVaultSel = async (pg, sel, opener = '#earnPick') => { await pg.click(opener); await pg.waitForSelector('#vpList [data-vp]'); await pg.click(sel.replace('[data-v=', '[data-vp=')); await pg.waitForTimeout(200); };
const path = require('path');
const { execSync } = require('child_process');
const fs = require('fs');
const RPC = 'http://127.0.0.1:8547';
const CAST = process.env.FOUNDRY_DIR + '/cast';
const FACTORY = '0x0FBad98595b0186dA120E41f77C102beb49f803c';
const USDG = '0x5fc5360d0400a0fd4f2af552add042d716f1d168';
const OWNER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const USER = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8';
const FAKE = '0x' + 'de'.repeat(20);                     // listed by the (mocked) API but not created by the factory
const HTML = fs.readFileSync(path.join(__dirname, '../../docs/olvana-prototype.html'), 'utf8');
const ORIGIN = 'https://olvana.test';
const sh = c => execSync(c, { encoding: 'utf8' }).trim();
const cast = a => sh(`${CAST} ${a} --rpc-url ${RPC}`).split(' ')[0];

const [VAULT, GATED, GATE] = sh(path.join(__dirname, 'chain.sh')).toLowerCase().split(' ');   // GATED: Vault V2 with a curator allowlist (MockGate)
const now = Math.floor(Date.now() / 1000);
const item = o => Object.assign({
  address: VAULT, name: 'Steakhouse USDG', symbol: 'steakUSDG', listed: true, creationTimestamp: String(now - 200 * 86400),
  factory: { address: FACTORY }, asset: { address: USDG, symbol: 'USDG', decimals: 6, priceUsd: 1, logoURI: null },
  totalAssetsUsd: 514e6, liquidityUsd: 50e6, performanceFee: 0, managementFee: 0, net7d: 0.0391, net1d: 0.04,
  curator: { address: '0x' + 'c'.repeat(40) }, curators: { items: [{ name: 'Steakhouse Financial', verified: true }] },
  adapters: { items: [{ address: '0x' + '2'.repeat(40), type: 'MorphoMarketV1', positions: { items: [
    { state: { supplyAssetsUsd: 500e6 }, market: { lltv: '860000000000000000', collateralAsset: { symbol: 'WETH', address: '0x' + '1'.repeat(40), logoURI: null }, oracle: { type: 'ChainlinkOracleV2' }, state: { utilization: 0.9 } } }] } }] },
}, o);
const ITEMS = [item(), item({ address: FAKE, name: 'Lookalike USDG', totalAssetsUsd: 20e6 }), item({ address: GATED, name: 'Confidential USDG', totalAssetsUsd: 30e6 })];
function api(postData) {
  let q; try { q = JSON.parse(postData || '{}'); } catch (e) { q = {}; }
  const c = q.variables && q.variables.c, chain = Array.isArray(c) ? c[0] : c;
  const items = chain === 4663 ? ITEMS : [];
  if (/vaultV2ByAddress/.test(q.query || '')) {
    const v = items.find(x => x.address === String(q.variables.a).toLowerCase()) || null;
    return { status: 200, contentType: 'application/json', body: JSON.stringify({ data: { vaultV2ByAddress: v } }) };
  }
  const s = (q.variables && q.variables.s) || 0;
  return { status: 200, contentType: 'application/json', body: JSON.stringify({ data: { vaultV2s: { items: items.slice(s, s + 50) } } }) };
}

// EIP-6963 wallet whose requests go to the local chain; eth_sendTransaction is signed by anvil's unlocked account.
const WALLET = (user) => {
  window.__sent = []; window.__reject = false;
  const provider = {
    on() {}, removeListener() {},
    request: async ({ method, params }) => {
      if (method === 'eth_requestAccounts') { window.__authed = true; return [user]; }
      if (method === 'eth_accounts') return window.__authed ? [user] : [];
      if (method === 'wallet_revokePermissions') return null;
      if (method === 'eth_sendTransaction') {
        if (window.__reject) throw Object.assign(new Error('User rejected the request.'), { code: 4001 });
        window.__sent.push({ to: params[0].to.toLowerCase(), data: params[0].data, from: params[0].from });
      }
      const r = await window.__rpc(method, params || []);
      if (r.error) throw Object.assign(new Error(r.error.message), { code: r.error.code, data: r.error.data });
      return r.result;
    },
  };
  const detail = Object.freeze({ info: { uuid: 'test-wallet', name: 'Test Wallet', icon: '', rdns: 'test.wallet' }, provider });
  const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail }));
  window.addEventListener('eip6963:requestProvider', announce); announce();
};

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
  let pass = 0, fail = 0; const errs = [];
  const check = (n, ok, info = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok ? '' : ' — ' + String(info).slice(0, 600))); };
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(e.message));
  await page.exposeFunction('__rpc', async (method, params) => {
    const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    return r.json();
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await page.route('**/api/morpho', r => r.fulfill(api(r.request().postData())));
  await page.route('https://api.morpho.org/**', r => r.fulfill(api(r.request().postData())));
  await page.route(ORIGIN + '/', r => r.fulfill({ status: 200, contentType: 'text/html', body: HTML }));
  await page.route('**/vaults.json', r => r.fulfill({ status: 404, body: '' }));   // no server snapshot: live API path
  await page.addInitScript(WALLET, USER);
  await page.goto(ORIGIN + '/#app'); await page.waitForTimeout(1500);

  const txt = s => page.$eval(s, e => e.textContent).catch(() => '');
  const sent = () => page.evaluate(() => window.__sent);
  const bal = (tok, who) => BigInt(cast(`call ${tok} "balanceOf(address)(uint256)" ${who}`));
  const allowance = () => BigInt(cast(`call ${USDG} "allowance(address,address)(uint256)" ${USER} ${VAULT}`));
  const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await page.waitForTimeout(150); } return false; };
  const setAmount = async v => { await page.fill('#amt', v); await page.dispatchEvent('#amt', 'input'); };
  const review = async () => { await page.click('#primary'); await until(async () => !/Running checks/.test(await txt('#confirm'))); };
  const checksTxt = async () => (await page.$$eval('#action .pf', els => els.map(e => e.innerText.replace(/\s+/g, ' ')))).join(' || ');

  await page.click('#walletBtn');
  await until(async () => /Wallet balance 1,000\.00 USDG/.test(await txt('#action')));
  check('connected on chain 4663, real wallet balance', /Wallet balance 1,000\.00 USDG/.test(await txt('#action')), await txt('#action'));
  await page.click('#earnPick'); await page.waitForSelector('#vpList [data-vp]');
  check('both listed vaults shown', /Lookalike USDG/.test(await txt('#vpList')) && /Steakhouse USDG/.test(await txt('#vpList')));
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);

  // 1 · deposit 100 → approve exact + deposit
  await pickVaultSel(page, `[data-v="4663:${VAULT}"]`);
  await setAmount('100'); await review();
  let c = await checksTxt();
  check('deposit checks: allowlist, balance passed; simulation after approval; no oracle row', /Vault contract on allowlist Passed/.test(c) && /Enough USDG in wallet [0-9,]+\.[0-9]{2} USDG/.test(c) && /Transaction simulated After approval/.test(c) && !/Oracle source/.test(c), c);
  check('steps: approve exact then deposit', /Approve exactly 100\.00 USDG/.test(c) && /Deposit 100\.00 USDG/.test(c), c);
  check('confirm button reads "Approve & deposit"', (await txt('#confirm')) === 'Approve & deposit', await txt('#confirm'));
  check('nothing sent before confirm', (await sent()).length === 0);
  await page.click('#confirm');
  await until(async () => /confirmed/.test(await txt('#action')));
  let s = await sent();
  check('sent exactly: approve(vault, 100e6) to USDG, then deposit(100e6, user) to vault',
    s.length === 2 && s[0].to === USDG && s[0].data === '0x095ea7b3' + VAULT.slice(2).padStart(64, '0') + (100e6).toString(16).padStart(64, '0')
    && s[1].to === VAULT && s[1].data === '0x6e553f65' + (100e6).toString(16).padStart(64, '0') + USER.slice(2).padStart(64, '0'), JSON.stringify(s));
  check('done screen with explorer links', /Deposit confirmed/.test(await txt('#action')) && (await page.$$eval('#action a[href*="robinhoodchain.blockscout.com/tx/0x"]', a => a.length)) === 2, await txt('#action'));
  check('onchain: wallet 900 USDG, vault holds 100, allowance used up', bal(USDG, USER) === 900000000n && bal(USDG, VAULT) === 100000000n && allowance() === 0n, `${bal(USDG, USER)} ${bal(USDG, VAULT)} ${allowance()}`);
  await page.click('#again');
  await until(async () => /100\.00/.test(await txt('.pos')));
  check('position refreshed to 100.00', /100\.00/.test(await txt('.pos')), await txt('.pos'));

  // 2 · rejection in the wallet, then retry
  await setAmount('50'); await review();
  await page.evaluate(() => { window.__reject = true; });
  await page.click('#confirm');
  await until(async () => /Try again/.test(await txt('#confirm')));
  check('rejected approve → plain message, nothing moved', /You rejected the request in your wallet\./.test(await txt('#action')) && bal(USDG, USER) === 900000000n, await txt('#action'));
  await page.evaluate(() => { window.__reject = false; });
  await page.click('#confirm');                                  // "Try again" re-runs the checks
  await until(async () => /Approve & deposit/.test(await txt('#confirm')));
  await page.click('#confirm');
  await until(async () => /confirmed/.test(await txt('#action')));
  check('retry deposits 50', bal(USDG, USER) === 850000000n && bal(USDG, VAULT) === 150000000n, `${bal(USDG, USER)}`);
  await page.click('#again'); await until(async () => /150\.00/.test(await txt('.pos')));

  // 3 · partial withdraw 30 → withdraw(assets, user, user)
  await page.click('[data-tab="withdraw"]');
  await setAmount('30'); await review();
  c = await checksTxt();
  check('withdraw checks: simulated + liquidity passed', /Transaction simulated Passed/.test(c) && /Liquidity available to exit Passed/.test(c) && (await txt('#confirm')) === 'Withdraw 30.00 USDG', c + ' | ' + await txt('#confirm'));
  await page.evaluate(() => { window.__sent = []; });
  await page.click('#confirm');
  await until(async () => /confirmed/.test(await txt('#action')));
  s = await sent();
  check('sent withdraw(30e6, user, user) to the vault only', s.length === 1 && s[0].to === VAULT && s[0].data === '0xb460af94' + (30e6).toString(16).padStart(64, '0') + USER.slice(2).padStart(64, '0') + USER.slice(2).padStart(64, '0'), JSON.stringify(s));
  check('onchain: +30 USDG back in wallet', bal(USDG, USER) === 880000000n, String(bal(USDG, USER)));
  await page.click('#again'); await until(async () => /120\.00/.test(await txt('.pos')));

  // 4 · MAX withdraw → redeem every share (no dust)
  await page.click('[data-tab="withdraw"]');
  await page.click('[data-p="100"]'); await review();
  check('MAX → "Withdraw everything" step', /Withdraw everything/.test(await checksTxt()), await checksTxt());
  const shares = bal(VAULT, USER);
  await page.evaluate(() => { window.__sent = []; });
  await page.click('#confirm');
  await until(async () => /confirmed/.test(await txt('#action')));
  s = await sent();
  check('sent redeem(allShares, user, user)', s.length === 1 && s[0].data === '0xba087652' + shares.toString(16).padStart(64, '0') + USER.slice(2).padStart(64, '0') + USER.slice(2).padStart(64, '0'), JSON.stringify(s));
  check('onchain: zero shares left, all 1000 USDG back', bal(VAULT, USER) === 0n && bal(USDG, USER) === 1000000000n, `${bal(VAULT, USER)} ${bal(USDG, USER)}`);
  await page.click('#again');

  // 5 · USDT-style token with a leftover allowance → reset to 0, approve exact, deposit
  cast(`send ${USDG} "setStrict(bool)" true --from ${OWNER} --unlocked`);
  cast(`send ${USDG} "approve(address,uint256)" ${VAULT} 5000000 --from ${USER} --unlocked`);
  await page.click('[data-tab="deposit"]');
  await until(async () => /Wallet balance 1,000\.00/.test(await txt('#action')));
  await setAmount('20'); await review();
  c = await checksTxt();
  check('strict token: 3 steps (reset, approve, deposit)', /Reset old approval to 0/.test(c) && /Approve exactly 20\.00 USDG/.test(c) && /Deposit 20\.00 USDG/.test(c), c);
  await page.evaluate(() => { window.__sent = []; });
  await page.click('#confirm');
  await until(async () => /confirmed/.test(await txt('#action')));
  s = await sent();
  check('sent approve(0), approve(20e6), deposit(20e6)', s.length === 3 && s[0].data.endsWith('0'.repeat(64)) && s[1].data.endsWith((20e6).toString(16).padStart(64, '0')) && s[2].data.startsWith('0x6e553f65'), JSON.stringify(s.map(x => x.data.slice(0, 10) + '…' + x.data.slice(-8))));
  check('onchain: 20 deposited, allowance 0', bal(USDG, VAULT) === 20000000n && allowance() === 0n, `${bal(USDG, VAULT)} ${allowance()}`);
  await page.click('#again');

  // 6 · vault listed by the API but not created by the factory → blocked, nothing sent
  await pickVaultSel(page, `[data-v="4663:${FAKE}"]`);
  await setAmount('10'); await review();
  c = await checksTxt();
  await page.evaluate(() => { window.__sent = []; });
  check('lookalike vault: allowlist "Not verified", confirm disabled', /Vault contract on allowlist Not verified/.test(c) && await page.$eval('#confirm', e => e.disabled) && /could not be verified onchain/.test(await txt('#action')), c + ' | ' + await txt('#action'));
  await page.click('#confirm', { force: true }).catch(() => {});
  await page.waitForTimeout(300);
  check('lookalike vault: nothing sent', (await sent()).length === 0);
  await page.click('#back');

  // 7 · one more plain deposit after the strict token is switched off
  await pickVaultSel(page, `[data-v="4663:${VAULT}"]`);
  cast(`send ${USDG} "setStrict(bool)" false --from ${OWNER} --unlocked`);
  await setAmount('25'); await review();
  await page.click('#confirm'); await until(async () => /confirmed/.test(await txt('#action')));
  check('plain deposit after strict mode', /Deposit confirmed/.test(await txt('#action')));

  // 8 · gated vault (curator allowlist, like "Confidential" vaults): refused before any approval, with a plain reason
  await page.click('#again');
  await pickVaultSel(page, `[data-v="4663:${GATED}"]`);
  await setAmount('10'); await review();
  c = await checksTxt();
  await page.evaluate(() => { window.__sent = []; });
  check('gated vault: blocked at review, before any approval ("Approved addresses only")', /Vault accepting deposits Approved addresses only/.test(c)
    && /only accepts deposits from addresses its curator has approved/.test(await txt('#action')) && await page.$eval('#confirm', e => e.disabled), c + ' | ' + await txt('#action'));
  await page.click('#confirm', { force: true }).catch(() => {}); await page.waitForTimeout(300);
  check('gated vault: nothing sent, no approval left behind', (await sent()).length === 0
    && BigInt(cast(`call ${USDG} "allowance(address,address)(uint256)" ${USER} ${GATED}`)) === 0n);
  await page.click('#back');
  // the curator approves the user → the same deposit goes through
  cast(`send ${GATE} "set(address,bool)" ${USER} true --from ${OWNER} --unlocked`);
  await review();
  c = await checksTxt();
  check('gated vault, user approved by the curator: no gate block', !/Approved addresses only/.test(c) && !(await page.$eval('#confirm', e => e.disabled)), c);
  await page.click('#confirm'); await until(async () => /confirmed/.test(await txt('#action')));
  check('gated vault: deposit confirmed onchain once allowed', /Deposit confirmed/.test(await txt('#action')) && BigInt(cast(`call ${GATED} "balanceOf(address)(uint256)" ${USER}`)) > 0n, await txt('#action'));

  check('no page errors', errs.length === 0, errs.join(' | '));
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
