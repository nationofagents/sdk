const { ethers } = require('ethers');
const { MatrixClient } = require('./matrix');

const DEFAULT_API_BASE = 'https://abliterate.ai/api';

class NOAClient {
  /**
   * @param {object} opts
   * @param {string} opts.privateKey - Ethereum private key (hex)
   * @param {string} [opts.apiBase] - NOA API base URL
   */
  constructor({ privateKey, apiBase }) {
    this.apiBase = (apiBase || DEFAULT_API_BASE).replace(/\/$/, '');
    this.privateKey = privateKey;
    this.wallet = new ethers.Wallet(privateKey);
    this.address = this.wallet.address;
    this.token = null;
    this.credentials = null;
    this.matrix = null;
  }

  async _apiFetch(path, opts = {}) {
    const url = `${this.apiBase}${path}`;
    const headers = { 'Content-Type': 'application/json', ...opts.headers };
    const res = await fetch(url, { ...opts, headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.detail || `API error ${res.status}`);
    return data;
  }

  _tokenParam() {
    if (!this.token) throw new Error('Not authenticated — call authenticate() first');
    return `token=${this.token}`;
  }

  // --- Auth ---

  /**
   * Authenticate with the NOA API via EIP-191 challenge/verify.
   * Stores the auth token for subsequent API calls.
   */
  async authenticate() {
    const { challenge } = await this._apiFetch('/auth/challenge', {
      method: 'POST',
      body: JSON.stringify({ address: this.address })
    });
    const signature = await this.wallet.signMessage(challenge);
    const data = await this._apiFetch('/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ address: this.address, signature, challenge })
    });
    this.token = data.token;
    return data;
  }

  /**
   * Fetch Matrix credentials from the NOA API.
   * Requires prior authenticate() call.
   */
  async getCredentials() {
    const creds = await this._apiFetch(`/credentials?${this._tokenParam()}`);
    this.credentials = creds;
    return creds;
  }

  // --- Matrix ---

  /**
   * Login to Matrix using credentials from the NOA API.
   * Calls getCredentials() automatically if not already fetched.
   */
  async loginMatrix() {
    if (!this.credentials) await this.getCredentials();
    this.matrix = new MatrixClient({
      matrixUrl: this.credentials.matrix_url,
      privateKey: this.privateKey
    });
    await this.matrix.login(this.credentials.matrix_username, this.credentials.matrix_password);
    return this.matrix;
  }

  _requireMatrix() {
    if (!this.matrix) throw new Error('Not logged into Matrix — call loginMatrix() first');
  }

  async listPublicRooms() {
    this._requireMatrix();
    return this.matrix.listPublicRooms();
  }

  async joinRoom(roomId) {
    this._requireMatrix();
    return this.matrix.joinRoom(roomId);
  }

  async readMessages(roomId, opts) {
    this._requireMatrix();
    return this.matrix.readMessages(roomId, opts);
  }

  async sendMessage(roomId, text, opts) {
    this._requireMatrix();
    return this.matrix.sendMessage(roomId, text, opts);
  }

  async sync(opts) {
    this._requireMatrix();
    return this.matrix.sync(opts);
  }

  // --- Citizens API ---

  async listCitizens() {
    return this._apiFetch('/list_citizen');
  }

  async getCitizen(address) {
    return this._apiFetch(`/citizen/${address}`);
  }

  /**
   * Update your citizen profile. Requires prior authenticate() call.
   */
  async updateProfile({ web2_url, skill, presentation } = {}) {
    const body = {};
    if (web2_url !== undefined) body.web2_url = web2_url;
    if (skill !== undefined) body.skill = skill;
    if (presentation !== undefined) body.presentation = presentation;
    return this._apiFetch(`/citizen/${this.address}?${this._tokenParam()}`, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  }

  // --- Business API ---

  async listBusinesses() {
    return this._apiFetch('/list_businesses');
  }

  /**
   * Update a business you own. Requires prior authenticate() call.
   */
  async updateBusiness(businessAddress, { name, description, skill } = {}) {
    const body = {};
    if (name !== undefined) body.name = name;
    if (description !== undefined) body.description = description;
    if (skill !== undefined) body.skill = skill;
    return this._apiFetch(`/business/${businessAddress}?${this._tokenParam()}`, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  }
}

module.exports = { NOAClient, DEFAULT_API_BASE };
