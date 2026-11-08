// Общая логика орфографии: окно заметок и всплывающие подсказки в других программах.
// Подключается как обычный <script src="spellcore.js"> до основного скрипта страницы.

const WORD = /[A-Za-zА-Яа-яЁё]+(?:['’-][A-Za-zА-Яа-яЁё]+)*/g;

// Слова, которых нет в словаре Windows, но они настоящие. Дополняется кнопкой «В словарь» и сам — частыми словами.
const SLANG = new Set(`пкм лкм скм лаг лаги лагает лагать лагают лагов залагало фриз фризы фризит баг баги багов багует фича фичи
  норм нормас ок окей кринж кринжово рофл рофлить изи хз имхо кст пж плз пжлст спс пасиб комп компа компе компом инет инета инете мб
  ваще щас чё чо типа прога проги прогу юзать юзаю юзер юзеры стрим стримы стример донат донатить скин скины геймплей катка катку тиммейт
  тиммейты нуб нубы читер читеры читы апдейт апдейты апгрейд гайд гайды лайк лайки лайкнуть репост коммент комменты коммит коммиты пуш
  ютуб ютубе ютуба тикток тг телега телеге дискорд дискорде дс вк ноут ноута ноуте смарт проц проца видюха видюху видюхи оперативка
  оперативку оперативки ссд пк ии нейросеть нейросети нейронка нейронки чатгпт гпт фпс пинг дедлайн дедлайны созвон созвониться таска
  таски таску бэкенд фронтенд девопс скрин скрины скриншот скриншоты линк линки файлик приколы прикол
  lol omg btw imo imho idk ok okay pls plz thx gg wp afk brb lmao fps ui ux api app apps repo dev devs npm json html css js gpu cpu ram ssd hdd usb`
  .split(/\s+/).filter(Boolean));

// расстояние между словами (с перестановкой соседних букв — самая частая опечатка вслепую)
function dist(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}
console.assert(dist('првиет', 'привет') === 1 && dist('зметка', 'заметка') === 1 && dist('кот', 'кот') === 0 && dist('abc', 'xyz') === 3, 'dist');
console.assert('Привет, мир! well-known'.match(WORD).join('|') === 'Привет|мир|well-known', 'WORD');

function makeSpell(api) {
  let words = { freq: {}, dict: [] }, dict = new Set();
  const verdict = new Map();   // слово → true (ошибка) / false (верно), чтобы не спрашивать Windows дважды
  const sugCache = new Map();  // слово → варианты от Windows
  const freq = w => words.freq[w.toLowerCase()] || 0;
  const skip = w => w.length < 2 || (w.length <= 5 && w === w.toUpperCase()); // ПК, USB, ОК
  const known = w => { const l = w.toLowerCase(); return SLANG.has(l) || dict.has(l) || freq(l) >= 5; };

  return {
    freq, skip, known,
    isBad: w => !skip(w) && !known(w) && verdict.get(w) === true,
    async loadWords() {
      const w = await api.invoke('words-get');
      words = w && w.freq ? w : { freq: {}, dict: [] };
      dict = new Set(words.dict);
    },
    // спросить Windows про слова, о которых ещё не спрашивали
    async check(list) {
      const ask = [...new Set(list)].filter(w => !skip(w) && !known(w) && !verdict.has(w));
      if (!ask.length) return;
      const bad = new Set(await api.invoke('spell-check', ask) || []);
      ask.forEach(w => verdict.set(w, bad.has(w)));
    },
    // d = { слово: на сколько изменить частоту }
    bump(d) {
      if (!Object.keys(d).length) return;
      api.send('words-learn', d);
      for (const [w, n] of Object.entries(d)) words.freq[w] = Math.max(0, (words.freq[w] || 0) + n);
    },
    addWord(w) { const l = w.toLowerCase(); dict.add(l); api.send('words-add', l); },
    ignore(w) { verdict.set(w, false); }, // «Пропустить» — до перезапуска
    // варианты: сначала слова, которые ты часто пишешь (по частоте), потом варианты Windows; регистр как у исходного слова
    async suggestions(word) {
      if (!sugCache.has(word)) sugCache.set(word, await api.invoke('spell-suggest', word) || []);
      const low = word.toLowerCase(), max = low.length > 4 ? 2 : 1;
      const mine = Object.entries(words.freq)
        .filter(([w, c]) => c >= 2 && w !== low && Math.abs(w.length - low.length) <= max && verdict.get(w) !== true && dist(w, low) <= max)
        .sort((a, b) => b[1] - a[1]).map(([w]) => w);
      const seen = new Set(), out = [];
      for (const s of [...mine, ...sugCache.get(word)]) {
        const k = s.toLowerCase();
        if (!seen.has(k) && k !== low) { seen.add(k); out.push(s); }
      }
      const cased = s => word === word.toUpperCase() ? s.toUpperCase()
        : word[0] === word[0].toUpperCase() ? s[0].toUpperCase() + s.slice(1) : s;
      return out.slice(0, 5).map(cased);
    },
  };
}
