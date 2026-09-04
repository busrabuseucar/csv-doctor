import { analyze } from './engine.js';
self.onmessage = ({ data }) => {
  try { self.postMessage({ id: data.id, result: analyze(data.text, data.options, data.delimiter) }); }
  catch (error) { self.postMessage({ id: data.id, error: { message: error.message, code: error.code ?? 'UNKNOWN' } }); }
};
