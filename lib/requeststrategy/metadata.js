
var bencode = require('../util/bencode')
  , BitField = require('../util/bitfield')
  , Message = require('../message')
  , Peer = require('../peer')
  ;

var LOGGER = require('log4js').getLogger('requeststrategy/metadata.js');

function MetadataRequestStrategy(metadata) {
  this._metadata = metadata;
  this._activePeers = {};
  this._activePieces = null;
}

MetadataRequestStrategy.prototype.handleMessage = function(peer, messageCode, payload) {

  LOGGER.debug('Peer [%s] notified of message %j', peer.getIdentifier(), messageCode);

  if (messageCode !== Message.EXTENDED_METADATA) {
    return;
  }

  var messageType = payload['msg_type'],
      activePieces = this._activePieces,
      requestedPieces = this._activePeers[peer.getIdentifier()];

  switch (messageType) {
    case MetadataRequestStrategy.REQUEST:
      LOGGER.debug('Peer [%s] ignoring REQUEST message.', peer.getIdentifier());
      break;

    case MetadataRequestStrategy.DATA:
      LOGGER.debug('Peer [%s] recieved DATA message.', peer.getIdentifier());
      var piece = payload['piece'];
      this._cleanupPieceRequest(peer, piece);

      console.log(payload.toString('binary'));
      console.log(payload);
      break;

    case MetadataRequestStrategy.REJECT:
      LOGGER.debug('Peer [%s] recieved REJECT message.', peer.getIdentifier());
      var piece = payload['piece'];
      this._cleanupPieceRequest(peer, piece);
      activePieces.unset(piece);
      break;

    default:
      LOGGER.warn('Unknown metadata message recieved.  messageType = %j', messageType);
  }
};

MetadataRequestStrategy.prototype.peerDisconnected = function(peer) {

  var requestedPieces = this._activePeers[peer.getIdentifier()],
      activePieces = this._activePieces;

  if (requestedPieces) {
    requestedPieces.forEach(function(index) {
      activePieces.unset(index);
    });
  }
  peer.removeAllListeners(Message.EXTENDED_METADATA);
};

MetadataRequestStrategy.prototype.peerReady = function(peer) {
  
  LOGGER.debug('Peer [%s] hasMetadata: %j, metadataSize: %j ', peer.getIdentifier(), 
    peer.hasMetadata, peer.metadataSize);

  if (peer.hasMetadata) {

    var metadata = this._metadata,
        activePeers = this._activePeers,
        activePieces = this._activePieces,
        availableBlocks = activePieces && activePieces.unsetIndices(),
        pieceToRequest = -1;

    if (!metadata.hasLength()) {
      metadata.setLength(peer.metadataSize);
      this._activePieces = activePieces = new BitField(metadata.bitfield.length);
      availableBlocks = activePieces.unsetIndices();
    }

    if (availableBlocks.length === 0) {
      return;
    }

    pieceToRequest = availableBlocks[Math.round(Math.random() * (availableBlocks.length - 1))];
    activePieces.set(pieceToRequest);

    LOGGER.debug('Peer [%s] requesting piece %j', peer.getIdentifier(), pieceToRequest);

    if (!activePeers[peer.getIdentifier()]) {
      activePeers[peer.getIdentifier()] = [];
      peer.on(Peer.EXTENDED, this.handleMessage.bind(this));
    }
    activePeers[peer.getIdentifier()].push(pieceToRequest);
    
    peer.sendExtendedMessage(Message.EXTENDED_METADATA, {
      msg_type: MetadataRequestStrategy.REQUEST,
      piece: pieceToRequest
    });
  } else {
    LOGGER.debug("Peer [%s] doesn't support metadata requests.", peer.getIdentifier());
  }
};

MetadataRequestStrategy.prototype._cleanupPieceRequest = function(peer, piece) {
  var requestedPieces = this._activePeers[peer.getIdentifier()];
  var pieceIndex = requestedPieces.indexOf(piece);
  if (pieceIndex > -1) {
    requestedPieces = requestedPieces.slice(0, pieceIndex).concat(requestedPieces.slice(pieceIndex + 1));
    this._activePeers[peer.getIdentifier()] = requestedPieces;
  }
};

MetadataRequestStrategy.REQUEST = 0;
MetadataRequestStrategy.DATA = 1;
MetadataRequestStrategy.REJECT = 2;

module.exports = exports = MetadataRequestStrategy;
