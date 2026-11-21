const $ = s => document.querySelector(s);
// При выпуске меняйте APP_VER, версию кэша и параметры ?v= вместе.
const APP_VER = '16 от 21.11.2026';
$('#app-version').textContent = 'v' + APP_VER;
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
const videoSupported = !!screenVideo.canPlayType('video/mp4; codecs="avc1.42E01E"');
let screenLock = null;
let screenRequestPending = false;

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
    screenVideo.pause();
    screenVideo.classList.add('hidden');
    setScreenStatus(screenEnabled
      ? 'Режим приостановлен, пока holdom не на экране.'
      : '');
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
  if (!screenEnabled || document.hidden) return;
  setScreenEnabled(false);
  screenVideo.pause();
  screenVideo.classList.add('hidden');
  setScreenStatus('Видео не запустилось. Проверьте интернет и включите настройку ещё раз.');
}

screenVideo.addEventListener('error', videoLockFailed);
screenVideo.addEventListener('playing', function () {
  if (screenEnabled) {
    setScreenStatus('');
  }
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
  keepScreenOn.setAttribute('aria-pressed', String(enabled));
}

try {
  setScreenEnabled(wakeLockSupported && localStorage.getItem(screenPreference) === '1');
} catch (_) {}
keepScreenOn.disabled = !wakeLockSupported && !videoSupported;
keepScreenOn.addEventListener('click', function () {
  setScreenEnabled(!screenEnabled);
  try {
    if (wakeLockSupported) localStorage.setItem(screenPreference, screenEnabled ? '1' : '0');
  } catch (_) {}
  updateScreenLock();
});
document.addEventListener('visibilitychange', updateScreenLock);
updateScreenLock();
