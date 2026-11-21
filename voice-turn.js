(function () {
  'use strict';
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  const rate = 44100;
  const maxSamples = rate * 8;
  const preRollSamples = rate * .3;

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

  function start(address, code, onEvent, history, actions) {
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
      let message = typeof result.text === 'string' ? result.text.slice(0, 280) : '';
      if (result.transcript) onEvent({ type: 'transcript', text: result.transcript });
      if (result.action) {
        onEvent({ type: 'action', name: result.action, transcript: result.transcript });
        if (closed) return;
      }
      if (result.draft && typeof result.draft === 'object') {
        const draft = result.draft;
        onEvent({ type: 'draft', title: draft.title, day: draft.day, time: draft.time });
        message = 'Проверьте черновик и нажмите «Сохранить».';
      }
      onEvent({ type: 'answer', text: result.draft ? '' : message });
      const pcm = atob(result.audio);
      if (!pcm.length || pcm.length % 2 || pcm.length > rate * 2 * 8) {
        stop(message);
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
      player.onended = function () { stop(message); };
      player.start();
    }

    function send() {
      if (closed || !processor) return;
      releaseMicrophone();
      if (!heardSpeech) { stop('Не услышал вопрос. Попробуйте ещё раз.'); return; }
      onEvent({ type: 'waiting' });
      request = new XMLHttpRequest();
      request.open('POST', address);
      request.timeout = 24000;
      request.setRequestHeader('Content-Type', 'text/plain;charset=UTF-8');
      request.onload = function () {
        if (closed) return;
        if (request.status === 401) { stop('Проверьте код подключения планшета.'); return; }
        if (request.status === 503) { stop('Проверьте настройки голосовой функции в Яндекс Cloud.'); return; }
        if (request.status !== 200) {
          let issue;
          try { issue = JSON.parse(request.responseText); } catch (_) {}
          const info = issue && typeof issue.stage === 'string' && /^[a-z0-9_-]{1,72}$/i.test(issue.stage) ? ' · ' + issue.stage : '';
          stop('Джованни не ответил (HTTP ' + request.status + info + ').');
          return;
        }
        try { receive(JSON.parse(request.responseText)); }
        catch (_) { stop('Не удалось воспроизвести ответ Джованни.'); }
      };
      request.onerror = function () { stop('Нет связи с облачным Джованни.'); };
      request.ontimeout = function () { stop('Джованни не успел ответить.'); };
      request.send(JSON.stringify({ code: code, audio: btoa(parts.join('')), history: history, actions: actions }));
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
      timer = setTimeout(function () { stop('Не услышал вопрос. Попробуйте ещё раз.'); }, 12000);
      onEvent({ type: 'recording' });
    }).catch(function () { stop('Проверьте разрешение на микрофон.'); });

    return { stop: stop };
  }

  window.HoldomVoiceTurn = { supported: supported, start: start };
}());
