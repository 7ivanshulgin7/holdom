(function () {
  'use strict';
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  const rate = 44100;
  const maxSamples = rate * 8;
  const preRollSamples = rate * .3;
  const listenTimeoutMs = 30000;

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

  function start(address, code, onEvent, getTurnContext) {
    const context = new AudioContext();
    let closed = false;
    let stream, input, processor, player, timer, request;
    let samples = 0;
    let position = 0;
    let parts = [];
    let noiseFloor = .004;
    let speechTime = 0;
    let quietTime = 0;
    let heardSpeech = false;
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
      const message = typeof result.text === 'string' ? result.text.slice(0, 280) : '';
      if (result.transcript) onEvent({ type: 'transcript', text: result.transcript });
      if (result.action) {
        onEvent({ type: 'action', name: result.action, transcript: result.transcript });
        if (closed) return;
      }
      if (result.draft && typeof result.draft === 'object') {
        const draft = result.draft;
        onEvent({ type: 'draft', title: draft.title, day: draft.day, time: draft.time });
      }
      onEvent({ type: 'answer', text: result.draft ? '' : message });
      const pcm = atob(result.audio);
      if (!pcm.length) {
        listen(true);
        return;
      }
      if (pcm.length % 2 || pcm.length > rate * 2 * 8) {
        stop('Не удалось воспроизвести ответ Джованни.');
        return;
      }
      const buffer = context.createBuffer(1, pcm.length / 2, rate);
      const channel = buffer.getChannelData(0);
      for (let index = 0; index < channel.length; index++) {
        const sample = pcm.charCodeAt(index * 2) | pcm.charCodeAt(index * 2 + 1) << 8;
        channel[index] = ((sample << 16) >> 16) / 32768;
      }
      player = context.createBufferSource();
      player.buffer = buffer;
      player.connect(context.destination);
      player.onended = function () {
        player.disconnect();
        player = null;
        listen(true);
      };
      onEvent({ type: 'speaking' });
      player.start();
    }

    function send() {
      if (closed || !processor) return;
      releaseMicrophone();
      if (!heardSpeech) { stop('Не услышал вопрос. Попробуйте ещё раз.'); return; }
      onEvent({ type: 'waiting' });
      const xhr = new XMLHttpRequest();
      request = xhr;
      xhr.open('POST', address);
      xhr.timeout = 24000;
      xhr.setRequestHeader('Content-Type', 'text/plain;charset=UTF-8');
      xhr.onload = function () {
        if (closed || request !== xhr) return;
        request = null;
        if (xhr.status === 401) { stop('Проверьте код подключения планшета.'); return; }
        if (xhr.status === 503) { stop('Проверьте настройки голосовой функции в Яндекс Cloud.'); return; }
        if (xhr.status !== 200) {
          let issue;
          try { issue = JSON.parse(xhr.responseText); } catch (_) {}
          const info = issue && typeof issue.stage === 'string' && /^[a-z0-9_-]{1,72}$/i.test(issue.stage) ? ' · ' + issue.stage : '';
          stop('Джованни не ответил (HTTP ' + xhr.status + info + ').');
          return;
        }
        try { receive(JSON.parse(xhr.responseText)); }
        catch (_) { stop('Не удалось воспроизвести ответ Джованни.'); }
      };
      xhr.onerror = function () { stop('Нет связи с облачным Джованни.'); };
      xhr.ontimeout = function () { stop('Джованни не успел ответить.'); };
      const turn = getTurnContext();
      xhr.send(JSON.stringify({
        code: code, audio: btoa(parts.join('')), history: turn.history, actions: turn.actions
      }));
      parts = [];
    }

    function listen(followUp) {
      if (closed) return;
      samples = 0;
      position = 0;
      noiseFloor = .004;
      speechTime = 0;
      quietTime = 0;
      heardSpeech = false;
      microphone().then(function (result) {
        if (closed) { release(result); return; }
        stream = result;
        input = context.createMediaStreamSource(stream);
        // ScriptProcessor работает в Chrome 55.
        processor = context.createScriptProcessor(2048, 1, 1);
        const step = context.sampleRate / rate;
        processor.onaudioprocess = function (event) {
          if (closed || !processor) return;
          const data = event.inputBuffer.getChannelData(0);
          let energy = 0;
          for (let index = 0; index < data.length; index++) energy += data[index] * data[index];
          const level = Math.sqrt(energy / data.length);
          const duration = data.length / context.sampleRate;
          const speech = level > Math.max(.009, noiseFloor * 2.6);
          if (!heardSpeech) {
            speechTime = speech ? speechTime + duration : 0;
            if (!speech) noiseFloor += (level - noiseFloor) * .08;
            if (speechTime >= .12) {
              heardSpeech = true;
              clearTimeout(timer);
            }
          } else quietTime = speech ? 0 : quietTime + duration;
          const pcm = [];
          for (; position < data.length && samples < maxSamples; position += step, samples++) {
            const left = Math.floor(position);
            const right = Math.min(left + 1, data.length - 1);
            const sample = data[left] + (data[right] - data[left]) * (position - left);
            const value = Math.round(Math.max(-1, Math.min(1, sample)) * 32767);
            pcm.push(value & 255, value >> 8 & 255);
          }
          position -= data.length;
          parts.push(String.fromCharCode.apply(null, pcm));
          if (!heardSpeech) {
            while (samples - parts[0].length / 2 >= preRollSamples) samples -= parts.shift().length / 2;
          } else if (quietTime >= .8 || samples >= maxSamples) send();
        };
        input.connect(processor);
        processor.connect(context.destination);
        timer = setTimeout(function () {
          stop(followUp ? 'Разговор завершён.' : 'Не услышал вопрос. Попробуйте ещё раз.');
        }, listenTimeoutMs);
        onEvent({ type: 'recording', followUp: followUp });
      }).catch(function () { stop('Проверьте разрешение на микрофон.'); });
    }

    listen(false);
    return { stop: stop };
  }

  window.HoldomVoiceTurn = { supported: supported, start: start };
}());
