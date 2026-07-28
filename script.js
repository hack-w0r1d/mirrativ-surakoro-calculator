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

  const rows = Object.entries(gifts).map(([key, gift]) => {
    const count = counts[key];
    const perUnit = giftPerUnit(gift);
    totalDraws += count * perUnit.draws;
    totalMedal += count * perUnit.medal;
    totalDoll += count * perUnit.doll;
    return { gift, count, spent: count * gift.price };
  });

  $('budgetGpResult').textContent = `${decimal(totalDraws * GP_PER_DRAW)} GP`;
  $('budgetOddsResult').textContent = `${decimal(totalDraws)} Lv.Up`;
  $('budgetDollResult').textContent = `${decimal(totalDoll)} 個`;
  $('budgetGemResult').textContent = `${decimal(totalDraws)} 個`;
  $('budgetMedalResult').textContent = `${decimal(totalMedal)} メダル`;
  applyEmomoResult('emomoResultBudget', 'emomoProbBudget', totalDraws);
  $('budgetComparison').innerHTML = rows.map(row => {
    const selectedClass = row.count > 0 ? 'is-selected' : '';
    const currencyLabel = row.gift.currency === 'free' ? '無償' : '有償';
    return `<tr class="${selectedClass}"><td>${row.gift.name}(${row.gift.price})</td><td>${integer(row.count)} 個</td><td>${integer(row.spent)} コイン(${currencyLabel})</td></tr>`;
  }).join('');
}

function renderGp() {
  const target = number('gpTarget');
  const stock = number('gpStock');
  const totalTarget = target + stock * 500;
  const selectedKey = $('gpGiftType').value;
  const gift = gifts[selectedKey];
  const perUnit = giftPerUnit(gift);
  const gpPerUnit = perUnit.draws * GP_PER_DRAW;
  const need = gpPerUnit > 0 ? Math.ceil(totalTarget / gpPerUnit) : 0;
  const currencyLabel = gift.currency === 'free' ? '無償' : '有償';
  let prefix;
  if (stock > 0 && target > 0) {
    prefix = `チャンスストック${integer(stock)}個と${integer(target)}GP`;
  } else if (stock > 0) {
    prefix = `チャンスストック${integer(stock)}個`;
  } else {
    prefix = `${integer(target)}GP`;
  }

  $('gpNeedCountLabel').textContent = `${prefix}貯めるのに必要な個数の目安`;
  $('gpNeedCoinsLabel').textContent = `${prefix}貯めるのに必要なコイン数の目安`;
  $('gpNeedCount').textContent = `${integer(need)} 個`;
  $('gpNeedCoins').textContent = `${integer(need * gift.price)} コイン(${currencyLabel})`;
  $('gpExpectedResult').textContent = `${decimal(need * gpPerUnit)} GP`;
  applyEmomoResult('emomoResultGp', 'emomoProbGp', need * perUnit.draws);

  $('gpComparison').innerHTML = Object.entries(gifts).map(([key, rowGift]) => {
    const rowGpPerUnit = giftPerUnit(rowGift).draws * GP_PER_DRAW;
    const count = rowGpPerUnit > 0 ? Math.ceil(totalTarget / rowGpPerUnit) : 0;
    const rowCurrencyLabel = rowGift.currency === 'free' ? '無償' : '有償';
    const selectedClass = key === selectedKey ? 'is-selected' : '';
    return `<tr class="${selectedClass}"><td>${rowGift.name}(${rowGift.price})</td><td>${integer(count)} 個</td><td>${integer(count * rowGift.price)} コイン(${rowCurrencyLabel})</td></tr>`;
  }).join('');
}

function renderOdds() {
  const target = number('oddsTarget');
  const selectedKey = $('oddsGiftType').value;
  const gift = gifts[selectedKey];
  const oddsPerUnit = giftPerUnit(gift).draws;
  const need = oddsPerUnit > 0 ? Math.ceil(target / oddsPerUnit) : 0;
  const currencyLabel = gift.currency === 'free' ? '無償' : '有償';

  $('oddsNeedCountLabel').textContent = `オッズLv.${integer(target)}Upに必要な個数の目安`;
  $('oddsNeedCoinsLabel').textContent = `オッズLv.${integer(target)}Upに必要なコイン数の目安`;
  $('oddsNeedCount').textContent = `${integer(need)} 個`;
  $('oddsNeedCoins').textContent = `${integer(need * gift.price)} コイン(${currencyLabel})`;
  $('oddsExpectedResult').textContent = `${decimal(need * oddsPerUnit)} Lv.Up`;
  applyEmomoResult('emomoResultOdds', 'emomoProbOdds', need * oddsPerUnit);

  $('oddsComparison').innerHTML = Object.entries(gifts).map(([key, rowGift]) => {
    const rowOddsPerUnit = giftPerUnit(rowGift).draws;
    const count = rowOddsPerUnit > 0 ? Math.ceil(target / rowOddsPerUnit) : 0;
    const rowCurrencyLabel = rowGift.currency === 'free' ? '無償' : '有償';
    const selectedClass = key === selectedKey ? 'is-selected' : '';
    return `<tr class="${selectedClass}"><td>${rowGift.name}(${rowGift.price})</td><td>${integer(count)} 個</td><td>${integer(count * rowGift.price)} コイン(${rowCurrencyLabel})</td></tr>`;
  }).join('');
}

function renderDoll() {
  const target = number('dollTarget');
  const selectedKey = $('dollGiftType').value;
  const gift = gifts[selectedKey];
  const perUnit = giftPerUnit(gift);
  const need = perUnit.doll > 0 ? Math.ceil(target / perUnit.doll) : 0;
  const currencyLabel = gift.currency === 'free' ? '無償' : '有償';

  $('dollNeedCountLabel').textContent = `限界突破ぶる太くん人形${integer(target)}個獲得に必要な個数の目安`;
  $('dollNeedCoinsLabel').textContent = `限界突破ぶる太くん人形${integer(target)}個獲得に必要なコイン数の目安`;
  $('dollNeedCount').textContent = `${integer(need)} 個`;
  $('dollNeedCoins').textContent = `${integer(need * gift.price)} コイン(${currencyLabel})`;
  $('dollExpectedResult').textContent = `${decimal(need * perUnit.doll)} 個`;
  applyEmomoResult('emomoResultDoll', 'emomoProbDoll', need * perUnit.draws);

  $('dollComparison').innerHTML = Object.entries(gifts).map(([key, rowGift]) => {
    const rowDollPerUnit = giftPerUnit(rowGift).doll;
    const count = rowDollPerUnit > 0 ? Math.ceil(target / rowDollPerUnit) : 0;
    const rowCurrencyLabel = rowGift.currency === 'free' ? '無償' : '有償';
    const selectedClass = key === selectedKey ? 'is-selected' : '';
    return `<tr class="${selectedClass}"><td>${rowGift.name}(${rowGift.price})</td><td>${integer(count)} 個</td><td>${integer(count * rowGift.price)} コイン(${rowCurrencyLabel})</td></tr>`;
  }).join('');
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
