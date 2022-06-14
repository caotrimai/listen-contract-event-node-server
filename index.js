require('dotenv').config();
const fs = require('fs');
const Web3 = require('web3');
const marketplace = require('./contract/marketplace')

console.log(process.env.WEB3_ENDPOINT)
const web3 = new Web3(process.env.WEB3_ENDPOINT);
const marketplaceContract = new web3.eth.Contract(marketplace.ABI, marketplace.ADDRESS);

const EVENT = {
  ORDER_ADDED: 'OrderAdded',
  ORDER_MATCHED: 'OrderMatched',
  ORDER_CANCELED: 'OrderCanceled',
}

let lastedBlock = process.env.LASTED_BLOCK;


function saveConfig() {
  let config = fs.readFileSync('./.env', {encoding: 'utf8', flag: 'r'});
  config = config.replace(/LASTED_BLOCK=\d+/, `LASTED_BLOCK=${lastedBlock}`);
  fs.writeFileSync('./.env', config, {encoding: 'utf8', flag: 'w'});
}

const getOrderAddedEvent = (event) => ({
  event: event.event,
  oderId: event.returnValues.oderId,
  seller: event.returnValues.seller,
  tokenId: event.returnValues.tokenId,
  paymentToken: event.returnValues.paymentToken,
  price: event.returnValues.price,
  blockNumber: event.blockNumber,
  transactionHash: event.transactionHash,
})

const getOrderMatchedEvent = (event) => ({
  event: event.event,
  oderId: event.returnValues.oderId,
  seller: event.returnValues.seller,
  buyer: event.returnValues.buyer,
  tokenId: event.returnValues.tokenId,
  paymentToken: event.returnValues.paymentToken,
  price: event.returnValues.price,
  blockNumber: event.blockNumber,
  transactionHash: event.transactionHash,
})

const getOrderCanceledEvent = (event) => ({
  event: event.event,
  oderId: event.returnValues.oderId,
  blockNumber: event.blockNumber,
  transactionHash: event.transactionHash,
})

const handleGettingEvent = (event) => {
  console.log(event);
}

const getEvent = async (eventName, fromBlock, toBlock) => {
  await marketplaceContract.getPastEvents(eventName, {
    fromBlock,
    toBlock,
  }, async (err, events) => {
    if (err) {
      console.error(err);
      return;
    }
    events.forEach(event => {
      switch (eventName) {
        case EVENT.ORDER_ADDED:
          handleGettingEvent(getOrderAddedEvent(event));
          break;
        case EVENT.ORDER_MATCHED:
          handleGettingEvent(getOrderMatchedEvent(event));
          break;
        case EVENT.ORDER_CANCELED:
          handleGettingEvent(getOrderCanceledEvent(event));
          break;
        default:
          break;
      }
    })
  });
}

const getEvents = async () => {
  let toBlock = await web3.eth.getBlockNumber();
  const fromBlock = Number(lastedBlock);
  if(toBlock - fromBlock > 4000) {
    toBlock = fromBlock + 4000;
  }
  console.log({fromBlock, toBlock});
  
  await getEvent(EVENT.ORDER_ADDED, fromBlock, toBlock);
  await getEvent(EVENT.ORDER_MATCHED, fromBlock, toBlock);
  await getEvent(EVENT.ORDER_CANCELED, fromBlock, toBlock);

  lastedBlock = toBlock + 1;
  saveConfig();
}

setInterval(getEvents, 5000);