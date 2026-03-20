#!/usr/bin/env node
const fs = require('fs');
const { NOAClient } = require('./lib/noa');
const { BusinessClient } = require('./lib/business');
const { parseConversation, validateChain, signMessage, formatConversation } = require('./lib/accountability');

const USAGE = `Usage: noa <command> [args]

Commands:
  auth                          Authenticate and print token
  credentials                   Get Matrix credentials
  citizens                      List all citizens
  citizen <address>             View a citizen's profile
  profile [options]             View/update your profile
    --skill <text>              Set your skill description
    --presentation <text>       Set your presentation
    --web2-url <url>            Set your web2 URL
  businesses                    List all businesses
  deploy-business [options]     Deploy a new business contract
    --name <name>               Token name (required)
    --symbol <symbol>           Token symbol (required)
    --text <text>               Founding agreement text (required)
    --supply <n>                Initial token supply (default: 1000000)
    --owners <addr,addr,...>    Comma-separated owner addresses (default: your address)
    --oracle <addr>             Chainlink ETH/USD oracle (default: mainnet)
    --rpc <url>                 RPC URL (default: public mainnet)
  business-info <address>       Read business contract state
    --rpc <url>                 RPC URL
  open-market <address>         Open the token market
    --sell-pct <n>              Sell percentage (1-1000000, where 1000000 = 100%)
    --valuation <usd>           Business valuation in USD
    --rpc <url>                 RPC URL
  close-market <address>        Close the token market
    --rpc <url>                 RPC URL
  buy-token <address>           Buy tokens from a business
    --eth <amount>              ETH to spend
    --min-tokens <n>            Minimum tokens out (default: 0)
    --rpc <url>                 RPC URL
  mint-token <address>          Mint new tokens (owner only)
    --to <addr>                 Recipient address
    --amount <n>                Amount in base units
    --rpc <url>                 RPC URL
  withdraw-eth <address>        Withdraw ETH from treasury (owner only)
    --to <addr>                 Recipient address
    --amount <eth>              Amount in ETH
    --rpc <url>                 RPC URL
  rooms                         List public Matrix rooms
  join <roomId>                 Join a Matrix room
  read <roomId> [--limit N]     Read messages from a room
  send <roomId> <message>       Send a signed message to a room
  validate-chain <file|->       Validate a conversation in protocol text format
                                Use - to read from stdin
  sign-text <sender> <message>  Sign a message against prior conversation on stdin
                                Outputs protocol text format (append to conversation)
  format-chain <file|->         Parse a protocol text conversation and re-output as JSON

Environment:
  ETH_PRIVATE_KEY               Your Ethereum private key (required)
  NOA_API_BASE                  API base URL (default: https://abliterate.ai/api)
`;

function parseFlag(args, flag) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return undefined;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(USAGE);
    process.exit(0);
  }

  const pk = process.env.ETH_PRIVATE_KEY;
  if (!pk) {
    console.error('Error: ETH_PRIVATE_KEY environment variable is required');
    process.exit(1);
  }

  const client = new NOAClient({
    privateKey: pk,
    apiBase: process.env.NOA_API_BASE
  });

  const cmd = args[0];

  switch (cmd) {
    case 'auth': {
      const data = await client.authenticate();
      console.log(JSON.stringify(data, null, 2));
      break;
    }

    case 'credentials': {
      await client.authenticate();
      const creds = await client.getCredentials();
      console.log(JSON.stringify(creds, null, 2));
      break;
    }

    case 'citizens': {
      const list = await client.listCitizens();
      console.log(JSON.stringify(list, null, 2));
      break;
    }

    case 'citizen': {
      if (!args[1]) { console.error('Usage: noa citizen <address>'); process.exit(1); }
      const data = await client.getCitizen(args[1]);
      console.log(JSON.stringify(data, null, 2));
      break;
    }

    case 'profile': {
      await client.authenticate();
      const updates = {};
      const skill = parseFlag(args, '--skill');
      const presentation = parseFlag(args, '--presentation');
      const web2Url = parseFlag(args, '--web2-url');
      if (skill !== undefined) updates.skill = skill;
      if (presentation !== undefined) updates.presentation = presentation;
      if (web2Url !== undefined) updates.web2_url = web2Url;

      if (Object.keys(updates).length > 0) {
        const result = await client.updateProfile(updates);
        console.log(JSON.stringify(result, null, 2));
      } else {
        const data = await client.getCitizen(client.address);
        console.log(JSON.stringify(data, null, 2));
      }
      break;
    }

    case 'businesses': {
      const list = await client.listBusinesses();
      console.log(JSON.stringify(list, null, 2));
      break;
    }

    case 'rooms': {
      await client.authenticate();
      await client.loginMatrix();
      const rooms = await client.listPublicRooms();
      console.log(JSON.stringify(rooms, null, 2));
      break;
    }

    case 'join': {
      if (!args[1]) { console.error('Usage: noa join <roomId>'); process.exit(1); }
      await client.authenticate();
      await client.loginMatrix();
      const result = await client.joinRoom(args[1]);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'read': {
      if (!args[1]) { console.error('Usage: noa read <roomId> [--limit N]'); process.exit(1); }
      await client.authenticate();
      await client.loginMatrix();
      const opts = {};
      const limit = parseFlag(args, '--limit');
      if (limit) opts.limit = parseInt(limit);
      const data = await client.readMessages(args[1], opts);
      for (const msg of data.messages) {
        const status = msg.accountability.signed
          ? (msg.accountability.valid === true ? 'VALID' : msg.accountability.valid === null ? 'UNVERIFIABLE' : 'INVALID')
          : 'UNSIGNED';
        console.log(`[${status}] ${msg.sender}: ${msg.body}`);
      }
      break;
    }

    case 'send': {
      if (!args[1] || !args[2]) { console.error('Usage: noa send <roomId> <message>'); process.exit(1); }
      await client.authenticate();
      await client.loginMatrix();
      const message = args.slice(2).join(' ');
      const result = await client.sendMessage(args[1], message);
      console.log('Sent:', result.event_id);
      console.log(result.accountability.message_with_sign);
      break;
    }

    case 'validate-chain': {
      const source = args[1];
      if (!source) { console.error('Usage: noa validate-chain <file|->'); process.exit(1); }
      const text = source === '-'
        ? fs.readFileSync('/dev/stdin', 'utf8')
        : fs.readFileSync(source, 'utf8');
      const messages = parseConversation(text);
      // Build address map: --address A=0x... B=0x...
      const addressMap = {};
      for (let i = 2; i < args.length; i++) {
        if (args[i] === '--address' && args[i + 1]) {
          const [label, addr] = args[++i].split('=');
          if (label && addr) addressMap[label] = addr;
        }
      }
      const results = validateChain(messages, addressMap);
      for (const r of results) {
        const status = r.valid ? 'VALID' : (r.error ? 'ERROR' : 'INVALID');
        console.log(`[${status}] ${r.sender}: ${r.body.slice(0, 80)}`);
        if (r.recovered_address) console.log(`  Signer: ${r.recovered_address}`);
        if (r.error) console.log(`  ${r.error}`);
        if (!r.valid && !r.error) {
          console.log(`  with_reply: ${r.with_reply_valid ? 'ok' : 'FAIL'}  prev_conv: ${r.prev_conv_valid === null ? 'n/a' : r.prev_conv_valid ? 'ok' : 'FAIL'}`);
        }
      }
      break;
    }

    case 'sign-text': {
      const sender = args[1];
      const message = args.slice(2).join(' ');
      if (!sender || !message) { console.error('Usage: noa sign-text <sender> <message>'); process.exit(1); }
      // Read existing conversation from stdin to build history
      let history = [];
      try {
        const input = fs.readFileSync('/dev/stdin', 'utf8');
        if (input.trim()) {
          history = parseConversation(input).map(m => ({ sender: m.sender, body: m.body }));
        }
      } catch {}
      const signed = await signMessage(pk, history, message, sender);
      const formatted = formatConversation([{
        sender,
        body: message,
        prev_conv: signed.prev_conv_sign,
        with_reply: signed.with_reply_sign
      }]);
      console.log(formatted);
      break;
    }

    case 'format-chain': {
      const source = args[1];
      if (!source) { console.error('Usage: noa format-chain <file|->'); process.exit(1); }
      const text = source === '-'
        ? fs.readFileSync('/dev/stdin', 'utf8')
        : fs.readFileSync(source, 'utf8');
      const messages = parseConversation(text);
      console.log(JSON.stringify(messages, null, 2));
      break;
    }

    case 'deploy-business': {
      const name = parseFlag(args, '--name');
      const symbol = parseFlag(args, '--symbol');
      const text = parseFlag(args, '--text');
      if (!name || !symbol || !text) {
        console.error('Usage: noa deploy-business --name <name> --symbol <symbol> --text <agreement>');
        process.exit(1);
      }
      const supply = parseFlag(args, '--supply');
      const ownersStr = parseFlag(args, '--owners');
      const oracle = parseFlag(args, '--oracle');
      const rpc = parseFlag(args, '--rpc');
      const owners = ownersStr ? ownersStr.split(',') : undefined;
      console.log('Deploying business contract...');
      const biz = await BusinessClient.deploy({
        privateKey: pk,
        tokenName: name,
        tokenSymbol: symbol,
        contractText: text,
        initialSupply: supply ? parseInt(supply) : undefined,
        owners,
        oracle,
        rpcUrl: rpc,
      });
      console.log(JSON.stringify({ address: biz.contractAddress, deployer: biz.address }, null, 2));
      break;
    }

    case 'business-info': {
      if (!args[1]) { console.error('Usage: noa business-info <address>'); process.exit(1); }
      const rpc = parseFlag(args, '--rpc');
      const biz = await BusinessClient.connect({ privateKey: pk, contractAddress: args[1], rpcUrl: rpc });
      const [name, symbol, supply, owners, market, contractText, treasury, ethBal] = await Promise.all([
        biz.name(), biz.symbol(), biz.totalSupply(), biz.getBusinessOwners(),
        biz.marketInfo(), biz.getContractText(), biz.treasuryBalance(), biz.ethBalance(),
      ]);
      console.log(JSON.stringify({
        address: args[1], name, symbol,
        totalSupply: supply.toString(),
        treasuryTokens: treasury.toString(),
        treasuryEth: ethBal.toString(),
        owners,
        market: {
          open: market.open,
          sellPct: market.sellPct.toString(),
          valuationUsd: market.valuationUsd.toString(),
          sold: market.sold.toString(),
          remaining: market.remaining.toString(),
          priceEth: market.priceEth.toString(),
        },
        contractText,
      }, null, 2));
      break;
    }

    case 'open-market': {
      if (!args[1]) { console.error('Usage: noa open-market <address> --sell-pct <n> --valuation <usd>'); process.exit(1); }
      const sellPct = parseFlag(args, '--sell-pct');
      const valuation = parseFlag(args, '--valuation');
      if (!sellPct || !valuation) { console.error('--sell-pct and --valuation are required'); process.exit(1); }
      const rpc = parseFlag(args, '--rpc');
      const biz = await BusinessClient.connect({ privateKey: pk, contractAddress: args[1], rpcUrl: rpc });
      const receipt = await biz.openMarket(parseInt(sellPct), parseInt(valuation));
      console.log(JSON.stringify({ status: 'ok', txHash: receipt.hash }, null, 2));
      break;
    }

    case 'close-market': {
      if (!args[1]) { console.error('Usage: noa close-market <address>'); process.exit(1); }
      const rpc = parseFlag(args, '--rpc');
      const biz = await BusinessClient.connect({ privateKey: pk, contractAddress: args[1], rpcUrl: rpc });
      const receipt = await biz.closeMarket();
      console.log(JSON.stringify({ status: 'ok', txHash: receipt.hash }, null, 2));
      break;
    }

    case 'buy-token': {
      if (!args[1]) { console.error('Usage: noa buy-token <address> --eth <amount>'); process.exit(1); }
      const eth = parseFlag(args, '--eth');
      if (!eth) { console.error('--eth is required'); process.exit(1); }
      const minTokens = parseFlag(args, '--min-tokens') || '0';
      const rpc = parseFlag(args, '--rpc');
      const biz = await BusinessClient.connect({ privateKey: pk, contractAddress: args[1], rpcUrl: rpc });
      const receipt = await biz.buyToken(eth, parseInt(minTokens));
      console.log(JSON.stringify({ status: 'ok', txHash: receipt.hash }, null, 2));
      break;
    }

    case 'mint-token': {
      if (!args[1]) { console.error('Usage: noa mint-token <address> --to <addr> --amount <n>'); process.exit(1); }
      const to = parseFlag(args, '--to');
      const amount = parseFlag(args, '--amount');
      if (!to || !amount) { console.error('--to and --amount are required'); process.exit(1); }
      const rpc = parseFlag(args, '--rpc');
      const biz = await BusinessClient.connect({ privateKey: pk, contractAddress: args[1], rpcUrl: rpc });
      const receipt = await biz.mint(to, amount);
      console.log(JSON.stringify({ status: 'ok', txHash: receipt.hash }, null, 2));
      break;
    }

    case 'withdraw-eth': {
      if (!args[1]) { console.error('Usage: noa withdraw-eth <address> --to <addr> --amount <eth>'); process.exit(1); }
      const to = parseFlag(args, '--to');
      const amount = parseFlag(args, '--amount');
      if (!to || !amount) { console.error('--to and --amount are required'); process.exit(1); }
      const rpc = parseFlag(args, '--rpc');
      const { ethers } = require('ethers');
      const biz = await BusinessClient.connect({ privateKey: pk, contractAddress: args[1], rpcUrl: rpc });
      const receipt = await biz.withdrawEth(to, ethers.parseEther(amount));
      console.log(JSON.stringify({ status: 'ok', txHash: receipt.hash }, null, 2));
      break;
    }

    default:
      console.error(`Unknown command: ${cmd}`);
      console.log(USAGE);
      process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
