(function () {
  const endpoint = 'https://d5d6pof8q0gpe24mebt8.l5v6loqa.apigw.yandexcloud.net/state';
  const storageKey = 'holdom-calendar-key';
  const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const form = $('#calendar-connect');
  const keyField = $('#calendar-key');
  const disconnect = $('#calendar-disconnect');
  const calendarLink = $('#open-kto-kogda');
  const linkStatus = $('#calendar-link-status');
  const status = $('#calendar-status');
  const days = $('#calendar-days');
  const agenda = $('#calendar-agenda');
  const events = $('#calendar-events');
  const nearest = $('#calendar-nearest');
  let selected = new Date();
  let month = new Date(selected.getFullYear(), selected.getMonth(), 1);
  let lastToday = dayKey(selected);
  let state = null;
  let key = '';
  let request = null;

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
      if (day < 1 || day > length) {
        days.appendChild(document.createElement('span'));
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
      days.appendChild(button);
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
    status.textContent = message;
  }

  function forgetCalendar() {
    if (request) request.abort();
    request = null;
    key = '';
    state = null;
    keyField.value = '';
    linkStatus.textContent = '';
    try { localStorage.removeItem(storageKey); } catch (_) {}
    render();
  }

  function syncCalendar(candidate) {
    if (!candidate || request) return;
    if (!state) showConnection('Подключаю календарь…');
    const xhr = new XMLHttpRequest();
    request = xhr;
    const submit = form.querySelector('button');
    submit.disabled = true;
    xhr.open('GET', endpoint, true);
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
    };
    xhr.send();
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
  render();
  showConnection('');
  refresh();
  setInterval(refresh, 60000);
  document.addEventListener('visibilitychange', refresh);
}());
