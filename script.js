const $ = id => document.getElementById(id);
const number = id => Math.max(0, Number($(id).value) || 0);
const integer = n => Math.ceil(n).toLocaleString('ja-JP');
const decimal = n => n.toLocaleString('ja-JP', { maximumFractionDigits: 1 });
const percent = n => `${(n * 100).toLocaleString('ja-JP', { maximumFractionDigits: 2 })}%`;
const coins = n => `${integer(n)} コイン`;

// ===== スラコロ: 宝箱の中身データ =====
// prob: 排出確率, draws: エモモの宝玉の抽選回数(オッズLv上昇量と同数、GPは1抽選につき20), coin: 獲得メダル, doll: 限界突破ぶる太くん人形の排出フラグ
const normalBoxOutcomes = [
  { prob: 0.79, draws: 0, coin: 150, doll: 0 }, // 🪙150
  { prob: 0.1, draws: 1, coin: 0, doll: 0 },    // 宝玉+オッズLv.1Up+20GP
  { prob: 0.1, draws: 2, coin: 0, doll: 0 },    // 宝玉×2+オッズLv.2Up+40GP
  { prob: 0.01, draws: 0, coin: 0, doll: 1 }    // 限界突破ぶる太くん人形
];
const deluxeBoxOutcomes = [
  { prob: 0.3, draws: 1, coin: 0, doll: 0 },    // 宝玉+オッズLv.1Up+20GP
  { prob: 0.3, draws: 2, coin: 0, doll: 0 },    // 宝玉×2+オッズLv.2Up+40GP
  { prob: 0.25, draws: 0, coin: 300, doll: 0 }, // 🪙300
  { prob: 0.1, draws: 0, coin: 1000, doll: 0 }, // 🪙1000
  { prob: 0.05, draws: 0, coin: 0, doll: 1 }    // 限界突破ぶる太くん人形
];
const GP_PER_DRAW = 20;

function outcomeEV(outcomes) {
  return outcomes.reduce((acc, o) => ({
    draws: acc.draws + o.prob * o.draws,
    coin: acc.coin + o.prob * o.coin,
    doll: acc.doll + o.prob * o.doll
  }), { draws: 0, coin: 0, doll: 0 });
}

// ===== スラコロ専用ギフト: ギフト種類 =====
// baseMedal: 排出内容とは別に確定で付帯するメダル(単発300 / 10連(11回)5000)
const gifts = {
  normalSingle: { name: '普通の宝箱', price: 100, currency: 'free', packSize: 1, baseMedal: 300, outcomes: normalBoxOutcomes },
  normalTen: { name: '10連 普通の宝箱', price: 1000, currency: 'free', packSize: 11, baseMedal: 5000, outcomes: normalBoxOutcomes },
  deluxeSingle: { name: '豪華な宝箱', price: 100, currency: 'paid', packSize: 1, baseMedal: 300, outcomes: deluxeBoxOutcomes },
  deluxeTen: { name: '10連 豪華な宝箱', price: 1000, currency: 'paid', packSize: 11, baseMedal: 5000, outcomes: deluxeBoxOutcomes }
};

function giftPerUnit(gift) {
  const ev = outcomeEV(gift.outcomes);
  const draws = ev.draws * gift.packSize;
  return { draws, medal: gift.baseMedal + ev.coin * gift.packSize, doll: ev.doll * gift.packSize };
}

const giftInputIds = {
  normalSingle: 'normalSingle',
  normalTen: 'normalTen',
  deluxeSingle: 'deluxeSingle',
  deluxeTen: 'deluxeTen'
};

// 目標値に対し、指定コインの10連ギフトを優先消化しつつ単発で不足分を補う個数を算出する
// (単発の必要数が10個以上になる場合は10連をもう1個追加し、単発は0個にする)
function calcTenSingleNeed(target, tenPerUnit, singlePerUnit) {
  let tenCount = tenPerUnit > 0 ? Math.floor(target / tenPerUnit) : 0;
  const remainder = target - tenCount * tenPerUnit;
  let singleCount = singlePerUnit > 0 ? Math.ceil(Math.max(0, remainder) / singlePerUnit) : 0;
  if (singleCount >= 10) {
    tenCount += 1;
    singleCount = 0;
  }
  return { tenCount, singleCount };
}

// ten/single選択中コインの個数を、比較テーブルの4ギフト分の内訳に変換する(非選択側の通貨は常に0)
function rowCountsFor(currency, tenCount, singleCount) {
  return {
    normalSingle: currency === 'free' ? singleCount : 0,
    normalTen: currency === 'free' ? tenCount : 0,
    deluxeSingle: currency === 'paid' ? singleCount : 0,
    deluxeTen: currency === 'paid' ? tenCount : 0
  };
}

// 比較テーブルでハイライト対象(該当個数1個以上)になった行を優先的に上位表示するための優先順位
// (10連 豪華な宝箱 > 豪華な宝箱 > 10連 普通の宝箱 > 普通の宝箱)
const highlightPriority = ['deluxeTen', 'deluxeSingle', 'normalTen', 'normalSingle'];

function renderComparisonTable(tableId, currency, tenCount, singleCount) {
  const rowCounts = rowCountsFor(currency, tenCount, singleCount);
  const baseOrder = Object.keys(gifts);
  const highlightedKeys = highlightPriority.filter(key => rowCounts[key] > 0);
  const restKeys = baseOrder.filter(key => rowCounts[key] === 0);
  const orderedKeys = [...highlightedKeys, ...restKeys];
  $(tableId).innerHTML = orderedKeys.map(key => {
    const rowGift = gifts[key];
    const count = rowCounts[key];
    const rowCurrencyLabel = rowGift.currency === 'free' ? '無償' : '有償';
    const selectedClass = count > 0 ? 'is-selected' : '';
    return `<tr class="${selectedClass}"><td>${rowGift.name}(${rowGift.price})</td><td>${integer(count)} 個</td><td>${integer(count * rowGift.price)} コイン(${rowCurrencyLabel})</td></tr>`;
  }).join('');
}

// ===== エモモアイテム選択: エモモの宝玉 排出率データ =====
// prob: 個別の排出確率(小数)。「その他」は各レア度で一番確率の高いアイテム群のみを対象とし、
// 表示確率は合算せず、番号が一番若いアイテムの個別確率を代表値として使用する
const gemRarities = {
  star5: {
    items: [
      { id: 'gem2', name: 'いやしのおばけ・ほわみゃ&くらにゃ', prob: 0.0001 }
    ],
    otherProb: 0
  },
  star4: {
    items: [
      { id: 'gem1', name: '頭乗りがくがくアトラン', prob: 0.003 },
      { id: 'gem3', name: 'ひーりんぐしんぷのほわほわストールコーデ', prob: 0.0012 },
      { id: 'gem4', name: 'りふれっしゅしすたーのひらひらリボンドレス', prob: 0.0012 },
      { id: 'gem5', name: 'ほわみゃのかいふくクロスヘアチャーム', prob: 0.0012 },
      { id: 'gem6', name: 'ふわふわたましいのリフレッシュヘアリング', prob: 0.0016 },
      { id: 'gem7', name: 'おそうじフワフワくもさんほうき', prob: 0.0016 },
      { id: 'gem8', name: 'りふれっしゅしすたーのフリフリおばけヴェール', prob: 0.0016 }
    ],
    otherProb: 0.008 // その他代表: gem9(個別確率)
  },
  star3: {
    items: [
      { id: 'gem19', name: 'たましいのおそうじタイム♪', prob: 0.02 }
    ],
    otherProb: 0.028 // その他代表: gem20(個別確率)
  },
  star2: {
    items: [],
    otherProb: 0.0801 // その他代表: gem26(個別確率)
  }
};

let emomoEnabled = false;

function updateEmomoItemOptions() {
  const rarity = $('emomoRarity').value;
  const field = $('emomoItemField');
  const select = $('emomoItem');
  const group = gemRarities[rarity];
  if (!rarity || !group.items.length) {
    field.hidden = true;
    select.innerHTML = '';
    select.disabled = false;
    return;
  }
  field.hidden = false;
  if (group.items.length === 1 && group.otherProb === 0) {
    // アイテムが1つしかないレア度は選択させず固定表示にする
    select.innerHTML = `<option value="${group.items[0].id}">${group.items[0].name}</option>`;
    select.disabled = true;
    return;
  }
  select.disabled = false;
  const options = group.items.map(item => `<option value="${item.id}">${item.name}</option>`);
  if (group.otherProb > 0) options.push('<option value="other">その他</option>');
  select.innerHTML = `<option value="">選択してください</option>${options.join('')}`;
}

function selectedGemProb() {
  const rarity = $('emomoRarity').value;
  if (!rarity) return null;
  const group = gemRarities[rarity];
  if (!group.items.length) return group.otherProb;
  const itemId = $('emomoItem').value;
  if (!itemId) return null;
  if (itemId === 'other') return group.otherProb;
  const item = group.items.find(i => i.id === itemId);
  return item ? item.prob : null;
}

// totalDraws(期待値)を切り捨てた回数だけ独立抽選したと仮定して的中確率を算出
function applyEmomoResult(blockId, valueId, totalDraws) {
  const block = $(blockId);
  if (!emomoEnabled) {
    block.hidden = true;
    return;
  }
  block.hidden = false;
  const prob = selectedGemProb();
  if (prob === null) {
    $(valueId).textContent = 'アイテムが選択されていません';
    return;
  }
  const draws = Math.floor(totalDraws);
  $(valueId).textContent = percent(1 - Math.pow(1 - prob, draws));
}

function renderSend() {
  let totalDraws = 0;
  let totalMedal = 0;
  let totalDoll = 0;
  let freeCoinsSpent = 0;
  let paidCoinsSpent = 0;

  Object.entries(gifts).forEach(([key, gift]) => {
    const count = number(giftInputIds[key]);
    const perUnit = giftPerUnit(gift);
    totalDraws += count * perUnit.draws;
    totalMedal += count * perUnit.medal;
    totalDoll += count * perUnit.doll;
    if (gift.currency === 'free') {
      freeCoinsSpent += count * gift.price;
    } else {
      paidCoinsSpent += count * gift.price;
    }
  });

  $('gpResult').textContent = `${decimal(totalDraws * GP_PER_DRAW)} GP`;
  $('oddsResult').textContent = `${decimal(totalDraws)} Lv.Up`;
  $('dollResult').textContent = `${decimal(totalDoll)} 個`;
  $('gemResult').textContent = `${decimal(totalDraws)} 個`;
  $('medalResult').textContent = `${decimal(totalMedal)} メダル`;
  $('freeCoinsResult').textContent = coins(freeCoinsSpent);
  $('paidCoinsResult').textContent = coins(paidCoinsSpent);
  applyEmomoResult('emomoResultSend', 'emomoProbSend', totalDraws);
}

// 無償コインは「10連 普通の宝箱」、有償コインは「10連 豪華な宝箱」を優先消化
function calcBudgetCounts(freeCoins, paidCoins) {
  const normalTenCount = Math.floor(freeCoins / gifts.normalTen.price);
  const normalSingleCount = Math.floor((freeCoins - normalTenCount * gifts.normalTen.price) / gifts.normalSingle.price);
  const deluxeTenCount = Math.floor(paidCoins / gifts.deluxeTen.price);
  const deluxeSingleCount = Math.floor((paidCoins - deluxeTenCount * gifts.deluxeTen.price) / gifts.deluxeSingle.price);
  return { normalSingle: normalSingleCount, normalTen: normalTenCount, deluxeSingle: deluxeSingleCount, deluxeTen: deluxeTenCount };
}

function renderBudget() {
  const counts = calcBudgetCounts(number('budgetFree'), number('budgetPaid'));
  let totalDraws = 0;
  let totalMedal = 0;
  let totalDoll = 0;

  const rowsByKey = {};
  Object.entries(gifts).forEach(([key, gift]) => {
    const count = counts[key];
    const perUnit = giftPerUnit(gift);
    totalDraws += count * perUnit.draws;
    totalMedal += count * perUnit.medal;
    totalDoll += count * perUnit.doll;
    rowsByKey[key] = { gift, count, spent: count * gift.price };
  });

  $('budgetGpResult').textContent = `${decimal(totalDraws * GP_PER_DRAW)} GP`;
  $('budgetOddsResult').textContent = `${decimal(totalDraws)} Lv.Up`;
  $('budgetDollResult').textContent = `${decimal(totalDoll)} 個`;
  $('budgetGemResult').textContent = `${decimal(totalDraws)} 個`;
  $('budgetMedalResult').textContent = `${decimal(totalMedal)} メダル`;
  applyEmomoResult('emomoResultBudget', 'emomoProbBudget', totalDraws);

  const highlightedKeys = highlightPriority.filter(key => rowsByKey[key].count > 0);
  const restKeys = Object.keys(gifts).filter(key => rowsByKey[key].count === 0);
  const orderedKeys = [...highlightedKeys, ...restKeys];
  $('budgetComparison').innerHTML = orderedKeys.map(key => {
    const row = rowsByKey[key];
    const selectedClass = row.count > 0 ? 'is-selected' : '';
    const currencyLabel = row.gift.currency === 'free' ? '無償' : '有償';
    return `<tr class="${selectedClass}"><td>${row.gift.name}(${row.gift.price})</td><td>${integer(row.count)} 個</td><td>${integer(row.spent)} コイン(${currencyLabel})</td></tr>`;
  }).join('');
}

function renderGp() {
  const target = number('gpTarget');
  const stock = number('gpStock');
  const totalTarget = target + stock * 500;
  const currency = $('gpCoinType').value;
  const tenGift = currency === 'free' ? gifts.normalTen : gifts.deluxeTen;
  const singleGift = currency === 'free' ? gifts.normalSingle : gifts.deluxeSingle;
  const tenPerUnit = giftPerUnit(tenGift);
  const singlePerUnit = giftPerUnit(singleGift);
  const gpPerTen = tenPerUnit.draws * GP_PER_DRAW;
  const gpPerSingle = singlePerUnit.draws * GP_PER_DRAW;
  const { tenCount, singleCount } = calcTenSingleNeed(totalTarget, gpPerTen, gpPerSingle);
  const currencyLabel = currency === 'free' ? '無償' : '有償';

  $('gpNeedTenLabel').textContent = `${tenGift.name}の個数の目安`;
  $('gpNeedSingleLabel').textContent = `${singleGift.name}の個数の目安`;
  $('gpNeedTen').textContent = `${integer(tenCount)} 個`;
  $('gpNeedSingle').textContent = `${integer(singleCount)} 個`;
  $('gpNeedTenResult').hidden = tenCount === 0;
  $('gpNeedSingleResult').hidden = singleCount === 0;
  $('gpNeedCoins').textContent = `${integer(tenCount * tenGift.price + singleCount * singleGift.price)} コイン(${currencyLabel})`;
  const totalDraws = tenCount * tenPerUnit.draws + singleCount * singlePerUnit.draws;
  $('gpExpectedResult').textContent = `${decimal(totalDraws * GP_PER_DRAW)} GP`;
  applyEmomoResult('emomoResultGp', 'emomoProbGp', totalDraws);
  renderComparisonTable('gpComparison', currency, tenCount, singleCount);
}

function renderOdds() {
  const target = number('oddsTarget');
  const currency = $('oddsCoinType').value;
  const tenGift = currency === 'free' ? gifts.normalTen : gifts.deluxeTen;
  const singleGift = currency === 'free' ? gifts.normalSingle : gifts.deluxeSingle;
  const tenPerUnit = giftPerUnit(tenGift);
  const singlePerUnit = giftPerUnit(singleGift);
  const { tenCount, singleCount } = calcTenSingleNeed(target, tenPerUnit.draws, singlePerUnit.draws);
  const currencyLabel = currency === 'free' ? '無償' : '有償';

  $('oddsNeedTenLabel').textContent = `${tenGift.name}の個数の目安`;
  $('oddsNeedSingleLabel').textContent = `${singleGift.name}の個数の目安`;
  $('oddsNeedTen').textContent = `${integer(tenCount)} 個`;
  $('oddsNeedSingle').textContent = `${integer(singleCount)} 個`;
  $('oddsNeedTenResult').hidden = tenCount === 0;
  $('oddsNeedSingleResult').hidden = singleCount === 0;
  $('oddsNeedCoins').textContent = `${integer(tenCount * tenGift.price + singleCount * singleGift.price)} コイン(${currencyLabel})`;
  const totalDraws = tenCount * tenPerUnit.draws + singleCount * singlePerUnit.draws;
  $('oddsExpectedResult').textContent = `${decimal(totalDraws)} Lv.Up`;
  applyEmomoResult('emomoResultOdds', 'emomoProbOdds', totalDraws);
  renderComparisonTable('oddsComparison', currency, tenCount, singleCount);
}

function renderDoll() {
  const target = number('dollTarget');
  const currency = $('dollCoinType').value;
  const tenGift = currency === 'free' ? gifts.normalTen : gifts.deluxeTen;
  const singleGift = currency === 'free' ? gifts.normalSingle : gifts.deluxeSingle;
  const tenPerUnit = giftPerUnit(tenGift);
  const singlePerUnit = giftPerUnit(singleGift);
  const { tenCount, singleCount } = calcTenSingleNeed(target, tenPerUnit.doll, singlePerUnit.doll);
  const currencyLabel = currency === 'free' ? '無償' : '有償';

  $('dollNeedTenLabel').textContent = `${tenGift.name}の個数の目安`;
  $('dollNeedSingleLabel').textContent = `${singleGift.name}の個数の目安`;
  $('dollNeedTen').textContent = `${integer(tenCount)} 個`;
  $('dollNeedSingle').textContent = `${integer(singleCount)} 個`;
  $('dollNeedTenResult').hidden = tenCount === 0;
  $('dollNeedSingleResult').hidden = singleCount === 0;
  $('dollNeedCoins').textContent = `${integer(tenCount * tenGift.price + singleCount * singleGift.price)} コイン(${currencyLabel})`;
  const totalDraws = tenCount * tenPerUnit.draws + singleCount * singlePerUnit.draws;
  const totalDoll = tenCount * tenPerUnit.doll + singleCount * singlePerUnit.doll;
  $('dollExpectedResult').textContent = `${decimal(totalDoll)} 個`;
  applyEmomoResult('emomoResultDoll', 'emomoProbDoll', totalDraws);
  renderComparisonTable('dollComparison', currency, tenCount, singleCount);
}

function render() {
  renderSend();
  renderBudget();
  renderGp();
  renderOdds();
  renderDoll();
}

function initTabs() {
  const tabs = Array.from(document.querySelectorAll('.tab'));
  const activate = (tab, { focus = false } = {}) => {
    tabs.forEach(t => {
      const isActive = t === tab;
      t.setAttribute('aria-selected', String(isActive));
      t.tabIndex = isActive ? 0 : -1;
      $(t.dataset.target).hidden = !isActive;
    });
    if (focus) tab.focus();
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activate(tab));
    tab.addEventListener('keydown', e => {
      const dir = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (!dir) return;
      e.preventDefault();
      activate(tabs[(index + dir + tabs.length) % tabs.length], { focus: true });
    });
  });
}

function initEmomo() {
  $('emomoEnabled').addEventListener('change', () => {
    emomoEnabled = $('emomoEnabled').checked;
    $('emomoState').textContent = emomoEnabled ? 'ON' : 'OFF';
    $('emomoBar').classList.toggle('is-active', emomoEnabled);
    $('emomoSelect').hidden = !emomoEnabled;
    render();
  });
  $('emomoRarity').addEventListener('change', () => {
    updateEmomoItemOptions();
    render();
  });
  $('emomoItem').addEventListener('change', render);
}

document.querySelectorAll('input, select').forEach(el => el.addEventListener('input', render));
document.querySelectorAll('input[type="number"]').forEach(el => el.addEventListener('focus', () => el.select()));
document.querySelectorAll('input[type="number"]').forEach(el => el.addEventListener('blur', () => {
  if (el.value === '') el.value = 0;
}));
initTabs();
initEmomo();
render();
