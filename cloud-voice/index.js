'use strict';

const { timingSafeEqual } = require('node:crypto');
const WebSocket = require('ws');
const origin = 'https://7ivanshulgin7.github.io';
const rate = 44100;
const maxInput = rate * 2 * 8;
const maxOutput = rate * 2 * 8;
const maxResponseTokens = 512;
const maxTranscriptLength = 280;

function diagnosticCode(value, fallback) {
  return typeof value === 'string' && /^[a-z0-9_-]{1,50}$/i.test(value) ? value : fallback;
}

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

  if (event.httpMethod !== 'POST') return reply(405, { error: 'method', revision: 'voice-retry-1' });
  if (suppliedOrigin?.[1] !== origin) return reply(403, { error: 'origin' });
  const code = process.env.HOLDOM_VOICE_CODE;
  const folder = process.env.YANDEX_FOLDER_ID;
  const accessToken = context?.token?.access_token;
  if (!code || !/^[a-f0-9]{64}$/.test(code) || !folder || typeof accessToken !== 'string' || !accessToken) {
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
  const history = Array.isArray(request.history) ? request.history.slice(-8).filter(item => item &&
    (item.role === 'user' || item.role === 'assistant') && typeof item.text === 'string') : [];
  const actions = request.actions && request.actions.draft === true
    ? { reviewing: request.actions.reviewing === true } : null;

  try {
    return reply(200, await askGiovanni(audio, folder, accessToken, history, actions));
  } catch (error) {
    const stage = error.stage || 'internal_error';
    console.warn('Giovanni:', stage);
    return reply(502, { error: 'upstream', stage });
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

function draftAction(transcript, actions) {
  if (!transcript) return null;
  const phrase = transcript.toLowerCase().replace(/^[\s«»"']+|[\s«»"'.!?]+$/g, '')
    .replace(/^джованни[,\s]+/, '').replace(/^нажми(?: кнопку)?\s+/, '').replace(/[«»"']/g, '');
  if (/^(?:сделай|сделать|создай|запиши) заметку(?:$|[\s:,.!?—-])/.test(phrase)) return 'new_note';
  if (/^(?:записать дело|добавить дело|открой форму дела)$/.test(phrase)) return 'new_event';
  if (!actions) return null;
  if (/^(?:покажи черновик|открой черновик|проверить дело|проверь дело)$/.test(phrase)) return 'review_draft';
  if (/^(?:отмени|отменить|удали) черновик$/.test(phrase)) return 'discard_draft';
  if (actions.reviewing && /^(?:да[, ]+)?сохрани(?:ть)? (?:это )?дело$/.test(phrase)) return 'save_draft';
  return null;
}

async function askGiovanni(audio, folder, token, history, actions) {
  const timeoutMs = 17000;
  const deadline = Date.now() + timeoutMs;
  try {
    return await requestGiovanni(audio, folder, token, history, actions, timeoutMs);
  } catch (error) {
    const remainingMs = deadline - Date.now();
    if (!error.retryable || remainingMs < 4000) throw error;
    console.warn('Giovanni reconnect:', error.stage);
    return requestGiovanni(audio, folder, token, history, actions, remainingMs);
  }
}

function requestGiovanni(audio, folder, token, history, actions, timeoutMs) {
  const url = new URL('wss://ai.api.cloud.yandex.net/v1/realtime/openai');
  url.searchParams.set('model', 'gpt://' + folder + '/speech-realtime-deepseek-v4-flash');
  const date = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeZone: 'Europe/Moscow' }).format(new Date());
  const silenceDurationMs = 1000;
  const format = { type: 'audio/pcm', rate };

  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, {
      headers: { Authorization: 'Bearer ' + token },
      handshakeTimeout: Math.min(6000, timeoutMs),
      maxPayload: 1_048_576,
    });
    const timer = setTimeout(() => finish(phase + '_timeout'), timeoutMs);
    let transcriptionTimer;
    const chunks = [];
    let bytes = 0;
    let transcript = '';
    let userTranscript = '';
    let completed;
    let sent = false;
    let phase = 'handshake';
    let finished = false;

    function finish(stage, result, retryable = false) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      clearTimeout(transcriptionTimer);
      socket.terminate();
      if (stage) reject(Object.assign(new Error('Realtime failed'), { stage, retryable }));
      else resolve(result);
    }

    function send(event) { socket.send(JSON.stringify(event)); }

    function finishResponse() {
      if (!completed) return;
      const action = completed.partial ? null : draftAction(userTranscript, actions);
      const draft = action || (actions && actions.reviewing) ? null : completed.draft;
      const evenBytes = bytes - bytes % 2;
      if (!draft && !action && !evenBytes && !transcript) return finish(completed.emptyStage);
      const actionText = {
        new_note: 'Открываю заметки.', new_event: 'Открываю форму дела.',
        review_draft: 'Открываю черновик.', discard_draft: 'Отменяю черновик.', save_draft: 'Сохраняю дело.',
      };
      const text = completed.partial && transcript ? transcript.slice(0, maxTranscriptLength - 1).trimEnd() + '…' : transcript;
      finish(null, { draft, action, transcript: userTranscript, text: action ? actionText[action] : text,
        audio: action ? '' : Buffer.concat(chunks, evenBytes).toString('base64'), rate });
    }

    socket.on('unexpected-response', (_, response) => {
      response.resume();
      const code = response.statusCode;
      finish('handshake_' + code, null, [502, 503, 504].includes(code));
    });
    socket.on('error', error => {
      if (completed) return finishResponse();
      const code = diagnosticCode(error?.code, '').toLowerCase();
      const retryable = !code || ['econnreset', 'epipe', 'etimedout', 'econnaborted', 'econnrefused', 'eai_again'].includes(code);
      finish(phase + '_connection' + (code ? '_' + code : ''), null, retryable);
    });
    socket.on('close', code => {
      if (completed) return finishResponse();
      finish(phase + '_closed_' + code, null, [1000, 1001, 1006, 1011, 1012, 1013].includes(code));
    });
    socket.on('open', () => {
      phase = 'session';
      send({
        type: 'session.update',
        session: {
          type: 'realtime',
          instructions: 'Ты Джованни, добродушный итальянский домашний помощник. Отвечай на русском одним коротким предложением. ' +
            'Сегодня в Москве ' + date + '. На вопросы отвечай по существу. Только если явно просят создать новое дело и известна дата, вызови prepare_event. ' +
            'Если дата неясна, уточни её. Ты создаёшь только черновик. Календарь тебе недоступен.' +
            (actions ? ' На экране уже есть черновик. Открытие, отмену и сохранение обрабатывает приложение. Не утверждай, что дело сохранено.' : ''),
          output_modalities: ['audio'],
          max_output_tokens: maxResponseTokens,
          audio: {
            input: { format, turn_detection: { type: 'server_vad', threshold: 0.4, silence_duration_ms: silenceDurationMs } },
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
      });
    });

    socket.on('message', body => {
      if (finished) return;
      let message;
      try { message = JSON.parse(body.toString()); } catch { return finish('invalid_response'); }
      switch (message.type) {
        case 'session.updated':
          if (sent) break;
          sent = true;
          phase = 'speech_start';
          for (const item of history) {
            send({ type: 'conversation.item.create', item: { type: 'message', role: item.role,
              content: [{ type: item.role === 'user' ? 'input_text' : 'output_text', text: item.text.slice(0, 280) }] } });
          }
          const chunkBytes = rate * 2 / 10;
          for (let offset = 0; offset < audio.length; offset += chunkBytes) {
            send({ type: 'input_audio_buffer.append',
              audio: audio.subarray(offset, offset + chunkBytes).toString('base64') });
          }
          // Give server VAD enough silence to close the recorded turn and start its reply.
          const silenceChunk = Buffer.alloc(chunkBytes).toString('base64');
          for (let ms = 0; ms < silenceDurationMs + 200; ms += 100) {
            send({ type: 'input_audio_buffer.append', audio: silenceChunk });
          }
          break;
        case 'input_audio_buffer.speech_started':
          phase = 'speech_end';
          break;
        case 'input_audio_buffer.speech_stopped':
          phase = 'response_start';
          break;
        case 'response.created':
          phase = 'response';
          break;
        case 'conversation.item.input_audio_transcription.completed':
          if (typeof message.transcript === 'string') userTranscript = message.transcript.trim().slice(0, 280);
          if (completed) finishResponse();
          break;
        case 'conversation.item.done':
          if (message.item?.role === 'user' && Array.isArray(message.item.content)) {
            const audio = message.item.content.find(item => item?.type === 'input_audio' && typeof item.transcript === 'string');
            if (audio && !userTranscript) userTranscript = audio.transcript.trim().slice(0, 280);
            if (userTranscript && completed) finishResponse();
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
        case 'response.output_audio_transcript.delta':
          if (typeof message.delta === 'string') transcript = (transcript + message.delta).slice(0, maxTranscriptLength);
          break;
        case 'response.output_audio_transcript.done':
          if (typeof message.transcript === 'string' && message.transcript.trim()) {
            transcript = message.transcript.trim().slice(0, maxTranscriptLength);
          }
          break;
        case 'response.done': {
          const response = message.response;
          const status = diagnosticCode(response?.status, 'unknown');
          const details = response?.status_details;
          const reason = diagnosticCode(details?.reason || details?.error?.code || details?.error?.type, '');
          const stage = 'response_' + status + (reason ? '_' + reason : '');
          if (status === 'cancelled' && reason === 'turn_detected') {
            // A newer speech segment interrupted this reply. Wait for its automatic response.
            chunks.length = 0;
            bytes = 0;
            transcript = '';
            userTranscript = '';
            phase = stage;
            break;
          }
          const partial = status === 'incomplete' && !details?.error &&
            (!details?.reason || details.reason === 'max_output_tokens');
          if (status !== 'completed' && !partial) return finish(stage);
          const items = Array.isArray(response.output) ? response.output.filter(Boolean) : [];
          const draft = partial ? null : items.map(readDraft).find(Boolean) || null;
          if (!transcript) {
            const output = items.flatMap(item => Array.isArray(item.content) ? item.content : [])
              .find(item => item?.type === 'output_audio' && typeof item.transcript === 'string');
            if (output) transcript = output.transcript.trim().slice(0, maxTranscriptLength);
          }
          completed = { draft, partial, emptyStage: partial ? stage : 'empty_response' };
          if (userTranscript) finishResponse();
          else transcriptionTimer = setTimeout(finishResponse, 750);
          break;
        }
        case 'error': {
          const code = message.error?.code || message.error?.type;
          finish(phase + '_' + diagnosticCode(code, 'rejected'));
          break;
        }
      }
    });
  });
}
