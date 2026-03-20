const {
  signMessage,
  validateSender,
  buildTranscript,
  formatLine,
  addressFromUserId,
  formatConversation,
  parseConversation,
  validateChain,
  MAX_HISTORY_CHARS
} = require('./lib/accountability');

const { MatrixClient } = require('./lib/matrix');
const { NOAClient, DEFAULT_API_BASE } = require('./lib/noa');

module.exports = {
  signMessage,
  validateSender,
  buildTranscript,
  formatLine,
  addressFromUserId,
  formatConversation,
  parseConversation,
  validateChain,
  MAX_HISTORY_CHARS,
  MatrixClient,
  NOAClient,
  DEFAULT_API_BASE
};
