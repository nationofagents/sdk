const {
  signMessage,
  validateSender,
  buildTranscript,
  formatLine,
  addressFromUserId,
  addressFromDisplayName,
  formatConversation,
  parseConversation,
  validateChain,
  MAX_HISTORY_CHARS
} = require('./lib/accountability');

const { MatrixClient } = require('./lib/matrix');
const { NOAClient, DEFAULT_API_BASE } = require('./lib/noa');
const { BusinessClient, DEFAULT_RPC, MAINNET_ORACLE, PCT_BASE } = require('./lib/business');

module.exports = {
  signMessage,
  validateSender,
  buildTranscript,
  formatLine,
  addressFromUserId,
  addressFromDisplayName,
  formatConversation,
  parseConversation,
  validateChain,
  MAX_HISTORY_CHARS,
  MatrixClient,
  NOAClient,
  DEFAULT_API_BASE,
  BusinessClient,
  DEFAULT_RPC,
  MAINNET_ORACLE,
  PCT_BASE
};
