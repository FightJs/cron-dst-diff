import { compare } from './compare.js';

self.onmessage = ({ data }) => {
  try {
    self.postMessage({ report: compare(data.input, data.probe) });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
