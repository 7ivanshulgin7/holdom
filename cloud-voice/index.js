'use strict';

const { timingSafeEqual } = require('node:crypto');
const WebSocket = require('ws');
const origin = 'https://7ivanshulgin7.github.io';
const rate = 44100;
const maxInput = rate * 2 * 8;
const maxOutput = rate * 2 * 8;

exports.handler = async function (event, context) {
  const suppliedOrigin = Object.entries(event.headers || {}).find(([name]) => name.toLowerCase() === 'origin');
  function reply(statusCode, payload) {
    return {
      statusCode,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Vary': 'Origin',
        ...(suppliedOrigin?.[1] === origin ? { 'Access-Control-Allow-Origin': origin } : {}),
      },
      body: JSON.stringify(payload),
    };
  }

  if (event.httpMethod !== 'POST') return reply(405, { error: 'method' });
  if (suppliedOrigin?.[1] !== origin) return reply(403, { error: 'origin' });
  const code = process.env.HOLDOM_VOICE_CODE;
  const folder = process.env.YANDEX_FOLDER_ID;
  if (!code || !/^[a-f0-9]{64}$/.test(code) || !folder || !context?.token) {
    return reply(503, { error: 'configuration' });
  }
  if (typeof event.body !== 'string' || event.body.length > 1_300_000) return reply(413, { error: 'size' });

  let request;
  try {
    request = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body);
  } catch {
    return reply(400, { error: 'request' });
  }
  if (!request || typeof request.code !== 'string' || !/^[a-f0-9]{64}$/.test(request.code) ||
      !timingSafeEqual(Buffer.from(code, 'hex'), Buffer.from(request.code, 'hex'))) {
    return reply(401, { error: 'pairing' });
  }
  if (typeof request.audio !== 'string' || request.audio.length > Math.ceil(maxInput / 3) * 4 ||
      request.audio.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(request.audio)) return reply(400, { error: 'audio' });
  const audio = Buffer.from(request.audio, 'base64');
  if (audio.length < rate / 5 || audio.length > maxInput || audio.length % 2) return reply(400, { error: 'audio' });

  try {
    return reply(200, await askGiovanni(audio, folder, context.token));
  } catch (error) {
    console.warn('Giovanni:', error.stage || 'request failed');
    return reply(502, { error: 'upstream' });
  }
};

function readDraft(item) {
  if (item.type !== 'function_call' || item.name !== 'prepare_event') return null;
  let draft;
  try { draft = JSON.parse(item.arguments); } catch { return null; }
  if (!draft || typeof draft.title !== 'string' || typeof draft.day !== 'string' || typeof draft.time !== 'string') return null;
  const title = draft.title.trim().slice(0, 60);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(draft.day) && new Date(draft.day + 'T00:00:00Z');
  if (!title || !date || isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== draft.day ||
      !/^(?:(?:[01]\d|2[0-3]):[0-5]\d)?$/.test(draft.time)) return null;
  return { title, day: draft.day, time: draft.time };
}

function askGiovanni(audio, folder, token) {
  const url = new URL('wss://ai.api.cloud.yandex.net/v1/realtime/openai');
  url.searchParams.set('model', 'gpt://' + folder + '/speech-realtime-deepseek-v4-flash');
  const date = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeZone: 'Europe/Moscow' }).format(new Date());
  const format = { type: 'audio/pcm', rate };

  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, {
      headers: { Authorization: 'Bearer ' + token },
      handshakeTimeout: 6000,
      maxPayload: 1_048_576,
    });
    const timer = setTimeout(() => finish('timeout'), 17000);
    const chunks = [];
    let bytes = 0;
    let transcript = '';
    let sent = false;
    let committed = false;
    let finished = false;

    function finish(stage, result) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      socket.terminate();
      if (stage) reject(Object.assign(new Error('Realtime failed'), { stage }));
      else resolve(result);
    }

    function send(event) { socket.send(JSON.stringify(event)); }

    socket.on('error', () => finish('connection'));
    socket.on('close', () => finish('closed'));
    socket.on('open', () => send({
      type: 'session.update',
      session: {
        type: 'realtime',
        instructions: 'Ты Джованни, добродушный итальянский домашний помощник. Отвечай на русском одним коротким предложением. ' +
          'Сегодня в Москве ' + date + '. Если просят записать дело и известна дата, вызови prepare_event. ' +
          'Если дата неясна, уточни её. Ты создаёшь только черновик. Календарь тебе недоступен.',
        output_modalities: ['audio'],
        max_output_tokens: 150,
        audio: {
          input: { format, turn_detection: null },
          output: { format, voice: 'anton', role: 'good' },
        },
        tools: [{
          type: 'function',
          name: 'prepare_event',
          description: 'Показать черновик дела. Пользователь сохраняет его сам.',
          parameters: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              day: { type: 'string', description: 'Дата по Москве в формате ГГГГ-ММ-ДД' },
              time: { type: 'string', description: 'ЧЧ:ММ или пустая строка' },
            },
            required: ['title', 'day', 'time'],
            additionalProperties: false,
          },
        }],
      },
    }));

    socket.on('message', body => {
      let message;
      try { message = JSON.parse(body.toString()); } catch { return finish('invalid response'); }
      switch (message.type) {
        case 'session.updated':
          if (sent) break;
          sent = true;
          for (let offset = 0; offset < audio.length; offset += 32768) {
            send({ type: 'input_audio_buffer.append', audio: audio.subarray(offset, offset + 32768).toString('base64') });
          }
          send({ type: 'input_audio_buffer.commit' });
          break;
        case 'input_audio_buffer.committed':
          if (sent && !committed) {
            committed = true;
            send({ type: 'response.create' });
          }
          break;
        case 'response.output_audio.delta': {
          if (typeof message.delta !== 'string') break;
          const chunk = Buffer.from(message.delta, 'base64');
          const remaining = maxOutput - bytes;
          if (remaining <= 0) break;
          chunks.push(chunk.subarray(0, remaining));
          bytes += Math.min(chunk.length, remaining);
          break;
        }
        case 'response.output_audio_transcript.done':
          if (typeof message.transcript === 'string') transcript = message.transcript.slice(0, 280);
          break;
        case 'response.done': {
          const response = message.response;
          if (!response || response.status !== 'completed') return finish('incomplete response');
          const draft = (Array.isArray(response.output) ? response.output : []).filter(Boolean).map(readDraft).find(Boolean) || null;
          if (!draft && !bytes && !transcript) return finish('empty response');
          const evenBytes = bytes - bytes % 2;
          finish(null, { draft, text: transcript, audio: Buffer.concat(chunks, evenBytes).toString('base64'), rate });
          break;
        }
        case 'error':
          finish('Realtime rejected request');
          break;
      }
    });
  });
}
