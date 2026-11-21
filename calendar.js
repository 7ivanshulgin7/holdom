(function () {
  const endpoint = 'https://d5d6pof8q0gpe24mebt8.l5v6loqa.apigw.yandexcloud.net';
  const storageKey = 'holdom-calendar-key';
  const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const form = $('#calendar-connect');
  const keyField = $('#calendar-key');
  const disconnect = $('#calendar-disconnect');
  const calendarLink = $('#open-kto-kogda');
  const linkStatus = $('#calendar-link-status');
  const peopleButton = $('#calendar-people-button');
  const peoplePanel = $('#calendar-people');
  const peopleForm = $('#people-search');
  const peopleQuery = $('#people-query');
  const peopleStatus = $('#people-status');
  const peopleResults = $('#people-results');
  const status = $('#calendar-status');
  const days = $('#calendar-days');
  const monthView = $('#calendar-month-view');
  const agenda = $('#calendar-agenda');
  const events = $('#calendar-events');
  const nearest = $('#calendar-nearest');
  const joAdd = $('#jo-add');
  const joAccount = $('#jo-account');
  const joForm = $('#jo-form');
  const joVoice = $('#jo-voice');
  const joTitle = $('#jo-title');
  const joDate = $('#jo-date');
  const joTime = $('#jo-time');
  const joSave = $('#jo-save');
  const joStatus = $('#jo-status');
  const joResult = $('#jo-result');
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let selected = new Date();
  let month = new Date(selected.getFullYear(), selected.getMonth(), 1);
  let lastToday = dayKey(selected);
  let state = null;
  let key = '';
  let request = null;
  let peopleRequest = null;
  let foundPeople = [];
  let draftId = '';
  let saveRequest = null;
  let recognition = null;

  try { key = localStorage.getItem(storageKey) || ''; } catch (_) {}

  function dayKey(date) {
    return date.getFullYear() + '-' + ('0' + (date.getMonth() + 1)).slice(-2)
      + '-' + ('0' + date.getDate()).slice(-2);
  }

  function entriesFor(day) {
    if (!state) return [];
    return state.entries.filter(function (entry) {
      return entry.from <= day && (entry.to || entry.from) >= day;
    });
  }

  function entryPeople(entry, day, people) {
    const ids = Array.isArray(entry.who) && entry.who.length ? entry.who : [entry.by];
    return ids.filter(function (id) {
      const personalDays = entry.days && entry.days[id];
      return people[id] && (!Array.isArray(personalDays) || personalDays.indexOf(day) !== -1);
    }).map(function (id) { return people[id]; });
  }

  function personColor(person) {
    return person && /^#[a-f0-9]{6}$/i.test(person.color) ? person.color : '#8bac7b';
  }

  function renderNearest(people) {
    nearest.classList.toggle('hidden', !state);
    if (!state) return;
    const now = new Date();
    const today = dayKey(now);
    const time = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
    let next = null;
    state.entries.forEach(function (entry) {
      const end = entry.to || entry.from;
      if (!entry.from || end < today) return;
      const day = entry.from < today ? today : entry.from;
      if (end === today && entry.tf && (entry.tt || entry.tf) < time) return;
      const order = day + 'T' + (entry.tf || '24:00');
      if (!next || order < next.order) next = { entry: entry, day: day, order: order };
    });
    const title = $('#nearest-title');
    const meta = $('#nearest-details');
    title.textContent = next ? next.entry.what : 'Предстоящих дел нет';
    meta.textContent = '';
    if (!next) return;
    const date = next.day.split('-');
    const peopleLabel = entryPeople(next.entry, next.day, people).map(function (person) { return person.name; });
    const details = [next.day === today ? 'Сегодня' : (+date[2] + ' ' + months[+date[1] - 1])];
    if (next.entry.tf) details.push(next.entry.tf + (next.entry.tt ? '–' + next.entry.tt : ''));
    if (peopleLabel.length) details.push(peopleLabel.join(', '));
    meta.textContent = details.join(' · ');
  }

  function render() {
    const year = month.getFullYear();
    const index = month.getMonth();
    const offset = (month.getDay() + 6) % 7;
    const length = new Date(year, index + 1, 0).getDate();
    const activeDay = dayKey(selected);
    const today = dayKey(new Date());
    const people = Object.create(null);
    if (state) state.people.forEach(function (person) { people[person.id] = person; });
    renderNearest(people);
    $('#calendar-month').textContent = monthNames[index] + ' ' + year;
    days.textContent = '';

    for (let cell = 0; cell < Math.ceil((offset + length) / 7) * 7; cell++) {
      const day = cell - offset + 1;
      const square = document.createElement('div');
      square.className = 'calendar-cell';
      days.appendChild(square);
      if (day < 1 || day > length) {
        square.setAttribute('aria-hidden', 'true');
        continue;
      }
      const date = new Date(year, index, day);
      const iso = dayKey(date);
      const dayEntries = entriesFor(iso);
      const count = dayEntries.length;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'calendar-day';
      if (iso === today) button.classList.add('calendar-today');
      button.setAttribute('aria-label', iso + (count ? ', событий: ' + count : ''));
      button.setAttribute('aria-pressed', String(iso === activeDay));
      button.textContent = day;
      if (count) {
        const bands = document.createElement('span');
        bands.className = 'calendar-bands';
        bands.setAttribute('aria-hidden', 'true');
        const marked = Object.create(null);
        dayEntries.forEach(function (entry) {
          entryPeople(entry, iso, people).forEach(function (person) {
            if (marked[person.id]) return;
            marked[person.id] = true;
            const band = document.createElement('i');
            band.style.backgroundColor = personColor(person);
            bands.appendChild(band);
          });
        });
        if (!bands.firstChild) bands.appendChild(document.createElement('i'));
        button.appendChild(bands);
      }
      button.onclick = function () {
        selected = date;
        render();
      };
      square.appendChild(button);
    }

    agenda.classList.toggle('hidden', !state);
    if (!state) return;
    $('#calendar-day-title').textContent = selected.getDate() + ' ' + months[selected.getMonth()];
    events.textContent = '';
    const items = entriesFor(activeDay).sort(function (a, b) {
      return (a.tf || '').localeCompare(b.tf || '');
    });
    if (!items.length) {
      events.textContent = 'На этот день дел нет.';
      return;
    }
    items.forEach(function (entry) {
      const owner = people[entry.by];
      const participants = entryPeople(entry, activeDay, people);
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
      info.appendChild(title);
      if (participants.length || owner) {
        const name = document.createElement('span');
        name.textContent = participants.length
          ? participants.map(function (person) { return person.name; }).join(', ')
          : owner.name;
        info.appendChild(name);
      }
      row.appendChild(time);
      row.appendChild(info);
      events.appendChild(row);
    });
  }

  function showConnection(message) {
    form.classList.toggle('hidden', !!key);
    disconnect.classList.toggle('hidden', !key);
    peopleButton.classList.toggle('hidden', !state);
    joAdd.disabled = !state;
    joAccount.textContent = state ? 'Календарь: ' + state.me.name : 'Подключите календарь «Кто когда»';
    status.textContent = message;
  }

  function forgetCalendar() {
    if (request) request.abort();
    request = null;
    key = '';
    state = null;
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
    peoplePanel.classList.add('hidden');
    peopleButton.setAttribute('aria-expanded', 'false');
    peopleQuery.value = '';
    peopleStatus.textContent = '';
    peopleResults.textContent = '';
    peopleForm.querySelector('button').disabled = false;
    keyField.value = '';
    linkStatus.textContent = '';
    try { localStorage.removeItem(storageKey); } catch (_) {}
    render();
  }

  function setJoOpen(open) {
    joForm.classList.toggle('hidden', !open);
    joAdd.setAttribute('aria-expanded', String(open));
    joAdd.textContent = open ? 'Свернуть' : 'Добавить дело';
    if (!open && recognition) {
      const active = recognition;
      recognition = null;
      active.abort();
      joVoice.disabled = !SpeechRecognition;
      joStatus.textContent = '';
    }
  }

  function resetJo() {
    setJoOpen(false);
    joForm.reset();
    joSave.disabled = false;
    joResult.textContent = '';
    joStatus.textContent = '';
    draftId = '';
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
    event.preventDefault();
    if (!key || !state || saveRequest) return;
    const what = joTitle.value.trim();
    const date = joDate.value;
    if (!what || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      joStatus.textContent = 'Укажите название и дату.';
      return;
    }
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
      month = new Date(selected.getFullYear(), selected.getMonth(), 1);
      resetJo();
      joResult.textContent = 'Добавлено: ' + data.entry.what;
      render();
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
      if (xhr.status === 401 || xhr.status === 403) {
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
      key = candidate;
      state = data;
      keyField.value = '';
      try { localStorage.setItem(storageKey, key); } catch (_) {}
      showConnection('Подключён аккаунт: ' + state.me.name);
      render();
      if (!peoplePanel.classList.contains('hidden')) renderPeopleResults();
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
        month = new Date(now.getFullYear(), now.getMonth(), 1);
      }
      lastToday = today;
      render();
    }
    syncCalendar(key);
  }

  function shiftMonth(delta) {
    month = new Date(month.getFullYear(), month.getMonth() + delta, 1);
    const now = new Date();
    selected = now.getFullYear() === month.getFullYear() && now.getMonth() === month.getMonth() ? now : month;
    render();
  }

  calendarLink.addEventListener('click', function (event) {
    if (!key) return;
    event.preventDefault();
    linkStatus.textContent = '';
    try {
      // GitHub Pages размещает обе PWA под одним origin, но у каждой свой ключ входа.
      if (new URL(calendarLink.href).origin !== window.location.origin) {
        window.location.assign(calendarLink.href);
        return;
      }
      const existing = JSON.parse(localStorage.getItem('kk-auth2') || 'null');
      if (existing && existing.token && existing.token !== key) {
        linkStatus.textContent = 'В «Кто когда» уже открыт другой сеанс. Сначала выйдите из него в самом календаре.';
        return;
      }
      if (!existing || !existing.token) {
        const pending = JSON.parse(localStorage.getItem('kk-pending2') || 'null');
        const cached = JSON.parse(localStorage.getItem('kk-state2') || 'null');
        if ((pending && (!Array.isArray(pending) || pending.length)) ||
            (cached && (!state || !cached.me || cached.me.id !== state.me.id))) {
          linkStatus.textContent = 'В «Кто когда» есть данные прежнего сеанса. Сначала завершите его в самом календаре.';
          return;
        }
        localStorage.setItem('kk-auth2', JSON.stringify({ token: key, me: state ? state.me.id : '' }));
      }
      window.location.assign(calendarLink.href);
    } catch (_) {
      linkStatus.textContent = 'Не удалось передать вход. Откройте «Кто когда» отдельно.';
    }
  });

  $('#previous-month').onclick = function () { shiftMonth(-1); };
  $('#next-month').onclick = function () { shiftMonth(1); };

  let swipeStart = null;
  let lastSwipe = 0;
  monthView.addEventListener('touchstart', function (event) {
    if (event.touches.length !== 1) {
      swipeStart = null;
      return;
    }
    const touch = event.touches[0];
    swipeStart = { id: touch.identifier, x: touch.clientX, y: touch.clientY };
  }, { passive: true });
  monthView.addEventListener('touchcancel', function () { swipeStart = null; }, { passive: true });
  monthView.addEventListener('touchend', function (event) {
    const start = swipeStart;
    swipeStart = null;
    if (!start || event.changedTouches.length !== 1) return;
    const touch = event.changedTouches[0];
    if (touch.identifier !== start.id) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 55 || Math.abs(dx) < 1.5 * Math.abs(dy)) return;
    lastSwipe = Date.now();
    shiftMonth(dx < 0 ? 1 : -1);
  }, { passive: true });
  monthView.addEventListener('click', function (event) {
    if (event.detail && Date.now() - lastSwipe < 320) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);
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
  peopleButton.addEventListener('click', function () {
    const open = peoplePanel.classList.contains('hidden');
    peoplePanel.classList.toggle('hidden', !open);
    peopleButton.setAttribute('aria-expanded', String(open));
    if (open) renderPeopleResults();
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
  joAdd.addEventListener('click', function () {
    const open = joForm.classList.contains('hidden');
    setJoOpen(open);
    if (open) {
      joResult.textContent = '';
      if (!joDate.value) joDate.value = dayKey(new Date());
      joStatus.textContent = SpeechRecognition ? '' : 'Диктовка недоступна в этом браузере. Можно вписать дело.';
      joForm.scrollIntoView(false);
    }
  });
  joVoice.addEventListener('click', startVoice);
  joForm.addEventListener('submit', saveJoEvent);
  render();
  showConnection('');
  refresh();
  setInterval(refresh, 60000);
  document.addEventListener('visibilitychange', refresh);
}());
