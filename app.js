const $ = s => document.querySelector(s);
const clock = $('#clock'), dateEl = $('#date');
function tick(){const d=new Date();clock.textContent=new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit'}).format(d);dateEl.textContent=new Intl.DateTimeFormat('ru-RU',{weekday:'long',day:'numeric',month:'long'}).format(d).toLocaleUpperCase('ru-RU')}
tick();setInterval(tick,1000);
const tabs = document.querySelectorAll('.tab');
const sections = document.querySelectorAll('.content');
Array.prototype.forEach.call(tabs, function (tab) {
  tab.addEventListener('click', function () {
    Array.prototype.forEach.call(tabs, function (button) {
      button.classList.toggle('active', button === tab);
    });
    Array.prototype.forEach.call(sections, function (section) {
      const selected = section.id === tab.dataset.tab;
      section.classList.toggle('active', selected);
      section.classList.toggle('hidden', !selected);
    });
  });
});
const STORE='holdom-shopping-v1';let items=JSON.parse(localStorage.getItem(STORE)||'[]');
function render(){const list=$('#shopping-list');list.textContent='';items.forEach((item,i)=>{const li=document.createElement('li');li.className=item.done?'done':'';const toggle=document.createElement('button');toggle.className='item-toggle';toggle.textContent=item.done?'✓':'';toggle.onclick=()=>{items[i].done=!items[i].done;save()};const name=document.createElement('span');name.className='item-name';name.textContent=item.name;const del=document.createElement('button');del.className='item-delete';del.textContent='×';del.setAttribute('aria-label','Удалить');del.onclick=()=>{items.splice(i,1);save()};li.appendChild(toggle);li.appendChild(name);li.appendChild(del);list.appendChild(li)});$('#shopping-count').textContent=items.filter(x=>!x.done).length;localStorage.setItem(STORE,JSON.stringify(items))}
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
