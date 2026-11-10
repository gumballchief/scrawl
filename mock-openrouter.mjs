// Fake OpenRouter for testing the starter without a key. Logs the shape of each request it gets.
import { createServer } from 'node:http';
const port = Number(process.argv[2] || 4799);
createServer(async (req, res) => {
  let raw = '';
  for await (const c of req) raw += c;
  const auth = req.headers.authorization || '';
  if (auth === 'Bearer bad') { res.writeHead(401, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: { message: 'User not found.', code: 401 } })); }
  if (auth === 'Bearer broke') { res.writeHead(402, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: { message: 'Insufficient credits', code: 402 } })); }
  if (req.url.endsWith('/key')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ data: { usage: 0.0123, limit: 10, limit_remaining: 9.9877 } })); }
  if (req.url.endsWith('/models')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ data: [{ id: 'meta/muse-ember' }] })); }
  const body = JSON.parse(raw || '{}');
  const user = body.messages?.at(-1)?.content;
  const shape = Array.isArray(user) ? user.map(p => p.type + (p.input_audio ? ':' + p.input_audio.format + ':' + (p.input_audio.data.startsWith('data:') ? 'HAS_PREFIX' : 'raw') : '') + (p.file ? ':' + p.file.filename : '')).join(',') : typeof user;
  console.log('REQ', JSON.stringify({ model: body.model, stream: body.stream, reasoning: body.reasoning, response_format: body.response_format?.type, tools: body.tools?.map(t => t.type), shape }));
  const answer = body.response_format ? '{"summary":"A test reply","tags":["mock","ok"]}' : `Mock reply. Got: ${shape}.`;
  if (body.stream) {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(': OPENROUTER PROCESSING\n\n');
    for (const w of answer.match(/.{1,6}/g)) {
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: w } }] })}\n\n`);
      await new Promise(r => setTimeout(r, 15));
    }
    res.write('data: [DONE]\n\n');
    return res.end();
  }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ model: body.model, choices: [{ message: { content: answer } }], usage: { prompt_tokens: 12, completion_tokens: 8, cost: 0.0000052 } }));
}).listen(port, () => console.log('mock on', port));
