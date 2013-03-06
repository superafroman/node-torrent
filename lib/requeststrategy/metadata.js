
var bencode = require('../util/bencode');

var Message = require('../message');

var LOGGER = require('log4js').getLogger('requeststrategy/metadata.js');

function MetadataRequestStrategy(metadata) {
  this._metadata = metadata;
  this._activePeers = {};
  this._activePieces = null;
}

MetadataRequestStrategy.prototype.handleMessage = function(peer, messageCode, payload) {

  if (messageCode !== Message.EXTENDED_METADATA) {
    return;
  }

  var messageType = payload['msg_type'],
      activePieces = this._activePieces,
      requestedPieces = this._activePeers[peer.getIdentifier()];

  switch (messageType) {
    case MetadataRequestStrategy.REQUEST:
      LOGGER.debug('Ignoring REQUEST message.');
      break;

    case MetadataRequestStrategy.DATA:
      LOGGER.debug('Recieved DATA message.');
      var piece = payload['piece'];
      this._cleanupPieceRequest(peer, piece);

      console.log(message.payload.toString('binary'));
      console.log(payload);
      break;

    case MetadataRequestStrategy.REJECT:
      LOGGER.debug('Recieved REJECT message.');
      var piece = payload['piece'];
      this._cleanupPieceRequest(peer, piece);
      activePieces.unset(piece);
      break;

    default:
      LOGGER.warn('Unknown metadata message recieved.  messageType = ' + messageType);
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
  
  LOGGER.debug('Peer ready, hasMetadata = ' + peer.hasMetadata + ', metadataSize = ' + peer.metadataSize);

  if (peer.hasMetadata) {

    var metadata = this._metadata,
        activePieces = this._activePieces,
        activePeers = this._activePeers,
        availableBlocks = null,
        pieceToRequest = -1;

    if (!metadata.hasLength()) {
      metadata.setLength(peer.metadataSize);
      this._activePieces = activePieces = new BitField(metadata.bitfield.length);
    }

    availableBlocks = activePieces.unsetIndices();
    pieceToRequest = availableBlocks[Math.round(Math.random() * (availableBlocks.length - 1))];
    activePieces.set(pieceToRequest);

    LOGGER.debug('Requesting piece ' + pieceToRequest + ' from peer ' + peer.getIdentifier());

    if (!activePeers[peer.getIdentifier()]) {
      activePeers[peer.getIdentifier()] = [];
      peer.on(Peer.EXTENDED_METADATA, this.handleMessage.bind(this));
    }
    activePeers[peer.getIdentifier()].push(pieceToRequest);
    
    peer.sendExtendedMessage(Message.EXTENDED_METADATA, {
      msg_type: MetadataRequestStrategy.REQUEST,
      piece: pieceToRequest
    });
  } else {
    LOGGER.debug("Peer doesn't support metadata requests.  peer id: " + peer.getIdentifier());
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
