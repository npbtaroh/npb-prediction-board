// ★ 非同期で中身が入るので let
let users = [];
let season;
let allUsers = null;   // users.json（不変マスタ）
let allSeasons = null;// seasons.json（年度設定）
let predictions = {};
let results = {};
let allResults = {};
let allPredictions = {};
let scores = {};

// 1. データロード系
async function loadSeasons() {
  const res = await fetch('data/seasons.json');
  return await res.json();
}

async function loadUsers() {
  const res = await fetch('data/users.json');
  return await res.json();
}

async function loadPredictions() {
  const res = await fetch('data/predictions.json');
  return await res.json();
}

async function loadResults() {
  const res = await fetch('data/results.json');
  return await res.json();
}

// 2. データ整形
function buildUsersForSeason(allUsers, seasons, season) {
  const seasonData = seasons[season];
  if (!seasonData) return [];

  const { participants, order } = seasonData;

  // 表示順を優先、なければ participants 順
  const ids = order && order.length ? order : participants;

  return ids.map(id => ({
    id,
    name: allUsers[id]?.name ?? id
  }));
}


// 3. 計算ロジック
function calculateBonusPoints(predictedRanks, actualRanks) {
  let bonus = 0;

  predictedRanks.forEach((team, index) => {
    const predictedRank = index + 1;
    const actualRank = actualRanks.indexOf(team) + 1;

    // 実際の順位が見つからない場合は無視（保険）
    if (actualRank === 0) return;

    // --- A. ピタリ順位ボーナス ---
    if (predictedRank === actualRank) {
      if (predictedRank === 1) bonus += 3;
      else if (predictedRank === 2 || predictedRank === 3) bonus += 2;
      else bonus += 1;
      return; // ★ 重複加算防止
    }

    // --- B. 上位圏ボーナス（1〜3位） ---
    if (predictedRank <= 3 && actualRank <= 3) {
      bonus += 1;
    }
  });

  return bonus;
}

function calculateLeagueScore(predictedRanks, actualRanks) {
  // --- 基本の順位点（Excel式） ---
  let rankPoint = 0;
  const weights = [5, 4, 3, 2, 1, 0];

  predictedRanks.forEach((team, index) => {
    const actualRank = actualRanks.indexOf(team) + 1;
    rankPoint += weights[index] * (6 - actualRank);
  });

  rankPoint -= 20;

  // --- ★ 追加：ボーナスポイント ---
  const bonusPoint = calculateBonusPoints(predictedRanks, actualRanks);

  return {
    rankPoint,
    bonusPoint,
    leaguePoint: rankPoint + bonusPoint
  };
}

function getBonusType(predictedRanks, actualRanks, teamKey) {
  const predictedIndex = predictedRanks.indexOf(teamKey);
  const actualIndex = actualRanks.indexOf(teamKey);

  if (predictedIndex === -1 || actualIndex === -1) {
    return null;
  }

  const predictedRank = predictedIndex + 1;
  const actualRank = actualIndex + 1;

  // A. ピタリ順位
  if (predictedRank === actualRank) {
    if (predictedRank === 1) return 'bonus-3';
    if (predictedRank === 2 || predictedRank === 3) return 'bonus-2';
    return 'bonus-1'; // 4〜6位ピタリ
  }

  // B. 上位圏ボーナス
  if (predictedRank <= 3 && actualRank <= 3) {
    return 'bonus-1';
  }

  return null;
}

function calculateNipponSeriesBonus(season, userId) {
  const predicted = predictions[season]?.nipponSeries;
  const actual = results[season]?.nipponSeries;

  // CS予想がない年度は0点
  if (!predicted || !actual) {
    return 0;
  }

  let bonus = 0;

  if (predicted.central?.[userId] === actual.central) {
    bonus += 5;
  }

  if (predicted.pacific?.[userId] === actual.pacific) {
    bonus += 5;
  }

  return bonus;
}

function recalcScores(season) { // アプリの状態（scores）を最新状態に更新する処理
  scores[season] = {};

  users.forEach(user => {
    const central = calculateLeagueScore(
      predictions[season].central[user.id],
      results[season].central
    );

    const pacific = calculateLeagueScore(
      predictions[season].pacific[user.id],
      results[season].pacific
    );

    // ★ 日本シリーズ進出チーム予想ボーナス
    const nipponSeriesBonus = calculateNipponSeriesBonus(
      season,
      user.id
    );

    scores[season][user.id] = {
      central,
      pacific,
      nipponSeriesBonus
    };
  });
}

function calcTotalScore(scoreObj) {
  if (!scoreObj) return 0;

  return (
    (scoreObj.central?.leaguePoint ?? 0) +
    (scoreObj.pacific?.leaguePoint ?? 0) +
    (scoreObj.nipponSeriesBonus ?? 0)
  ); // 未計算のものは0として扱いエラーが出ず描画を継続できる
}

// 4. 描画系
function renderTotalScoreTable() {
  const thead = document.getElementById('total-score');
  thead.innerHTML = '';

  // 1行目：名前
  const nameRow = document.createElement('tr');
  const nameCorner = document.createElement('th');
  nameCorner.className = 'actual-column';
  nameRow.appendChild(nameCorner);

  users.forEach(u => {
    const th = document.createElement('th');
    th.className = 'user-column';
    th.textContent = u.name;
    nameRow.appendChild(th);
  });

  // 2行目：合計点（central+pacific）
  const scoreRow = document.createElement('tr');
  const label = document.createElement('th');
  label.textContent = '合計';
  label.className = 'actual-column';
  scoreRow.appendChild(label);

  // 合計点を先に配列で取得
  const totals = users.map(u =>
    calcTotalScore(scores[season]?.[u.id])
  );

  // 最大値
  const maxTotal = Math.max(...totals);

  // 描画
  users.forEach((u, index) => {
    const th = document.createElement('th');
    th.className = 'user-column';

    const total = totals[index];

    const main = document.createElement('span');
    main.className = 'league-score';
    main.textContent = `${total}pt`;

    if (total === maxTotal) {
      main.classList.add('score-strong-total');
    }

    th.appendChild(main);
    scoreRow.appendChild(th);
  });

// 3行目：CS予想
const csRow = document.createElement('tr');

const actual = results[season]?.nipponSeries;

// 左端セル
const csInfoTh = document.createElement('th');
csInfoTh.className = 'cs-info-cell actual-column';

// 左側：「CS予想」
const csTitle = document.createElement('div');
csTitle.className = 'cs-row-label';
csTitle.innerHTML = 'CS<br>予想';

csInfoTh.appendChild(csTitle);

// 右側：「日本S進出」＋結果ロゴ
const resultArea = document.createElement('div');
resultArea.className = 'cs-result-area';

if (actual) {
  const resultLabel = document.createElement('div');
  resultLabel.className = 'cs-result-label';
  resultLabel.textContent = '日本S進出';

  const logos = document.createElement('div');
  logos.className = 'cs-result-logos';

  logos.appendChild(
    createCsLogo('central', actual.central, false)
  );

  logos.appendChild(
    createCsLogo('pacific', actual.pacific, false)
  );

  resultArea.appendChild(resultLabel);
  resultArea.appendChild(logos);
} else {
  resultArea.textContent = '-';
}

csInfoTh.appendChild(resultArea);
csRow.appendChild(csInfoTh);

// 各ユーザー：CS予想
users.forEach(user => {
  const th = document.createElement('th');
  th.className = 'cs-cell user-column';

  const predicted = predictions[season]?.nipponSeries;

  if (predicted && actual) {
    th.appendChild(
      createCsLogo(
        'central',
        predicted.central?.[user.id],
        predicted.central?.[user.id] === actual.central
      )
    );

    th.appendChild(
      createCsLogo(
        'pacific',
        predicted.pacific?.[user.id],
        predicted.pacific?.[user.id] === actual.pacific
      )
    );
  } else {
    th.textContent = '-';
  }

  csRow.appendChild(th);
});

  thead.appendChild(nameRow);
  thead.appendChild(scoreRow);
  thead.appendChild(csRow);
}

function createCsLogo(league, team, hit) {
  const wrapper = document.createElement('span');
  wrapper.className = 'cs-logo-wrapper';

  const img = document.createElement('img');
  img.src = `logos/${league}/${team}.png`;
  img.alt = team;
  img.className = 'cs-logo';

  wrapper.appendChild(img);

  // CS予想的中
  if (hit) {
    wrapper.classList.add('cs-hit');

    const bonusLabel = document.createElement('span');
    bonusLabel.className = 'cs-bonus-label';
    bonusLabel.textContent = '+5';

    wrapper.appendChild(bonusLabel);
  }

  return wrapper;
}

function renderRankingHeader(season, league, theadId) {
  const thead = document.getElementById(theadId);
  thead.innerHTML = '';

  // リーグ見出し＋各ユーザーのリーグ得点
  const leagueRow = document.createElement('tr');
  leagueRow.className = 'league-score-row';

  // 左端：リーグ名
  const leagueTh = document.createElement('th');
  leagueTh.className = 'league-cell actual-column';

  const leagueImg = document.createElement('img');
  leagueImg.src =
    league === 'central'
      ? 'logos/league/central.gif'
      : 'logos/league/pacific.gif';

  leagueImg.alt =
    league === 'central'
      ? 'セ・リーグ'
      : 'パ・リーグ';

  leagueImg.className = 'league-icon';

  const leagueText = document.createElement('span');
  leagueText.textContent =
    league === 'central'
      ? 'セ・リーグ'
      : 'パ・リーグ';

  leagueTh.appendChild(leagueImg);
  leagueTh.appendChild(leagueText);
  leagueRow.appendChild(leagueTh);

  // このリーグのユーザー別得点
  const leagueTotals = users.map(user =>
    scores[season][user.id][league].leaguePoint
  );

  const maxLeaguePoint = Math.max(...leagueTotals);

  users.forEach(user => {
    const point = scores[season][user.id][league];
    const th = document.createElement('th');
    th.className = 'user-column';

    const main = document.createElement('span');
    main.className = 'league-score';
    main.textContent = point.leaguePoint;

    if (point.leaguePoint === maxLeaguePoint) {
      if (league === 'central') {
        main.classList.add('score-strong-central');
      } else {
        main.classList.add('score-strong-pacific');
      }
    }

    const sup = document.createElement('sup');
    sup.className = 'score-breakdown';
    sup.textContent =
      `${point.rankPoint}+${point.bonusPoint}`;

    th.appendChild(main);
    th.appendChild(sup);
    leagueRow.appendChild(th);
  });

  thead.appendChild(leagueRow);
}

function renderTable(season, league, tbodyId) {
  const tbody = document.getElementById(tbodyId);
  tbody.innerHTML = '';

  const resultRanks = results[season][league];

  for (let rank = 0; rank < 6; rank++) {
    const tr = document.createElement('tr');

    // 1列目：実際の順位（実績）
    const currentTd = document.createElement('td');
    currentTd.className = 'actual-column';

    const wrapper = document.createElement('div');
    wrapper.className = 'current-rank';

    const currentImg = document.createElement('img');
    currentImg.src = `logos/${league}/${resultRanks[rank]}.png`;
    currentImg.className = 'logo';

    wrapper.appendChild(currentImg);

    // ゲーム差表示（2位以下のみ）
    const gbList =
      league === 'central'
        ? results[season].centralGb
        : results[season].pacificGb;

    const gb = gbList?.[rank];

    if (rank > 0 && gb && gb !== '-') {
      const gbLabel = document.createElement('span');
      gbLabel.className = 'gb-label';
      gbLabel.textContent = `↑${gb}`;
      wrapper.appendChild(gbLabel);
    }

    currentTd.appendChild(wrapper);
    tr.appendChild(currentTd);

    // 2列目以降：各ユーザーの予想
    users.forEach(user => {
      const predictedTeam = predictions[season][league][user.id][rank];
      const td = document.createElement('td');
      td.className = 'user-column';

      // team-bonus ラッパー
      const wrapper = document.createElement('div');
      wrapper.className = 'team-bonus';

      // ロゴ
      const img = document.createElement('img');
      img.src = `logos/${league}/${predictedTeam}.png`;
      img.className = 'logo';
      img.alt = predictedTeam;

      // ★ 後で判定するための情報
      img.dataset.team = predictedTeam;
      wrapper.dataset.user = user.id;
      wrapper.dataset.league = league;

      wrapper.appendChild(img);
      td.appendChild(wrapper);
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  }
}

function renderSeason(season) {
  const boardContents = document.querySelectorAll('.board-content');

  boardContents.forEach(boardContent => {
    boardContent.style.setProperty(
      '--user-count',
      users.length
    );
  });

  renderTotalScoreTable();

  ['central', 'pacific'].forEach(league => {
    renderRankingHeader(
      season,
      league,
      `${league}-head`
    );

    renderTable(
      season,
      league,
      `${league}-body`
    );

    applyBonusUI(
      season,
      league,
      `${league}-body`
    );
  });
}

function applyBonusUI(season, league, tbodyId) {
  const tbody = document.getElementById(tbodyId);
  const actualRanks = results[season][league];

  tbody.querySelectorAll('.team-bonus').forEach(wrapper => {
    const img = wrapper.querySelector('.logo');
    const teamKey = img.dataset.team;
    const userId = wrapper.dataset.user;

    const predictedRanks =
      predictions[season][league][userId];

    const bonusType = getBonusType(
      predictedRanks,
      actualRanks,
      teamKey
    );

    // リセット
    wrapper.classList.remove('bonus-3', 'bonus-2', 'bonus-1');
    const old = wrapper.querySelector('.bonus-label');
    if (old) old.remove();

    if (!bonusType) return;

    wrapper.classList.add(bonusType, league);

    const label = document.createElement('span');
    label.className = 'bonus-label';
    label.textContent =
      bonusType === 'bonus-3' ? '+3' :
      bonusType === 'bonus-2' ? '+2' :
      '+1';

    wrapper.appendChild(label);
  });
}

// 5. UI補助
function setupBoardScrollSync() {
  const top = document.querySelector('.board-scroll-top');
  const bottom = document.querySelector('.board-scroll-bottom');

  if (!top || !bottom) {
    return;
  }

  let syncing = false;

  const syncScroll = (source, target) => {
    if (syncing) return;

    syncing = true;
    target.scrollLeft = source.scrollLeft;

    requestAnimationFrame(() => {
      syncing = false;
    });
  };

  top.addEventListener(
    'scroll',
    () => syncScroll(top, bottom),
    { passive: true }
  );

  bottom.addEventListener(
    'scroll',
    () => syncScroll(bottom, top),
    { passive: true }
  );
}

function updateTitleBySeason(season) {
  const seasonText = document.getElementById('season-text');
  if (!seasonText) return;
  seasonText.textContent = season;
}

function formatUpdatedAt(updatedAtStr) {
  if (!updatedAtStr) return '--';

  // "YYYY/MM/DD HH:mm" を Date に変換
  const [datePart, timePart] = updatedAtStr.split(' ');
  const [y, m, d] = datePart.split('/').map(Number);
  const [hh, mm] = timePart.split(':').map(Number);
  const updatedAt = new Date(y, m - 1, d, hh, mm);

  const now = new Date();

  // 今日・昨日判定用に日付だけを比較
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const updatedDate = new Date(
    updatedAt.getFullYear(),
    updatedAt.getMonth(),
    updatedAt.getDate()
  );

  const time = `${hh}:${mm.toString().padStart(2, '0')}`;

  if (updatedDate.getTime() === today.getTime()) {
    return `今日 ${time}`;
  }

  if (updatedDate.getTime() === yesterday.getTime()) {
    return `昨日 ${time}`;
  }

  return updatedAtStr;
}

function updateUpdatedAt(season) {
  const el = document.getElementById('updated-at');
  if (!el) return;

  const updatedAt = results[season]?.updatedAt;
  el.textContent = updatedAt
    ? `最終更新：${formatUpdatedAt(updatedAt)}`
    : '最終更新：--';
}

// 6. シーズンUI
async function switchSeason(newSeason) {
  season = newSeason;

  // タイトル更新
  updateTitleBySeason(season);
  
  predictions[season] = allPredictions[season];
  results[season]     = allResults[season];

  // 年度データ差し替え
  users = buildUsersForSeason(allUsers, allSeasons, season);  

  scores[season] = {};
  recalcScores(season);

  // 再描画
  renderSeason(season);

  const topScroll = document.querySelector('.board-scroll-top');
  const bottomScroll = document.querySelector('.board-scroll-bottom');

  if (topScroll) {
    topScroll.scrollLeft = 0;
  }

  if (bottomScroll) {
    bottomScroll.scrollLeft = 0;
  }

  updateUpdatedAt(season);
}

function setupSeasonNavigation() {
  const prevButton = document.getElementById('season-prev');
  const nextButton = document.getElementById('season-next');

  if (!prevButton || !nextButton) return;

  const getAvailableSeasons = () =>
    Object.keys(allSeasons)
      .map(Number)
      .sort((a, b) => a - b);

  const updateButtons = () => {
    const seasons = getAvailableSeasons();
    const currentIndex = seasons.indexOf(Number(season));

    prevButton.disabled = currentIndex <= 0;
    nextButton.disabled = currentIndex >= seasons.length - 1;
  };

  prevButton.addEventListener('click', async () => {
    const seasons = getAvailableSeasons();
    const currentIndex = seasons.indexOf(Number(season));

    if (currentIndex > 0) {
      await switchSeason(
        String(seasons[currentIndex - 1])
      );
      updateButtons();
    }
  });

  nextButton.addEventListener('click', async () => {
    const seasons = getAvailableSeasons();
    const currentIndex = seasons.indexOf(Number(season));

    if (currentIndex < seasons.length - 1) {
      await switchSeason(
        String(seasons[currentIndex + 1])
      );
      updateButtons();
    }
  });

  updateButtons();
}

// 7. init
async function init() {  
  // マスタロード（1回だけ）
  allUsers   = (await loadUsers()).users;
  allSeasons = await loadSeasons();

  // 登録されている最新年度を初期表示
  season = Object.keys(allSeasons)
    .sort((a, b) => Number(b) - Number(a))[0];

  // タイトル更新
  updateTitleBySeason(season);

  // データ取得
  allPredictions = await loadPredictions();
  allResults     = await loadResults();

  // 年度状態セット
  predictions[season] = allPredictions[season];
  results[season]     = allResults[season];

 // 表示ユーザー構築
  users = buildUsersForSeason(allUsers, allSeasons, season);

  // スコア計算  
  scores[season] = {};
  recalcScores(season);

  // 描画
  renderSeason(season);
  updateUpdatedAt(season);
  setupBoardScrollSync();

  // UI初期化
  setupSeasonNavigation();
}

init()

