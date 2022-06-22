require('dotenv').config()
const fs = require('fs')
const Web3 = require('web3')
const marketplace = require('./contract/marketplace')
const axiosRequest = require('./configs/request')
const petty = require('./contract/petty')

const web3 = new Web3(process.env.WEB3_ENDPOINT)
const marketplaceContract = new web3.eth.Contract(marketplace.ABI,
  marketplace.ADDRESS)
const pettyContract = new web3.eth.Contract(petty.ABI,
  petty.ADDRESS)

const EVENT = {
  ORDER_ADDED: 'OrderAdded',
  ORDER_MATCHED: 'OrderMatched',
  ORDER_CANCELED: 'OrderCanceled',
}

const PETTY_EVENT = {
  TRANSFER: 'Transfer',
}

let lastedBlock = process.env.LASTED_BLOCK

function saveConfig () {
  let config = fs.readFileSync('./.env', {encoding: 'utf8', flag: 'r'})
  config = config.replace(/LASTED_BLOCK=\d+/, `LASTED_BLOCK=${lastedBlock}`)
  fs.writeFileSync('./.env', config, {encoding: 'utf8', flag: 'w'})
}

const getOrderAddedEvent = (event) => ({
  event: event.event,
  orderId: event.returnValues.oderId,
  seller: event.returnValues.seller,
  tokenId: event.returnValues.tokenId,
  paymentToken: event.returnValues.paymentToken,
  price: event.returnValues.price,
  blockNumber: event.blockNumber,
  transactionHash: event.transactionHash,
})

const getOrderMatchedEvent = (event) => ({
  event: event.event,
  orderId: event.returnValues.oderId,
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
  orderId: event.returnValues.oderId,
  blockNumber: event.blockNumber,
  transactionHash: event.transactionHash,
})

const getEventData = (eventName, event) => {
  let eventData
  switch (eventName) {
    case EVENT.ORDER_ADDED:
      eventData = getOrderAddedEvent(event)
      break
    case EVENT.ORDER_MATCHED:
      eventData = getOrderMatchedEvent(event)
      break
    case EVENT.ORDER_CANCELED:
      eventData = getOrderCanceledEvent(event)
      break
    default:
      break
  }
  return eventData
}

const handleMarketplaceEvent = async (eventName, event) => {
  const eventData = getEventData(eventName, event)
  if (!eventData) {
    return
  }
  try {
    const res = await axiosRequest.post(`/event/marketplace/${eventName}`,
      eventData)
    console.log(res)
  } catch (err) {
    console.log(err)
  }
}

const getEvent = async (eventName, fromBlock, toBlock) => {
  await marketplaceContract.getPastEvents(eventName, {
    fromBlock,
    toBlock,
  }, async (err, events) => {
    if (err) {
      console.error(err)
      return
    }
    for (const event of events) {
      await handleMarketplaceEvent(eventName, event)
    }
  })
}

const getPettyTransferEvent = (event) => ({
  event: event.event,
  from: event.returnValues.from,
  to: event.returnValues.to,
  tokenId: event.returnValues.tokenId,
  blockNumber: event.blockNumber,
  transactionHash: event.transactionHash,
})

const getPettyEventData = (eventName, event) => {
  let eventData
  switch (eventName) {
    case PETTY_EVENT.TRANSFER:
      eventData = getPettyTransferEvent(event)
      break
    default:
      break
  }
  return eventData
}

const handlePettyEvent = async (eventName, event) => {
  const eventData = getPettyEventData(eventName, event)
  if (!eventData) {
    return
  }
  const res = await axiosRequest.post(`/event/petty/${eventName}`,
    eventData)
  console.log(res)
}

const getPettyEvent = async (eventName, fromBlock, toBlock) => {
  await pettyContract.getPastEvents(eventName, {
    fromBlock,
    toBlock,
  }, async (err, events) => {
    if (err) {
      console.error(err)
      return
    }
    for (const event of events) {
      await handlePettyEvent(eventName, event)
    }
  })
}

const getEvents = async () => {
  let toBlock = await web3.eth.getBlockNumber()
  const fromBlock = Number(lastedBlock)
  if (toBlock - fromBlock > 4000) {
    toBlock = fromBlock + 4000
  }
  console.log({fromBlock, toBlock})

  await getEvent(EVENT.ORDER_ADDED, fromBlock, toBlock)
  await getEvent(EVENT.ORDER_MATCHED, fromBlock, toBlock)
  await getEvent(EVENT.ORDER_CANCELED, fromBlock, toBlock)
  await getPettyEvent(PETTY_EVENT.TRANSFER, fromBlock, toBlock)

  lastedBlock = toBlock + 1
  saveConfig()
}

setInterval(getEvents, 5000)