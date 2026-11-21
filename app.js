const $ = s => document.querySelector(s);
// При выпуске меняйте APP_VER, версию кэша и параметры ?v= вместе.
const APP_VER = '23 от 22.11.2026';
$('#app-version').textContent = 'v' + APP_VER;

function usePointerFocus() { document.documentElement.classList.add('pointer-focus'); }
document.addEventListener('mousedown', usePointerFocus, true);
document.addEventListener('touchstart', usePointerFocus, { capture: true, passive: true });
document.addEventListener('keydown', function (event) {
  if (event.key === 'Tab' || event.keyCode === 9) document.documentElement.classList.remove('pointer-focus');
}, true);

const reloadParam = 'holdom-refresh';
const pageUrl = new URL(window.location.href);
if (pageUrl.searchParams.has(reloadParam)) {
  pageUrl.searchParams.delete(reloadParam);
  window.history.replaceState(window.history.state, '', pageUrl.href);
}
$('#reload-button').addEventListener('click', function () {
  const url = new URL(window.location.href);
  // Свежий адрес обходит сохранённую копию HTML в Service Worker.
  url.searchParams.set(reloadParam, String(Date.now()));
  window.location.replace(url.href);
});

const themeSelect = $('#theme-select');
const themeKey = 'holdom-theme';
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

function applyTheme(mode) {
  const dark = mode === 'dark' || (mode === 'auto' && systemDark.matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  $('meta[name="theme-color"]').content = dark ? '#000000' : '#f2f2f7';
}

try {
  const savedTheme = localStorage.getItem(themeKey);
  if (savedTheme === 'light' || savedTheme === 'dark') themeSelect.value = savedTheme;
} catch (_) {}
applyTheme(themeSelect.value);
systemDark.addListener(function () { applyTheme(themeSelect.value); });
themeSelect.addEventListener('change', function () {
  applyTheme(themeSelect.value);
  try { localStorage.setItem(themeKey, themeSelect.value); } catch (_) {}
});

const clockFace = $('#jo-add');
const clockHours = $('#clock-hours');
const clockMinutes = $('#clock-minutes');
const dateEl = $('#date');
const weekdays = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
function tick() {
  const now = new Date();
  const hours = ('0' + now.getHours()).slice(-2);
  const minutes = ('0' + now.getMinutes()).slice(-2);
  const date = weekdays[now.getDay()] + ', ' + now.getDate() + ' ' + months[now.getMonth()];
  if (clockHours.textContent !== hours || clockMinutes.textContent !== minutes) {
    clockHours.textContent = hours;
    clockMinutes.textContent = minutes;
    clockFace.setAttribute('aria-label', hours + ':' + minutes + '. Открыть Джованни');
  }
  if (dateEl.textContent !== date) dateEl.textContent = date;
}
tick();
setInterval(tick, 1000);

const fullscreenButton = $('#fullscreen-button');
const fullscreenStatus = $('#fullscreen-status');
const fullscreenRoot = document.documentElement;
const enterFullscreen = fullscreenRoot.requestFullscreen
  || fullscreenRoot.webkitRequestFullscreen || fullscreenRoot.webkitRequestFullScreen;
const exitFullscreen = document.exitFullscreen
  || document.webkitExitFullscreen || document.webkitCancelFullScreen;

function fullscreenActive() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement
    || document.webkitCurrentFullScreenElement || document.webkitIsFullScreen);
}

function fullscreenMessage(message) {
  fullscreenStatus.textContent = message;
  fullscreenStatus.classList.toggle('hidden', !message);
  window.dispatchEvent(new Event('holdomlayout'));
}

function syncFullscreenButton() {
  const active = fullscreenActive();
  fullscreenButton.textContent = active ? 'Выйти из полного экрана' : 'На весь экран';
  fullscreenButton.setAttribute('aria-pressed', String(active));
  fullscreenMessage('');
}

function fullscreenFailed() {
  fullscreenMessage('Браузер не разрешил переключить полноэкранный режим.');
}

fullscreenButton.addEventListener('click', function () {
  const active = fullscreenActive();
  const action = active ? exitFullscreen : enterFullscreen;
  if (!action) {
    fullscreenMessage('Этот браузер не поддерживает полноэкранный режим страницы.');
    return;
  }
  try {
    const result = action.call(active ? document : fullscreenRoot);
    if (result && typeof result.catch === 'function') result.catch(fullscreenFailed);
  } catch (_) {
    fullscreenFailed();
  }
});
document.addEventListener('fullscreenchange', syncFullscreenButton);
document.addEventListener('webkitfullscreenchange', syncFullscreenButton);
document.addEventListener('fullscreenerror', fullscreenFailed);
document.addEventListener('webkitfullscreenerror', fullscreenFailed);
syncFullscreenButton();
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
const screenPreference = 'holdom-keep-screen-on';
const keepScreenOn = $('#keep-screen-on');
const screenStatus = $('#screen-status');
const wakeLockSupported = !!(navigator.wakeLock && navigator.wakeLock.request);
const screenVideo = $('#screen-video');
const videoSupported = !!screenVideo.canPlayType('video/mp4');
let screenLock = null;
let screenRequestPending = false;
let videoRequest = null;
let videoNeedsTap = false;

let screenEnabled = false;

function setScreenStatus(message) {
  screenStatus.textContent = message;
  screenStatus.classList.toggle('hidden', !message);
  window.dispatchEvent(new Event('holdomlayout'));
}

function updateVideoLock() {
  if (!videoSupported) {
    setScreenStatus('Этот браузер не поддерживает удержание экрана.');
    return;
  }
  if (!screenEnabled || document.hidden) {
    videoRequest = null;
    screenVideo.pause();
    screenVideo.classList.add('hidden');
    keepScreenOn.setAttribute('aria-pressed', 'false');
    setScreenStatus(screenEnabled
      ? 'Режим приостановлен, пока holdom не на экране.'
      : '');
    return;
  }
  if (videoNeedsTap || videoRequest || !screenVideo.paused) return;
  screenVideo.classList.remove('hidden');
  screenVideo.muted = true;
  if (!screenVideo.getAttribute('src')) screenVideo.src = './keep-awake.mp4';
  setScreenStatus('Запускаем видео для удержания экрана…');
  const attempt = {};
  videoRequest = attempt;
  try {
    const playback = screenVideo.play();
    if (playback) playback.catch(function (error) {
      if (videoRequest === attempt) videoLockFailed(error);
    });
  } catch (error) {
    videoLockFailed(error);
  }
}

function videoLockFailed(error) {
  videoRequest = null;
  if (!screenEnabled || document.hidden) return;
  videoNeedsTap = true;
  screenVideo.pause();
  screenVideo.classList.add('hidden');
  keepScreenOn.setAttribute('aria-pressed', 'false');
  if (error && error.name === 'NotAllowedError') {
    setScreenStatus('Нажмите «Не гасить экран», чтобы запустить удержание.');
  } else {
    screenVideo.removeAttribute('src');
    setScreenStatus('Видео не запустилось. Нажмите «Не гасить экран», чтобы повторить.');
  }
}

screenVideo.addEventListener('error', videoLockFailed);
screenVideo.addEventListener('playing', function () {
  videoRequest = null;
  if (screenEnabled && !document.hidden) {
    keepScreenOn.setAttribute('aria-pressed', 'true');
    setScreenStatus('');
  }
});
screenVideo.addEventListener('pause', function () {
  if (!screenEnabled || document.hidden || videoNeedsTap) return;
  videoRequest = null;
  keepScreenOn.setAttribute('aria-pressed', 'false');
  updateVideoLock();
});

function updateScreenLock() {
  if (!wakeLockSupported) {
    updateVideoLock();
    return;
  }
  if (!screenEnabled) {
    if (screenLock) {
      const lock = screenLock;
      screenLock = null;
      lock.release().catch(function () {});
    }
    setScreenStatus('');
    return;
  }
  if (screenLock && screenLock.released) screenLock = null;
  if (document.visibilityState !== 'visible' || screenLock || screenRequestPending) return;

  screenRequestPending = true;
  setScreenStatus('Включаем удержание экрана…');
  navigator.wakeLock.request('screen').then(function (lock) {
    screenRequestPending = false;
    if (!screenEnabled || document.visibilityState !== 'visible') {
      lock.release().catch(function () {});
      return;
    }
    screenLock = lock;
    setScreenStatus('');
    lock.addEventListener('release', function () {
      if (screenLock !== lock) return;
      screenLock = null;
      setScreenStatus('Удержание остановлено. Выключите и снова включите настройку, чтобы повторить.');
    });
  }).catch(function () {
    screenRequestPending = false;
    if (screenEnabled) {
      setScreenStatus('Браузер не смог удержать экран. Выключите и снова включите настройку, чтобы повторить.');
    }
  });
}

function setScreenEnabled(enabled) {
  screenEnabled = enabled;
  if (wakeLockSupported || !enabled) keepScreenOn.setAttribute('aria-pressed', String(enabled));
}

try {
  setScreenEnabled((wakeLockSupported || videoSupported) && localStorage.getItem(screenPreference) === '1');
} catch (_) {}
keepScreenOn.disabled = !wakeLockSupported && !videoSupported;
keepScreenOn.addEventListener('click', function () {
  setScreenEnabled(videoNeedsTap || !screenEnabled);
  videoNeedsTap = false;
  try {
    localStorage.setItem(screenPreference, screenEnabled ? '1' : '0');
  } catch (_) {}
  updateScreenLock();
});
document.addEventListener('visibilitychange', updateScreenLock);
document.addEventListener('webkitfullscreenchange', updateScreenLock);
document.addEventListener('fullscreenchange', updateScreenLock);
updateScreenLock();
