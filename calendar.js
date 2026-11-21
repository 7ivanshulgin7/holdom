(function () {
  const endpoint = 'https://d5d6pof8q0gpe24mebt8.l5v6loqa.apigw.yandexcloud.net/state';
  const storageKey = 'holdom-calendar-key';
  const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const form = $('#calendar-connect');
  const keyField = $('#calendar-key');
  const disconnect = $('#calendar-disconnect');
  const status = $('#calendar-status');
  const days = $('#calendar-days');
  const agenda = $('#calendar-agenda');
  const events = $('#calendar-events');
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

  function render() {
    const year = month.getFullYear();
    const index = month.getMonth();
    const offset = (month.getDay() + 6) % 7;
    const length = new Date(year, index + 1, 0).getDate();
    const activeDay = dayKey(selected);
    const today = dayKey(new Date());
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
      const count = entriesFor(iso).length;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'calendar-day';
      if (iso === today) button.classList.add('calendar-today');
      if (count) button.classList.add('calendar-busy');
      button.setAttribute('aria-label', iso + (count ? ', событий: ' + count : ''));
      button.setAttribute('aria-pressed', String(iso === activeDay));
      button.textContent = day;
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
    const people = Object.create(null);
    state.people.forEach(function (person) { people[person.id] = person; });
    items.forEach(function (entry) {
      const owner = people[entry.by];
      const row = document.createElement('article');
      row.className = 'event';
      const time = document.createElement('div');
      time.className = 'event-time';
      time.textContent = entry.tf || 'Весь день';
      const info = document.createElement('div');
      info.className = 'event-info';
      if (owner && /^#[a-f0-9]{6}$/i.test(owner.color)) info.style.borderColor = owner.color;
      const title = document.createElement('strong');
      title.textContent = entry.what;
      info.appendChild(title);
      if (owner) {
        const name = document.createElement('span');
        name.textContent = owner.name;
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
