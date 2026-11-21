const $ = s => document.querySelector(s);
// При выпуске меняйте APP_VER, версию кэша и параметры ?v= вместе.
const APP_VER = '6 от 21.11.2026';
$('#app-version').textContent = 'holdom · бета · v' + APP_VER;
const clock = $('#clock');
const dateEl = $('#date');
const weekdays = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
function tick() {
  const now = new Date();
  const time = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
  const date = weekdays[now.getDay()] + ', ' + now.getDate() + ' ' + months[now.getMonth()];
  if (clock.textContent !== time) clock.textContent = time;
  if (dateEl.textContent !== date) dateEl.textContent = date;
}
tick();
setInterval(tick, 1000);
const STORE='holdom-shopping-v1';let items=JSON.parse(localStorage.getItem(STORE)||'[]');
function render() {
  const list = $('#shopping-list');
  list.textContent = '';
  items.forEach(function (item, index) {
    const row = document.createElement('li');
    row.className = item.done ? 'done' : '';
    const toggle = document.createElement('button');
    toggle.className = 'item-toggle';
    toggle.textContent = item.done ? '✓' : '○';
    toggle.setAttribute('aria-label', 'Куплено: ' + item.name);
    toggle.setAttribute('aria-pressed', String(item.done));
    toggle.onclick = function () { item.done = !item.done; save(); };
    const name = document.createElement('span');
    name.className = 'item-name';
    name.textContent = item.name;
    const remove = document.createElement('button');
    remove.className = 'item-delete';
    remove.textContent = '×';
    remove.setAttribute('aria-label', 'Удалить: ' + item.name);
    remove.onclick = function () { items.splice(index, 1); save(); };
    row.appendChild(toggle);
    row.appendChild(name);
    row.appendChild(remove);
    list.appendChild(row);
  });
  $('#shopping-empty').hidden = items.length > 0;
  $('#shopping-count').textContent = items.filter(function (item) { return !item.done; }).length;
  $('#clear-done').disabled = !items.some(function (item) { return item.done; });
  localStorage.setItem(STORE, JSON.stringify(items));
}
function save(){render()}
$('#shopping-form').addEventListener('submit',e=>{e.preventDefault();const input=$('#shopping-input');const name=input.value.trim();if(!name)return;items.push({name,done:false});input.value='';save()});
$('#clear-done').onclick=()=>{items=items.filter(x=>!x.done);save()};
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
const screenPreference = 'holdom-keep-screen-on';
const settingsButton = $('#settings-button');
const settings = $('#settings');
const keepScreenOn = $('#keep-screen-on');
const screenStatus = $('#screen-status');
const wakeLockSupported = !!(navigator.wakeLock && navigator.wakeLock.request);
const screenVideo = $('#screen-video');
const videoSupported = !!screenVideo.canPlayType('video/mp4; codecs="avc1.42E01E"');
let screenLock = null;
let screenRequestPending = false;

settingsButton.addEventListener('click', function () {
  const open = !settings.classList.contains('hidden');
  settings.classList.toggle('hidden', open);
  settingsButton.setAttribute('aria-expanded', String(!open));
});

function setScreenStatus(message) {
  screenStatus.textContent = message;
}

function updateVideoLock() {
  if (!videoSupported) {
    setScreenStatus('Этот браузер не поддерживает удержание экрана.');
    return;
  }
  if (!keepScreenOn.checked || document.hidden) {
    screenVideo.pause();
    screenVideo.classList.add('hidden');
    setScreenStatus(keepScreenOn.checked
      ? 'Режим приостановлен, пока holdom не на экране.'
      : 'Старый браузер. Для удержания экрана используем тихое видео.');
    return;
  }
  screenVideo.classList.remove('hidden');
  screenVideo.muted = true;
  if (!screenVideo.getAttribute('src')) screenVideo.src = './keep-awake.mp4';
  setScreenStatus('Запускаем видео для удержания экрана…');
  const playback = screenVideo.play();
  if (playback) playback.catch(videoLockFailed);
}

function videoLockFailed() {
  if (!keepScreenOn.checked || document.hidden) return;
  keepScreenOn.checked = false;
  screenVideo.pause();
  screenVideo.classList.add('hidden');
  setScreenStatus('Видео не запустилось. Проверьте интернет и включите настройку ещё раз.');
}

screenVideo.addEventListener('error', videoLockFailed);
screenVideo.addEventListener('playing', function () {
  if (keepScreenOn.checked) {
    setScreenStatus('Видео играет без звука. Проверьте, останется ли экран включённым.');
  }
});

function updateScreenLock() {
  if (!wakeLockSupported) {
    updateVideoLock();
    return;
  }
  if (!keepScreenOn.checked) {
    if (screenLock) {
      const lock = screenLock;
      screenLock = null;
      lock.release().catch(function () {});
    }
    setScreenStatus('Действует обычный тайм-аут экрана.');
    return;
  }
  if (screenLock && screenLock.released) screenLock = null;
  if (document.visibilityState !== 'visible' || screenLock || screenRequestPending) return;

  screenRequestPending = true;
  setScreenStatus('Включаем удержание экрана…');
  navigator.wakeLock.request('screen').then(function (lock) {
    screenRequestPending = false;
    if (!keepScreenOn.checked || document.visibilityState !== 'visible') {
      lock.release().catch(function () {});
      return;
    }
    screenLock = lock;
    setScreenStatus('Экран останется включённым, пока открыт holdom.');
    lock.addEventListener('release', function () {
      if (screenLock !== lock) return;
      screenLock = null;
      setScreenStatus('Удержание остановлено. Выключите и снова включите настройку, чтобы повторить.');
    });
  }).catch(function () {
    screenRequestPending = false;
    if (keepScreenOn.checked) {
      setScreenStatus('Браузер не смог удержать экран. Выключите и снова включите настройку, чтобы повторить.');
    }
  });
}

try {
  keepScreenOn.checked = wakeLockSupported && localStorage.getItem(screenPreference) === '1';
} catch (_) {}
keepScreenOn.disabled = !wakeLockSupported && !videoSupported;
keepScreenOn.addEventListener('change', function () {
  try {
    if (wakeLockSupported) localStorage.setItem(screenPreference, keepScreenOn.checked ? '1' : '0');
  } catch (_) {}
  updateScreenLock();
});
document.addEventListener('visibilitychange', updateScreenLock);
updateScreenLock();
render();
