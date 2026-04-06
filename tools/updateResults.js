process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const fs = require('fs');
const path = require('path');
const https = require('https');
const cheerio = require('cheerio');

console.log('✅ updateResults.js started');

// ---------- チーム名変換 ----------
const TEAM_KEY_MAP = {
  '東京ヤクルトスワローズ': 'swallows',
  '阪神タイガース': 'tigers',
  '読売ジャイアンツ': 'giants',
  '広島東洋カープ': 'carp',
  '中日ドラゴンズ': 'dragons',
  '横浜DeNAベイスターズ': 'baystars',

  '福岡ソフトバンクホークス': 'hawks',
  '北海道日本ハムファイターズ': 'fighters',
  '埼玉西武ライオンズ': 'lions',
  'オリックス・バファローズ': 'buffaloes',
  '千葉ロッテマリーンズ': 'marines',
  '東北楽天ゴールデンイーグルス': 'eagles'
};

function toTeamKeyArray(jpTeams) {
  return jpTeams.map(name => {
    const key = TEAM_KEY_MAP[name];
    if (!key) {
      throw new Error(`Unknown team name: ${name}`);
    }
    return key;
  });
}

// ---------- 共通関数 ----------
function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// ---------- 設定 ----------
const season = '2026';
const resultsPath = path.join(__dirname, '..', 'data', 'results.json');

// ---------------- メイン処理 ----------------
async function updateResults() {
  const GB_COL_INDEX = 6; // ← ゲーム差の列番号（※要確認）

  /* ===== セ・リーグ取得 ===== */
  console.log('🌐 fetching Central League page...');
  const centralHtml = await fetchPage(
    'https://npb.jp/bis/2026/stats/std_c.html'
  );
  const $c = cheerio.load(centralHtml);

  const centralJp = [];
  const centralGb = [];

  $c('tbody.bis-table-body tr.ststats').each((i, el) => {
    const tds = $c(el).find('td');

    // チーム名
    const teamName = tds.eq(0).text().trim();
    centralJp.push(teamName);

    // ゲーム差（1位は "-"）
    const gbText = tds.eq(GB_COL_INDEX).text().trim();
    centralGb.push(gbText || '-');
  });

  const central = toTeamKeyArray(centralJp);

  console.log('✅ Central league order (keys):', central);
  console.log('✅ Central league games behind:', centralGb);

  /* ===== パ・リーグ取得 ===== */
  console.log('🌐 fetching Pacific League page...');
  const pacificHtml = await fetchPage(
    'https://npb.jp/bis/2026/stats/std_p.html'
  );
  const $p = cheerio.load(pacificHtml);

  const pacificJp = [];
  const pacificGb = [];

  $p('tbody.bis-table-body tr.ststats').each((i, el) => {
    const tds = $p(el).find('td');

    const teamName = tds.eq(0).text().trim();
    pacificJp.push(teamName);

    const gbText = tds.eq(GB_COL_INDEX).text().trim();
    pacificGb.push(gbText || '-');
  });

  const pacific = toTeamKeyArray(pacificJp);

  console.log('✅ Pacific league order (keys):', pacific);
  console.log('✅ Pacific league games behind:', pacificGb);

  /* ===== results.json 更新 ===== */
  console.log('📖 reading results.json...');
  const raw = fs.readFileSync(resultsPath, 'utf-8');
  const data = JSON.parse(raw);

  data[season] = {
    updatedAt: new Date().toLocaleString('ja-JP', {
      timeZone: 'Asia/Tokyo'
    }),
    central,
    centralGb,
    pacific,
    pacificGb
  };

  fs.writeFileSync(
    resultsPath,
    JSON.stringify(data, null, 2),
    'utf-8'
  );

  console.log(
    `✅ results.json updated (${season}): standings + games behind`
  );
}

// 実行
updateResults().catch(err => {
  console.error('❌ update failed');
  console.error(err);
});
