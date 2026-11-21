(function () {
  const endpoint = 'https://d5d6pof8q0gpe24mebt8.l5v6loqa.apigw.yandexcloud.net';
  const storageKey = 'holdom-calendar-key';
  const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const form = $('#calendar-connect');
  const keyField = $('#calendar-key');
  const disconnect = $('#calendar-disconnect');
  const settingsButton = $('#calendar-settings-button');
  const settings = $('#calendar-settings');
  const peoplePanel = $('#calendar-people');
  const peopleForm = $('#people-search');
  const peopleQuery = $('#people-query');
  const peopleStatus = $('#people-status');
  const peopleResults = $('#people-results');
  const status = $('#calendar-status');
  const boardStatus = $('#calendar-board-status');
  const feed = $('#calendar-feed');
  const showPastControl = $('#show-past-days');
  const showPastStorageKey = 'holdom-show-past-days';
  const dashboard = $('.dashboard');
  const gridSpace = $('#calendar-grid-space');
  const monthGrid = $('#calendar-grid');
  const calendarWeekdays = $('#calendar-weekdays');
  const agenda = $('#calendar-agenda');
  const events = $('#calendar-events');
  const agendaClose = $('#calendar-day-close');
  const nearest = $('#calendar-nearest');
  const nearestItems = $('#nearest-items');
  const filterBar = $('#calendar-people-filter');
  const filterChips = $('#filter-chips');
  const joAdd = $('#jo-add');
  const joForm = $('#jo-form');
  const joDialog = $('#jo-dialog');
  const joVoice = $('#jo-voice');
  const joWake = $('#jo-wake');
  const joCloud = $('#jo-cloud');
  const joChatMessages = $('#jo-chat-messages');
  const joChatStatus = $('#jo-chat-status');
  const joManual = $('#jo-manual');
  const joNote = $('#jo-note');
  const noteDialog = $('#note-dialog');
  const noteText = $('#note-text');
  const noteStatus = $('#note-status');
  const noteList = $('#note-list');
  const notesStorageKey = 'holdom-notes';
  const joReview = $('#jo-review');
  const joDiscard = $('#jo-discard');
  const joConnect = $('#jo-connect');
  const joVoiceAction = $('#jo-voice-action');
  const voiceServerForm = $('#voice-server-form');
  const voiceServerAddress = $('#voice-server-address');
  const voiceServerCode = $('#voice-server-code');
  const voiceServerStatus = $('#voice-server-status');
  const voiceSettingsKey = 'holdom-voice-function';
  const defaultVoiceAddress = 'https://functions.yandexcloud.net/d4evm4v4igcuimuril8h';
  const joListening = $('#jo-listening');
  const joTitle = $('#jo-title');
  const joDate = $('#jo-date');
  const joTime = $('#jo-time');
  const joSave = $('#jo-save');
  const joStatus = $('#jo-status');
  const joResult = $('#jo-result');
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let selected = new Date();
  let firstMonth = monthIndex(selected);
  let lastMonth = firstMonth + 2;
  let showPast = false;
  let lastToday = dayKey(selected);
  let state = null;
  let hiddenPeople = [];
  let key = '';
  let request = null;
  let peopleRequest = null;
  let foundPeople = [];
  let draftId = '';
  let saveRequest = null;
  let recognition = null;
  let wakeEnabled = false;
  let wakeRecognition = null;
  let wakeTimer = 0;
  let wakeSpeech = null;
  let awaitingCommandUntil = 0;
  let voiceConfirm = false;
  let voiceSettings = null;
  let voiceReadFailed = false;
  let cloudVoice = null;
  let chatHistory = [];
  let chatStarted = false;
  let cloudDraft = null;
  let reviewingCloudDraft = false;
  let expandingFeed = false;
  let calendarNavigated = false;

  try { key = localStorage.getItem(storageKey) || ''; } catch (_) {}
  try {
    const savedVoice = JSON.parse(localStorage.getItem(voiceSettingsKey) || 'null');
    if (savedVoice) voiceSettings = readVoiceSettings(savedVoice.address, savedVoice.code);
  } catch (_) { voiceReadFailed = true; }
  try { showPast = localStorage.getItem(showPastStorageKey) === '1'; } catch (_) {}
  if (showPast) firstMonth -= 2;
  showPastControl.checked = showPast;

  function dayKey(date) {
    return date.getFullYear() + '-' + ('0' + (date.getMonth() + 1)).slice(-2)
      + '-' + ('0' + date.getDate()).slice(-2);
  }

  function monthIndex(date) {
    return date.getFullYear() * 12 + date.getMonth();
  }

  function fitMonth() {
    const anchor = firstVisibleMonth();
    const fraction = anchor && anchor.offsetHeight ? (feed.scrollTop - anchor.offsetTop) / anchor.offsetHeight : 0;
    if (!window.matchMedia('(min-width: 700px) and (orientation: landscape)').matches) {
      dashboard.style.height = '';
      monthGrid.style.maxWidth = '';
      feed.style.height = '';
    } else {
      dashboard.style.height = window.innerHeight + 'px';
      const feedHeight = Math.max(0, gridSpace.clientHeight - calendarWeekdays.offsetHeight);
      const cellSize = Math.min(Math.floor(gridSpace.clientWidth / 7), Math.max(26, Math.floor((feedHeight - 42) / 6)));
      monthGrid.style.maxWidth = cellSize > 0 ? (cellSize * 7) + 'px' : '';
      feed.style.height = feedHeight > 0 ? feedHeight + 'px' : '';
    }
    if (anchor) feed.scrollTop = anchor.offsetTop + Math.round(fraction * anchor.offsetHeight);
  }

  function entriesFor(day, people) {
    if (!state) return [];
    return state.entries.filter(function (entry) {
      return entry.from <= day && (entry.to || entry.from) >= day && visibleEntryPeople(entry, day, people).length;
    });
  }

  function entryPeople(entry, day, people) {
    const ids = Array.isArray(entry.who) && entry.who.length ? entry.who : [entry.by];
    return ids.filter(function (id) {
      const personalDays = entry.days && entry.days[id];
      return people[id] && (!Array.isArray(personalDays) || personalDays.indexOf(day) !== -1);
    }).map(function (id) { return people[id]; });
  }

  function visibleEntryPeople(entry, day, people) {
    const participants = entryPeople(entry, day, people);
    const helper = entry.req && entry.req.st === 'yes' && people[entry.req.to];
    if (helper && !participants.some(function (person) { return person.id === helper.id; })) participants.push(helper);
    return participants;
  }

  function filterStorageKey(account) {
    return 'holdom-hidden-people:' + account.id;
  }

  function loadPeopleFilter(account) {
    filterChips.scrollLeft = 0;
    hiddenPeople = [];
    try {
      const saved = JSON.parse(localStorage.getItem(filterStorageKey(account)) || '[]');
      if (Array.isArray(saved)) hiddenPeople = saved;
    } catch (_) {}
  }

  function availablePeople() {
    if (!state) return [];
    const friends = state.links && state.links.friends || [];
    return state.people.filter(function (person) {
      return person.id === state.me.id || friends.indexOf(person.id) !== -1;
    }).sort(function (a, b) {
      if (a.id === b.id) return 0;
      if (a.id === state.me.id) return -1;
      if (b.id === state.me.id) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  function renderPeopleFilter(people) {
    filterBar.classList.toggle('hidden', !people.length);
    const scrollLeft = filterChips.scrollLeft;
    filterChips.textContent = '';
    people.forEach(function (person) {
      const button = document.createElement('button');
      const dot = document.createElement('span');
      const name = document.createElement('span');
      button.type = 'button';
      button.className = 'filter-chip';
      button.title = person.name;
      button.setAttribute('aria-pressed', String(hiddenPeople.indexOf(person.id) === -1));
      dot.className = 'filter-dot';
      dot.style.backgroundColor = personColor(person);
      dot.style.borderColor = personColor(person);
      dot.setAttribute('aria-hidden', 'true');
      name.className = 'filter-name';
      name.textContent = person.name;
      button.appendChild(dot);
      button.appendChild(name);
      button.onclick = function () {
        const index = hiddenPeople.indexOf(person.id);
        if (index === -1) hiddenPeople.push(person.id);
        else hiddenPeople.splice(index, 1);
        try { localStorage.setItem(filterStorageKey(state.me), JSON.stringify(hiddenPeople)); } catch (_) {}
        render();
      };
      filterChips.appendChild(button);
    });
    filterChips.scrollLeft = scrollLeft;
  }

  function personColor(person) {
    return person && /^#[a-f0-9]{6}$/i.test(person.color) ? person.color : '#8bac7b';
  }

  function calendarPatterns(people) {
    const patterns = Object.create(null);
    const colors = Object.create(null);
    people.forEach(function (person) {
      const color = personColor(person).toLowerCase();
      if (!colors[color]) colors[color] = [];
      colors[color].push(person);
      if (person.pat >= 1 && person.pat <= 4) patterns[person.id] = person.pat;
    });
    Object.keys(colors).forEach(function (color) {
      const group = colors[color];
      const used = [false, false, false, false, false];
      group.forEach(function (person) { if (patterns[person.id]) used[patterns[person.id]] = true; });
      group.forEach(function (person) {
        if (patterns[person.id]) return;
        const available = used.indexOf(false);
        const pattern = available === -1 ? 4 : available;
        used[pattern] = true;
        patterns[person.id] = pattern;
      });
    });
    return patterns;
  }

  function calendarDayBands(day, orderedPeople, people) {
    const occupied = Object.create(null);
    entriesFor(day, people).forEach(function (entry) {
      entryPeople(entry, day, people).forEach(function (person) {
        if (!occupied[person.id]) occupied[person.id] = entry.id;
      });
      const helper = entry.req && entry.req.st === 'yes' && people[entry.req.to];
      if (helper && !occupied[helper.id]) occupied[helper.id] = entry.id + '~helper';
    });
    const groups = [];
    orderedPeople.forEach(function (person) {
      const id = occupied[person.id];
      if (!id) return;
      let group = groups.find(function (item) { return item.entry === id; });
      if (!group) {
        group = { entry: id, people: [] };
        groups.push(group);
      }
      group.people.push(person);
    });
    const count = Object.keys(occupied).length;
    if (!count) return [];
    const gap = groups.length > 1 ? Math.min(4, 20 / (groups.length - 1)) : 0;
    const height = (100 - gap * (groups.length - 1)) / count;
    const bands = [];
    let top = 0;
    groups.forEach(function (group) {
      group.people.forEach(function (person, index) {
        bands.push({ person: person, entry: group.entry, top: top, bottom: top + height,
          first: index === 0, last: index === group.people.length - 1 });
        top += height;
      });
      top += gap;
    });
    return bands;
  }

  function createBand(band, patterns, past) {
    const element = document.createElement('i');
    const pattern = patterns[band.person.id];
    if (pattern) element.className = 'pattern-' + pattern;
    const color = parseInt(personColor(band.person).slice(1), 16);
    const mix = function (channel) { return past ? Math.round(channel * .45 + 12) : channel; };
    element.style.backgroundColor = 'rgb(' + mix(color >> 16) + ',' + mix((color >> 8) & 255) + ',' + mix(color & 255) + ')';
    return element;
  }

  function renderBands(button, square, current, following, patterns, past) {
    if (!current.length) return;
    button.classList.add('calendar-filled');
    const layer = document.createElement('span');
    const bridges = document.createElement('span');
    layer.className = 'calendar-bands';
    bridges.className = 'calendar-bridges';
    layer.setAttribute('aria-hidden', 'true');
    bridges.setAttribute('aria-hidden', 'true');
    current.forEach(function (band) {
      const color = createBand(band, patterns, past);
      color.style.top = band.top + '%';
      color.style.height = (band.bottom - band.top) + '%';
      if (band.first) color.classList.add('band-first');
      if (band.last) color.classList.add('band-last');
      layer.appendChild(color);
      const continued = following.find(function (next) {
        return next.person.id === band.person.id && next.entry === band.entry;
      });
      if (!continued) return;
      const top = Math.max(continued.top, band.top);
      const bottom = Math.min(continued.bottom, band.bottom);
      if (bottom - top <= 5) return;
      const bridge = createBand(band, patterns, past);
      bridge.style.top = top + '%';
      bridge.style.height = (bottom - top) + '%';
      bridges.appendChild(bridge);
    });
    if (bridges.firstChild) square.appendChild(bridges);
    button.appendChild(layer);
  }

  function nextVisibleDay(entry, earliest, people) {
    if (visibleEntryPeople(entry, earliest, people).length) return earliest;
    let first = '';
    Object.keys(entry.days || {}).forEach(function (id) {
      if (!people[id] || (entry.who || []).indexOf(id) === -1 || !Array.isArray(entry.days[id])) return;
      entry.days[id].forEach(function (day) {
        if (day >= earliest && day <= (entry.to || entry.from) && (!first || day < first)) first = day;
      });
    });
    return first;
  }

  function renderNearest(people) {
    nearest.classList.toggle('hidden', !state);
    nearestItems.textContent = '';
    if (!state) return;
    const now = new Date();
    const today = dayKey(now);
    const localTime = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
    const upcoming = [];
    state.entries.forEach(function (entry) {
      const end = entry.to || entry.from;
      if (!entry.from || end < today) return;
      let start = entry.from < today ? today : entry.from;
      if (start === today && entry.tf && (entry.tt || entry.tf) < localTime) {
        if (end === today) return;
        start = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
      }
      const day = nextVisibleDay(entry, start, people);
      if (day) upcoming.push({ entry: entry, day: day, order: day + 'T' + (entry.tf || '24:00') });
    });
    upcoming.sort(function (a, b) { return a.order.localeCompare(b.order); }).slice(0, 3).forEach(function (item) {
      const row = document.createElement('li');
      const title = document.createElement('strong');
      const meta = document.createElement('small');
      const date = item.day.split('-');
      const details = [item.day === today ? 'Сегодня' : (+date[2] + ' ' + months[+date[1] - 1])];
      if (item.entry.tf) details.push(item.entry.tf + (item.entry.tt ? '–' + item.entry.tt : ''));
      const names = visibleEntryPeople(item.entry, item.day, people).map(function (person) { return person.name; });
      if (names.length) details.push(names.join(', '));
      title.textContent = item.entry.what;
      title.title = item.entry.what;
      meta.textContent = details.join(' · ');
      meta.title = meta.textContent;
      row.appendChild(title);
      row.appendChild(meta);
      nearestItems.appendChild(row);
    });
    if (!upcoming.length) {
      const empty = document.createElement('li');
      empty.textContent = Object.keys(people).length ? 'Предстоящих дел нет.' : 'Выберите, чьи дела показывать.';
      nearestItems.appendChild(empty);
    }
  }

  function monthLabel(index) {
    return monthNames[index % 12] + ' ' + Math.floor(index / 12);
  }

  function renderMonthBlock(month, today, activeDay, orderedPeople, people, patterns) {
    const year = Math.floor(month / 12);
    const index = month % 12;
    const length = new Date(year, index + 1, 0).getDate();
    const offset = (new Date(year, index, 1).getDay() + 6) % 7;
    const bandsByDay = [];
    const block = document.createElement('section');
    const title = document.createElement('h4');
    const days = document.createElement('div');
    block.className = 'calendar-month-block';
    block.setAttribute('data-month', String(month));
    title.className = 'calendar-month-label';
    title.textContent = monthLabel(month);
    days.className = 'calendar-days';
    block.appendChild(title);
    block.appendChild(days);
    for (let day = 1; day <= length; day++) {
      bandsByDay[day] = calendarDayBands(dayKey(new Date(year, index, day)), orderedPeople, people);
    }
    const cellCount = Math.ceil((offset + length) / 7) * 7;
    for (let cell = 0; cell < cellCount; cell++) {
      const day = cell - offset + 1;
      const date = new Date(year, index, day);
      const square = document.createElement('div');
      square.className = 'calendar-cell';
      days.appendChild(square);
      if (day < 1 || day > length) {
        square.setAttribute('aria-hidden', 'true');
        const ghost = document.createElement('span');
        ghost.className = 'calendar-day calendar-ghost';
        const number = document.createElement('span');
        number.className = 'calendar-number';
        number.textContent = date.getDate();
        ghost.appendChild(number);
        square.appendChild(ghost);
        continue;
      }
      const iso = dayKey(date);
      const count = entriesFor(iso, people).length;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'calendar-day';
      button.setAttribute('data-date', iso);
      if (iso === today) button.classList.add('calendar-today');
      if (iso < today) button.classList.add('calendar-past');
      if (cell % 7 === 6) button.classList.add('calendar-sunday');
      button.setAttribute('aria-label', iso + (count ? ', событий: ' + count : ''));
      button.setAttribute('aria-pressed', String(iso === activeDay));
      button.setAttribute('aria-haspopup', 'dialog');
      const following = cell % 7 < 6 && day < length ? bandsByDay[day + 1] : [];
      renderBands(button, square, bandsByDay[day], following, patterns, iso < today);
      const number = document.createElement('span');
      number.className = 'calendar-number';
      number.textContent = day;
      button.appendChild(number);
      button.onclick = function () {
        calendarNavigated = true;
        selected = date;
        agenda.classList.remove('hidden');
        render();
        agendaClose.focus();
      };
      square.appendChild(button);
    }
    return block;
  }

  function firstVisibleMonth() {
    const months = feed.querySelectorAll('[data-month]');
    let visible = months[0];
    for (let index = 0; index < months.length; index++) {
      if (months[index].offsetTop > feed.scrollTop + 1) break;
      visible = months[index];
    }
    return visible;
  }

  function goToToday() {
    calendarNavigated = false;
    selected = new Date();
    render(monthIndex(selected));
  }

  function render(revealMonth) {
    const anchor = firstVisibleMonth();
    const anchorMonth = anchor ? Number(anchor.getAttribute('data-month')) : monthIndex(new Date());
    const scrollOffset = anchor ? feed.scrollTop - anchor.offsetTop : 0;
    const currentMonth = monthIndex(new Date());
    if (!showPast) firstMonth = currentMonth;
    lastMonth = Math.max(lastMonth, currentMonth + 2);
    const activeDay = dayKey(selected);
    const today = dayKey(new Date());
    const everyone = availablePeople();
    const orderedPeople = everyone.filter(function (person) { return hiddenPeople.indexOf(person.id) === -1; });
    const people = Object.create(null);
    orderedPeople.forEach(function (person) { people[person.id] = person; });
    const patterns = calendarPatterns(everyone);
    renderPeopleFilter(everyone);
    renderNearest(people);
    const contents = document.createDocumentFragment();
    for (let index = firstMonth; index <= lastMonth; index++) {
      contents.appendChild(renderMonthBlock(index, today, activeDay, orderedPeople, people, patterns));
    }
    feed.textContent = '';
    feed.appendChild(contents);
    renderAgenda(people, activeDay);
    fitMonth();
    const target = typeof revealMonth === 'number' ? revealMonth : anchorMonth;
    const block = feed.querySelector('[data-month="' + target + '"]');
    if (block) feed.scrollTop = block.offsetTop + (typeof revealMonth === 'number' ? 0 : scrollOffset);
  }

  function renderAgenda(people, activeDay) {
    if (agenda.classList.contains('hidden')) return;
    $('#calendar-day-title').textContent = selected.getDate() + ' ' + months[selected.getMonth()];
    events.textContent = '';
    if (!state) {
      events.textContent = 'Подключите «Кто когда» в настройках, чтобы посмотреть дела.';
      return;
    }
    const items = entriesFor(activeDay, people).sort(function (a, b) {
      return (a.tf || '').localeCompare(b.tf || '');
    });
    if (!items.length) {
      events.textContent = 'На этот день дел нет.';
      return;
    }
    items.forEach(function (entry) {
      const owner = people[entry.by];
      const participants = visibleEntryPeople(entry, activeDay, people);
      const row = document.createElement('article');
      row.className = 'event';
      const time = document.createElement('div');
      time.className = 'event-time';
      time.textContent = entry.tf ? entry.tf + (entry.tt ? '–' + entry.tt : '') : 'Весь день';
      const info = document.createElement('div');
      info.className = 'event-info';
      info.style.borderColor = personColor(participants[0] || owner);
      const title = document.createElement('strong');
      title.textContent = entry.what;
      title.title = entry.what;
      info.appendChild(title);
      if (participants.length || owner) {
        const name = document.createElement('span');
        name.textContent = participants.length
          ? participants.map(function (person) { return person.name; }).join(', ')
          : owner.name;
        name.title = name.textContent;
        info.appendChild(name);
      }
      row.appendChild(time);
      row.appendChild(info);
      events.appendChild(row);
    });
  }

  function showConnection(message, connected) {
    form.classList.toggle('hidden', !!key);
    disconnect.classList.toggle('hidden', !key);
    peoplePanel.classList.toggle('hidden', !state);
    status.textContent = message;
    boardStatus.textContent = connected ? '' : (message || (!key ? 'Подключите календарь в настройках.' : ''));
    syncCloudVoiceButton();
    fitMonth();
  }

  function forgetCalendar() {
    if (request) request.abort();
    request = null;
    key = '';
    state = null;
    setWakeEnabled(false);
    if (saveRequest) {
      const pendingSave = saveRequest;
      saveRequest = null;
      pendingSave.abort();
    }
    resetJo();
    if (peopleRequest) {
      const pendingPeopleRequest = peopleRequest;
      peopleRequest = null;
      pendingPeopleRequest.abort();
    }
    foundPeople = [];
    cloudDraft = null;
    syncCloudVoiceButton();
    peoplePanel.classList.add('hidden');
    peopleQuery.value = '';
    peopleStatus.textContent = '';
    peopleResults.textContent = '';
    peopleForm.querySelector('button').disabled = false;
    keyField.value = '';
    try { localStorage.removeItem(storageKey); } catch (_) {}
    render();
  }

  function setJoOpen(open) {
    joDialog.classList.toggle('hidden', !open);
    if (open) stopWakeRecognition();
    else {
      stopCloudVoice('');
      reviewingCloudDraft = false;
      voiceConfirm = false;
      scheduleWake();
    }
    if (!open && recognition) {
      const active = recognition;
      recognition = null;
      active.abort();
      joVoice.disabled = !SpeechRecognition;
      joStatus.textContent = '';
    }
  }

  function readVoiceSettings(address, code) {
    if (typeof address !== 'string' || typeof code !== 'string' || !/^[a-f0-9]{64}$/i.test(code)) return null;
    try {
      const url = new URL(address);
      if (url.protocol === 'https:' && url.host === 'functions.yandexcloud.net' &&
          /^\/[a-z0-9]{20}$/.test(url.pathname) &&
          !url.username && !url.password && !url.search && !url.hash) return { address: url.href, code: code.toLowerCase() };
    } catch (_) {}
    return null;
  }

  function showVoiceSettings() {
    syncCloudVoiceButton();
    voiceServerAddress.value = voiceSettings ? voiceSettings.address : defaultVoiceAddress;
    voiceServerCode.value = '';
    voiceServerCode.placeholder = voiceSettings ? 'Код уже сохранён' : '';
    if (voiceSettings) setVoiceStatus('Код сохранён на этом планшете.', 'is-saved');
    else if (voiceReadFailed) setVoiceStatus('Не удалось прочитать код из хранилища браузера.', 'is-error');
    else setVoiceStatus('Код ещё не сохранён.');
  }

  function syncCloudVoiceButton() {
    joCloud.classList.toggle('hidden', !voiceSettings || !chatStarted);
    joCloud.disabled = !window.HoldomVoiceTurn || !window.HoldomVoiceTurn.supported();
    joConnect.classList.toggle('hidden', !!voiceSettings || !chatStarted);
    joManual.classList.toggle('hidden', !!cloudDraft);
    joNote.classList.toggle('hidden', !!cloudDraft);
    joReview.classList.toggle('hidden', !cloudDraft);
    joDiscard.classList.toggle('hidden', !cloudDraft);
    joVoiceAction.classList.toggle('hidden', !reviewingCloudDraft || !voiceSettings);
  }

  function setVoiceStatus(message, stateClass) {
    voiceServerStatus.textContent = message;
    voiceServerStatus.classList.toggle('is-saved', stateClass === 'is-saved');
    voiceServerStatus.classList.toggle('is-error', stateClass === 'is-error');
  }

  function stopCloudVoice(message) {
    if (cloudVoice) cloudVoice.stop(message);
  }

  function addChatMessage(role, value) {
    const text = typeof value === 'string' ? value.trim().slice(0, 280) : '';
    if (!text) return;
    chatHistory.push({ role: role, text: text });
    chatHistory = chatHistory.slice(-8);
    const message = document.createElement('p');
    message.className = 'jo-chat-message' + (role === 'user' ? ' is-user' : '');
    const sender = document.createElement('span');
    sender.className = 'jo-chat-sender';
    sender.textContent = role === 'user' ? 'Вы' : 'Джованни';
    message.appendChild(sender);
    message.appendChild(document.createTextNode(text));
    joChatMessages.appendChild(message);
    if (joChatMessages.childNodes.length > 8) joChatMessages.removeChild(joChatMessages.firstChild);
    joChatMessages.classList.remove('hidden');
    joChatMessages.scrollTop = joChatMessages.scrollHeight;
  }

  function openJoDraft(draft) {
    if (!draft && !state) { setSettingsOpen(true); return; }
    setJoOpen(true);
    reviewingCloudDraft = !!draft;
    joVoice.classList.toggle('hidden', !!voiceSettings);
    joWake.classList.toggle('hidden', !!voiceSettings);
    $('#jo-calendar-required').classList.toggle('hidden', !!state);
    joSave.disabled = !state || !!saveRequest;
    joStatus.textContent = draft ? 'Проверьте дело, дату и время.' : '';
    if (draft) {
      joTitle.value = draft.title;
      joDate.value = draft.day;
      joTime.value = draft.time;
    } else if (!joDate.value) joDate.value = dayKey(new Date());
    syncCloudVoiceButton();
    joTitle.focus();
  }

  function discardCloudDraft() {
    cloudDraft = null;
    if (reviewingCloudDraft) resetJo();
    syncCloudVoiceButton();
    joChatStatus.textContent = 'Черновик отменён.';
  }

  function loadNotes() {
    const items = JSON.parse(localStorage.getItem(notesStorageKey) || '[]');
    return Array.isArray(items) ? items.filter(function (item) { return typeof item === 'string'; }) : [];
  }

  function renderNotes(items) {
    noteList.textContent = '';
    items.forEach(function (text) {
      const row = document.createElement('li');
      row.textContent = text;
      noteList.appendChild(row);
    });
  }

  function openNote(text) {
    if (reviewingCloudDraft) setJoOpen(false);
    noteStatus.textContent = '';
    try { renderNotes(loadNotes()); }
    catch (_) { noteStatus.textContent = 'Браузер не смог прочитать заметки.'; }
    if (text) noteText.value = text.slice(0, 600);
    noteDialog.classList.remove('hidden');
    noteText.focus();
  }

  function voiceStatus(message) {
    joChatStatus.textContent = message;
    if (reviewingCloudDraft) joStatus.textContent = message;
  }

  function voiceEvent(event) {
    if (event.type === 'closed') {
      cloudVoice = null;
      syncCloudVoiceButton();
      joCloud.textContent = 'Задать вопрос';
      joVoiceAction.textContent = 'Сказать команду';
      joAdd.classList.remove('is-listening');
      joAdd.classList.remove('is-working');
      joVoice.disabled = !SpeechRecognition;
      joWake.disabled = !SpeechRecognition;
      if (event.text !== undefined) voiceStatus(event.text);
    } else if (event.type === 'recording') {
      joAdd.classList.add('is-listening');
      voiceStatus('Джованни слушает…');
    } else if (event.type === 'waiting') {
      joAdd.classList.remove('is-listening');
      voiceStatus('Джованни готовит ответ…');
    } else if (event.type === 'transcript') {
      addChatMessage('user', event.text);
    } else if (event.type === 'answer') {
      addChatMessage('assistant', event.text);
    } else if (event.type === 'draft' && typeof event.title === 'string' &&
        typeof event.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(event.day) &&
        typeof event.time === 'string' && /^(?:(?:[01]\d|2[0-3]):[0-5]\d)?$/.test(event.time)) {
      cloudDraft = { title: event.title.slice(0, 60), day: event.day, time: event.time };
      addChatMessage('assistant', 'Черновик: ' + cloudDraft.title + ' · ' + cloudDraft.day + (cloudDraft.time ? ' · ' + cloudDraft.time : ''));
      syncCloudVoiceButton();
    } else if (event.type === 'action') {
      if (event.name === 'new_note') {
        const text = typeof event.transcript === 'string'
          ? event.transcript.replace(/[«»"']/g, '').replace(/^(?:джованни[, ]+)?(?:нажми(?: кнопку)? +)?(?:сделай|сделать|создай|запиши) заметку[\s:,.!?–—-]*/i, '')
          : '';
        openNote(text.trim());
      }
      if (event.name === 'new_event') openJoDraft(null);
      if (event.name === 'review_draft' && cloudDraft) openJoDraft(cloudDraft);
      if (event.name === 'discard_draft' && cloudDraft) discardCloudDraft();
      if (event.name === 'save_draft' && reviewingCloudDraft && cloudDraft && typeof event.transcript === 'string' &&
          /^(?:джованни[, ]+)?(?:нажми(?: кнопку)? +)?(?:да[, ]+)?сохрани(?:ть)? (?:это )?дело[.!?]*$/i.test(event.transcript.replace(/[«»"']/g, '').trim())) {
        saveJoEvent({ preventDefault: function () {} });
      }
    }
  }

  function startCloudVoice() {
    if (!voiceSettings || cloudVoice || joCloud.disabled) return;
    setWakeEnabled(false);
    if (recognition) {
      const active = recognition;
      recognition = null;
      active.abort();
    }
    try {
      cloudVoice = window.HoldomVoiceTurn.start(voiceSettings.address, voiceSettings.code, voiceEvent, chatHistory,
        cloudDraft ? { draft: true, reviewing: reviewingCloudDraft } : null);
      joAdd.classList.add('is-working');
      joCloud.textContent = 'Остановить';
      joVoiceAction.textContent = 'Остановить';
      joVoice.disabled = true;
      joWake.disabled = true;
      voiceStatus('Подключаю микрофон…');
    } catch (_) {
      voiceStatus('Не удалось включить микрофон.');
    }
  }

  function setSettingsOpen(open) {
    settings.classList.toggle('hidden', !open);
    settingsButton.setAttribute('aria-expanded', String(open));
    if (open) {
      showVoiceSettings();
      if (state) renderPeopleResults();
    }
    (open ? $('#calendar-settings-close') : settingsButton).focus();
  }

  function resetJo() {
    setJoOpen(false);
    joForm.reset();
    joSave.disabled = false;
    joResult.textContent = '';
    joStatus.textContent = '';
    draftId = '';
  }

  function stopWakeRecognition() {
    clearTimeout(wakeTimer);
    wakeTimer = 0;
    joAdd.classList.remove('is-listening');
    if (!wakeRecognition) return;
    const listener = wakeRecognition;
    wakeRecognition = null;
    listener.abort();
  }

  function stopWakeSpeech() {
    if (!wakeSpeech) return;
    clearTimeout(wakeSpeech.timer);
    wakeSpeech = null;
    window.speechSynthesis.cancel();
  }

  function setWakeEnabled(enabled, message) {
    wakeEnabled = enabled;
    joWake.setAttribute('aria-pressed', String(enabled));
    joWake.textContent = enabled ? 'Выключить обращение по имени' : 'Слушать команды для дел';
    joListening.textContent = message || '';
    if (!enabled) {
      awaitingCommandUntil = 0;
      voiceConfirm = false;
      stopWakeRecognition();
      stopWakeSpeech();
    }
  }

  function scheduleWake() {
    clearTimeout(wakeTimer);
    wakeTimer = 0;
    if (wakeEnabled && !document.hidden && !wakeSpeech) wakeTimer = setTimeout(startWake, 1200);
  }

  function sayWake(text) {
    stopWakeRecognition();
    stopWakeSpeech();
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance || document.hidden) {
      scheduleWake();
      return;
    }
    const reply = new window.SpeechSynthesisUtterance(text);
    reply.lang = 'ru-RU';
    const speaking = { timer: 0 };
    wakeSpeech = speaking;
    function finish() {
      if (wakeSpeech !== speaking) return;
      clearTimeout(speaking.timer);
      wakeSpeech = null;
      scheduleWake();
    }
    reply.onend = reply.onerror = finish;
    speaking.timer = setTimeout(function () { stopWakeSpeech(); scheduleWake(); }, 8000);
    try { window.speechSynthesis.speak(reply); } catch (_) { finish(); }
  }

  function handleWakePhrase(transcript) {
    const phrase = transcript.trim().toLowerCase().replace(/ё/g, 'е');
    if (voiceConfirm) {
      const answer = phrase.replace(/[,.!?]/g, '').trim();
      if (/^(да|да запиши|да сохрани|запиши|сохрани)$/.test(answer)) {
        voiceConfirm = false;
        stopWakeRecognition();
        saveJoEvent();
      } else if (/^(нет|отмена|отмени|не надо)$/.test(answer)) {
        resetJo();
        sayWake('Отменила.');
      }
      return;
    }
    const match = /^(джованни|джовани|джовань|джо)(?=$|[\s,.!?])/.exec(phrase);
    if (!match && Date.now() > awaitingCommandUntil) return;
    const command = match ? phrase.slice(match[0].length).replace(/^[\s,.!?]+/, '') : transcript;
    if (!command) {
      awaitingCommandUntil = Date.now() + 12000;
      joListening.textContent = 'Слушаю. Какое дело записать?';
      sayWake('Слушаю. Какое дело записать?');
      return;
    }
    awaitingCommandUntil = 0;
    if (!/^(?:запиши|добавь|создай|запланируй|напомни)(?=$|[\s,.!?])/i.test(command)) return;
    setJoOpen(true);
    joResult.textContent = '';
    voiceDraft(command);
    voiceConfirm = true;
    joStatus.textContent = 'Проверьте дело, дату и время. Скажите «да» или нажмите «Сохранить».';
    const date = joDate.value.split('-');
    const when = joDate.value === dayKey(new Date()) ? 'сегодня' : (+date[2] + ' ' + months[+date[1] - 1]);
    sayWake('Записать «' + joTitle.value + '» ' + when + (joTime.value ? ' в ' + joTime.value : '') + '?');
  }

  function startWake() {
    const formOpen = !joDialog.classList.contains('hidden');
    if (!wakeEnabled || !SpeechRecognition || document.hidden || !state ||
        wakeRecognition || wakeSpeech || recognition || (formOpen && !voiceConfirm)) return;
    const listener = new SpeechRecognition();
    listener.lang = 'ru-RU';
    listener.continuous = true;
    wakeRecognition = listener;
    listener.onstart = function () {
      if (wakeRecognition !== listener) return;
      joAdd.classList.add('is-listening');
      if (!voiceConfirm && Date.now() > awaitingCommandUntil) joListening.textContent = 'Слушаю имя «Джованни»';
    };
    listener.onresult = function (event) {
      for (let index = event.resultIndex; index < event.results.length && wakeRecognition === listener; index++) {
        if (event.results[index].isFinal) handleWakePhrase(event.results[index][0].transcript);
      }
    };
    listener.onerror = function (event) {
      if (wakeRecognition !== listener || event.error === 'no-speech') return;
      setWakeEnabled(false, 'Режим обращения по имени остановлен браузером.');
    };
    listener.onend = function () {
      if (wakeRecognition !== listener) return;
      wakeRecognition = null;
      joAdd.classList.remove('is-listening');
      scheduleWake();
    };
    try {
      listener.start();
    } catch (_) {
      setWakeEnabled(false, 'Браузер не смог включить микрофон.');
    }
  }

  function voiceDraft(transcript) {
    let title = transcript.toLowerCase().replace(/^(?:джо[, ]+)?(?:добавь|запиши|создай|поставь)(?: дело)?[\s,:]+/i, '').trim();
    const date = new Date();
    const dayWords = { сегодня: 0, завтра: 1, послезавтра: 2 };
    title = title.replace(/(^|[\s,])(послезавтра|завтра|сегодня)(?=$|[\s,.!?])/i, function (_, before, word) {
      date.setDate(date.getDate() + dayWords[word]);
      return before;
    });
    let time = '';
    function formatVoiceTime(hour, minutes, partOfDay) {
      if ((partOfDay === 'дня' || partOfDay === 'вечера') && hour < 12) hour += 12;
      if ((partOfDay === 'ночи' || partOfDay === 'утра') && hour === 12) hour = 0;
      return ('0' + hour).slice(-2) + ':' + (minutes || '00');
    }
    title = title.replace(/(^|\s)в\s+([01]?\d|2[0-3])(?:(?:[:. ]([0-5]\d))|\s*(?:часов|часа|час))?(?:\s+(утра|дня|вечера|ночи))?(?=$|[\s,.!?])/i,
      function (_, before, hours, minutes, partOfDay) {
        time = formatVoiceTime(Number(hours), minutes, partOfDay);
        return before;
      });
    if (!time) {
      const hoursByWord = { час: 1, один: 1, два: 2, три: 3, четыре: 4, пять: 5, шесть: 6,
        семь: 7, восемь: 8, девять: 9, десять: 10, одиннадцать: 11, двенадцать: 12 };
      title = title.replace(/(^|\s)в\s+(час|один|два|три|четыре|пять|шесть|семь|восемь|девять|десять|одиннадцать|двенадцать)\s+(утра|дня|вечера|ночи)(?=$|[\s,.!?])/i,
        function (_, before, hourWord, partOfDay) {
          time = formatVoiceTime(hoursByWord[hourWord], '', partOfDay);
          return before;
        });
    }
    title = title.replace(/^[\s,.;!?]+|[\s,.;!?]+$/g, '').replace(/\s{2,}/g, ' ');
    joTitle.value = ((title.charAt(0).toUpperCase() + title.slice(1)) || transcript).slice(0, 60);
    joDate.value = dayKey(date);
    joTime.value = time;
  }

  function startVoice() {
    if (!SpeechRecognition || recognition) return;
    voiceConfirm = false;
    stopWakeRecognition();
    stopWakeSpeech();
    const listener = new SpeechRecognition();
    listener.lang = 'ru-RU';
    recognition = listener;
    joVoice.disabled = true;
    joStatus.textContent = 'Говорите…';
    listener.onresult = function (event) {
      if (recognition !== listener) return;
      voiceDraft(event.results[0][0].transcript);
      joStatus.textContent = 'Проверьте дело, дату и время.';
    };
    listener.onerror = function () {
      if (recognition === listener) joStatus.textContent = 'Диктовка не сработала. Дело можно вписать вручную.';
    };
    listener.onend = function () {
      if (recognition !== listener) return;
      recognition = null;
      joVoice.disabled = false;
      if (joStatus.textContent === 'Говорите…') joStatus.textContent = 'Речь не распознана. Попробуйте снова.';
    };
    try {
      listener.start();
    } catch (_) {
      listener.onerror();
      listener.onend();
    }
  }

  function saveJoEvent(event) {
    if (event) event.preventDefault();
    if (!key || !state || saveRequest) return;
    const what = joTitle.value.trim();
    const date = joDate.value;
    const reviewedDraft = reviewingCloudDraft ? cloudDraft : null;
    if (!what || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      joStatus.textContent = 'Укажите название и дату.';
      return;
    }
    stopCloudVoice('');
    voiceConfirm = false;
    stopWakeRecognition();
    stopWakeSpeech();
    if (!draftId) draftId = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    const xhr = new XMLHttpRequest();
    saveRequest = xhr;
    joSave.disabled = true;
    joStatus.textContent = 'Сохраняю…';
    xhr.open('PUT', endpoint + '/entries/' + draftId, true);
    xhr.timeout = 15000;
    xhr.setRequestHeader('Authorization', 'Bearer ' + key);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onloadend = function () {
      if (saveRequest !== xhr) return;
      saveRequest = null;
      joSave.disabled = false;
      let data;
      try { data = JSON.parse(xhr.responseText); } catch (_) {}
      if (xhr.status !== 200 || !data || !data.entry) {
        joStatus.textContent = data && data.error || 'Сервер не подтвердил сохранение. Можно повторить.';
        if (xhr.status === 401) syncCalendar(key);
        return;
      }
      state.entries = state.entries.filter(function (entry) { return entry.id !== data.entry.id; });
      state.entries.push(data.entry);
      const parts = date.split('-');
      selected = new Date(+parts[0], +parts[1] - 1, +parts[2]);
      const targetMonth = monthIndex(selected);
      if (showPast) firstMonth = Math.min(firstMonth, targetMonth);
      lastMonth = Math.max(lastMonth, targetMonth + 1);
      resetJo();
      if (reviewedDraft && cloudDraft === reviewedDraft) {
        cloudDraft = null;
        syncCloudVoiceButton();
        addChatMessage('assistant', 'Дело сохранено: ' + data.entry.what);
      }
      joResult.textContent = 'Добавлено: ' + data.entry.what;
      if (!event && wakeEnabled) sayWake('Дело добавлено.');
      render(!showPast && date < dayKey(new Date()) ? undefined : targetMonth);
      syncAfterMutation();
    };
    xhr.send(JSON.stringify({ entry: { what: what, from: date, to: date, tf: joTime.value, vis: 'all' } }));
  }

  function syncAfterMutation() {
    if (request) {
      const pendingSync = request;
      request = null;
      pendingSync.abort();
    }
    syncCalendar(key);
  }

  function syncCalendar(candidate) {
    if (!candidate || request) return;
    if (!state) showConnection('Подключаю календарь…');
    const xhr = new XMLHttpRequest();
    request = xhr;
    const submit = form.querySelector('button');
    submit.disabled = true;
    xhr.open('GET', endpoint + '/state', true);
    xhr.timeout = 12000;
    xhr.setRequestHeader('Authorization', 'Bearer ' + candidate);
    xhr.onloadend = function () {
      if (request !== xhr) return;
      request = null;
      submit.disabled = false;
      if (xhr.status === 401) {
        forgetCalendar();
        showConnection('Ключ не подошёл или доступ закрыт.');
        return;
      }
      let data;
      try { data = JSON.parse(xhr.responseText); } catch (_) {}
      if (xhr.status === 200 && data && data.me && data.pending) {
        showConnection('Аккаунт ожидает подтверждения в «Кто когда».');
        return;
      }
      if (xhr.status !== 200 || !data || !data.me || !Array.isArray(data.entries) || !Array.isArray(data.people)) {
        showConnection(state ? 'Связь потеряна. Показано последнее обновление.' : 'Не удалось связаться с «Кто когда».');
        return;
      }
      const newConnection = !key;
      key = candidate;
      if (!state || state.me.id !== data.me.id) loadPeopleFilter(data.me);
      state = data;
      keyField.value = '';
      try { localStorage.setItem(storageKey, key); } catch (_) {}
      showConnection('Подключён аккаунт: ' + state.me.name, true);
      render(calendarNavigated ? undefined : monthIndex(new Date()));
      if (!settings.classList.contains('hidden')) {
        if (newConnection) setSettingsOpen(false);
        else renderPeopleResults();
      }
    };
    xhr.send();
  }

  function renderPeopleResults() {
    peopleResults.textContent = '';
    if (!state) return;
    const links = state.links || {};
    const results = foundPeople.slice();
    (links.incoming || []).forEach(function (id) {
      if (results.some(function (person) { return person.id === id; })) return;
      const person = state.people.find(function (item) { return item.id === id; });
      if (person) results.push(person);
    });
    results.forEach(function (person) {
      const row = document.createElement('li');
      row.className = 'people-result';
      const label = document.createElement('div');
      const nick = document.createElement('small');
      label.textContent = person.name;
      nick.textContent = '@' + person.id;
      label.appendChild(nick);
      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'quiet-button';
      if ((links.friends || []).indexOf(person.id) !== -1) {
        action.disabled = true;
        action.textContent = 'Уже в друзьях';
      } else if ((links.outgoing || []).indexOf(person.id) !== -1) {
        action.disabled = true;
        action.textContent = 'Запрос отправлен';
      } else {
        action.textContent = (links.incoming || []).indexOf(person.id) !== -1 ? 'Принять' : 'Постучаться';
        action.disabled = !!peopleRequest;
        action.onclick = function () { knock(person); };
      }
      row.appendChild(label);
      row.appendChild(action);
      peopleResults.appendChild(row);
    });
  }

  function requestPeople(method, path, onSuccess) {
    if (!key || !state || peopleRequest) return;
    const xhr = new XMLHttpRequest();
    const submit = peopleForm.querySelector('button');
    peopleRequest = xhr;
    submit.disabled = true;
    renderPeopleResults();
    xhr.open(method, endpoint + path, true);
    xhr.timeout = 12000;
    xhr.setRequestHeader('Authorization', 'Bearer ' + key);
    xhr.onloadend = function () {
      if (peopleRequest !== xhr) return;
      peopleRequest = null;
      submit.disabled = false;
      if (xhr.status === 401 || xhr.status === 403) {
        syncCalendar(key);
        peopleStatus.textContent = 'Не удалось подтвердить вход. Обновляю календарь…';
        renderPeopleResults();
        return;
      }
      let data;
      try { data = JSON.parse(xhr.responseText); } catch (_) {}
      if (xhr.status === 200 && data) onSuccess(data);
      else peopleStatus.textContent = data && data.error || 'Не удалось связаться с «Кто когда».';
      renderPeopleResults();
    };
    xhr.send();
  }

  function knock(person) {
    peopleStatus.textContent = 'Отправляю…';
    requestPeople('POST', '/links/' + encodeURIComponent(person.id), function (data) {
      if (data.state !== 'friends' && data.state !== 'outgoing') {
        peopleStatus.textContent = 'Сервер не подтвердил запрос.';
        return;
      }
      const links = state.links || (state.links = {});
      const group = data.state === 'friends' ? 'friends' : 'outgoing';
      links[group] = (links[group] || []).concat(person.id);
      peopleStatus.textContent = group === 'friends'
        ? 'Вы теперь в друзьях: ' + person.name + '.'
        : 'Запрос отправлен: @' + person.id + '.';
      syncAfterMutation();
    });
  }

  function refresh() {
    if (document.hidden) return;
    const now = new Date();
    const today = dayKey(now);
    if (today !== lastToday) {
      if (dayKey(selected) === lastToday) {
        selected = now;
      }
      lastToday = today;
      render();
    }
    syncCalendar(key);
  }

  function closeAgenda() {
    agenda.classList.add('hidden');
    const day = feed.querySelector('[data-date="' + dayKey(selected) + '"]');
    (day || feed).focus();
  }

  $('#calendar-today-button').onclick = function () { goToToday(); setSettingsOpen(false); };
  agendaClose.onclick = closeAgenda;
  agenda.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' || event.keyCode === 27) closeAgenda();
  });

  function markCalendarNavigation() { calendarNavigated = true; }

  feed.addEventListener('pointerdown', markCalendarNavigation);
  feed.addEventListener('wheel', markCalendarNavigation, { passive: true });
  feed.addEventListener('keydown', markCalendarNavigation);
  feed.addEventListener('touchstart', markCalendarNavigation, { passive: true });
  feed.addEventListener('scroll', function () {
    if (expandingFeed || !calendarNavigated || !feed.clientHeight) return;
    const extendPast = showPast && feed.scrollTop <= 48;
    const extendFuture = feed.scrollHeight - feed.clientHeight - feed.scrollTop <= 48;
    if (!extendPast && !extendFuture) return;
    expandingFeed = true;
    requestAnimationFrame(function () {
      expandingFeed = false;
      const past = extendPast && showPast && feed.scrollTop <= 48;
      const future = extendFuture && feed.scrollHeight - feed.clientHeight - feed.scrollTop <= 48;
      if (!past && !future) return;
      if (past) firstMonth -= 2;
      if (future) lastMonth += 2;
      render();
    });
  }, { passive: true });
  showPastControl.addEventListener('change', function () {
    showPast = showPastControl.checked;
    try { localStorage.setItem(showPastStorageKey, showPast ? '1' : '0'); } catch (_) {}
    const now = new Date();
    const current = monthIndex(now);
    firstMonth = current - (showPast ? 2 : 0);
    if (!showPast && monthIndex(selected) < current) selected = now;
    render(current);
  });

  disconnect.onclick = function () {
    forgetCalendar();
    form.querySelector('button').disabled = false;
    showConnection('');
  };
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    const candidate = keyField.value.trim();
    if (/^[A-Za-z0-9_-]{16,64}$/.test(candidate)) syncCalendar(candidate);
    else showConnection('Вставьте ключ входа целиком.');
  });
  peopleForm.addEventListener('submit', function (event) {
    event.preventDefault();
    const query = peopleQuery.value.trim().replace(/^@/, '').toLowerCase();
    if (query.length < 2) {
      peopleStatus.textContent = 'Введите хотя бы две буквы.';
      return;
    }
    foundPeople = [];
    peopleStatus.textContent = 'Ищу…';
    requestPeople('GET', '/search/' + encodeURIComponent(query), function (data) {
      foundPeople = Array.isArray(data.people) ? data.people : [];
      peopleStatus.textContent = foundPeople.length ? '' : 'Никого не нашёл.';
    });
  });
  joVoice.disabled = !SpeechRecognition;
  joWake.disabled = !SpeechRecognition;
  showVoiceSettings();
  voiceServerForm.addEventListener('submit', function (event) {
    event.preventDefault();
    const address = voiceServerAddress.value.trim();
    const enteredCode = voiceServerCode.value.trim();
    if (!address && !enteredCode) {
      try {
        localStorage.removeItem(voiceSettingsKey);
      } catch (_) {
        setVoiceStatus('Браузер не смог удалить сохранённый код.', 'is-error');
        return;
      }
      voiceSettings = null;
      voiceReadFailed = false;
      showVoiceSettings();
      return;
    }
    const targetAddress = address || defaultVoiceAddress;
    const code = enteredCode || (voiceSettings && voiceSettings.address === targetAddress ? voiceSettings.code : '');
    const candidate = readVoiceSettings(targetAddress, code);
    if (!candidate) {
      const message = !code ? 'Введите код подключения планшета.'
        : !/^[a-f0-9]{64}$/i.test(code) ? 'В коде должно быть 64 символа: цифры и буквы A–F.'
        : 'Проверьте адрес функции.';
      setVoiceStatus(message, 'is-error');
      return;
    }
    try {
      const saved = JSON.stringify(candidate);
      localStorage.setItem(voiceSettingsKey, saved);
      if (localStorage.getItem(voiceSettingsKey) !== saved) throw new Error('Voice settings were not stored');
    } catch (_) {
      setVoiceStatus('Браузер не сохранил код. Проверьте, разрешено ли сайту хранить данные.', 'is-error');
      return;
    }
    voiceSettings = candidate;
    voiceReadFailed = false;
    setWakeEnabled(false);
    showVoiceSettings();
  });
  function toggleCloudVoice() {
    if (cloudVoice) stopCloudVoice('Запись остановлена.');
    else startCloudVoice();
  }
  joCloud.addEventListener('click', toggleCloudVoice);
  joVoiceAction.addEventListener('click', toggleCloudVoice);
  joManual.addEventListener('click', function () { openJoDraft(null); });
  joNote.addEventListener('click', function () { openNote(''); });
  $('#note-close').addEventListener('click', function () { noteDialog.classList.add('hidden'); joAdd.focus(); });
  $('#note-form').addEventListener('submit', function (event) {
    event.preventDefault();
    const text = noteText.value.trim();
    if (!text) return;
    try {
      const items = loadNotes();
      items.unshift(text);
      localStorage.setItem(notesStorageKey, JSON.stringify(items));
      renderNotes(items);
      noteText.value = '';
      noteStatus.textContent = 'Заметка сохранена на этом планшете.';
    } catch (_) {
      noteStatus.textContent = 'Браузер не смог сохранить заметку.';
    }
  });
  joReview.addEventListener('click', function () { if (cloudDraft) openJoDraft(cloudDraft); });
  joDiscard.addEventListener('click', discardCloudDraft);
  joConnect.addEventListener('click', function () { setSettingsOpen(true); });
  settingsButton.addEventListener('click', function () { setSettingsOpen(true); });
  $('#calendar-settings-close').addEventListener('click', function () { setSettingsOpen(false); });
  joAdd.addEventListener('click', function () {
    chatStarted = true;
    syncCloudVoiceButton();
    if (voiceSettings && !joCloud.disabled) toggleCloudVoice();
    else {
      joChatStatus.textContent = voiceSettings ? 'Этот браузер не поддерживает запись микрофона.'
        : 'Подключите облачного Джованни, чтобы задавать вопросы голосом.';
    }
  });
  $('#jo-close').addEventListener('click', function () { setJoOpen(false); joAdd.focus(); });
  joWake.addEventListener('click', function () {
    if (wakeEnabled) setWakeEnabled(false);
    else if (SpeechRecognition && state) {
      setWakeEnabled(true, 'Включаю микрофон…');
      setJoOpen(false);
      clearTimeout(wakeTimer);
      startWake();
    }
  });
  joVoice.addEventListener('click', startVoice);
  joForm.addEventListener('submit', saveJoEvent);
  showConnection('');
  goToToday();
  requestAnimationFrame(function () {
    if (!calendarNavigated) goToToday();
  });
  refresh();
  setInterval(refresh, 60000);
  document.addEventListener('visibilitychange', refresh);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      stopCloudVoice('Разговор остановлен.');
      awaitingCommandUntil = 0;
      voiceConfirm = false;
      stopWakeRecognition();
      stopWakeSpeech();
    } else scheduleWake();
  });
  window.addEventListener('resize', fitMonth);
  window.addEventListener('holdomlayout', fitMonth);
}());
