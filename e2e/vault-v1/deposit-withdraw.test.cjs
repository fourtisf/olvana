// End-to-end deposit / withdraw test for Morpho Vault V1 (MetaMorpho v1.1): the real site HTML in Chromium, a wallet
// that forwards to a local chain (id 1) running Morpho Blue + MetaMorphoV1_1Factory compiled from Morpho's source,
// with the factory at its Ethereum address. Run through ./run.sh.
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');

// Earn / calculator vault picker (replaced the row of vault buttons): open it, click the vault row
const pickVaultSel = async (pg, sel, opener = '#earnPick') => { await pg.click(opener); await pg.waitForSelector('#vpList [data-vp]'); await pg.click(sel.replace('[data-v=', '[data-vp=')); await pg.waitForTimeout(200); };
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const RPC = 'http://127.0.0.1:8548';
const CAST = process.env.FOUNDRY_DIR + '/cast';
const FACTORY = '0x1897A8997241C1cD4bD0698647e4EB7213535c24';
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const OWNER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const USER = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8';
const FAKE = '0x' + 'dd'.repeat(20);                     // listed by the (mocked) API but not created by any MetaMorpho factory
const HTML = fs.readFileSync(path.join(__dirname, '../../docs/olvana-prototype.html'), 'utf8');
const ORIGIN = 'https://olvana.test';
const sh = c => execSync(c, { encoding: 'utf8' }).trim();
const cast = a => sh(`${CAST} ${a} --rpc-url ${RPC}`).split(' ')[0];

const [VAULT_RAW, BLUE] = sh(path.join(__dirname, 'chain.sh')).split(' ');
const VAULT = VAULT_RAW.toLowerCase();
const now = Math.floor(Date.now() / 1000);
const v1 = o => Object.assign({
  address: VAULT, name: 'Steakhouse USDC', symbol: 'steakUSDC', listed: true, creationTimestamp: String(now - 700 * 86400),
  factory: { address: FACTORY }, asset: { address: USDC, symbol: 'USDC', decimals: 6, logoURI: null },
  liquidity: { underlying: '100000000000000', usd: 100e6 },
  state: { totalAssets: '400000000000000', totalAssetsUsd: 400e6, fee: 0.1, curator: '0x' + 'c'.repeat(40), weeklyApy: 0.05, dailyApy: 0.05,
    curators: [{ name: 'Steakhouse Financial', verified: true }],
    allocation: [{ supplyAssetsUsd: 400e6, market: { lltv: '860000000000000000', collateralAsset: { symbol: 'wstETH', address: '0x' + '1'.repeat(40), logoURI: null }, oracle: { type: 'ChainlinkOracleV2' }, state: { utilization: 0.9 } } }] },
}, o);
const V1 = [v1(), v1({ address: FAKE, name: 'Lookalike USDC' })];
let API_TX = [], API_DOWN = false;   // filled by the test to stand in for Morpho's indexer
function api(postData) {
  let q; try { q = JSON.parse(postData || '{}'); } catch (e) { q = {}; }
  const Q = q.query || '', c = q.variables && q.variables.c, chain = Array.isArray(c) ? c[0] : c;
  const ok = data => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
  const items = chain === 1 ? V1 : [];
  if (/vaultByAddress\(/.test(Q)) return ok({ vaultByAddress: items.find(x => x.address === String(q.variables.a).toLowerCase()) || null });
  if (/\bvaults\(/.test(Q)) return ok({ vaults: { items: items.map(x => ({ ...x, state: { totalAssets: x.state.totalAssets, totalAssetsUsd: x.state.totalAssetsUsd } })) } });
  // Morpho API vault transactions (history fallback): answered only for this user, chain 1, deposits + withdrawals
  if (/\btransactions\(/.test(Q) && API_DOWN) return { status: 502, contentType: 'text/plain', body: 'down' };
  if (/\btransactions\(/.test(Q)) return ok({ transactions: { items: API_TX.filter(x => Q.includes(`userAddress_in: ["${x.user}"]`) && /chainId_in: \[1\]/.test(Q)
    && /type_in: \[MetaMorphoDeposit, MetaMorphoWithdraw\]/.test(Q) && Q.includes(x.data.vault.address)).map(({ user, ...x }) => x) } });
  if (/vaultV2ByAddress/.test(Q)) return ok({ vaultV2ByAddress: null });
  return ok({ vaultV2s: { items: [] } });
}

const WALLET = (user) => {
  window.__sent = []; window.__reads = []; window.__reject = false;
  const provider = {
    on() {}, removeListener() {},
    request: async ({ method, params }) => {
      if (method === 'eth_requestAccounts') { window.__authed = true; return [user]; }
      if (method === 'eth_accounts') return window.__authed ? [user] : [];
      if (method === 'wallet_revokePermissions') return null;
      if (method === 'eth_getLogs' && window.__noLogs) { if (window.__slowLogs) await new Promise(r => setTimeout(r, window.__slowLogs)); return []; }
      // a node that caps eth_getLogs block ranges, like many public RPCs
      if (method === 'eth_getLogs' && window.__maxLogRange && parseInt(params[0].toBlock, 16) - parseInt(params[0].fromBlock, 16) >= window.__maxLogRange) throw Object.assign(new Error('block range too large'), { code: -32005 });
      if (method === 'eth_call') window.__reads.push({ to: String(params[0].to).toLowerCase(), data: params[0].data });
      if (method === 'eth_sendTransaction') {
        if (window.__reject) throw Object.assign(new Error('User rejected the request.'), { code: 4001 });
        window.__sent.push({ to: params[0].to.toLowerCase(), data: params[0].data });
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
  const page = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
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
  const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await page.waitForTimeout(150); } return false; };
  const setAmount = async v => { await page.fill('#amt', v); await page.dispatchEvent('#amt', 'input'); };
  const review = async () => { await page.click('#primary'); await until(async () => !/Running checks/.test(await txt('#confirm'))); };
  const checksTxt = async () => (await page.$$eval('#action .pf', els => els.map(e => e.innerText.replace(/\s+/g, ' ')))).join(' || ');
  const word = n => BigInt(n).toString(16).padStart(64, '0');

  await page.click('#walletBtn');
  await pickVaultSel(page, `[data-v="1:${VAULT}"]`);
  await until(async () => /Wallet balance 1,000\.00 USDC/.test(await txt('#action')));
  check('V1 vault on Ethereum (chain 1): wallet balance read', /Wallet balance 1,000\.00 USDC/.test(await txt('#action')), await txt('#action'));
  check('labelled Morpho Vault V1', /Morpho Vault V1/.test(await txt('.vault-head')));

  // 1 · deposit 100: approve exact → deposit(assets, receiver)
  await setAmount('100'); await review();
  let c = await checksTxt();
  check('allowlist passed via isMetaMorpho on the V1.1 factory', /Vault contract on allowlist Passed/.test(c), c);
  await page.click('#confirm'); await until(async () => /confirmed/.test(await txt('#action')));
  let s = await sent();
  check('sent approve(vault, 100e6) then deposit(100e6, user)', s.length === 2 && s[0].to === USDC && s[0].data === '0x095ea7b3' + word(VAULT) + word(100e6)
    && s[1].to === VAULT && s[1].data === '0x6e553f65' + word(100e6) + word(USER), JSON.stringify(s));
  check('onchain: 100 USDC supplied into Morpho Blue through the vault, allowance used up', bal(USDC, USER) === 900000000n && bal(USDC, BLUE) === 100000000n
    && BigInt(cast(`call ${USDC} "allowance(address,address)(uint256)" ${USER} ${VAULT}`)) === 0n, `${bal(USDC, USER)} ${bal(USDC, BLUE)}`);
  await page.click('#again'); await until(async () => /100\.00/.test(await txt('.pos')));
  const MC3 = '0xca11bde05977b3631167028862be2a173976ca11';
  let reads = await page.evaluate(() => window.__reads);
  check('the rest of the network is read through Multicall3 (aggregate3), not vault by vault', reads.some(r => r.to === MC3 && r.data.startsWith('0x82ad56cb')) && !reads.some(r => r.to === FAKE),
    JSON.stringify(reads.map(r => r.to + ' ' + r.data.slice(0, 10))));
  await page.goto(ORIGIN + '/#portfolio'); await until(async () => /Steakhouse USDC[\s\S]*100\.00/.test(await txt('#view')));
  check('Portfolio: the 100 USDC position, no read error', /Steakhouse USDC[\s\S]*100\.00/.test(await txt('#view')) && !/Could not read/.test(await txt('#view')), (await txt('#view')).slice(0, 400));
  check('Portfolio: position shows its per-day estimate', /\+0\.[0-9]{4} USDC \/ day|\+[0-9.,]+ USDC \/ day/.test(await txt('#view')), (await txt('#view')).slice(0, 400));
  await until(async () => /Deposit/.test(await txt('.txl')));
  check('Portfolio history: the deposit read from the vault events, with its tx link', /Deposit[\s\S]*Steakhouse USDC[\s\S]*\+100\.00 USDC/.test(await txt('.txl'))
    && (await page.$$eval('.txl a.txh', as => as.map(a => a.href))).some(h => /\/tx\/0x[0-9a-f]{64}$/.test(h)), await txt('.txl'));
  check('Portfolio: balance chart drawn, ending at the current balance', !!(await page.$('#hc svg path.hc-line')) && /Now \$100\.00/.test(await txt('.hc-stats')), await txt('#view').then(t => t.slice(0, 300)));
  await page.click('[data-pos-withdraw]'); await until(async () => /Wallet balance|Your position|70|100/.test(await txt('#action')) && !!(await page.$('[data-tab="withdraw"].on')));
  check('Portfolio Withdraw opens Earn on that vault with the Withdraw tab', !!(await page.$('[data-tab="withdraw"].on')) && /Steakhouse USDC/.test(await txt('.vault-head')), await txt('.vault-head'));
  await page.click('[data-tab="deposit"]'); await page.waitForTimeout(300);

  // 2 · over the cap (150 − 100 = 50 left): blocked before any approval
  await setAmount('80'); await review();
  c = await checksTxt();
  await page.evaluate(() => { window.__sent = []; });
  check('over-cap deposit blocked by maxDeposit before approving', /Vault accepting deposits Only 50\.00 left/.test(c) && /almost full: up to 50\.00 USDC/.test(await txt('#action'))
    && await page.$eval('#confirm', e => e.disabled), c + ' | ' + await txt('#action'));
  check('nothing sent for the over-cap deposit', (await sent()).length === 0);
  await page.click('#back');

  // 3 · a full V1 deposit that fails at simulation (cap lowered after review) → plain-English V1 error, no deposit sent
  await setAmount('40'); await review();
  cast(`send ${VAULT} "submitCap((address,address,address,address,uint256),uint256)" "(${USDC},0x0000000000000000000000000000000000000000,0x0000000000000000000000000000000000000000,0x0000000000000000000000000000000000000000,0)" 100000000 --from ${OWNER} --unlocked`);
  await page.evaluate(() => { window.__sent = []; });
  await page.click('#confirm'); await until(async () => /Try again/.test(await txt('#confirm')));
  s = await sent();
  check('cap cut after review: approval sent, deposit stopped by the simulation with a V1 message', s.length === 1 && s[0].data.startsWith('0x095ea7b3')
    && /vault is full/i.test(await txt('#action')) && bal(USDC, USER) === 900000000n, JSON.stringify(s) + ' | ' + await txt('#action'));
  await page.click('#back');

  // 4 · partial withdraw, then MAX (redeem all shares)
  await page.click('[data-tab="withdraw"]');
  await setAmount('30'); await review();
  await page.evaluate(() => { window.__sent = []; });
  await page.click('#confirm'); await until(async () => /confirmed/.test(await txt('#action')));
  s = await sent();
  check('sent withdraw(30e6, user, user)', s.length === 1 && s[0].data === '0xb460af94' + word(30e6) + word(USER) + word(USER), JSON.stringify(s));
  check('onchain: +30 USDC back', bal(USDC, USER) === 930000000n, String(bal(USDC, USER)));
  await page.click('#again'); await until(async () => /70\.00/.test(await txt('.pos')));
  await page.click('[data-tab="withdraw"]'); await page.click('[data-p="100"]'); await review();
  const shares = bal(VAULT, USER);
  await page.evaluate(() => { window.__sent = []; });
  await page.click('#confirm'); await until(async () => /confirmed/.test(await txt('#action')));
  s = await sent();
  check('MAX → redeem(allShares, user, user)', s.length === 1 && s[0].data === '0xba087652' + word(shares) + word(USER) + word(USER), JSON.stringify(s));
  check('onchain: no shares left, all 1,000 USDC back', bal(VAULT, USER) === 0n && bal(USDC, USER) === 1000000000n, `${bal(VAULT, USER)} ${bal(USDC, USER)}`);
  await page.click('#again');

  // 4b · history on a node that refuses long eth_getLogs ranges: walked back in windows, all three events still found
  cast('rpc anvil_mine 0xbb8');
  API_DOWN = true;   // the deep chain scan runs only when Morpho's API cannot answer
  await page.evaluate(() => { window.__maxLogRange = 1000; });
  await page.goto(ORIGIN + '/#portfolio'); await until(async () => !!(await page.$('#histRefresh'))); await page.click('#histRefresh'); await until(async () => /Withdraw[\s\S]*Withdraw[\s\S]*Deposit/.test(await txt('.txl')), 60000);
  check('capped eth_getLogs range: deposit + 2 withdrawals found by walking back', /Withdraw[\s\S]*Withdraw[\s\S]*−30\.00 USDC[\s\S]*Deposit[\s\S]*\+100\.00 USDC/.test(await txt('.txl')), await txt('.txl'));
  await page.evaluate(() => { window.__maxLogRange = 0; });
  API_DOWN = false;
  await page.goto(ORIGIN + '/#app'); await page.waitForTimeout(300);

  // 4c · a wallet node that returns no logs at all: the same history comes from Morpho's API
  const rpcJ = async (method, params) => (await (await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })).json()).result;
  const DEP = '0xdcbc1c05240f31ff3ad067ef1ee35ce4997762752e3a095284754544f4c709d7', WD = '0xfbde797d201c681b91056529119e0b02407c7bb96a4a2c75c01fc9667232c8db';
  const raw = await rpcJ('eth_getLogs', [{ address: VAULT, fromBlock: '0x0', toBlock: 'latest', topics: [[DEP, WD]] }]);
  API_TX = [];
  for (const l of raw) {
    const blk = await rpcJ('eth_getBlockByNumber', [l.blockNumber, false]), x = l.data.slice(2);
    API_TX.push({ user: USER.toLowerCase(), hash: l.transactionHash, blockNumber: parseInt(l.blockNumber, 16), logIndex: parseInt(l.logIndex, 16), timestamp: parseInt(blk.timestamp, 16),
      type: l.topics[0] === DEP ? 'MetaMorphoDeposit' : 'MetaMorphoWithdraw', data: { assets: String(BigInt('0x' + x.slice(0, 64))), shares: Number(BigInt('0x' + x.slice(64, 128))), vault: { address: VAULT } } });
  }
  await page.evaluate(() => { window.__noLogs = true; window.__slowLogs = 15000; });   // and slow: 15 s per eth_getLogs
  await page.goto(ORIGIN + '/#portfolio'); await until(async () => !!(await page.$('#histRefresh')));
  const tHist = Date.now(); await page.click('#histRefresh'); await until(async () => /Deposit/.test(await txt('.txl')), 30000);
  const histMs = Date.now() - tHist;
  check('history shown in under 3 s although the wallet node takes 15 s', histMs < 3000, histMs + ' ms');
  check('wallet node returns no logs: history (1 deposit, 2 withdrawals) from the Morpho API', API_TX.length === 3 && /Withdraw[\s\S]*Withdraw[\s\S]*−30\.00 USDC[\s\S]*Deposit[\s\S]*\+100\.00 USDC/.test(await txt('.txl'))
    && !/Older activity may be missing|only let Olvana look back/.test(await txt('#view')), await txt('#view').then(t => t.slice(-600)));
  await page.evaluate(() => { window.__noLogs = false; window.__slowLogs = 0; });
  API_TX = [];
  await page.goto(ORIGIN + '/#app'); await page.waitForTimeout(300);

  // 5 · lookalike V1 vault (not created by a MetaMorpho factory) → blocked
  await page.click('[data-tab="deposit"]');
  await pickVaultSel(page, `[data-v="1:${FAKE}"]`);
  await setAmount('10'); await review();
  await page.evaluate(() => { window.__sent = []; });
  check('lookalike V1 vault: "Not verified", confirm disabled, nothing sent', /Vault contract on allowlist Not verified/.test(await checksTxt()) && await page.$eval('#confirm', e => e.disabled) && (await sent()).length === 0, await checksTxt());

  check('no page errors', errs.length === 0, errs.join(' | '));
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
