(function () {
  'use strict';
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  const rate = 44100;

  function supported() {
    return !!(window.isSecureContext !== false && AudioContext &&
      ((navigator.mediaDevices && navigator.mediaDevices.getUserMedia) || navigator.webkitGetUserMedia));
  }

  function microphone() {
    const options = { audio: { echoCancellation: true } };
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) return navigator.mediaDevices.getUserMedia(options);
    return new Promise(function (resolve, reject) { navigator.webkitGetUserMedia(options, resolve, reject); });
  }

  function release(stream) {
    if (stream) stream.getTracks().forEach(function (track) { track.stop(); });
  }

  function start(address, code, onEvent) {
    const context = new AudioContext();
    let closed = false;
    let stream, input, processor, player, timer, request;
    let samples = 0;
    let position = 0;
    let parts = [];
    context.resume().catch(function () {});

    function releaseMicrophone() {
      clearTimeout(timer);
      if (processor) {
        processor.onaudioprocess = null;
        processor.disconnect();
        processor = null;
      }
      if (input) { input.disconnect(); input = null; }
      release(stream);
      stream = null;
    }

    function stop(message) {
      if (closed) return;
      closed = true;
      releaseMicrophone();
      parts = [];
      if (request) request.abort();
      if (player) {
        player.onended = null;
        try { player.stop(); } catch (_) {}
        player.disconnect();
      }
      context.close().catch(function () {});
      onEvent({ type: 'closed', text: message });
    }

    function receive(result) {
      if (!result || result.rate !== rate || typeof result.audio !== 'string') {
        stop('Джованни прислал непонятный ответ.');
        return;
      }
      let message = typeof result.text === 'string' ? result.text.slice(0, 280) : '';
      if (result.draft && typeof result.draft === 'object') {
        const draft = result.draft;
        onEvent({ type: 'draft', title: draft.title, day: draft.day, time: draft.time });
        message = 'Проверьте черновик и нажмите «Сохранить».';
      }
      const pcm = atob(result.audio);
      if (!pcm.length || pcm.length % 2 || pcm.length > rate * 2 * 8) {
        if (message && result.draft && window.speechSynthesis && window.SpeechSynthesisUtterance) {
          const preview = new SpeechSynthesisUtterance('Черновик готов.');
          preview.lang = 'ru-RU';
          window.speechSynthesis.speak(preview);
        }
        stop(message);
        return;
      }
      onEvent({ type: 'answer', text: message });
      const buffer = context.createBuffer(1, pcm.length / 2, rate);
      const channel = buffer.getChannelData(0);
      for (let index = 0; index < channel.length; index++) {
        const sample = pcm.charCodeAt(index * 2) | pcm.charCodeAt(index * 2 + 1) << 8;
        channel[index] = ((sample << 16) >> 16) / 32768;
      }
      player = context.createBufferSource();
      player.buffer = buffer;
      player.connect(context.destination);
      player.onended = function () { stop(message); };
      player.start();
    }

    function send() {
      if (closed || !processor) return;
      releaseMicrophone();
      if (samples < rate / 5) { stop('Запишите фразу чуть длиннее.'); return; }
      onEvent({ type: 'waiting' });
      request = new XMLHttpRequest();
      request.open('POST', address);
      request.timeout = 24000;
      request.setRequestHeader('Content-Type', 'text/plain;charset=UTF-8');
      request.onload = function () {
        if (closed) return;
        if (request.status === 401) { stop('Проверьте код подключения планшета.'); return; }
        if (request.status !== 200) { stop('Джованни сейчас недоступен. Попробуйте ещё раз.'); return; }
        try { receive(JSON.parse(request.responseText)); }
        catch (_) { stop('Не удалось воспроизвести ответ Джованни.'); }
      };
      request.onerror = function () { stop('Нет связи с облачным Джованни.'); };
      request.ontimeout = function () { stop('Джованни не успел ответить.'); };
      request.send(JSON.stringify({ code: code, audio: btoa(parts.join('')) }));
      parts = [];
    }

    microphone().then(function (result) {
      if (closed) { release(result); return; }
      stream = result;
      input = context.createMediaStreamSource(stream);
      // ScriptProcessor работает в Chrome 55.
      processor = context.createScriptProcessor(2048, 1, 1);
      const step = context.sampleRate / rate;
      processor.onaudioprocess = function (event) {
        const data = event.inputBuffer.getChannelData(0);
        const pcm = [];
        for (; position < data.length && samples < rate * 8; position += step, samples++) {
          const left = Math.floor(position);
          const right = Math.min(left + 1, data.length - 1);
          const sample = data[left] + (data[right] - data[left]) * (position - left);
          const value = Math.round(Math.max(-1, Math.min(1, sample)) * 32767);
          pcm.push(value & 255, value >> 8 & 255);
        }
        position -= data.length;
        parts.push(String.fromCharCode.apply(null, pcm));
        if (samples >= rate * 8) send();
      };
      input.connect(processor);
      processor.connect(context.destination);
      timer = setTimeout(send, 8200);
      onEvent({ type: 'recording' });
    }).catch(function () { stop('Проверьте разрешение на микрофон.'); });

    return { stop: stop, send: send };
  }

  window.HoldomVoiceTurn = { supported: supported, start: start };
}());
